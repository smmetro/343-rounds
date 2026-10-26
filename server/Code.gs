// ============================================================
// 343 SANSOME ROUNDS — Apps Script server  (v2)
// Bound to: 343 Sansome Rounds (shared drive > Logs > Rounds)
//
// Test forms (Elevator, Generator, Fire Pumps) live in Tests.gs, a second file in this project.
//
// Tabs this script manages:
//   <one tab per round type>  readings, one row per round
//   Users        who can sign in, role, assigned rounds
//   Templates    round types (name, tab, icon, active, order)
//   Log Points   every reading: section, type, limits, options...
//   Settings     building name, alert email recipients
//   Notes Log    every note ever written, searchable
//   Alerts Log   every out-of-range / alarm reading
//   Photo Index  every photo uploaded, with Drive links
//
// Columns on round tabs are tied to each reading's permanent ID
// (hidden column tags), never to its name. Two readings can share
// a name, and renaming a reading keeps its history in place.
// ============================================================

const VERSION = '2.1.0';

const CONFIG = {
  CLIENT_ID: '1029316106419-u8cc3mq65a5fos9gp3074d0bbfkvsgsr.apps.googleusercontent.com',
  DOMAIN: '343sansomesf.com',
  SHEET_ID: '1GAoLIjy2pqGIQe9i0JJnuUPzUl8y-6OZ8L0d-995kuY',
  ROUNDS_FOLDER_ID: '1mjmJMDvhFOfcuXxx-f12l1usknQdPYeK',
  PHOTOS_FOLDER_ID: '1nZSvdhg2heWL9qhHB8-Po5oLL5n4vLjO',
  TIMEZONE: 'America/Los_Angeles',
  SESSION_DAYS: 60,
  MAX_PHOTO_BYTES: 8 * 1024 * 1024,
  HISTORY_ROWS: 8,
  NWS_PRIMARY: 'SFOC1',
  NWS_SECONDARY: 'KSFO',
  MIGRATION_FILE: 'rounds-migration.json'
};

const TAB = {
  USERS: 'Users', TEMPLATES: 'Templates', LOGS: 'Log Points', SETTINGS: 'Settings',
  NOTES: 'Notes Log', ALERTS: 'Alerts Log', PHOTOS: 'Photo Index'
};
const MD_COL = 'rounds_col';   // tag on each reading column: {id, sec, name, retired}
const MD_RID = 'rounds_rid';   // tag on the hidden Round ID column
const COLOR = {
  hdrDark: '#1a1f35', hdrSec: '#2e3250', hdrRetired: '#6b7280', text: '#ffffff',
  alert: '#f8d7da', warn: '#fff3cd', marked: '#e8f0fe'
};

const HEADERS = {
  Users: ['Email', 'Name', 'Role', 'Active', 'Rounds'],
  Templates: ['Template ID', 'Name', 'Sheet Tab', 'Icon', 'Description', 'Active', 'Order'],
  'Log Points': ['Template ID', 'Order', 'Section', 'Name', 'Description', 'Type', 'Unit', 'Options',
    'Warn Low', 'Warn High', 'Alert Low', 'Alert High', 'Cumulative', 'Auto-fill', 'Show If (Log ID)', 'Equals', 'Log ID'],
  Settings: ['Setting', 'Value'],
  'Notes Log': ['Date', 'Time', 'Engineer', 'Round', 'Section', 'Reading', 'Value', 'Note', 'Photos', 'Round ID', 'Template ID', 'Log ID'],
  'Alerts Log': ['Date', 'Time', 'Engineer', 'Round', 'Section', 'Reading', 'Value', 'Unit', 'Normal Range', 'Level', 'Note', 'Round ID'],
  'Photo Index': ['Uploaded', 'Engineer', 'Round', 'Section', 'Reading', 'Photo', 'Folder', 'Round ID', 'Template ID', 'Log ID', 'Photo ID', 'File ID']
};

// ============================================================
// SETUP (run once from the editor after pasting a new version)
// ============================================================
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SESSION_SECRET')) props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('CONFIG_VERSION')) props.setProperty('CONFIG_VERSION', '1');

  const ss = ss_();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  Object.keys(HEADERS).forEach(name => ensureTab_(ss, name));

  // Users: add Rounds column to the v1 tab, default everyone to all rounds
  const users = ss.getSheetByName(TAB.USERS);
  if (users.getRange(1, 5).getValue() !== 'Rounds') {
    users.getRange(1, 5).setValue('Rounds');
    styleHeader_(users, 5);
    if (users.getLastRow() > 1) users.getRange(2, 5, users.getLastRow() - 1, 1).setValue('all');
  }
  if (users.getLastRow() < 2) {
    users.getRange(2, 1, 2, 5).setValues([
      ['scott@343sansomesf.com', 'Scott', 'admin', true, 'all'],
      ['jacky@343sansomesf.com', 'Jacky', 'engineer', true, 'all']]);
  }
  users.getRange(2, 4, Math.max(users.getLastRow() - 1, 1), 1).insertCheckboxes();

  const settings = ss.getSheetByName(TAB.SETTINGS);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, 2, 2).setValues([
      ['Building Name', '343 Sansome St.'],
      ['Alert Emails', 'scott@343sansomesf.com, jacky@343sansomesf.com']]);
  }

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);

  DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID).getName();
  UrlFetchApp.fetch('https://api.weather.gov/stations/' + CONFIG.NWS_PRIMARY, {muteHttpExceptions: true, headers: nwsHeaders_()});
  MailApp.getRemainingDailyQuota();
  setupTests_();   // Tests.gs: Test Records tab + Test Form Assets folder
  Logger.log('Setup complete (server v' + VERSION + ').');
}

// Edits typed straight into the config tabs reach phones on their next refresh
function onEdit(e) {
  const name = e && e.range && e.range.getSheet().getName();
  if (name === TAB.TEMPLATES || name === TAB.LOGS || name === TAB.SETTINGS) {
    const p = PropertiesService.getScriptProperties();
    p.setProperty('CONFIG_VERSION', String(Number(p.getProperty('CONFIG_VERSION') || '1') + 1));
  }
}

// ============================================================
// HTTP ENTRY POINTS
// ============================================================
function doGet() {
  return json_({ok: true, service: '343 Rounds API', version: VERSION});
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (req.action) {
      case 'ping':   return json_({ok: true, version: VERSION, time: new Date().toISOString()});
      case 'signIn': return json_(signIn_(req.idToken));
    }
    const user = requireSession_(req.session);
    switch (req.action) {
      case 'whoami':      return json_({ok: true, user: user});
      case 'bootstrap':   return json_(bootstrap_(user));
      case 'submitRound': return json_(withLock_(() => submitRound_(user, req.round)));
      case 'uploadPhoto': return json_(withLock_(() => uploadPhoto_(user, req)));
      case 'testWrite':   return json_(testWrite_(user, req));
      case 'testPhoto':   return json_(testPhoto_(user, req));
      case 'testSync':    return json_(testSync_(user));                                  // Tests.gs
      case 'testAssets':  return json_(testAssets_(user));                                // Tests.gs
      case 'submitTest':  return json_(withLock_(() => submitTest_(user, req)));          // Tests.gs
    }
    requireAdmin_(user);
    switch (req.action) {
      case 'adminGet':        return json_(adminGet_());
      case 'adminSaveConfig': return json_(withLock_(() => adminSaveConfig_(user, req.config, req.baseVersion)));
      case 'adminSaveUsers':  return json_(withLock_(() => adminSaveUsers_(user, req.users)));
      case 'adminHistory':    return json_(adminHistory_());
      case 'adminRestore':    return json_(withLock_(() => adminRestore_(user, req.fileId)));
    }
    throw new Error('Unknown action: ' + req.action);
  } catch (err) {
    return json_({ok: false, error: err.message, code: err.code || 'ERROR'});
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ============================================================
// AUTH
// ============================================================
function signIn_(idToken) {
  if (!idToken) throw authErr_('Missing Google sign-in');
  const resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {muteHttpExceptions: true});
  if (resp.getResponseCode() !== 200) throw authErr_('Google could not verify this sign-in. Try again.');
  const t = JSON.parse(resp.getContentText());
  if (t.aud !== CONFIG.CLIENT_ID) throw authErr_('Sign-in was issued for a different app.');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw authErr_('Sign-in issuer not recognized.');
  if (String(t.email_verified) !== 'true') throw authErr_('Google account email is not verified.');
  if (Number(t.exp) * 1000 < Date.now()) throw authErr_('Sign-in expired. Try again.');
  if (t.hd !== CONFIG.DOMAIN) throw authErr_('Use your @' + CONFIG.DOMAIN + ' account.');
  const user = lookupUser_(t.email);
  if (!user) throw authErr_(t.email + ' is not set up in Rounds. Ask Scott to add you.');
  return {ok: true, session: makeSession_(user.email), user: user};
}

function readUsers_() {
  const sh = ss_().getSheetByName(TAB.USERS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({
      email: String(r[0]).trim().toLowerCase(),
      name: String(r[1] || r[0]).trim(),
      role: String(r[2] || 'engineer').trim().toLowerCase() === 'admin' ? 'admin' : 'engineer',
      active: r[3] === true,
      rounds: parseRounds_(r[4])
    }));
}
function parseRounds_(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s || s.toLowerCase() === 'all') return 'all';
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
function lookupUser_(email) {
  const target = String(email).trim().toLowerCase();
  const u = readUsers_().find(x => x.email === target && x.active);
  return u ? {email: u.email, name: u.name, role: u.role, rounds: u.rounds} : null;
}
function canUse_(user, tmplId) {
  return user.role === 'admin' || user.rounds === 'all' || (user.rounds || []).indexOf(tmplId) !== -1;
}
function requireAdmin_(user) {
  if (user.role !== 'admin') throw authErr_('Admin access required.');
}

function makeSession_(email) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({e: email, x: Date.now() + CONFIG.SESSION_DAYS * 86400000}));
  return body + '.' + sign_(body);
}
function requireSession_(token) {
  if (!token) throw authErr_('Not signed in.');
  const parts = String(token).split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw authErr_('Session not valid. Sign in again.');
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!p.x || p.x < Date.now()) throw authErr_('Session expired. Sign in again.');
  const user = lookupUser_(p.e);
  if (!user) throw authErr_('This account is no longer active in Rounds.');
  return user;
}
function sign_(body) {
  const secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!secret) throw new Error('Server not set up. Run setup() in Apps Script.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
}
function authErr_(msg) { const e = new Error(msg); e.code = 'AUTH'; return e; }

// ============================================================
// CONFIG  (Templates + Log Points + Settings tabs)
// ============================================================
function configVersion_() {
  return Number(PropertiesService.getScriptProperties().getProperty('CONFIG_VERSION') || '1');
}

function readConfig_() {
  const key = 'config_v' + configVersion_();
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const ss = ss_();
  const templates = rows_(ss.getSheetByName(TAB.TEMPLATES)).map(r => ({
    id: str_(r[0]), name: str_(r[1]), sheetTab: str_(r[2]) || str_(r[1]), icon: str_(r[3]),
    description: str_(r[4]), active: r[5] === true, order: Number(r[6]) || 0, logs: []
  })).filter(t => t.id).sort((a, b) => a.order - b.order);

  const byId = {};
  templates.forEach(t => byId[t.id] = t);

  // Rows typed straight into the Log Points tab get a permanent ID on first read
  const logSh = ss.getSheetByName(TAB.LOGS);
  if (logSh && logSh.getLastRow() > 1) {
    const idRange = logSh.getRange(2, 1, logSh.getLastRow() - 1, 17);
    const grid = idRange.getValues();
    let changed = false;
    grid.forEach((r, i) => { if (str_(r[0]) && str_(r[3]) && !str_(r[16])) { r[16] = 'log_' + Date.now() + '_' + i; changed = true; } });
    if (changed) logSh.getRange(2, 17, grid.length, 1).setValues(grid.map(r => [r[16]]));
  }

  rows_(logSh)
    .map(r => ({
      tmpl: str_(r[0]), order: Number(r[1]) || 0, sec: str_(r[2]) || 'General', name: str_(r[3]),
      desc: str_(r[4]), type: normType_(r[5]), unit: str_(r[6]), opts: parseOpts_(r[7]),
      warnLo: num_(r[8]), warnHi: num_(r[9]), alertLo: num_(r[10]), alertHi: num_(r[11]),
      cumulative: r[12] === true, autoFill: r[13] === true,
      condTrigger: str_(r[14]), condValue: str_(r[15]), id: str_(r[16])
    }))
    .filter(l => l.id && byId[l.tmpl])
    .sort((a, b) => a.order - b.order)
    .forEach(l => {
      l.condEnabled = !!(l.condTrigger && l.condValue);
      byId[l.tmpl].logs.push(l);
      delete l.tmpl; delete l.order;
    });

  const settings = {};
  rows_(ss.getSheetByName(TAB.SETTINGS)).forEach(r => settings[str_(r[0])] = r[1]);
  const cfg = {
    version: configVersion_(),
    building: str_(settings['Building Name']) || 'Rounds',
    alertEmails: String(settings['Alert Emails'] || '').split(/[,;\s]+/).map(s => s.trim()).filter(s => s.indexOf('@') > 0),
    templates: templates
  };
  try { cache.put(key, JSON.stringify(cfg), 21600); } catch (e) { /* too large to cache, fine */ }
  return cfg;
}

function normType_(v) {
  const s = str_(v).toLowerCase();
  return s === 'status' ? 'status' : s === 'text' ? 'text' : 'numeric';
}
function parseOpts_(v) {
  return str_(v).split('|').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*\[(ok|warn|alarm)\]$/i);
    return m ? {label: m[1].trim(), style: m[2].toLowerCase()} : {label: s, style: ''};
  });
}
function fmtOpts_(opts) {
  return (opts || []).map(o => o.style ? o.label + ' [' + o.style + ']' : o.label).join(' | ');
}

function validateConfig_(cfg) {
  if (!cfg || !Array.isArray(cfg.templates)) throw new Error('Config is missing round templates.');
  const tIds = {}, tabs = {};
  cfg.templates.forEach(t => {
    if (!t.id || !String(t.name || '').trim()) throw new Error('Every round needs an ID and a name.');
    if (tIds[t.id]) throw new Error('Duplicate round ID: ' + t.id);
    tIds[t.id] = true;
    const tab = String(t.sheetTab || t.name).trim();
    if (HEADERS[tab]) throw new Error('"' + tab + '" is reserved. Choose a different Sheet tab name.');
    if (tabs[tab.toLowerCase()]) throw new Error('Two rounds use the Sheet tab "' + tab + '".');
    tabs[tab.toLowerCase()] = true;
    const lIds = {};
    (t.logs || []).forEach(l => {
      if (!l.id) throw new Error('A reading in "' + t.name + '" has no ID.');
      if (lIds[l.id]) throw new Error('Duplicate reading ID in "' + t.name + '": ' + l.id);
      lIds[l.id] = l;
      if (!String(l.name || '').trim()) throw new Error('A reading in "' + t.name + '" has no name.');
      if (l.type === 'status' && !(l.opts || []).length) throw new Error('"' + l.name + '" needs at least one option.');
    });
    (t.logs || []).forEach(l => {
      if (l.condTrigger) {
        const trig = lIds[l.condTrigger];
        if (!trig) throw new Error('"' + l.name + '" depends on a reading that no longer exists.');
        if (trig.type !== 'status') throw new Error('"' + l.name + '" can only depend on a status reading.');
      }
    });
  });
}

function writeConfig_(cfg) {
  validateConfig_(cfg);
  const ss = ss_();
  const prev = readConfig_();

  const tRows = cfg.templates.map((t, i) => [t.id, String(t.name).trim(), String(t.sheetTab || t.name).trim(),
    t.icon || '', t.description || '', t.active !== false, i + 1]);
  const lRows = [];
  cfg.templates.forEach(t => (t.logs || []).forEach((l, i) => lRows.push([
    t.id, i + 1, String(l.sec || 'General').trim(), String(l.name).trim(), l.desc || '', normType_(l.type), l.unit || '',
    l.type === 'status' ? fmtOpts_(l.opts) : '',
    num_(l.warnLo), num_(l.warnHi), num_(l.alertLo), num_(l.alertHi),
    !!l.cumulative, !!l.autoFill, l.condEnabled !== false && l.condTrigger ? l.condTrigger : '',
    l.condEnabled !== false && l.condTrigger ? (l.condValue || '') : '', l.id])));

  replaceRows_(ss.getSheetByName(TAB.TEMPLATES), tRows, [6]);
  replaceRows_(ss.getSheetByName(TAB.LOGS), lRows, [13, 14]);
  replaceRows_(ss.getSheetByName(TAB.SETTINGS), [
    ['Building Name', cfg.building || '343 Sansome St.'],
    ['Alert Emails', (cfg.alertEmails || []).join(', ')]], []);

  // Renamed tabs follow their round
  cfg.templates.forEach(t => {
    const old = prev.templates.find(p => p.id === t.id);
    const tab = String(t.sheetTab || t.name).trim();
    if (old && old.sheetTab !== tab) {
      const sh = ss.getSheetByName(old.sheetTab);
      if (sh && !ss.getSheetByName(tab)) sh.setName(tab);
    }
  });

  const v = configVersion_() + 1;
  PropertiesService.getScriptProperties().setProperty('CONFIG_VERSION', String(v));
  const fresh = readConfig_();
  fresh.templates.forEach(t => { if (ss.getSheetByName(t.sheetTab)) syncTab_(ss, t); });
  return fresh;
}

// ============================================================
// ROUND TABS: column tags, headers, layout
// ============================================================
function colLetter_(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
function wholeCol_(sheet, c) { const L = colLetter_(c); return sheet.getRange(L + ':' + L); }

function readColMeta_(sheet) {
  const out = {cols: {}, byCol: {}, ridCol: 0};
  const SA = SpreadsheetApp;
  sheet.createDeveloperMetadataFinder().withLocationType(SA.DeveloperMetadataLocationType.COLUMN).find().forEach(md => {
    const col = md.getLocation().getColumn().getColumn();
    if (md.getKey() === MD_RID) { out.ridCol = col; return; }
    if (md.getKey() !== MD_COL) return;
    const v = JSON.parse(md.getValue());
    v.col = col; v.md = md;
    out.cols[v.id] = v; out.byCol[col] = v;
  });
  return out;
}
function tagCol_(sheet, col, info) {
  wholeCol_(sheet, col).addDeveloperMetadata(MD_COL, JSON.stringify({id: info.id, sec: info.sec, name: info.name, type: info.type, retired: !!info.retired}));
}
function retagCol_(meta, info) {
  meta.md.setValue(JSON.stringify({id: info.id, sec: info.sec, name: info.name, type: info.type, retired: !!info.retired}));
}

function newRoundTab_(ss, name) {
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 2, 4).setValues([['Date', 'Time', 'Engineer', 'Round ID'], ['Date', 'Time', 'Engineer', 'Round ID']]);
  wholeCol_(sh, 4).addDeveloperMetadata(MD_RID, 'rid');
  sh.setFrozenRows(2);
  sh.setFrozenColumns(3);
  return sh;
}

// Makes the tab's columns match the template. Never deletes data:
// readings removed from the template become "Retired" columns at the far right.
function syncTab_(ss, tmpl, extraLogs) {
  let sh = ss.getSheetByName(tmpl.sheetTab) || newRoundTab_(ss, tmpl.sheetTab);
  let meta = readColMeta_(sh);
  const activeIds = {};
  tmpl.logs.forEach(l => activeIds[l.id] = true);

  // 1. Retire columns whose reading left the template; move them to the retired area
  Object.keys(meta.cols).forEach(id => {
    const m = meta.cols[id];
    if (!activeIds[id] && !m.retired) {
      m.retired = true; retagCol_(m, m);
      sh.moveColumns(wholeCol_(sh, m.col), meta.ridCol);
      meta = readColMeta_(sh);
    }
  });

  // 2. Every active reading gets a column, placed with its section
  const all = tmpl.logs.concat(extraLogs || []);
  all.forEach(l => {
    const m = meta.cols[l.id];
    const info = {id: l.id, sec: l.sec, name: l.name, type: l.type, retired: !activeIds[l.id]};
    if (!m) {
      const at = insertPosFor_(meta, l, tmpl);
      sh.insertColumnBefore(at);
      tagCol_(sh, at, info);
      meta = readColMeta_(sh);
    } else if (m.retired && activeIds[l.id]) {
      retagCol_(m, info);
      meta = readColMeta_(sh);
      const at = insertPosFor_(meta, l, tmpl, l.id);
      if (at !== m.col && at !== m.col + 1) { sh.moveColumns(wholeCol_(sh, m.col), at); }
      meta = readColMeta_(sh);
    } else if (m.sec !== l.sec || m.name !== l.name || m.type !== l.type) {
      retagCol_(m, Object.assign({}, info, {retired: m.retired}));
      meta = readColMeta_(sh);
    }
  });
  renderHeaders_(sh, meta);
  return sh;
}

// Column number to insert a new reading at (before this column)
function insertPosFor_(meta, log, tmpl, skipId) {
  const active = Object.keys(meta.byCol).map(Number).sort((a, b) => a - b).map(c => meta.byCol[c])
    .filter(m => !m.retired && m.id !== skipId);
  const sameSec = active.filter(m => m.sec === log.sec);
  if (sameSec.length) {
    // after the template-order predecessor in this section, else after the section's last column
    const order = tmpl.logs.map(l => l.id);
    const mine = order.indexOf(log.id);
    let best = null;
    sameSec.forEach(m => { const i = order.indexOf(m.id); if (i !== -1 && i < mine && (!best || i > order.indexOf(best.id))) best = m; });
    if (best) return best.col + 1;
    const after = sameSec.filter(m => order.indexOf(m.id) > mine);
    if (after.length) return Math.min.apply(null, after.map(m => m.col));
    return Math.max.apply(null, sameSec.map(m => m.col)) + 1;
  }
  const retired = Object.keys(meta.byCol).map(Number).filter(c => meta.byCol[c].retired);
  return retired.length ? Math.min.apply(null, retired) : meta.ridCol;
}

function renderHeaders_(sh, meta) {
  const last = meta.ridCol;
  const width = last;
  sh.getRange(1, 1, 2, width).breakApart();
  const r1 = [], r2 = [];
  for (let c = 1; c <= width; c++) {
    if (c <= 3) { r1.push(['Date', 'Time', 'Engineer'][c - 1]); r2.push(r1[c - 1]); continue; }
    if (c === last) { r1.push('Round ID'); r2.push('Round ID'); continue; }
    const m = meta.byCol[c];
    r1.push(m ? (m.retired ? 'Retired · ' + m.sec : m.sec) : '');
    r2.push(m ? m.name : '');
  }
  sh.getRange(1, 1, 2, width).setValues([r1, r2]);
  sh.getRange(1, 1, 2, width).setFontColor(COLOR.text).setFontWeight('bold').setBackground(COLOR.hdrDark).setHorizontalAlignment('center');
  [1, 2, 3, last].forEach(c => sh.getRange(1, c, 2, 1).merge());

  // Group consecutive columns with the same section label into one merged cell
  let c = 4;
  while (c < last) {
    let e = c;
    while (e + 1 < last && r1[e] === r1[c - 1] && r1[c - 1] !== '') e++;
    const rng = sh.getRange(1, c, 1, e - c + 1);
    if (e > c) rng.merge();
    const m = meta.byCol[c];
    rng.setBackground(m && m.retired ? COLOR.hdrRetired : COLOR.hdrSec);
    c = e + 1;
  }
  // Status/text columns stay plain text so "1/2" or "100%" are never turned into dates/numbers
  Object.keys(meta.byCol).forEach(col => {
    if (meta.byCol[col].type !== 'numeric') sh.getRange(3, Number(col), Math.max(sh.getMaxRows() - 2, 1), 1).setNumberFormat('@');
  });
  if (sh.getMaxColumns() > last) sh.deleteColumns(last + 1, sh.getMaxColumns() - last);
  sh.getRange(3, 1, Math.max(sh.getMaxRows() - 2, 1), 1).setNumberFormat('MM/dd/yyyy');
  sh.getRange(3, 2, Math.max(sh.getMaxRows() - 2, 1), 1).setNumberFormat('h:mm AM/PM');
  sh.hideColumns(last);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(3);
}

// ============================================================
// LEVELS (shared by phone-side rules, row shading, alerts)
// ============================================================
function levelFor_(log, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (log.type === 'status') {
    const o = (log.opts || []).find(x => x.label === String(value));
    return o && o.style === 'alarm' ? 'alert' : o && o.style === 'warn' ? 'warn' : '';
  }
  if (log.type !== 'numeric') return '';
  const v = Number(value);
  if (isNaN(v)) return '';
  const aLo = numOrNaN_(log.alertLo), aHi = numOrNaN_(log.alertHi), wLo = numOrNaN_(log.warnLo), wHi = numOrNaN_(log.warnHi);
  if ((!isNaN(aLo) && v < aLo) || (!isNaN(aHi) && v > aHi)) return 'alert';
  if ((!isNaN(wLo) && v < wLo) || (!isNaN(wHi) && v > wHi)) return 'warn';
  return '';
}
function rangeText_(log) {
  if (log.type !== 'numeric') return '';
  const lo = log.warnLo !== '' ? log.warnLo : log.alertLo, hi = log.warnHi !== '' ? log.warnHi : log.alertHi;
  if (lo === '' && hi === '') return '';
  return (lo === '' ? '—' : lo) + ' – ' + (hi === '' ? '—' : hi) + (log.unit ? ' ' + log.unit : '');
}

// Builds one Sheet row + its notes/shading from a round. Used by live submits AND history import.
function buildRow_(meta, logsById, round) {
  const width = meta.ridCol;
  const when = new Date(round.t1 || round.t);
  const vals = new Array(width).fill(''), notes = new Array(width).fill(''), bgs = new Array(width).fill(null);
  vals[0] = when; vals[1] = when; vals[2] = round.engineer || '';
  vals[width - 1] = round.rid;
  const alerts = [];
  Object.keys(meta.byCol).forEach(colStr => {
    const col = Number(colStr), m = meta.byCol[col], i = col - 1;
    const log = logsById[m.id] || m;
    let v = round.vals ? round.vals[m.id] : undefined;
    if (v === undefined || v === null) v = '';
    if (log.type === 'numeric' && v !== '') { const n = Number(v); v = isNaN(n) ? String(v) : n; }
    else v = String(v);
    vals[i] = v;
    const note = round.notes && round.notes[m.id] ? String(round.notes[m.id]).trim() : '';
    if (note) notes[i] = note;
    const lvl = logsById[m.id] ? levelFor_(log, v) : (round.levels && round.levels[m.id]) || '';
    if (lvl) { bgs[i] = lvl === 'alert' ? COLOR.alert : COLOR.warn; alerts.push({log: log, value: v, level: lvl, note: note}); }
    else if (note || (round.photoCount && round.photoCount[m.id])) bgs[i] = COLOR.marked;
  });
  return {vals: vals, notes: notes, bgs: bgs, alerts: alerts, when: when};
}

// ============================================================
// SUBMIT ROUND
// ============================================================
function submitRound_(user, round) {
  if (!round || !round.rid || !round.templateId) throw new Error('Round data incomplete.');
  if (!/^r[0-9a-z_-]{6,40}$/i.test(round.rid)) throw new Error('Round ID not valid.');
  const ss = ss_();
  const cfg = readConfig_();
  let tmpl = cfg.templates.find(t => t.id === round.templateId);
  if (!tmpl) {
    // Round type was deleted after this round started: keep the data anyway
    tmpl = {id: round.templateId, name: round.templateName || 'Deleted Round', sheetTab: round.templateName || 'Deleted Round',
      logs: (round.logs || []).map(l => ({id: l.id, sec: l.sec, name: l.name, type: l.type, unit: l.unit || ''}))};
  }
  if (!canUse_(user, tmpl.id)) throw new Error('You are not assigned to ' + tmpl.name + '.');

  // Readings on the phone that the current template no longer has: keep as retired columns
  const known = {};
  tmpl.logs.forEach(l => known[l.id] = true);
  const extras = (round.logs || []).filter(l => !known[l.id] && round.vals && round.vals[l.id] !== undefined && round.vals[l.id] !== '');

  let sh = ss.getSheetByName(tmpl.sheetTab);
  const needsSync = !sh || (function () { const m = readColMeta_(sh); return tmpl.logs.concat(extras).some(l => !m.cols[l.id]); })();
  if (needsSync) sh = syncTab_(ss, tmpl, extras);
  const meta = readColMeta_(sh);

  // Already written? (outbox retry after a dropped connection)
  if (findRoundRow_(sh, meta, round.rid)) return {ok: true, duplicate: true, rid: round.rid};

  // Weather, matched to when the round started, not when it synced
  const wxLogs = tmpl.logs.filter(l => l.autoFill && /^wx_/.test(l.id));
  if (wxLogs.length) {
    const have = wxLogs.some(l => round.vals && round.vals[l.id] !== undefined && round.vals[l.id] !== '');
    if (!have) Object.assign(round.vals = round.vals || {}, weatherAt_(new Date(round.t0 || round.t1)));
  }

  round.engineer = user.name;
  const photos = photosForRound_(ss, round.rid);
  round.photoCount = {};
  Object.keys(photos).forEach(id => round.photoCount[id] = photos[id].length);

  const logsById = {};
  tmpl.logs.concat(extras).forEach(l => logsById[l.id] = l);
  const built = buildRow_(meta, logsById, round);
  const row = Math.max(sh.getLastRow(), 2) + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  const rng = sh.getRange(row, 1, 1, meta.ridCol);
  rng.setValues([built.vals]);
  rng.setNotes([built.notes]);
  rng.setBackgrounds([built.bgs]);
  Object.keys(photos).forEach(id => { if (meta.cols[id]) linkPhotoCell_(sh, row, meta.cols[id].col, photos[id]); });

  const dateStr = Utilities.formatDate(built.when, CONFIG.TIMEZONE, 'MM/dd/yyyy');
  const timeStr = Utilities.formatDate(built.when, CONFIG.TIMEZONE, 'h:mm a');

  // Notes Log
  const noteRows = [];
  Object.keys(round.notes || {}).forEach(id => {
    const note = String(round.notes[id] || '').trim();
    const l = logsById[id];
    if (!note || !l) return;
    const v = round.vals ? round.vals[id] : '';
    noteRows.push([dateStr, timeStr, user.name, tmpl.name, l.sec, l.name, v === undefined ? '' : v, note,
      photos[id] ? photos[id].length : '', round.rid, tmpl.id, id]);
  });
  appendRows_(ss.getSheetByName(TAB.NOTES), noteRows);

  // Alerts Log + email
  const alertRows = built.alerts.map(a => [dateStr, timeStr, user.name, tmpl.name, a.log.sec, a.log.name, a.value,
    a.log.unit || '', rangeText_(a.log), a.level === 'alert' ? 'ALERT' : 'Warning', a.note, round.rid]);
  appendRows_(ss.getSheetByName(TAB.ALERTS), alertRows);
  const emailed = sendAlertEmail_(cfg, tmpl, user, built, photos, dateStr, timeStr);

  return {ok: true, rid: round.rid, row: row, alerts: built.alerts.length, emailed: emailed};
}

function findRoundRow_(sh, meta, rid) {
  const last = sh.getLastRow();
  if (last < 3) return 0;
  const hit = sh.getRange(3, meta.ridCol, last - 2, 1).createTextFinder(rid).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function sendAlertEmail_(cfg, tmpl, user, built, photos, dateStr, timeStr) {
  const alerts = built.alerts.filter(a => a.level === 'alert');
  if (!alerts.length || !cfg.alertEmails.length) return false;
  const lines = alerts.map(a => {
    const p = photos[a.log.id];
    return '• ' + a.log.sec + ' > ' + a.log.name + ': ' + a.value + (a.log.unit ? ' ' + a.log.unit : '') +
      (rangeText_(a.log) ? '  (normal ' + rangeText_(a.log) + ')' : '') +
      (a.note ? '\n   Note: ' + a.note : '') + (p && p.length ? '\n   Photo: ' + p[0].url : '');
  });
  const first = alerts[0];
  const subject = 'Rounds alert: ' + first.log.name + ' ' + first.value + (first.log.unit ? ' ' + first.log.unit : '') +
    (alerts.length > 1 ? ' (+' + (alerts.length - 1) + ' more)' : '') + ' · ' + tmpl.name;
  const body = tmpl.name + ' · ' + dateStr + ' ' + timeStr + ' · ' + user.name + '\n\n' + lines.join('\n\n') +
    '\n\nOpen the Sheet: ' + ss_().getUrl() + '#gid=' + ss_().getSheetByName(tmpl.sheetTab).getSheetId();
  try { MailApp.sendEmail({to: cfg.alertEmails.join(','), subject: subject, body: body, name: 'Rounds'}); return true; }
  catch (e) { Logger.log('Alert email failed: ' + e.message); return false; }
}

// ============================================================
// PHOTOS
// ============================================================
function uploadPhoto_(user, req) {
  if (!req.photo || !req.rid || !req.logId || !req.pid) throw new Error('Photo data incomplete.');
  const ss = ss_();
  const idx = ss.getSheetByName(TAB.PHOTOS);
  const already = idx.getLastRow() > 1 &&
    idx.getRange(2, 11, idx.getLastRow() - 1, 1).createTextFinder(String(req.pid)).matchEntireCell(true).findNext();
  if (already) return {ok: true, duplicate: true, url: idx.getRange(already.getRow(), 6).getValue()};

  const bytes = Utilities.base64Decode(req.photo);
  if (bytes.length > CONFIG.MAX_PHOTO_BYTES) throw new Error('Photo too large after compression.');

  const cfg = readConfig_();
  const tmpl = cfg.templates.find(t => t.id === req.templateId);
  const tName = tmpl ? tmpl.name : (req.templateName || 'Round');
  const log = tmpl ? tmpl.logs.find(l => l.id === req.logId) : null;
  const sec = log ? log.sec : (req.sec || ''), lname = log ? log.name : (req.logName || req.logId);
  const start = new Date(req.t0 || Date.now());

  const root = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);
  const year = folder_(root, Utilities.formatDate(start, CONFIG.TIMEZONE, 'yyyy'));
  const month = folder_(year, Utilities.formatDate(start, CONFIG.TIMEZONE, 'MM-MMMM'));
  const roundFolder = folder_(month, Utilities.formatDate(start, CONFIG.TIMEZONE, 'yyyy-MM-dd HHmm') + ' ' + tName + ' (' + user.name + ')');
  const n = (Number(req.idx) || 0) + 1;
  const file = roundFolder.createFile(Utilities.newBlob(bytes, 'image/jpeg',
    safeName_(sec + ' - ' + lname + ' ' + n) + '.jpg'));
  const url = file.getUrl();
  idx.appendRow([new Date(), user.name, tName, sec, lname, url, roundFolder.getUrl(), req.rid, req.templateId, req.logId, req.pid, file.getId()]);

  // If the round row already exists, update that reading's cell link now
  if (tmpl) {
    const sh = ss.getSheetByName(tmpl.sheetTab);
    if (sh) {
      const meta = readColMeta_(sh);
      const row = findRoundRow_(sh, meta, req.rid);
      if (row && meta.cols[req.logId]) {
        const list = photosForRound_(ss, req.rid)[req.logId] || [];
        linkPhotoCell_(sh, row, meta.cols[req.logId].col, list);
        const cell = sh.getRange(row, meta.cols[req.logId].col);
        if (!cell.getBackground() || cell.getBackground() === '#ffffff') cell.setBackground(COLOR.marked);
      }
    }
  }
  return {ok: true, url: url};
}

function photosForRound_(ss, rid) {
  const idx = ss.getSheetByName(TAB.PHOTOS);
  const out = {};
  if (!idx || idx.getLastRow() < 2) return out;
  idx.getRange(2, 1, idx.getLastRow() - 1, 12).getValues().forEach(r => {
    if (r[7] !== rid) return;
    (out[r[9]] = out[r[9]] || []).push({url: r[5], folder: r[6]});
  });
  return out;
}

// One photo links to the photo; several link to the round's photo folder
function linkPhotoCell_(sh, row, col, list) {
  if (!list || !list.length) return;
  const cell = sh.getRange(row, col);
  const label = cell.getValue();
  const url = list.length === 1 ? list[0].url : list[0].folder;
  const shown = label === '' ? '📷' : label;
  const lit = typeof shown === 'number' ? String(shown) : '"' + String(shown).replace(/"/g, '""') + '"';
  cell.setFormula('=HYPERLINK("' + url + '",' + lit + ')');
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function safeName_(s) { return String(s).replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120); }

// ============================================================
// WEATHER (NWS) — matched to round start time
// ============================================================
function nwsHeaders_() { return {'Accept': 'application/geo+json', 'User-Agent': '343SansomeRounds (scott@343sansomesf.com)'}; }

function nearestObs_(station, when) {
  const start = new Date(when.getTime() - 3 * 3600000).toISOString();
  const end = new Date(when.getTime() + 1 * 3600000).toISOString();
  const url = 'https://api.weather.gov/stations/' + station + '/observations?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end);
  const resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true, headers: nwsHeaders_()});
  if (resp.getResponseCode() !== 200) return null;
  const feats = (JSON.parse(resp.getContentText()).features || []).map(f => f.properties)
    .filter(p => p && p.temperature && p.temperature.value !== null);
  if (!feats.length) return null;
  feats.sort((a, b) => Math.abs(new Date(a.timestamp) - when) - Math.abs(new Date(b.timestamp) - when));
  return feats[0];
}

function weatherAt_(when) {
  const v = (p, k) => p && p[k] && p[k].value !== null && p[k].value !== undefined ? p[k].value : null;
  const out = {wx_drybulb: '', wx_dewpoint: '', wx_wetbulb: '', wx_rh: '', wx_sky: '', wx_wind: '', wx_station: '', wx_status: ''};
  let a = null, b = null;
  try { a = nearestObs_(CONFIG.NWS_PRIMARY, when); } catch (e) { /* try the other station */ }
  try { b = nearestObs_(CONFIG.NWS_SECONDARY, when); } catch (e) { /* may be null too */ }
  const main = a || b;
  if (!main) { out.wx_status = 'Failed'; return out; }
  // Downtown (SFOC1) first; SFO fills anything Downtown doesn't report (sky, wind, sometimes humidity)
  const used = {};
  const pick = k => {
    if (v(a, k) !== null) { used[CONFIG.NWS_PRIMARY] = 1; return v(a, k); }
    if (v(b, k) !== null) { used[CONFIG.NWS_SECONDARY] = 1; return v(b, k); }
    return null;
  };
  const tC = pick('temperature'), dewC = pick('dewpoint'), rh = pick('relativeHumidity'), wind = pick('windSpeed');
  let sky = '';
  if (a && a.textDescription) { sky = a.textDescription; used[CONFIG.NWS_PRIMARY] = 1; }
  else if (b && b.textDescription) { sky = b.textDescription; used[CONFIG.NWS_SECONDARY] = 1; }
  const f = c => Math.round((c * 9 / 5 + 32) * 10) / 10;
  out.wx_drybulb = f(tC);
  if (dewC !== null) out.wx_dewpoint = f(dewC);
  if (rh !== null) { out.wx_rh = Math.round(rh); out.wx_wetbulb = f(wetBulbC_(tC, rh)); }
  if (wind !== null) out.wx_wind = Math.round(wind * 0.621371 * 10) / 10;
  out.wx_sky = sky;
  out.wx_station = [CONFIG.NWS_PRIMARY, CONFIG.NWS_SECONDARY].filter(s => used[s]).join(' + ');
  out.wx_status = 'OK · ' + Utilities.formatDate(new Date(main.timestamp), CONFIG.TIMEZONE, 'h:mm a') + ' obs';
  return out;
}
// Stull (2011) wet-bulb approximation, °C and %RH in, °C out (±0.3 °C)
function wetBulbC_(tC, rh) {
  return tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(tC + rh) - Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
}

// ============================================================
// BOOTSTRAP — everything the phone needs, cached on the phone
// ============================================================
function bootstrap_(user) {
  const cfg = readConfig_();
  const ss = ss_();
  const templates = cfg.templates.filter(t => t.active && canUse_(user, t.id));
  const history = {}, lastRound = {};
  templates.forEach(t => {
    const sh = ss.getSheetByName(t.sheetTab);
    history[t.id] = {};
    if (!sh || sh.getLastRow() < 3) return;
    const meta = readColMeta_(sh);
    const n = Math.min(CONFIG.HISTORY_ROWS * 2, sh.getLastRow() - 2);
    const rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, meta.ridCol).getValues()
      .filter(r => r[0] instanceof Date)
      .sort((a, b) => b[0] - a[0]);
    if (rows.length) lastRound[t.id] = {t: rows[0][0].toISOString(), engineer: rows[0][2]};
    t.logs.forEach(l => {
      const m = meta.cols[l.id];
      if (!m) return;
      const list = [];
      rows.forEach(r => { const v = r[m.col - 1]; if (v !== '' && list.length < CONFIG.HISTORY_ROWS) list.push({v: v, t: r[0].toISOString()}); });
      if (list.length) history[t.id][l.id] = list;
    });
  });

  // Most recent note per reading
  const lastNotes = {};
  const notes = ss.getSheetByName(TAB.NOTES);
  if (notes && notes.getLastRow() > 1) {
    const n = Math.min(400, notes.getLastRow() - 1);
    notes.getRange(notes.getLastRow() - n + 1, 1, n, 12).getValues().forEach(r => {
      const key = r[10] + '|' + r[11];
      const when = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
      lastNotes[key] = {note: r[7], date: when, by: r[2]};
    });
  }
  return {
    ok: true, version: VERSION, user: user, session: makeSession_(user.email),
    building: cfg.building, configVersion: cfg.version, templates: templates,
    history: history, lastNotes: lastNotes, lastRound: lastRound
  };
}

// ============================================================
// ADMIN
// ============================================================
function adminGet_() {
  return {ok: true, config: readConfig_(), users: readUsers_(), sheetUrl: ss_().getUrl()};
}

function adminSaveConfig_(user, cfg, baseVersion) {
  if (baseVersion && Number(baseVersion) !== configVersion_()) {
    throw new Error('Someone published changes after you opened the admin panel. Reload to get the latest, then redo your edits.');
  }
  const before = readConfig_();
  snapshot_(before, user, 'before publish');
  const fresh = writeConfig_(cfg);
  return {ok: true, config: fresh};
}

function adminSaveUsers_(user, users) {
  if (!Array.isArray(users)) throw new Error('No users sent.');
  const seen = {};
  const clean = users.map(u => {
    const email = String(u.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Not a valid email: ' + u.email);
    if (email.split('@')[1] !== CONFIG.DOMAIN) throw new Error(email + ' must be an @' + CONFIG.DOMAIN + ' account.');
    if (seen[email]) throw new Error('Listed twice: ' + email);
    seen[email] = true;
    return [email, String(u.name || email.split('@')[0]).trim(), u.role === 'admin' ? 'admin' : 'engineer', u.active !== false,
      u.rounds === 'all' || !u.rounds ? 'all' : u.rounds.join(', ')];
  });
  const me = clean.find(r => r[0] === user.email);
  if (!me || me[2] !== 'admin' || !me[3]) throw new Error('You cannot remove your own admin access.');
  replaceRows_(ss_().getSheetByName(TAB.USERS), clean, [4]);
  return {ok: true, users: readUsers_()};
}

function historyFolder_() { return folder_(DriveApp.getFolderById(CONFIG.ROUNDS_FOLDER_ID), 'Config History'); }

function snapshot_(cfg, user, why) {
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HHmmss');
  historyFolder_().createFile(Utilities.newBlob(JSON.stringify(cfg), 'application/json',
    'config ' + stamp + ' (' + user.name + ', ' + why + ').json'));
}

function adminHistory_() {
  const out = [];
  const it = historyFolder_().getFiles();
  while (it.hasNext()) { const f = it.next(); out.push({id: f.getId(), name: f.getName(), t: f.getDateCreated().toISOString()}); }
  out.sort((a, b) => b.t < a.t ? -1 : 1);
  return {ok: true, snapshots: out.slice(0, 50)};
}

function adminRestore_(user, fileId) {
  const f = DriveApp.getFileById(fileId);
  const parents = f.getParents();
  if (!parents.hasNext() || parents.next().getId() !== historyFolder_().getId()) throw new Error('Not a config snapshot.');
  const cfg = JSON.parse(f.getBlob().getDataAsString());
  snapshot_(readConfig_(), user, 'before restore');
  return {ok: true, config: writeConfig_(cfg)};
}

// ============================================================
// HISTORY IMPORT (one time, from the Supabase export)
// Upload rounds-migration.json to the Rounds folder, then run importHistory.
// ============================================================
function importHistory() {
  const ss = ss_();
  const it = DriveApp.getFolderById(CONFIG.ROUNDS_FOLDER_ID).getFilesByName(CONFIG.MIGRATION_FILE);
  if (!it.hasNext()) throw new Error(CONFIG.MIGRATION_FILE + ' not found in the Rounds folder.');
  const data = JSON.parse(it.next().getBlob().getDataAsString());

  data.templates.forEach(t => {
    const sh = ss.getSheetByName(t.sheetTab || t.name);
    if (sh && sh.getLastRow() > 2) throw new Error('Tab "' + sh.getName() + '" already has data. Delete that tab first to re-import.');
  });

  const cfg = writeConfig_({building: data.building, alertEmails: data.alertEmails, templates: data.templates});
  const noteRows = [];

  cfg.templates.forEach(t => {
    const old = ss.getSheetByName(t.sheetTab);
    if (old) ss.deleteSheet(old);
    const retired = (data.retired[t.id] || []).map(r => Object.assign({}, r, {retired: true}));
    const sh = newRoundTab_(ss, t.sheetTab);
    const cols = t.logs.map(l => ({id: l.id, sec: l.sec, name: l.name, type: l.type})).concat(retired);
    sh.insertColumnsBefore(4, cols.length);
    cols.forEach((c, i) => tagCol_(sh, 4 + i, c));
    const meta = readColMeta_(sh);
    renderHeaders_(sh, meta);

    const logsById = {};
    t.logs.forEach(l => logsById[l.id] = l);
    retired.forEach(r => logsById[r.id] = r);
    const rounds = data.rounds.filter(r => r.templateId === t.id).sort((a, b) => a.t < b.t ? -1 : 1);
    if (!rounds.length) return;
    const built = rounds.map(r => buildRow_(meta, logsById, {rid: r.rid, t1: r.t, engineer: r.engineer, vals: r.vals, notes: r.notes}));
    if (sh.getMaxRows() < rounds.length + 2) sh.insertRowsAfter(sh.getMaxRows(), rounds.length + 2 - sh.getMaxRows());
    const rng = sh.getRange(3, 1, rounds.length, meta.ridCol);
    rng.setValues(built.map(b => b.vals));
    rng.setNotes(built.map(b => b.notes));
    rng.setBackgrounds(built.map(b => b.bgs));

    rounds.forEach(r => Object.keys(r.notes || {}).forEach(id => {
      const l = logsById[id];
      if (!l || !String(r.notes[id]).trim()) return;
      const d = new Date(r.t);
      noteRows.push([Utilities.formatDate(d, CONFIG.TIMEZONE, 'MM/dd/yyyy'), Utilities.formatDate(d, CONFIG.TIMEZONE, 'h:mm a'),
        r.engineer, t.name, l.sec, l.name, r.vals[id] === undefined ? '' : r.vals[id], String(r.notes[id]).trim(), '', r.rid, t.id, id]);
    }));
    Logger.log(t.name + ': ' + rounds.length + ' rounds imported.');
  });

  noteRows.sort((a, b) => new Date(a[0] + ' ' + a[1]) - new Date(b[0] + ' ' + b[1]));
  appendRows_(ss.getSheetByName(TAB.NOTES), noteRows);
  Logger.log('Notes Log: ' + noteRows.length + ' notes imported. Import complete.');
}

// Removes the connection test tab once the real app is live
function removeConnectionTest() {
  const sh = ss_().getSheetByName('Connection Test');
  if (sh) ss_().deleteSheet(sh);
}

// ============================================================
// CONNECTION TEST (kept until cutover)
// ============================================================
function testWrite_(user, req) {
  const ss = ss_();
  let sh = ss.getSheetByName('Connection Test');
  if (!sh) { sh = ss.insertSheet('Connection Test'); sh.appendRow(['Timestamp', 'Engineer', 'Email', 'Device', 'App Mode']); }
  sh.appendRow([Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd/yyyy hh:mm:ss a'), user.name, user.email,
    String(req.device || '').slice(0, 200), String(req.mode || '')]);
  return {ok: true, row: sh.getLastRow()};
}
function testPhoto_(user, req) {
  if (!req.photo) throw new Error('No photo received.');
  const now = new Date();
  const root = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);
  const f = folder_(folder_(folder_(root, Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy')),
    Utilities.formatDate(now, CONFIG.TIMEZONE, 'MM-MMMM')), Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd') + ' Connection Test (' + user.name + ')');
  const file = f.createFile(Utilities.newBlob(Utilities.base64Decode(req.photo), 'image/jpeg',
    'Test photo ' + Utilities.formatDate(now, CONFIG.TIMEZONE, 'HH-mm-ss') + '.jpg'));
  return {ok: true, url: file.getUrl(), folderUrl: f.getUrl()};
}

// ============================================================
// HELPERS
// ============================================================
let SS_CACHE = null;
function ss_() { return SS_CACHE || (SS_CACHE = SpreadsheetApp.openById(CONFIG.SHEET_ID)); }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function num_(v) { if (v === '' || v === null || v === undefined) return ''; const n = Number(v); return isNaN(n) ? '' : n; }
function numOrNaN_(v) { return v === '' || v === null || v === undefined ? NaN : Number(v); }

function ensureTab_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    styleHeader_(sh, HEADERS[name].length);
    sh.setFrozenRows(1);
    if (name === TAB.NOTES || name === TAB.ALERTS) sh.getRange('A:B').setNumberFormat('@');
    if (name === TAB.NOTES) sh.hideColumns(10, 3);
    if (name === TAB.PHOTOS) sh.hideColumns(8, 5);
    if (name === TAB.LOGS) sh.hideColumns(17);
  }
  return sh;
}
function styleHeader_(sh, width) {
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground(COLOR.hdrDark).setFontColor(COLOR.text);
}
function rows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().filter(r => r.some(c => c !== ''));
}
function replaceRows_(sh, rows, checkboxCols) {
  const width = HEADERS[sh.getName()].length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), width)).clearContent().clearDataValidations();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, width).setValues(rows);
  (checkboxCols || []).forEach(c => sh.getRange(2, c, rows.length, 1).insertCheckboxes());
}
function appendRows_(sh, rows) {
  if (!rows.length) return;
  const start = Math.max(sh.getLastRow(), 1) + 1;
  if (start + rows.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 20);
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}