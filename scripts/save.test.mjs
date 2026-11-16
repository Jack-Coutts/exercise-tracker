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

{
    // A note with a line break, comma or quote, and a type with a comma, must survive save then load.
    const { tracker } = loadTracker();
    tracker.exercises = [
        { id: 1, date: '2026-01-02', exercise_type: 'squash', duration_minutes: 240, notes: 'first line\nsecond line, "quoted"' },
        { id: 2, date: '2026-01-01', exercise_type: 'sauna, cold plunge', duration_minutes: 90, notes: '' }
    ];
    const csv = tracker.buildCSV();
    tracker.importCSV(csv);
    assert.deepEqual(
        // JSON copy: the rows come from the vm context, so their prototypes differ from ours.
        JSON.parse(JSON.stringify(tracker.exercises.map(({ date, exercise_type, duration_minutes, notes }) => ({ date, exercise_type, duration_minutes, notes })))),
        [
            { date: '2026-01-02', exercise_type: 'squash', duration_minutes: 240, notes: 'first line\nsecond line, "quoted"' },
            { date: '2026-01-01', exercise_type: 'sauna, cold plunge', duration_minutes: 90, notes: '' }
        ]
    );
    assert.equal(tracker.buildCSV(), csv, 'a second save writes the same file');
}

{
    // A note imports its sessions with multi-line notes, and one bad heading refuses the whole note.
    const { tracker } = loadTracker();
    // Tag-only lines are skipped wherever they sit; "#1 court" is prose and stays.
    const good = '# Exercise log\n#health/exercise\n\n#### 2026-11-16 gym 60\nLegs.\n#gym #leg day#\n\nKnee sore.\n\n#### 2026-11-15 Off Sick\n#### 2026-11-14 zone 2 40\n#1 court\n#log\n';
    tracker.importNote(good);
    const rows = () => JSON.parse(JSON.stringify(tracker.exercises.map(({ date, exercise_type, duration_minutes, notes }) => ({ date, exercise_type, duration_minutes, notes }))));
    const expected = [
        { date: '2026-11-16', exercise_type: 'gym', duration_minutes: 60, notes: 'Legs.\n\nKnee sore.' },
        { date: '2026-11-15', exercise_type: 'off sick', duration_minutes: 0, notes: '' },
        { date: '2026-11-14', exercise_type: 'zone 2', duration_minutes: 40, notes: '#1 court' }
    ];
    assert.deepEqual(rows(), expected);
    assert.equal(tracker.exerciseTypes.includes('zone 2'), true, 'a new type in a heading reaches the type list');

    const bad = '#### 2026-11-16 60\n#### 2026-02-30 squash 45\n#### 2026-11-12 squash\n#### 16/11/2026 squash 45\n#### 2026-11-10 squash 45\n';
    assert.equal(tracker.parseNote(bad).errors.map(e => e.split(':')[0]).join(), 'Line 1,Line 2,Line 3,Line 4');
    tracker.importNote(bad);
    assert.deepEqual(rows(), expected, 'a refused note leaves the loaded data untouched');
    assert.equal(tracker.parseNote('just some text').errors.length, 1, 'a note with no sessions is refused');
}

{
    // After a note import, Save writes the PDF alone: the note is the database, so no CSV may appear.
    const { tracker, downloads } = loadTracker({ showDirectoryPicker: async () => { throw new Error('note mode must not open the folder picker'); } });
    tracker.importNote('#### 2026-11-16 squash 45\n');
    await tracker.saveReport();
    const saved = downloads.filter(d => d.blob);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].filename.endsWith('.pdf'), true);
    assert.equal(saved[0].type, 'application/pdf');
}

{
    // A CSV with any unreadable row is refused whole, and the loaded data stays as it was.
    const { tracker } = loadTracker();
    const head = 'date,exercise_type,duration_minutes,notes\n';
    tracker.importCSV(head + '2026-01-02,squash,45,"ok"\n\n2026-01-01,Off Sick,,""\n');
    const state = () => tracker.exercises.map(e => `${e.date}|${e.exercise_type}|${e.duration_minutes}`).join();
    const loaded = '2026-01-02|squash|45,2026-01-01|off sick|0';
    assert.equal(state(), loaded);
    for (const row of ['2026-02-30,squash,45,""', '02/01/2026,squash,45,""', '2026-01-02,squash,45.5,""', '2026-01-02,squash,,""', '2026-01-02,,45,""']) {
        tracker.importCSV(head + '2026-01-03,running,30,""\n' + row + '\n');
        assert.equal(state(), loaded, `refused: ${row}`);
    }
    tracker.importCSV('date,exercise_type,notes\n2026-01-03,running,""\n');
    assert.equal(state(), loaded, 'a missing column is refused');
}

{
    // The Patterns numbers, on a log small enough to work out by hand. 5 Jan 2026 is a Monday.
    const { tracker } = loadTracker();
    tracker.importNote([
        '#### 2026-01-05 cycling 80', '#### 2026-01-05 squash 60', '#### 2026-01-06 cycling 40', '#### 2026-01-07 off sick',
        '#### 2026-01-11 running 30', '#### 2026-02-02 squash 45'
    ].join('\n'));
    const p = JSON.parse(JSON.stringify(tracker.calculatePatterns()));
    assert.deepEqual(p.totals, { cycling: 120, other: 135 });
    assert.deepEqual(p.dayKinds, { cyclingOnly: 1, both: 1, otherOnly: 2 });
    assert.deepEqual(p.months.map(m => [m.key, m.cycling, m.other]), [['2026-01', 120, 90], ['2026-02', 0, 45]]);
    assert.deepEqual(p.weeks.map(w => [w.start, w.cycling + w.other, w.activeDays, w.sick]),
        [['2026-01-05', 210, 3, 1], ['2026-01-12', 0, 0, 0], ['2026-01-19', 0, 0, 0], ['2026-01-26', 0, 0, 0], ['2026-02-02', 45, 1, 0]]);
    assert.deepEqual(p.activeDaysPerWeek, [3, 1, 0, 1, 0, 0, 0, 0]);
    assert.deepEqual(p.weekdayOther, [105, 0, 0, 0, 0, 0, 30]);
    assert.deepEqual(p.gaps, [
        { from: '2026-01-12', to: '2026-02-01', days: 21, sick: 0, holiday: 0 },
        { from: '2026-01-07', to: '2026-01-10', days: 4, sick: 1, holiday: 0 }
    ]);
    assert.equal(p.days['2026-01-05'].main.type, 'squash', 'cycling does not win a day that had another activity, even with more minutes');
    assert.equal(p.days['2026-01-06'].main.type, 'cycling', 'a day of cycling alone is a cycling day');
    assert.equal(p.records.week.start, '2026-01-05');
    assert.equal(p.records.session.duration_minutes, 80);
    assert.equal(tracker.buildPdfReport().length > 1000, true, 'the report builds with the Patterns pages');
}

{
    // A log with only off days has no patterns, and the report must still build.
    const { tracker } = loadTracker();
    tracker.importNote('#### 2026-01-07 off sick');
    assert.equal(tracker.calculatePatterns(), null);
    assert.equal(tracker.buildPdfReport().length > 1000, true);
}

console.log('save.test.mjs: all assertions passed');
