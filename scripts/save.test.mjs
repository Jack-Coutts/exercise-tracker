import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function mockElement() {
    return {
        value: '',
        textContent: '',
        innerHTML: '',
        classList: { add() {}, remove() {}, contains() { return false; } },
        style: {},
        appendChild() {},
        removeChild() {},
        click() {},
        onchange: null,
        setAttribute() {}
    };
}

function loadTracker(overrides = {}) {
    const elements = new Map();
    const downloads = [];
    const timeouts = [];
    const getEl = (id) => {
        if (!elements.has(id)) elements.set(id, mockElement());
        return elements.get(id);
    };
    const context = createContext({
        window: {
            isSecureContext: true,
            showDirectoryPicker: overrides.showDirectoryPicker
        },
        document: {
            getElementById: getEl,
            createElement() {
                const el = mockElement();
                Object.defineProperty(el, 'download', {
                    set(name) { el._download = name; },
                    get() { return el._download; }
                });
                Object.defineProperty(el, 'href', {
                    set(href) {
                        el._href = href;
                        if (href === 'blob:test') {
                            downloads.push({ filename: el._download, type: downloads._pendingType });
                        }
                    },
                    get() { return el._href; }
                });
                el.click = () => {
                    downloads.push({ filename: el._download, type: downloads._pendingType, blob: downloads._pendingBlob });
                };
                return el;
            },
            body: { appendChild() {}, removeChild() {} }
        },
        URL: {
            createObjectURL(blob) {
                downloads._pendingType = blob.type;
                downloads._pendingBlob = blob;
                return 'blob:test';
            },
            revokeObjectURL() {}
        },
        Blob: class {
            constructor(parts, opts = {}) {
                this.parts = parts;
                this.type = opts.type || '';
                this.size = parts.reduce((n, p) => n + (typeof p === 'string' ? p.length : p.byteLength || p.size || 0), 0);
            }
        },
        alert() {},
        setTimeout(fn, ms) {
            timeouts.push({ ms, fn });
            return timeouts.length;
        },
        Date,
        Math,
        String,
        Number,
        Array,
        Object,
        Set,
        Map,
        Uint8Array,
        parseInt,
        isNaN,
        console,
        TextEncoder,
        TextDecoder
    });
    context.window.document = context.document;
    context.globalThis = context;
    runInContext(script, context);
    return {
        tracker: runInContext('tracker', context),
        downloads,
        timeouts,
        eval: (code) => runInContext(code, context)
    };
}

function mockDir(seed = {}, failWrites = new Set(), { supportMove = true } = {}) {
    const files = new Map(Object.entries(seed).map(([name, content]) => [name, { content }]));
    return {
        files,
        snapshot() {
            return Object.fromEntries([...files.entries()].map(([name, file]) => [name, file.content]));
        },
        async getFileHandle(name, { create } = {}) {
            if (!files.has(name)) {
                if (!create) throw new Error(`missing ${name}`);
                files.set(name, { content: '' });
            }
            const file = files.get(name);
            const handle = {
                name,
                async createWritable() {
                    file.content = '';
                    return {
                        async write(data) {
                            if (failWrites.has(name)) {
                                throw Object.assign(new Error('write failed'), { name: 'QuotaExceededError' });
                            }
                            file.content = typeof data === 'string' ? data : Buffer.from(data).toString();
                        },
                        async close() {}
                    };
                }
            };
            if (supportMove) {
                handle.move = async (newName) => {
                    if (files.has(newName) && newName !== name) {
                        throw Object.assign(new Error('exists'), { name: 'InvalidModificationError' });
                    }
                    files.set(newName, files.get(name));
                    files.delete(name);
                };
            }
            return handle;
        },
        async removeEntry(name) {
            files.delete(name);
        }
    };
}

function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
}

function unzipStore(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const files = {};
    let offset = 0;
    while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const size = view.getUint32(offset + 22, true);
        const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
        const start = offset + 30 + nameLen + extraLen;
        files[name] = bytes.subarray(start, start + size);
        offset = start + size;
    }
    return files;
}

const priorCsv = 'OLD CSV CONTENTS';
const priorPdf = 'OLD PDF CONTENTS';

{
    const { tracker } = loadTracker();
    assert.equal(typeof tracker.writeFilesToDirectory, 'function', 'writeFilesToDirectory is the directory save entry');
    const dir = mockDir({
        'workout.csv': priorCsv,
        'workout.pdf': priorPdf
    }, new Set(['workout.csv.saving']));
    await assert.rejects(() => tracker.writeFilesToDirectory(dir, [
        { name: 'workout.csv', data: 'NEW CSV' },
        { name: 'workout.pdf', data: 'NEW PDF' }
    ]));
    const left = dir.snapshot();
    assert.equal(left['workout.csv'], priorCsv, 'failed temp write must not truncate the live CSV');
    assert.equal(left['workout.pdf'], priorPdf, 'failed temp write must not truncate the live PDF');
}

{
    const { tracker } = loadTracker();
    const dir = mockDir({
        'workout.csv': priorCsv,
        'workout.pdf': priorPdf
    }, new Set(['workout.pdf.saving']));
    await assert.rejects(() => tracker.writeFilesToDirectory(dir, [
        { name: 'workout.csv', data: 'NEW CSV' },
        { name: 'workout.pdf', data: 'NEW PDF' }
    ]));
    const left = dir.snapshot();
    assert.equal(left['workout.csv'], priorCsv, 'CSV stays put when the PDF temp write fails');
    assert.equal(left['workout.pdf'], priorPdf, 'PDF stays put when its temp write fails');
}

{
    const { tracker } = loadTracker();
    const dir = mockDir({
        'workout.csv': priorCsv,
        'workout.pdf': priorPdf
    }, new Set(), { supportMove: false });
    await tracker.writeFilesToDirectory(dir, [
        { name: 'workout.csv', data: 'NEW CSV' },
        { name: 'workout.pdf', data: 'NEW PDF' }
    ]);
    const left = dir.snapshot();
    assert.equal(left['workout.csv'], 'NEW CSV');
    assert.equal(left['workout.pdf'], 'NEW PDF');
    assert.equal(left['workout.csv.saving'], undefined, 'temp CSV is removed after promote');
    assert.equal(left['workout.pdf.saving'], undefined, 'temp PDF is removed after promote');
}

{
    const { tracker } = loadTracker();
    const dir = mockDir({ 'workout.csv': priorCsv });
    await tracker.writeFilesToDirectory(dir, [
        { name: 'workout.csv', data: 'NEW CSV' },
        { name: 'workout.pdf', data: 'NEW PDF' }
    ]);
    assert.equal(dir.snapshot()['workout.csv'], 'NEW CSV');
    assert.equal(dir.snapshot()['workout.pdf'], 'NEW PDF');
}

{
    const { tracker, downloads, timeouts } = loadTracker();
    const csv = 'date,exercise_type,duration_minutes,notes\n';
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    tracker.downloadBoth({
        csv: 'workout_history_2026-08-27.csv',
        pdf: 'workout_history_2026-08-27.pdf',
        zip: 'workout_history_2026-08-27.zip'
    }, csv, pdf);
    assert.equal(timeouts.filter(t => t.ms === 250).length, 0, 'second file must not wait on a timer');
    const zipDownloads = downloads.filter(d => d.filename && d.filename.endsWith('.zip'));
    assert.equal(zipDownloads.length, 1, 'fallback is one zip download');
    const blob = zipDownloads[0].blob;
    const zipBytes = blob.parts[0];
    const files = unzipStore(zipBytes);
    assert.ok(files['workout_history_2026-08-27.csv'], 'zip contains the CSV');
    assert.ok(files['workout_history_2026-08-27.pdf'], 'zip contains the PDF');
    assert.equal(new TextDecoder().decode(files['workout_history_2026-08-27.csv']), csv);
    assert.deepEqual([...files['workout_history_2026-08-27.pdf']], [...pdf]);
    assert.equal(crc32(files['workout_history_2026-08-27.pdf']), crc32(pdf));
}

{
    const { tracker } = loadTracker();
    const src = tracker.drawPdfLog.toString();
    assert.equal(src.includes('getFilteredExercises'), false, 'PDF log must not follow the on-screen filter');
    assert.equal(src.includes('this.exercises'), true, 'PDF log dumps the full history');
}

console.log('save.test.mjs: all assertions passed');
