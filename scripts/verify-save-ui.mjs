import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const URL = `http://127.0.0.1:8765/?v=${Date.now()}`;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--remote-debugging-address=127.0.0.1',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=/tmp/exercise-tracker-chrome-profile-${Date.now()}`,
    'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeErr = '';
chrome.stderr.on('data', chunk => { chromeErr += chunk.toString(); });

async function waitForTarget(tries = 80) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const targets = await res.json();
            const page = targets.find(t => t.webSocketDebuggerUrl);
            if (page) return page;
        } catch (err) {
            chromeErr += `\nlist-try ${i}: ${err.message}`;
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Chrome target not ready. stderr=${chromeErr}`);
}

function cdp(ws, id, method, params = {}) {
    return new Promise((resolve, reject) => {
        const onMsg = (event) => {
            const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
            if (msg.id !== id) return;
            ws.removeEventListener('message', onMsg);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

try {
    const target = await waitForTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
    });
    const evalExpr = async (id, expression) => {
        const result = await cdp(ws, id, 'Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        });
        if (result.exceptionDetails) {
            throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
        }
        return result.result.value;
    };

    await cdp(ws, 1, 'Runtime.enable');
    await cdp(ws, 2, 'Page.enable');
    const loaded = new Promise((resolve) => {
        const onMsg = (event) => {
            const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
            if (msg.method === 'Page.loadEventFired') {
                ws.removeEventListener('message', onMsg);
                resolve(true);
            }
        };
        ws.addEventListener('message', onMsg);
    });
    await cdp(ws, 21, 'Page.navigate', { url: URL });
    await loaded;

    await evalExpr(3, `
        document.querySelector('button.secondary')?.click();
        true
    `);

    const ui = await evalExpr(4, `
        const save = document.getElementById('saveButton');
        JSON.stringify({
            saveLabel: save ? save.textContent.trim() : null,
            printPdf: [...document.querySelectorAll('button')].some(b => /print pdf/i.test(b.textContent)),
            exportCsv: [...document.querySelectorAll('button')].some(b => /export csv/i.test(b.textContent)),
            hasClearAll: [...document.querySelectorAll('button')].some(b => /clear all/i.test(b.textContent))
        })
    `);

    const importText = await (await fetch('http://127.0.0.1:8765/example.csv')).text();
    const logCheck = await evalExpr(5, `
        const csv = ${JSON.stringify(importText)};
        window.tracker.importCSV(csv);
        const search = document.getElementById('searchInput');
        search.value = 'cycling';
        window.tracker.filterExercises();
        const filtered = window.tracker.getFilteredExercises().length;
        const all = window.tracker.exercises.length;
        const src = window.tracker.drawPdfLog.toString();
        JSON.stringify({
            all,
            filtered,
            pdfUsesFilter: src.includes('getFilteredExercises'),
            pdfUsesAll: src.includes('this.exercises'),
            filterSmaller: filtered < all && filtered > 0
        })
    `);

    const downloadCheck = await evalExpr(6, `
        (async () => {
            const downloads = [];
            const origCreate = URL.createObjectURL;
            const origClick = HTMLAnchorElement.prototype.click;
            URL.createObjectURL = (blob) => {
                downloads.push({ type: blob.type, size: blob.size });
                return origCreate.call(URL, blob);
            };
            HTMLAnchorElement.prototype.click = function() {
                downloads.push({ filename: this.download, href: this.href });
            };
            const origPicker = window.showDirectoryPicker;
            window.showDirectoryPicker = undefined;
            await window.tracker.saveReport();
            window.showDirectoryPicker = origPicker;
            URL.createObjectURL = origCreate;
            HTMLAnchorElement.prototype.click = origClick;
            return JSON.stringify({
                downloads,
                zipOnly: downloads.some(d => d.filename && d.filename.endsWith('.zip')) &&
                         !downloads.some(d => d.filename && (d.filename.endsWith('.csv') || d.filename.endsWith('.pdf')))
            });
        })()
    `);

    const parsed = {
        ui: JSON.parse(ui),
        log: JSON.parse(logCheck),
        download: JSON.parse(downloadCheck)
    };
    mkdirSync('/tmp/save-ui-check', { recursive: true });
    writeFileSync('/tmp/save-ui-check/result.json', JSON.stringify(parsed, null, 2));
    console.log(JSON.stringify(parsed, null, 2));

    const fail = [];
    if (parsed.ui.saveLabel !== 'Save') fail.push('Save button missing');
    if (parsed.ui.printPdf || parsed.ui.exportCsv) fail.push('old buttons still present');
    if (!parsed.ui.hasClearAll) fail.push('Clear All missing');
    if (!parsed.log.filterSmaller) fail.push('search filter did not shrink the on-screen log');
    if (parsed.log.pdfUsesFilter) fail.push('PDF log still reads the filter');
    if (!parsed.log.pdfUsesAll) fail.push('PDF log does not read full history');
    if (!parsed.download.zipOnly) fail.push('fallback download was not a single zip');
    if (fail.length) {
        console.error('UI CHECK FAILED: ' + fail.join('; '));
        process.exitCode = 1;
    } else {
        console.log('UI CHECK PASSED');
    }

    ws.close();
} finally {
    chrome.kill();
}
