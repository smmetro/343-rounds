// ============================================================
// 343 SANSOME ROUNDS: TEST FORMS (server side)
// Second file in the same Apps Script project as Code.gs.
//
// Elevator Phase I & II and Generator Monthly:
//   one Google Sheet per test, built here, with a PDF copy beside it.
// Diesel Fire Pump Weekly / Electric Fire Pump Monthly (NFPA 25 AES forms):
//   the phone fills the state PDF; this saves it (one file per form cycle).
// Every test is also kept as a record on the "Test Records" tab so either
// phone can reopen it for editing.
//
// Files: shared drive > Logs > Testing & Inspections > {Generator | Elevator | Fire Pump/...} > {year}
// Blank forms + signature stamps: Logs > Rounds > Test Form Assets (private, never on GitHub)
// ============================================================

const TESTS = {
  ROOT_ID: '12_cTjHsJKCmpDcE9gkcaPM8zScJEcyGm',      // Logs > Testing & Inspections
  ASSETS_FOLDER: 'Test Form Assets',                    // inside the Rounds folder
  TAB: 'Test Records',
  HEADERS: ['Record ID', 'Form', 'Date', 'Tester', 'Status', 'Cycle', 'Updated', 'File', 'File ID', 'Sheet ID', 'Data'],
  SYNC_DAYS: 550,
  NAMES: {
    elevator: 'Elevator Phase I and II Test', generator: 'Generator Monthly Test',
    diesel: 'Diesel Fire Pump Weekly Test', electric: 'Electric Fire Pump Monthly Test'
  },
  FOLDERS: {elevator: ['Elevator'], generator: ['Generator'], diesel: ['Fire Pump', 'Diesel Weekly'], electric: ['Fire Pump', 'Electric Monthly']},
  ELEV_REVISION: 'Revision 10/26/2026'
};

// ---------- setup (called from setup() in Code.gs) ----------
function setupTests_() {
  const ss = ss_();
  let sh = ss.getSheetByName(TESTS.TAB);
  if (!sh) {
    sh = ss.insertSheet(TESTS.TAB);
    sh.getRange(1, 1, 1, TESTS.HEADERS.length).setValues([TESTS.HEADERS]);
    styleHeader_(sh, TESTS.HEADERS.length);
    sh.setFrozenRows(1);
    sh.getRange('C:C').setNumberFormat('@');
    sh.hideColumns(9, 3);
  }
  const assets = testAssetsFolder_();
  DriveApp.getFolderById(TESTS.ROOT_ID).getName();
  Logger.log('Test forms ready. Put master_diesel.pdf, master_electric.pdf, sig_scott.png, sig_jacky.png in ' + assets.getUrl());
}
function testAssetsFolder_() { return folder_(DriveApp.getFolderById(CONFIG.ROUNDS_FOLDER_ID), TESTS.ASSETS_FOLDER); }

// ---------- actions ----------
function testSync_(user) {
  const cutoff = Utilities.formatDate(new Date(Date.now() - TESTS.SYNC_DAYS * 86400000), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const records = testRows_().filter(r => r.date >= cutoff).map(r => r.rec);
  return {ok: true, records: records, assetsVersion: testAssetsVersion_()};
}

function testAssetsVersion_() {
  const it = testAssetsFolder_().getFiles();
  const parts = [];
  while (it.hasNext()) { const f = it.next(); parts.push(f.getName() + ':' + f.getLastUpdated().getTime()); }
  return parts.sort().join('|');
}

function testAssets_(user) {
  const it = testAssetsFolder_().getFiles();
  const files = {};
  while (it.hasNext()) {
    const f = it.next();
    const m = /^(master_(diesel|electric)\.pdf|sig_[a-z]+\.png)$/i.exec(f.getName());
    if (!m) continue;
    files[f.getName().replace(/\.(pdf|png)$/i, '').toLowerCase()] = Utilities.base64Encode(f.getBlob().getBytes());
  }
  if (!files.master_diesel || !files.master_electric) throw new Error('Blank fire pump forms missing from Rounds > ' + TESTS.ASSETS_FOLDER + '.');
  return {ok: true, version: testAssetsVersion_(), files: files};
}

function submitTest_(user, req) {
  const rec = cleanRecord_(req.record);
  const sh = ss_().getSheetByName(TESTS.TAB);
  if (!sh) throw new Error('Run setup() in Apps Script first (Test Records tab missing).');
  const rows = testRows_();
  const old = rows.find(r => r.rec.id === rec.id);
  if (old && old.rec.updated && rec.updated && old.rec.updated > rec.updated) {
    return {ok: true, stale: true, record: old.rec};   // a newer edit already arrived
  }
  rec.savedBy = user.name;
  let file = {url: old ? old.url : '', fileId: old ? old.fileId : '', sheetId: old ? old.sheetId : ''};

  if (rec.form === 'diesel' || rec.form === 'electric') {
    if (!req.pdf) throw new Error('Fire pump test arrived without its PDF.');
    // one PDF per form cycle; replace the previous copy
    const cyc = rows.filter(r => r.rec.form === rec.form && r.rec.cycle === rec.cycle && r.rec.id !== rec.id);
    const prevId = (old && old.fileId) || (cyc.find(r => r.fileId) || {}).fileId;
    const folder = testFolder_(rec.form, rec.cycle.replace(/^E/, '').slice(0, 4));
    const blob = Utilities.newBlob(Utilities.base64Decode(req.pdf), 'application/pdf', safeName_(req.fileName || (rec.date + ' ' + TESTS.NAMES[rec.form])) + (/\.pdf$/i.test(req.fileName || '') ? '' : '.pdf'));
    const f = folder.createFile(blob);
    if (prevId && prevId !== f.getId()) { try { DriveApp.getFileById(prevId).setTrashed(true); } catch (e) { /* already gone */ } }
    file = {url: f.getUrl(), fileId: f.getId(), sheetId: ''};
    // every test in the cycle now points at the new file
    cyc.forEach(r => { sh.getRange(r.row, 8, 1, 2).setValues([[f.getUrl(), f.getId()]]); });
  } else {
    file = buildTestSheet_(rec, rows, file);
  }
  rec.url = file.url;
  const row = [rec.id, rec.form, rec.date, rec.testerName || rec.tester, rec.status, rec.cycle || '', rec.updated || new Date().toISOString(),
    file.url, file.fileId, file.sheetId || '', JSON.stringify(rec)];
  if (old) sh.getRange(old.row, 1, 1, row.length).setValues([row]);
  else appendRows_(sh, [row]);
  return {ok: true, record: rec, url: file.url};
}

function cleanRecord_(r) {
  if (!r || !r.id || !TESTS.NAMES[r.form]) throw new Error('Test record incomplete.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) throw new Error('Test date not valid.');
  if ((r.form === 'diesel' || r.form === 'electric') && !r.cycle) throw new Error('Fire pump test is missing its form cycle.');
  return {
    id: String(r.id), form: r.form, date: r.date, t0: r.t0 || '', t1: r.t1 || '', updated: r.updated || new Date().toISOString(),
    status: r.status === 'incomplete' ? 'incomplete' : 'complete', tester: str_(r.tester), testerName: str_(r.testerName), testerEmail: str_(r.testerEmail),
    values: r.values || {}, defs: r.defs || [], notes: r.notes || [], cycle: r.cycle || '', testType: r.testType || '', sets: r.sets || []
  };
}

function testRows_() {
  const sh = ss_().getSheetByName(TESTS.TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, TESTS.HEADERS.length).getValues().map((v, i) => {
    let rec = null; try { rec = JSON.parse(v[10]); } catch (e) { return null; }
    rec.url = v[7];
    return {row: i + 2, rec: rec, date: String(v[2]), url: v[7], fileId: v[8], sheetId: v[9]};
  }).filter(Boolean);
}

function testFolder_(form, year) {
  let f = DriveApp.getFolderById(TESTS.ROOT_ID);
  TESTS.FOLDERS[form].forEach(n => { f = folder_(f, n); });
  return folder_(f, String(year));
}

// ============================================================
// GOOGLE SHEET OUTPUT (Generator, Elevator)
// ============================================================
function buildTestSheet_(rec, rows, prev) {
  const sameDay = rows.filter(r => r.rec.form === rec.form && r.rec.date === rec.date && r.rec.id !== rec.id && (r.rec.t0 || '') < (rec.t0 || ''));
  const name = rec.date + ' ' + TESTS.NAMES[rec.form] + (sameDay.length ? ' (' + (sameDay.length + 1) + ')' : '');
  const folder = testFolder_(rec.form, rec.date.slice(0, 4));
  let ss;
  if (prev.sheetId) { try { ss = SpreadsheetApp.openById(prev.sheetId); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(name);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  } else if (ss.getName() !== name) ss.rename(name);
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  let sh = ss.getSheets()[0];
  sh.setName(rec.form === 'generator' ? 'Generator Test' : 'Phase I and II');
  sh.getImages().forEach(im => im.remove());
  sh.clear(); sh.clearFormats();
  // a rebuilt sheet was trimmed last time: give it room again
  if (sh.getMaxRows() < 90) sh.insertRowsAfter(sh.getMaxRows(), 90 - sh.getMaxRows());
  if (sh.getMaxColumns() < 10) sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.setHiddenGridlines(true);

  if (rec.form === 'generator') layoutGenerator_(sh, rec); else layoutElevator_(sh, rec);
  SpreadsheetApp.flush();

  // PDF copy beside the Sheet, replacing the previous one
  const pdf = exportSheetPdf_(ss, sh, name);
  const pf = folder.createFile(pdf);
  if (prev.fileId) { try { DriveApp.getFileById(prev.fileId).setTrashed(true); } catch (e) { /* gone */ } }
  return {url: ss.getUrl(), fileId: pf.getId(), sheetId: ss.getId()};
}

function exportSheetPdf_(ss, sh, name) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&size=letter&portrait=true&fitw=true' +
    '&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER' +
    '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4&gid=' + sh.getSheetId();
  let resp;
  for (let i = 0; i < 3; i++) {
    resp = UrlFetchApp.fetch(url, {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
    if (resp.getResponseCode() === 200) break;
    Utilities.sleep(1500 * (i + 1));
  }
  if (resp.getResponseCode() !== 200) throw new Error('PDF export failed (' + resp.getResponseCode() + ')');
  return resp.getBlob().setName(name + '.pdf');
}

function sigBlob_(tester) {
  const it = testAssetsFolder_().getFilesByName('sig_' + String(tester || '').toLowerCase() + '.png');
  return it.hasNext() ? it.next().getBlob() : null;
}
function mdy_(ymd) { const p = String(ymd).split('-'); return p[1] + '/' + p[2] + '/' + p[0]; }
function tm_(iso) { return iso ? Utilities.formatDate(new Date(iso), CONFIG.TIMEZONE, 'h:mm a') : ''; }

// small sheet helpers
const GRID = '#444444', SEC_BG = '#bfbfbf', SUB_BG = '#efefef', HEAD_BG = '#d9d9d9', FLAG = '#c00000';
function box_(r) { return r.setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID); }
function put_(sh, row, col, val, opt) {
  const r = sh.getRange(row, col, 1, (opt && opt.span) || 1);
  if (opt && opt.span > 1) r.merge();
  r.setValue(val === undefined || val === null ? '' : val);
  if (opt) {
    if (opt.bold) r.setFontWeight('bold');
    if (opt.italic) r.setFontStyle('italic');
    if (opt.bg) r.setBackground(opt.bg);
    if (opt.color) r.setFontColor(opt.color);
    if (opt.size) r.setFontSize(opt.size);
    if (opt.align) r.setHorizontalAlignment(opt.align);
    if (opt.box) box_(r);
  }
  return r;
}

// ---------- Generator ----------
const GEN_ROWS = [ // [id, label, unit, lo, hi, group]
  ['kw', 'Load (Load Bank only)', 'kW'], ['oil', 'Oil pressure', 'psi', 40, 50], ['ect', 'Engine coolant temp', '°F', 160, 180], ['hz', 'Frequency', 'Hz'],
  ['#', 'Voltage'], ['v_ab', 'A-B', 'V'], ['v_ac', 'A-C', 'V'], ['v_bc', 'B-C', 'V'],
  ['#', 'Current'], ['a_a', 'Phase A', 'A'], ['a_b', 'Phase B', 'A'], ['a_c', 'Phase C', 'A'],
  ['#', 'Engine Heat Exchanger'], ['ehx_ci', 'Engine coolant in', '°F', 100, 165], ['ehx_co', 'Engine coolant out', '°F', 100, 165],
  ['ehx_ri', 'Radiator loop in', '°F', 75, 105], ['ehx_ro', 'Radiator loop out', '°F', 75, 105],
  ['#', 'Fuel Heat Exchanger'], ['fhx_i', 'Fuel heat exchanger inlet', '°F', 70, 110], ['fhx_o', 'Fuel heat exchanger outlet', '°F', 70, 90], ['fuel_sup', 'Engine fuel supply temp', '°F', 65, 85],
  ['#', 'Radiator Loop Pressure'], ['rlp_i', 'Inlet pressure', 'psi', 10, 14], ['rlp_o', 'Outlet pressure', 'psi', 2, 6],
  ['#', 'Checked every reading set'], ['c_cool', 'Engine coolant level'], ['c_rcf', 'Radiator Cooling Fan 1 running'], ['c_rcfa', 'Radiator Cooling Fan 1 area: general condition']
];
function withUnit_(v, unit) { if (v === undefined || v === '') return ''; return unit === '°F' ? v + '°F' : v + (unit ? ' ' + unit : ''); }
function outOfRange_(v, lo, hi) { const n = Number(v); return lo !== undefined && v !== '' && v !== undefined && !isNaN(n) && (n < lo || n > hi); }

function layoutGenerator_(sh, rec) {
  const V = rec.values || {}, sets = rec.sets || [], ats = rec.testType === 'ATS Transfer', lb = rec.testType === 'Load Bank';
  const widths = [236, 76, 68, 68, 68, 68, 68, 68];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange(1, 1, 80, 8).setFontFamily('Arial').setFontSize(9).setVerticalAlignment('middle').setNumberFormat('@');
  sh.setRowHeights(1, 80, 15);   // compact rows so the whole log prints on one letter page
  let r = 1;
  put_(sh, r, 1, '343 SANSOME STREET', {span: 8, bold: true, size: 15, align: 'center'}); sh.setRowHeight(r, 26); r++;
  put_(sh, r, 1, 'Emergency Generator Monthly Test Log' + (rec.status === 'incomplete' ? '  (INCOMPLETE)' : ''), {span: 8, size: 11, align: 'center', color: rec.status === 'incomplete' ? FLAG : null}); r++;
  const types = ['No-Load', 'ATS Transfer', 'Load Bank'].map(t => (rec.testType === t ? '☒ ' : '☐ ') + t).join('   ');
  put_(sh, r, 1, 'Date:  ' + mdy_(rec.date), {bold: true});
  put_(sh, r, 2, 'Test Type:  ' + types, {span: 5});
  put_(sh, r, 7, 'Tester:  ' + (rec.testerName || ''), {span: 2}); sh.setRowHeight(r, 20); r++;
  sh.setRowHeight(r, 6); r++;

  // side-by-side: pre-run (A:B) | pre-start (C:H)
  const top = r;
  const left = [['PRE-RUN PROCEDURE']].concat([
    ['Security notified of generator test', V.g_sec], ['Siemens monitoring: supervisories on ignore', V.g_sie], ['Basement ATS: no active alarms', V.g_atsal],
    ['General condition: generator / day tank', V.g_cond1], ['General condition: Radiator Cooling Fan 1,\nGenerator Cooling Fan 1, Generator Cooling Pump 1', V.g_cond2]]);
  if (ats) left.push(['ATS TRANSFER'], ['ATS-1', V.g_ats1], ['ATS-2', V.g_ats2]);
  const right = [['PRE-START READINGS'], ['Control switch status', V.g_ctl], ['Battery (VDC)', V.g_bat], ['Engine coolant level', V.g_cool], ['Oil level', V.g_oillvl],
    ['Block heater temp (°F)', V.g_blk], ['Day tank fuel level (pre)', V.g_day], ['Hours (start)', V.g_hrs1]];
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const row = top + i, L = left[i], R = right[i];
    if (L) {
      if (L.length === 1) put_(sh, row, 1, L[0], {span: 2, bold: true, bg: SEC_BG, box: true});
      else { put_(sh, row, 1, L[0], {box: true, size: L[0].length > 60 ? 8 : 9}).setWrap(true); put_(sh, row, 2, L[1] || '', {align: 'center', box: true}); }
    }
    if (R) {
      if (R.length === 1) put_(sh, row, 3, R[0], {span: 6, bold: true, bg: SEC_BG, box: true});
      else { put_(sh, row, 3, R[0], {span: 4, box: true}); put_(sh, row, 7, R[1] || '', {span: 2, align: 'center', box: true}); }
    }
    sh.setRowHeight(row, L && L[0].length > 60 ? 24 : 15);
  }
  r = top + n; sh.setRowHeight(r, 6); r++;

  // running readings grid
  put_(sh, r, 1, 'RUNNING READINGS', {span: 2, bold: true, bg: SEC_BG, box: true});
  put_(sh, r, 3, 'Engine start: ' + tm_(V.g_start), {span: 6, bold: true, bg: SEC_BG, align: 'center', box: true}); r++;
  put_(sh, r, 1, 'Reading Set', {bold: true, bg: HEAD_BG, box: true}); put_(sh, r, 2, 'Normal', {bg: HEAD_BG, align: 'center', color: '#555555', box: true});
  for (let k = 0; k < 6; k++) put_(sh, r, 3 + k, String(k + 1), {bold: true, bg: HEAD_BG, align: 'center', box: true});
  r++;
  put_(sh, r, 1, 'Time', {bold: true, box: true}); put_(sh, r, 2, '', {box: true});
  for (let k = 0; k < 6; k++) put_(sh, r, 3 + k, sets[k] ? sets[k].time : '', {align: 'center', box: true});
  r++;
  GEN_ROWS.forEach(g => {
    if (g[0] === '#') { put_(sh, r, 1, g[1], {span: 8, bold: true, italic: true, bg: SUB_BG, box: true}); r++; return; }
    put_(sh, r, 1, (['kw', 'oil', 'ect', 'hz'].indexOf(g[0]) === -1 ? '   ' : '') + g[1], {box: true});
    put_(sh, r, 2, g[3] !== undefined ? g[3] + '–' + g[4] + (g[2] === '°F' ? '°F' : ' ' + g[2]) : '', {align: 'center', color: '#555555', size: 8, box: true});
    for (let k = 0; k < 6; k++) {
      const v = sets[k] && sets[k].vals ? sets[k].vals[g[0]] : '';
      const cell = put_(sh, r, 3 + k, g[0] === 'kw' && !lb ? '' : withUnit_(v, g[2]), {align: 'center', box: true});
      if (g[0] === 'kw' && !lb) cell.setBackground('#f3f3f3');
      if (outOfRange_(v, g[3], g[4]) || v === 'F') { cell.setFontColor(FLAG).setFontWeight('bold').setValue(withUnit_(v, g[2]) + ' ▲'); }
    }
    r++;
  });
  put_(sh, r, 1, 'Confirmed running (once during test)', {span: 8, bold: true, italic: true, bg: SUB_BG, box: true}); r++;
  [['Generator Cooling Fan 1', V.g_gcf], ['Generator Cooling Pump 1', V.g_gcp]].forEach(x => {
    put_(sh, r, 1, '   ' + x[0], {box: true}); put_(sh, r, 2, '', {box: true}); put_(sh, r, 3, x[1] || '', {align: 'center', box: true});
    put_(sh, r, 4, '', {span: 5, bg: '#f3f3f3', box: true}); r++;
  });
  sh.setRowHeight(r, 6); r++;

  // shutdown (A:B) | notes + tester (C:H)
  const runMin = V.g_start && V.g_stop ? Math.round((new Date(V.g_stop) - new Date(V.g_start)) / 60000) + ' min' : '';
  const sd = [['SHUTDOWN'], ['Stop time', tm_(V.g_stop)], ['Hours (stop)', V.g_hrs2], ['Run time (calculated)', runMin], ['Control switch returned to Auto', V.g_ctl2]];
  if (ats) ['1', '2'].forEach(x => sd.push(['ATS-' + x + ' retransferred to normal', V['g_ats' + x] === 'N/A' ? 'N/A' : V['g_ats' + x + 'r']]));
  sd.push(['Basement ATS: no active alarms', V.g_atsal2], ['Security notified test complete', V.g_secd]);
  const s0 = r;
  sd.forEach((x, i) => {
    if (x.length === 1) put_(sh, s0 + i, 1, x[0], {span: 2, bold: true, bg: SEC_BG, box: true});
    else { put_(sh, s0 + i, 1, x[0], {box: true}); put_(sh, s0 + i, 2, x[1] || '', {align: 'center', box: true}); }
    sh.setRowHeight(s0 + i, 15);
  });
  const notesRows = sd.length - 4;
  put_(sh, s0, 3, 'NOTES', {span: 6, bold: true, bg: SEC_BG, box: true});
  const nr = sh.getRange(s0 + 1, 3, notesRows, 6).merge();
  box_(nr); nr.setValue((rec.notes || []).join('\n')).setWrap(true).setVerticalAlignment('top').setFontSize((rec.notes || []).join(' ').length > 400 ? 7 : 9);
  put_(sh, s0 + 1 + notesRows, 3, 'TESTER', {span: 6, bold: true, bg: SEC_BG, box: true});
  put_(sh, s0 + 2 + notesRows, 3, 'Print name:  ' + (rec.testerName || ''), {span: 6, box: true});
  put_(sh, s0 + 3 + notesRows, 3, 'Signature:', {span: 4, box: true});
  put_(sh, s0 + 3 + notesRows, 7, 'Date: ' + mdy_(rec.date), {span: 2, box: true});
  sh.setRowHeight(s0 + 3 + notesRows, 32);
  const sig = sigBlob_(rec.tester);
  if (sig) { const im = sh.insertImage(sig, 3, s0 + 3 + notesRows, 70, 2); const h = 30, w = Math.round(im.getWidth() * h / im.getHeight()); im.setHeight(h).setWidth(w); }
  r = s0 + Math.max(sd.length, 4 + notesRows) + 1;
  put_(sh, r, 1, '▲ = outside normal range', {size: 8, color: '#555555'});
  put_(sh, r, 5, 'Generated by 343 Rounds App', {span: 4, size: 8, color: '#555555', align: 'right'});
  trimSheet_(sh, r, 8);
}

// ---------- Elevator ----------
const ELEV = {
  cars: ['A', 'B', 'C', 'D', 'E', 'P'],
  p1: [['fcc', 'Fire Recall Function FCC Room'], ['lobby', 'Fire Recall Function Lobby'], ['parked', 'Verify cars are parked and locked out on fire mode']],
  p2: [['lamp', 'Emergency recall lamp activated'], ['bell_l', 'Emergency Bell function / left side'], ['bell_r', 'Emergency Bell function / right side'],
    ['close_l', 'Door close button / left side'], ['close_r', 'Door close button / right side'], ['photo', 'Photo over-ride disabled'], ['open_l', 'Door open button / left side'],
    ['open_r', 'Door open button / right side'], ['hold', 'Car Hold function'], ['phone', 'Confirm elevator phone operation'], ['addr', 'Operator identifies building address'],
    ['carid', 'Operator identifies car ID'], ['cancel', 'Call cancel function']],
  p3: [['normal', 'Ensure car returns to normal operation']]
};
function layoutElevator_(sh, rec) {
  const V = rec.values || {};
  [330, 62, 62, 62, 62, 62, 62].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange(1, 1, 60, 7).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setNumberFormat('@');
  let r = 1;
  put_(sh, r, 1, '343 SANSOME STREET', {span: 7, bold: true, size: 15, align: 'center'}); sh.setRowHeight(r, 26); r++;
  put_(sh, r, 1, 'SAN FRANCISCO, CA 94104', {span: 7, size: 9, align: 'center'}); r++;
  put_(sh, r, 1, 'Monthly Phase I and Phase II Emergency Operations Test' + (rec.status === 'incomplete' ? '  (INCOMPLETE)' : ''), {span: 7, bold: true, size: 11, align: 'center', color: rec.status === 'incomplete' ? FLAG : null}); sh.setRowHeight(r, 24); r++;
  put_(sh, r, 1, 'Item', {bold: true, bg: HEAD_BG, box: true});
  ELEV.cars.forEach((c, i) => put_(sh, r, 2 + i, c === 'P' ? 'Parking\nCar P' : 'Car ' + c, {bold: true, bg: HEAD_BG, align: 'center', box: true}).setWrap(true));
  sh.setRowHeight(r, 30); r++;
  const section = (title, items, pfx) => {
    put_(sh, r, 1, title, {bold: true, bg: SEC_BG, box: true}); sh.getRange(r, 2, 1, 6).setBackground(SEC_BG); box_(sh.getRange(r, 2, 1, 6)); sh.setRowHeight(r, 24); r++;
    items.forEach(it => {
      put_(sh, r, 1, it[1], {box: true});
      ELEV.cars.forEach((c, i) => {
        const v = V[pfx + '.' + it[0] + '.' + c] || '';
        const cell = put_(sh, r, 2 + i, v, {align: 'center', box: true});
        if (v === 'F') cell.setFontColor(FLAG).setFontWeight('bold');
      });
      sh.setRowHeight(r, 25); r++;
    });
  };
  section('PHASE 1 OPERATION', ELEV.p1, 'p1');
  section('PHASE 2 OPERATION', ELEV.p2, 'p2');
  section('RESET / RETURN TO NORMAL', ELEV.p3, 'p3');
  r++;
  // notes fill the rest of the page
  put_(sh, r, 1, 'NOTES', {span: 7, bold: true, bg: SEC_BG, box: true}); sh.setRowHeight(r, 22); r++;
  const notes = (rec.notes || []).join('\n');
  const nr = sh.getRange(r, 1, 1, 7).merge(); box_(nr);
  nr.setValue(notes).setWrap(true).setVerticalAlignment('top').setFontSize(notes.length > 1400 ? 7 : notes.length > 900 ? 8 : 10);
  sh.setRowHeight(r, 190); r++;
  sh.setRowHeight(r, 8); r++;
  put_(sh, r, 1, 'Date:  ' + mdy_(rec.date), {box: true});
  put_(sh, r, 2, 'Tester:  ' + (rec.testerName || ''), {span: 3, box: true});
  put_(sh, r, 5, 'Signature:', {span: 3, box: true}).setVerticalAlignment('middle');
  sh.setRowHeight(r, 40);
  const sig = sigBlob_(rec.tester);
  if (sig) { const im = sh.insertImage(sig, 5, r, 66, 3); const h = 34, w = Math.round(im.getWidth() * h / im.getHeight()); im.setHeight(h).setWidth(Math.min(w, 120)); }
  r++;
  put_(sh, r, 1, '✓ = Pass   F = Fail', {size: 8, color: '#555555'});
  put_(sh, r, 5, TESTS.ELEV_REVISION, {span: 3, size: 8, color: '#555555', align: 'right'});
  trimSheet_(sh, r, 7);
}

function trimSheet_(sh, lastRow, lastCol) {
  if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);
}

// ============================================================
// SELF-CHECK: run by hand once after deploying. Builds sample
// Generator and Elevator sheets in Testing & Inspections > _Self-check.
// Delete that folder after looking.
// ============================================================
function testFormsSelfCheck() {
  setupTests_();
  const now = new Date().toISOString();
  const date = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const gen = {id: 'selfcheck-gen', form: 'generator', date: date, t0: now, status: 'complete', tester: 'scott', testerName: 'Scott Morris', testType: 'ATS Transfer',
    values: {g_sec: '✓', g_sie: '✓', g_atsal: '✓', g_cond1: '✓', g_cond2: '✓', g_ctl: 'Auto', g_bat: '27.6', g_cool: '✓', g_oillvl: '✓', g_blk: '112', g_day: 'Full', g_hrs1: '1284.2',
      g_start: now, g_ats1: 'Transferred to Emergency', g_ats2: 'N/A', g_gcf: '✓', g_gcp: '✓', g_stop: new Date(Date.now() + 32 * 60000).toISOString(), g_hrs2: '1284.7', g_ctl2: '✓', g_ats1r: '✓', g_atsal2: '✓', g_secd: '✓'},
    sets: [0, 1, 2].map(k => ({time: ['7:05 AM', '7:20 AM', '7:32 AM'][k], vals: {oil: '46', ect: '170', hz: '60.0', v_ab: '480', v_ac: '479', v_bc: '481', a_a: '0', a_b: '0', a_c: '0',
      ehx_ci: k === 2 ? '168' : '150', ehx_co: '140', ehx_ri: '88', ehx_ro: '101', fhx_i: '94', fhx_o: '85', fuel_sup: '78', rlp_i: '12', rlp_o: '4', c_cool: '✓', c_rcf: '✓', c_rcfa: '✓'}})),
    notes: ['Set 3: engine coolant in 168°F, above 165°F normal. Sample record from testFormsSelfCheck.']};
  const elev = {id: 'selfcheck-elev', form: 'elevator', date: date, t0: now, status: 'complete', tester: 'jacky', testerName: 'Jacky Cheung', values: {}, notes: ['Car C (F): Door close button / left side. Sample record from testFormsSelfCheck.']};
  ['p1', 'p2', 'p3'].forEach(p => ELEV[p].forEach(it => ELEV.cars.forEach(c => { elev.values[p + '.' + it[0] + '.' + c] = '✓'; })));
  elev.values['p2.close_l.C'] = 'F';
  const root = folder_(DriveApp.getFolderById(TESTS.ROOT_ID), '_Self-check');
  [gen, elev].forEach(rec => {
    const name = 'SELF-CHECK ' + TESTS.NAMES[rec.form];
    const ss = SpreadsheetApp.create(name);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    const sh = ss.getSheets()[0]; sh.setHiddenGridlines(true);
    if (rec.form === 'generator') layoutGenerator_(sh, rec); else layoutElevator_(sh, rec);
    SpreadsheetApp.flush();
    root.createFile(exportSheetPdf_(ss, sh, name));
  });
  Logger.log('Self-check files: ' + root.getUrl());
}
