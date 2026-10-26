// Server tests: runs the real server/Code.gs + server/Tests.gs against simulated Google services.
//   node tests/server_test.cjs        (from the repo root)
// Only real Apps Script method names are implemented, so a typo in a call fails here.
// Writes tests/output/sheet_<form>.html (a rendering of the built Sheet) for a visual check.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, {recursive: true});
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  ' + (detail || ''))); };

// ---------------- simulated Google services ----------------
let idSeq = 1; const nextId = p => p + (idSeq++);
class Blob { constructor(bytes, type, name) { this.bytes = bytes; this.type = type; this.name = name; }
  getBytes() { return this.bytes; } getContentType() { return this.type; } getName() { return this.name; } setName(n) { this.name = n; return this; }
  getDataAsString() { return Buffer.from(this.bytes).toString('utf8'); } }
const FILES = {}, FOLDERS = {};
class File { constructor(blob, parent) { this.id = nextId('file'); this.blob = blob; this.parent = parent; this.trashed = false; this.updated = new Date(); FILES[this.id] = this; }
  getId() { return this.id; } getName() { return this.blob.name; } getUrl() { return 'https://drive/' + this.id; } getBlob() { return this.blob; }
  getLastUpdated() { return this.updated; } setTrashed(t) { this.trashed = t; return this; } moveTo(f) { this.parent = f; return this; } getDateCreated() { return this.updated; }
  getParents() { const p = this.parent; let done = false; return {hasNext: () => !done, next: () => { done = true; return p; }}; } }
class Folder { constructor(name, parent) { this.id = nextId('folder'); this.name = name; this.parent = parent; FOLDERS[this.id] = this; }
  getId() { return this.id; } getName() { return this.name; } getUrl() { return 'https://drive/folder/' + this.id; }
  kids() { return Object.values(FOLDERS).filter(f => f.parent === this); }
  files() { return Object.values(FILES).filter(f => f.parent === this && !f.trashed); }
  getFoldersByName(n) { return iter(this.kids().filter(f => f.name === n)); } createFolder(n) { return new Folder(n, this); }
  createFile(blob) { return new File(blob, this); } getFiles() { return iter(this.files()); } getFilesByName(n) { return iter(this.files().filter(f => f.getName() === n)); } }
const iter = list => { let i = 0; return {hasNext: () => i < list.length, next: () => list[i++]}; };
const DRIVE_ROOT = new Folder('shared drive', null);
FOLDERS['12_cTjHsJKCmpDcE9gkcaPM8zScJEcyGm'] = Object.assign(new Folder('Testing & Inspections', DRIVE_ROOT), {id: '12_cTjHsJKCmpDcE9gkcaPM8zScJEcyGm'});
FOLDERS['1mjmJMDvhFOfcuXxx-f12l1usknQdPYeK'] = Object.assign(new Folder('Rounds', DRIVE_ROOT), {id: '1mjmJMDvhFOfcuXxx-f12l1usknQdPYeK'});
FOLDERS['1nZSvdhg2heWL9qhHB8-Po5oLL5n4vLjO'] = Object.assign(new Folder('Rounds Photos', DRIVE_ROOT), {id: '1nZSvdhg2heWL9qhHB8-Po5oLL5n4vLjO'});

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, {sh, r, c, nr: nr || 1, nc: nc || 1}); }
  each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.sh.cell(this.r + i, this.c + j), i, j); return this; }
  setValue(v) { return this.each(x => x.v = v); } getValue() { return this.sh.cell(this.r, this.c).v; }
  setValues(a) { if (a.length !== this.nr || a[0].length !== this.nc) throw new Error('setValues size mismatch'); return this.each((x, i, j) => x.v = a[i][j]); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.cell(this.r + i, this.c + j).v); out.push(row); } return out; }
  merge() { this.sh.merges.push([this.r, this.c, this.nr, this.nc]); return this; }
  breakApart() { this.sh.merges = []; return this; }
  setFontWeight(w) { return this.each(x => x.bold = w === 'bold'); } setFontStyle(s) { return this.each(x => x.italic = s === 'italic'); }
  setBackground(b) { return this.each(x => x.bg = b); } setFontColor(c) { return this.each(x => x.color = c); } setFontSize(s) { return this.each(x => x.size = s); }
  setHorizontalAlignment(a) { return this.each(x => x.align = a); } setVerticalAlignment(a) { return this.each(x => x.valign = a); }
  setBorder(t, l, b, r, v, h, color, style) { if (arguments.length < 6) throw new Error('setBorder needs 6+ args'); return this.each(x => x.border = true); }
  setWrap(w) { return this.each(x => x.wrap = w); } setNumberFormat() { return this; } setFontFamily() { return this; }
  clearContent() { return this.each(x => x.v = ''); } clearDataValidations() { return this; } insertCheckboxes() { return this; } setNotes() { return this; } setBackgrounds() { return this; }
  createTextFinder() { return {matchEntireCell: () => ({findNext: () => null})}; } getRow() { return this.r; } getBackground() { return this.sh.cell(this.r, this.c).bg || '#ffffff'; }
}
class Sheet {
  constructor(name) { this.name = name; this.cells = {}; this.merges = []; this.widths = {}; this.heights = {}; this.images = []; this.maxR = 1000; this.maxC = 26; this.id = idSeq++; }
  cell(r, c) { const k = r + ',' + c; if (r > this.maxR || c > this.maxC) throw new Error('cell outside sheet ' + k); return this.cells[k] || (this.cells[k] = {v: ''}); }
  getRange(r, c, nr, nc) { if (typeof r === 'string') { const m = /^([A-Z]):([A-Z])$/.exec(r); return new Range(this, 1, m[1].charCodeAt(0) - 64, this.maxR, m[2].charCodeAt(0) - m[1].charCodeAt(0) + 1); } return new Range(this, r, c, nr, nc); }
  getName() { return this.name; } setName(n) { this.name = n; return this; } getSheetId() { return this.id; }
  setColumnWidth(c, w) { this.widths[c] = w; return this; } setRowHeights(r, n, h) { for (let i = 0; i < n; i++) this.heights[r + i] = h; return this; } setRowHeight(r, h) { this.heights[r] = h; return this; }
  getImages() { return this.images.slice(); } clear() { this.cells = {}; return this; } clearFormats() { return this; }
  getMaxRows() { return this.maxR; } getMaxColumns() { return this.maxC; } setHiddenGridlines() { return this; }
  insertImage(blob, c, r, ox, oy) { const sh = this; const im = {c, r, ox, oy, w: 800, h: 367, getWidth() { return this.w; }, getHeight() { return this.h; },
    setWidth(w) { this.w = w; return this; }, setHeight(h) { this.h = h; return this; }, remove() { sh.images = sh.images.filter(x => x !== this); }}; this.images.push(im); return im; }
  deleteRows(s, n) { this.maxR = s - 1; return this; } deleteColumns(s, n) { this.maxC = s - 1; return this; }
  getLastRow() { let m = 0; Object.keys(this.cells).forEach(k => { const [r] = k.split(',').map(Number); if (this.cells[k].v !== '' && r > m) m = r; }); return m; }
  getLastColumn() { let m = 0; Object.keys(this.cells).forEach(k => { const c = Number(k.split(',')[1]); if (this.cells[k].v !== '' && c > m) m = c; }); return m; }
  setFrozenRows() { return this; } hideColumns() { return this; } insertRowsAfter(a, n) { this.maxR += n; return this; } insertColumnsAfter(a, n) { this.maxC += n; return this; } appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this.cell(r, j + 1).v = v); }
}
class SS { constructor(name) { this.id = nextId('ss'); this.name = name; this.sheets = [new Sheet('Sheet1')]; SHEETS[this.id] = this; this.file = new File(new Blob([], 'sheet', name), DRIVE_ROOT); FILES[this.id] = this.file; this.file.id = this.id; }
  getSheets() { return this.sheets; } getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; } insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getId() { return this.id; } getName() { return this.name; } rename(n) { this.name = n; this.file.blob.name = n; return this; } setSpreadsheetTimeZone() { return this; } getUrl() { return 'https://sheets/' + this.id; } deleteSheet() {} }
const SHEETS = {};
const MAIN = new SS('343 Sansome Rounds'); SHEETS['1GAoLIjy2pqGIQe9i0JJnuUPzUl8y-6OZ8L0d-995kuY'] = MAIN;
const props = {SESSION_SECRET: 'secret', CONFIG_VERSION: '1'};
const fix = n => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n));
const assets = FOLDERS['1mjmJMDvhFOfcuXxx-f12l1usknQdPYeK'].createFolder('Test Form Assets');
['master_diesel.pdf', 'master_electric.pdf', 'sig_scott.png', 'sig_jacky.png'].forEach(n => assets.createFile(new Blob(fix(n), 'x', n)));
let pdfExports = 0;
const G = {
  console, JSON, Date, Math, Number, String, Array, Object, Error, RegExp, isNaN, parseFloat, Buffer,
  Logger: {log: () => {}},
  SpreadsheetApp: {openById: id => { if (!SHEETS[id]) throw new Error('no sheet ' + id); return SHEETS[id]; }, create: n => new SS(n), flush: () => {}, BorderStyle: {SOLID: 'SOLID'}},
  DriveApp: {getFolderById: id => { if (!FOLDERS[id]) throw new Error('no folder ' + id); return FOLDERS[id]; }, getFileById: id => { if (!FILES[id]) throw new Error('no file ' + id); return FILES[id]; }},
  Utilities: {base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'), newBlob: (b, t, n) => new Blob(b, t, n),
    formatDate: (d, tz, f) => { const z = new Date(d); const p = x => String(x).padStart(2, '0');
      return f.replace('yyyy', z.getFullYear()).replace('MMMM', z.toLocaleString('en-US', {month: 'long'})).replace('MM', p(z.getMonth() + 1)).replace('dd', p(z.getDate()))
        .replace('HH', p(z.getHours())).replace('mm', p(z.getMinutes())).replace('ss', p(z.getSeconds())).replace('h:', ((z.getHours() + 11) % 12 + 1) + ':').replace(' a', z.getHours() < 12 ? ' AM' : ' PM'); },
    sleep: () => {}, getUuid: () => 'uuid', computeHmacSha256Signature: (b, s) => Buffer.from(require('crypto').createHmac('sha256', s).update(b).digest()),
    base64EncodeWebSafe: b => Buffer.from(typeof b === 'string' ? Buffer.from(b) : b).toString('base64url'), base64DecodeWebSafe: s => Buffer.from(s, 'base64url')},
  UrlFetchApp: {fetch: (url) => { if (/export\?format=pdf/.test(url)) { pdfExports++; return {getResponseCode: () => 200, getBlob: () => new Blob(Buffer.from('%PDF-1.4 sim'), 'application/pdf', 'x.pdf')}; }
    return {getResponseCode: () => 200, getContentText: () => '{}'}; }},
  ScriptApp: {getOAuthToken: () => 'token'},
  PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }})},
  LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
  ContentService: {createTextOutput: s => ({setMimeType() { return JSON.parse(s); }}), MimeType: {JSON: 'json'}},
  MailApp: {getRemainingDailyQuota: () => 100}
};
vm.createContext(G);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'server', 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'server', 'Tests.gs'), 'utf8') +
  '\n;globalThis.__api={doPost,setupTests_,submitTest_,testSync_,testAssets_,cleanRecord_,makeSession_,testFormsSelfCheck,TESTS};', G, {filename: 'server'});
const S = G.__api;
// Users tab for sessions
const users = MAIN.insertSheet('Users');
[['Email', 'Name', 'Role', 'Active', 'Rounds'], ['scott@343sansomesf.com', 'Scott', 'admin', true, 'all'], ['jacky@343sansomesf.com', 'Jacky', 'engineer', true, 'all']]
  .forEach((r, i) => r.forEach((v, j) => users.cell(i + 1, j + 1).v = v));
const session = S.makeSession_('scott@343sansomesf.com');
const post = body => G.__api.doPost({postData: {contents: JSON.stringify(Object.assign({session}, body))}});

console.log('Setup and routing');
S.setupTests_();
check('Test Records tab created', !!MAIN.getSheetByName('Test Records'));
check('Test Records headers', MAIN.getSheetByName('Test Records').cell(1, 1).v === 'Record ID');
const sync0 = post({action: 'testSync'});
check('testSync via doPost', sync0.ok && Array.isArray(sync0.records) && sync0.records.length === 0, JSON.stringify(sync0));
check('assets version reported', /master_diesel\.pdf/.test(sync0.assetsVersion));
const as = post({action: 'testAssets'});
check('testAssets returns 4 files', as.ok && Object.keys(as.files).sort().join() === 'master_diesel,master_electric,sig_jacky,sig_scott', Object.keys(as.files || {}));
check('unknown action still errors', post({action: 'nope'}).ok === false);
check('no session rejected', G.__api.doPost({postData: {contents: JSON.stringify({action: 'testSync'})}}).code === 'AUTH');

console.log('Fire pump PDFs: one file per cycle, replaced on each save');
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
const d1 = {id: 'd1', form: 'diesel', date: '2026-10-06', t0: '2026-10-06T14:00:00Z', updated: '2026-10-06T15:00:00Z', status: 'complete', tester: 'scott', testerName: 'Scott Morris', cycle: '2026-10', values: {'1.5': 'P'}, defs: []};
let r = post({action: 'submitTest', record: d1, pdf, fileName: '2026-10-06 Diesel Fire Pump Weekly Test.pdf'});
check('diesel saved', r.ok && /drive\/file/.test(r.url), JSON.stringify(r));
const f1 = Object.values(FILES).find(f => f.getName() === '2026-10-06 Diesel Fire Pump Weekly Test.pdf');
check('in Fire Pump/Diesel Weekly/2026', f1 && f1.parent.name === '2026' && f1.parent.parent.name === 'Diesel Weekly' && f1.parent.parent.parent.name === 'Fire Pump');
const d2 = Object.assign({}, d1, {id: 'd2', date: '2026-10-13', t0: '2026-10-13T14:00:00Z', updated: '2026-10-13T15:00:00Z', tester: 'jacky', testerName: 'Jacky Cheung'});
r = post({action: 'submitTest', record: d2, pdf, fileName: '2026-10-06 to 2026-10-13 Diesel Fire Pump Weekly Test.pdf'});
check('first file trashed when second week saved', f1.trashed === true);
const tr = MAIN.getSheetByName('Test Records');
check('both rows point at the new file', tr.cell(2, 8).v === tr.cell(3, 8).v && tr.cell(2, 8).v === r.url);
// stale edit ignored
r = post({action: 'submitTest', record: Object.assign({}, d1, {updated: '2026-10-01T00:00:00Z', values: {'1.5': 'F'}}), pdf, fileName: 'x.pdf'});
check('older edit does not overwrite newer', r.stale === true && JSON.parse(tr.cell(2, 11).v).values['1.5'] === 'P');
// edit
r = post({action: 'submitTest', record: Object.assign({}, d1, {updated: '2026-10-20T00:00:00Z', values: {'1.5': 'F'}}), pdf, fileName: '2026-10-06 to 2026-10-13 Diesel Fire Pump Weekly Test.pdf'});
check('edit updates same row', tr.getLastRow() === 3 && JSON.parse(tr.cell(2, 11).v).values['1.5'] === 'F');
check('missing pdf rejected', post({action: 'submitTest', record: Object.assign({}, d1, {id: 'd9'})}).ok === false);
check('missing cycle rejected', post({action: 'submitTest', record: Object.assign({}, d1, {id: 'd8', cycle: ''}), pdf}).ok === false);

console.log('Generator and Elevator Sheets');
const now = '2026-10-27T14:02:00Z';
const gen = {id: 'g1', form: 'generator', date: '2026-10-27', t0: now, updated: now, status: 'complete', tester: 'scott', testerName: 'Scott Morris', testType: 'ATS Transfer',
  values: {g_type: 'ATS Transfer', g_sec: '✓', g_sie: '✓', g_atsal: '✓', g_cond1: '✓', g_cond2: '✓', g_ctl: 'Auto', g_bat: '27.6', g_cool: '✓', g_oillvl: '✓', g_blk: '112', g_day: '7/8', g_hrs1: '1284.2',
    g_start: now, g_ats1: 'Transferred to Emergency', g_ats2: 'N/A', g_gcf: '✓', g_gcp: '✓', g_stop: '2026-10-27T14:34:00Z', g_hrs2: '1284.7', g_ctl2: '✓', g_ats1r: '✓', g_atsal2: '✓', g_secd: '✓'},
  sets: [0, 1, 2].map(k => ({time: ['7:05 AM', '7:20 AM', '7:32 AM'][k], vals: {oil: '46', ect: '170', hz: '60.0', v_ab: '480', v_ac: '479', v_bc: '481', a_a: '0', a_b: '0', a_c: '0',
    ehx_ci: k === 2 ? '168' : '150', ehx_co: '140', ehx_ri: '88', ehx_ro: '101', fhx_i: '94', fhx_o: '85', fuel_sup: '78', rlp_i: '12', rlp_o: '4', c_cool: '✓', c_rcf: '✓', c_rcfa: '✓'}})),
  notes: ['Set 3: engine coolant in 168°F, above 165°F normal. Monitoring next test.']};
r = post({action: 'submitTest', record: gen});
check('generator saved', r.ok, JSON.stringify(r));
const gss = Object.values(SHEETS).find(s => s.name === '2026-10-27 Generator Monthly Test');
check('generator Sheet created and named', !!gss);
check('generator Sheet in Generator/2026', gss && gss.file.parent.name === '2026' && gss.file.parent.parent.name === 'Generator');
const gpdf = Object.values(FILES).find(f => f.getName() === '2026-10-27 Generator Monthly Test.pdf');
check('PDF copy beside Sheet', gpdf && gpdf.parent === gss.file.parent);
const gsh = gss.getSheets()[0];
const allVals = Object.values(gsh.cells).map(c => String(c.v));
check('flag on out-of-range reading', allVals.includes('168°F ▲'));
check('units appended', allVals.includes('46 psi') && allVals.includes('480 V') && allVals.includes('60.0 Hz'));
check('ATS retransfer rows', allVals.includes('ATS-1 retransferred to normal') && allVals.includes('N/A'));
check('run time calculated', allVals.includes('32 min'));
check('signature stamped', gsh.images.length === 1);
check('no Load Bank values on ATS test', !allVals.some(v => / kW$/.test(v)));
// edit regenerates in place
const pdfCount = Object.values(FILES).filter(f => /Generator Monthly Test\.pdf$/.test(f.getName()) && !f.trashed).length;
r = post({action: 'submitTest', record: Object.assign({}, gen, {updated: '2026-10-28T00:00:00Z', notes: ['Edited note']})});
check('edit saved', r.ok, JSON.stringify(r));
check('edit reuses the Sheet', Object.values(SHEETS).filter(s => /Generator Monthly Test/.test(s.name)).length === 1);
check('edit replaces the PDF', Object.values(FILES).filter(f => /Generator Monthly Test\.pdf$/.test(f.getName()) && !f.trashed).length === pdfCount);
check('only one signature after rebuild', gsh.images.length === 1, gsh.images.length + ' ' + (gss.getSheets()[0]===gsh));
// second test same day
r = post({action: 'submitTest', record: Object.assign({}, gen, {id: 'g2', t0: '2026-10-27T20:00:00Z', updated: '2026-10-27T21:00:00Z', testType: 'Load Bank',
  sets: [{time: '1:00 PM', vals: {kw: '150', oil: '45'}}]})});
check('second test same day gets (2)', Object.values(SHEETS).some(s => s.name === '2026-10-27 Generator Monthly Test (2)'));
const lb = Object.values(SHEETS).find(s => s.name === '2026-10-27 Generator Monthly Test (2)').getSheets()[0];
check('Load Bank kW shown', Object.values(lb.cells).some(c => c.v === '150 kW'));

const elev = {id: 'e1', form: 'elevator', date: '2026-10-26', t0: now, updated: now, status: 'complete', tester: 'jacky', testerName: 'Jacky Cheung', values: {}, notes: ['Car C (F): Door close button / left side. Button sticks.']};
['p1.fcc', 'p1.lobby', 'p1.parked', 'p2.lamp', 'p2.bell_l', 'p2.bell_r', 'p2.close_l', 'p2.close_r', 'p2.photo', 'p2.open_l', 'p2.open_r', 'p2.hold', 'p2.phone', 'p2.addr', 'p2.carid', 'p2.cancel', 'p3.normal']
  .forEach(k => 'ABCDEP'.split('').forEach(c => elev.values[k + '.' + c] = '✓'));
elev.values['p2.close_l.C'] = 'F';
r = post({action: 'submitTest', record: elev});
check('elevator saved', r.ok, JSON.stringify(r));
const ess = Object.values(SHEETS).find(s => s.name === '2026-10-26 Elevator Phase I and II Test');
check('elevator Sheet in Elevator/2026', ess && ess.file.parent.parent.name === 'Elevator');
const esh = ess.getSheets()[0], ev = Object.values(esh.cells).map(c => String(c.v));
check('revision footer', ev.includes('Revision 10/26/2026'));
check('legend ✓/F', ev.includes('✓ = Pass   F = Fail'));
check('new Phase 2 items', ev.includes('Operator identifies building address') && ev.includes('Confirm elevator phone operation'));
check('incomplete marked in title', (() => { post({action: 'submitTest', record: Object.assign({}, elev, {id: 'e2', status: 'incomplete', t0: '2026-10-27T20:00:00Z', updated: now})});
  const s = Object.values(SHEETS).find(x => x.name === '2026-10-26 Elevator Phase I and II Test (2)'); return s && Object.values(s.getSheets()[0].cells).some(c => /INCOMPLETE/.test(String(c.v))); })());
check('sync returns saved records', post({action: 'testSync'}).records.length === 6, post({action: 'testSync'}).records.length);
check('PDF exports requested', pdfExports >= 4, pdfExports);

console.log('Self-check function');
let ok = true; try { S.testFormsSelfCheck(); } catch (e) { ok = false; console.log(e); }
check('testFormsSelfCheck runs', ok);

// ---------- render built Sheets to HTML for a visual check ----------
function renderSheet(sh, file) {
  const maxR = Math.min(sh.maxR, 70), maxC = Math.min(sh.maxC, 8);
  const covered = {}, span = {};
  sh.merges.forEach(([r, c, nr, nc]) => { span[r + ',' + c] = [nr, nc]; for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (i || j) covered[(r + i) + ',' + (c + j)] = 1; });
  let h = '<html><body style="margin:0;background:#fff"><div style="width:816px;padding:38px;box-sizing:border-box"><table style="border-collapse:collapse;table-layout:fixed;font-family:Arial">';
  h += '<colgroup>' + Array.from({length: maxC}, (_, j) => '<col style="width:' + (sh.widths[j + 1] || 100) + 'px">').join('') + '</colgroup>';
  for (let r = 1; r <= maxR; r++) {
    h += '<tr style="height:' + (sh.heights[r] || 21) + 'px;line-height:1.1">';
    for (let c = 1; c <= maxC; c++) {
      if (covered[r + ',' + c]) continue;
      const x = sh.cells[r + ',' + c] || {v: ''}, sp = span[r + ',' + c] || [1, 1];
      const st = ['padding:0 4px', 'font-size:' + (x.size || 9) + 'pt', x.bold ? 'font-weight:bold' : '', x.italic ? 'font-style:italic' : '', x.bg ? 'background:' + x.bg : '',
        x.color ? 'color:' + x.color : '', 'text-align:' + (x.align || 'left'), 'vertical-align:' + (x.valign || 'middle'), x.border ? 'border:1px solid #444' : '', 'white-space:' + (x.wrap ? 'pre-wrap' : 'nowrap'), 'overflow:hidden'].filter(Boolean).join(';');
      const img = sh.images.find(i => i.r === r && i.c === c);
      h += '<td rowspan="' + sp[0] + '" colspan="' + sp[1] + '" style="' + st + '">' + String(x.v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') +
        (img ? ' <span style="font-family:cursive;font-size:18px;color:#1a237e">[signature]</span>' : '') + '</td>';
    }
    h += '</tr>';
  }
  fs.writeFileSync(path.join(OUT, file), h + '</table></div></body></html>');
}
renderSheet(gsh, 'sheet_generator.html'); renderSheet(esh, 'sheet_elevator.html'); renderSheet(lb, 'sheet_generator_loadbank.html');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
