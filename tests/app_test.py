"""
Phone app tests for the test forms (Elevator, Generator, Diesel / Electric fire pumps).
Runs the real index.html in Chromium at iPhone size against a simulated server.

  python3 tests/app_test.py            (from the repo root)

Needs tests/fixtures/: master_diesel.pdf, master_electric.pdf, sig_scott.png, sig_jacky.png
(copies of the files in Drive > Logs > Rounds > Test Form Assets; never committed).
Writes generated PDFs and screenshots to tests/output/ for a visual check.
"""
import base64, functools, http.server, json, os, re, subprocess, sys, threading, traceback
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
OUT = os.path.join(ROOT, 'tests', 'output')
os.makedirs(OUT, exist_ok=True)
API = 'https://script.google.com/macros/s/'

PASS, FAIL = [], []
def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + ('' if cond else '  ' + str(detail)))

# ---------------- simulated server ----------------
class Server:
    def __init__(self):
        self.records = {}
        self.calls = []
        self.offline = False
        self.files = {}
        for k in ['master_diesel', 'master_electric']:
            self.files[k] = base64.b64encode(open(os.path.join(FIX, k + '.pdf'), 'rb').read()).decode()
        for k in ['sig_scott', 'sig_jacky']:
            self.files[k] = base64.b64encode(open(os.path.join(FIX, k + '.png'), 'rb').read()).decode()
    def handle(self, route):
        req = json.loads(route.request.post_data or '{}')
        a = req.get('action')
        self.calls.append(req)
        if self.offline and a in ('submitTest', 'testSync', 'testAssets', 'bootstrap'):
            return route.abort()
        if a == 'bootstrap':
            body = {'ok': True, 'version': '2.1.0', 'user': USER, 'session': 'tok', 'building': '343 Sansome St.', 'configVersion': 1,
                    'templates': [TEMPLATE], 'history': {}, 'lastNotes': {}, 'lastRound': {}}
        elif a == 'testSync':
            body = {'ok': True, 'records': list(self.records.values()), 'assetsVersion': 'v1'}
        elif a == 'testAssets':
            body = {'ok': True, 'version': 'v1', 'files': self.files}
        elif a == 'submitTest':
            rec = req['record']; rec['url'] = 'https://drive.example/' + rec['id']
            self.records[rec['id']] = rec
            if req.get('pdf'):
                name = req.get('fileName') or rec['id'] + '.pdf'
                open(os.path.join(OUT, name), 'wb').write(base64.b64decode(req['pdf']))
            body = {'ok': True, 'record': rec, 'url': rec['url']}
        elif a == 'submitRound':
            body = {'ok': True}
        else:
            body = {'ok': True}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
    def submits(self, form=None):
        return [c for c in self.calls if c.get('action') == 'submitTest' and (form is None or c['record']['form'] == form)]

USER = {'email': 'scott@343sansomesf.com', 'name': 'Scott', 'role': 'admin', 'rounds': 'all'}
TEMPLATE = {'id': 'morning', 'name': 'Morning Rounds', 'icon': '🌅', 'description': '', 'logs': [
    {'id': 'l1', 'sec': 'Plant', 'name': 'CHW Supply', 'type': 'numeric', 'unit': '°F'},
    {'id': 'l2', 'sec': 'Plant', 'name': 'Chiller 1', 'type': 'status', 'opts': [{'label': 'Running', 'style': 'ok'}, {'label': 'Off', 'style': ''}]}]}

# ---------------- helpers that drive the app ----------------
DRIVER = r"""
window.__run = async function(answers, opts){
  answers = answers || {}; opts = opts || {};
  let guard = 0;
  while (document.getElementById('s-test').classList.contains('active') && guard++ < 600) {
    const s = curStep();
    if (opts.stopAt && s.id === opts.stopAt) return 'stopped';
    let v = answers[s.id];
    if (v === undefined && T.v[s.id] !== undefined && T.v[s.id] !== '' && s.kind !== 'hub') v = T.v[s.id];
    if (s.kind === 'hub') {
      const want = opts.sets || 1;
      if ((T.sets||[]).length < want) { addSet(); continue; }
      testNext(); continue;
    }
    if (v === undefined) {
      if (s.kind === 'proc') v = 'Done';
      else if (s.kind === 'pf' || s.kind === 'procpf') v = 'P';
      else if (s.kind === 'check') v = '✓';
      else if (s.kind === 'frac') v = 'Full';
      else if (s.kind === 'choice') v = s.opts[0];
      else if (s.kind === 'chain') v = 'No';
      else if (s.kind === 'event') v = new Date().toISOString();
      else if (s.kind === 'num') v = (s.lo !== undefined ? String(s.lo) : '12');
    }
    if (v === '__skip') { testNext(); continue; }
    const before = T.idx + '|' + T.form;
    setT(s, v);
    if (s.kind === 'chain' || s.kind === 'choice') TS = buildSteps(T);
    if (failEntryMissing(s)) {
      if (TEST_FORMS[T.form].kind === 'aes') T.defs.push({id: uid('d'), item: s.item || s.marks, dc: 'D', text: answers['def:' + s.id] || ('Found at ' + s.id), date: T.date});
      else T.notes.push({id: uid('n'), step: s.id, text: answers['note:' + s.id] || ('Note for ' + s.id)});
    }
    testNext();
    if (T && (T.idx + '|' + T.form) === before && document.getElementById('s-test').classList.contains('active')) return 'stuck at ' + s.id;
  }
  return document.querySelector('.screen.active').id;
};
"""

def boot(page, srv, clear=True):
    page.goto('http://127.0.0.1:%d/index.html' % PORT)
    if clear:
        page.evaluate("""() => { localStorage.clear(); localStorage.setItem('r2_session', JSON.stringify({token:'tok', user:%s}));
          return new Promise(r => { const q = indexedDB.deleteDatabase('rounds2'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); }""" % json.dumps(USER))
        page.reload()
    page.wait_for_function("document.getElementById('s-rounds').classList.contains('active')", timeout=15000)
    page.wait_for_function("document.querySelectorAll('#test-cards .round-card').length===4", timeout=10000)
    page.evaluate(DRIVER)

def wait_sent(page, n=0):
    page.evaluate("processOutbox()")
    left = page.evaluate("""async (n) => { for (let i = 0; i < 120; i++) { const o = await dbAll('outbox');
        if (o.length === n && !syncing) return o.length; if (!syncing) processOutbox(); await new Promise(r => setTimeout(r, 250)); }
        return (await dbAll('outbox')).map(x => x.err || 'pending'); }""", n)
    if left != n: raise Exception('outbox not sent: %s' % left)

def pdftext(path):
    return subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout

def render(path, prefix):
    subprocess.run(['pdftoppm', '-r', '70', '-png', path, os.path.join(OUT, prefix)], check=True)

# ---------------- tests ----------------
def t_home_and_rounds(page, srv):
    print('Home screen + rounds still work')
    names = page.eval_on_selector_all('#test-cards .round-name', 'els => els.map(e => e.textContent)')
    check('four test cards', names == ['Elevator Phase I & II', 'Generator Monthly Test', 'Diesel Fire Pump Weekly', 'Electric Fire Pump Monthly'], names)
    check('round card still present', page.locator('#round-cards .round-card').count() == 1)
    page.click('#round-cards .round-card')
    page.wait_for_selector('#s-log.active')
    for k in '44':
        page.click('.key[data-k="%s"]' % k)
    page.click('#nav-next'); page.click('.opt >> text=Running'); page.wait_for_selector('#s-review.active', timeout=5000)
    page.click('#submit-btn'); page.wait_for_selector('#s-done.active')
    wait_sent(page)
    check('round submitted', any(c['action'] == 'submitRound' for c in srv.calls))
    check('done title says round', page.text_content('#done-title') == 'Round saved')
    page.evaluate("goRounds()")

def t_diesel(page, srv):
    print('Diesel weekly: UI clicks, fail entry, PDF')
    page.evaluate("startTest('diesel')")
    page.wait_for_selector('#s-test.active')
    check('first step is monitoring company', 'Monitoring company' in page.text_content('#t-label'))
    page.click('#t-next')
    check('procedure step blocks Next', 'Monitoring company' in page.text_content('#t-label'))
    page.click('.opt >> text=Done ✓'); page.wait_for_timeout(450)
    check('Done moves on', 'Notify Security' in page.text_content('#t-label'))
    page.evaluate("for(let i=0;i<2;i++){setT(curStep(),'Done');testNext();}")
    check('fans step marks 1.5', page.text_content('#t-num') == 'Item 1.5')
    page.click('.opt >> text=P · Pass'); page.wait_for_timeout(450)
    check('1.5 recorded P', page.evaluate("T.v['1.5']") == 'P')
    r = page.evaluate("__run({'suction':'45','system':'215','1.18':'12','1.19':'215','1.22':'F','def:1.22':'Slight vibration at outboard bearing','1.27':'3','1.28':'4','1.30':'30','1.31a':'64','1.31b':'1781','1.31c':'174','1.53':'7/8'}, {stopAt:'1.20'})")
    check('stops at 1.20 after start', r == 'stopped', r)
    order = page.evaluate("TS.slice(TS.findIndex(s=>s.id==='start_diesel')+1, TS.findIndex(s=>s.id==='start_diesel')+6).map(s=>s.id)")
    check('running order starts 1.48, 1.20, 1.22, 1.27, 1.28', order == ['1.48', '1.20', '1.22', '1.27', '1.28'], order)
    hidden = page.evaluate("['1.29','1.31d','1.35','1.36','1.38','1.39','1.50','1.54','1.55','1.67'].filter(k=>TS.some(s=>s.id===k))")
    check('N/A items hidden from tester', hidden == [], hidden)
    r = page.evaluate("__run({'1.22':'F','def:1.22':'Slight vibration at outboard bearing','1.18':'12','1.19':'215','1.27':'3','1.28':'4','1.30':'30','1.31a':'64','1.31b':'1781','1.31c':'174','suction':'45','system':'215','1.53':'7/8'})")
    check('diesel reaches review', r == 's-treview', r)
    page.click('#tr-save'); page.wait_for_selector('#s-done.active')
    check('done title says test', page.text_content('#done-title') == 'Test saved')
    wait_sent(page)
    sub = srv.submits('diesel')[-1]
    rec = sub['record']
    check('record has 1.68 P', rec['values'].get('1.68') == 'P')
    check('record keeps deficiency', any(d['item'] == '1.22' and d['dc'] == 'D' for d in rec['defs']))
    check('cycle is the month', rec['cycle'] == rec['date'][:7], rec['cycle'])
    check('procedure steps not stored', not any(k.startswith('p_') or k.startswith('r_') for k in rec['values']))
    pdf = os.path.join(OUT, sub['fileName'])
    check('PDF file name', re.match(r'^\d{4}-\d{2}-\d{2} Diesel Fire Pump Weekly Test\.pdf$', sub['fileName']), sub['fileName'])
    txt = pdftext(pdf)
    check('PDF has prefilled 160/185/203/225', all(x in txt for x in ['160', '185', '203', '225']))
    check('PDF has fuel 7/8', '7/8' in txt)
    check('PDF has deficiency text', 'Slight vibration at outboard bearing' in txt)
    check('PDF has N/A', 'N/A' in txt)
    check('PDF has tester name', 'Scott Morris' in txt)
    render(pdf, 'diesel1')

def t_chain(page, srv):
    print('Diesel week 2 chained into electric; 1.28 auto-fail')
    page.evaluate("startTest('diesel')")
    r = page.evaluate("__run({'q_chain':'Yes'}, {stopAt:'c_knife'})")
    check('chain moves to electric', r == 'stopped' and page.evaluate("T.form") == 'electric', r)
    check('electric carries 1.5/1.35/1.36', page.evaluate("[T.v['1.5'],T.v['1.35'],T.v['1.36']].join()") == 'P,P,P')
    check('electric chained skips standalone procedure', not page.evaluate("TS.some(s=>s.id==='p_mon'||s.id==='1.35')"))
    run = page.evaluate("(()=>{const i=TS.findIndex(s=>s.id==='start_electric');return TS.slice(i+1).filter(s=>!s.id.startsWith('r_')).map(s=>s.id)})()")
    check('electric running order', run == ['1.27', '1.18', '1.19', '1.24', '1.20', '1.21', '1.22', '1.23', '1.25', '1.28', '1.17'], run)
    # 1.28 under 10 min must force a deficiency
    page.evaluate("__run({}, {stopAt:'1.28'})")
    page.evaluate("setT(curStep(),'8')")
    page.click('#t-next')
    page.wait_for_selector('#ov-tdef.open')
    check('1.28 under 10 opens deficiency', True)
    page.fill('#def-ta', 'Pump ran 8 minutes, controller timer short')
    page.click('#ov-tdef .btn-acc')
    page.click('#t-next')
    check('moves on after entry', page.evaluate("curStep().id") == '1.17')
    restore = page.evaluate("TS.filter(s=>s.sec==='Restore to normal').map(s=>s.id)")
    check('electric restore order', restore == ['r_knife', 'r_valves', 'r_fans', 'r_auto', 'r_ann', 'r_sec'], restore)
    r = page.evaluate("__run({'1.28':'8'})")
    check('electric reaches review', r == 's-treview', r)
    page.click('#tr-save'); page.wait_for_selector('#s-done.active')
    wait_sent(page)
    d = srv.submits('diesel')[-1]; e = srv.submits('electric')[-1]
    check('diesel saved with 1.68 P at end of chain', d['record']['values'].get('1.68') == 'P')
    check('electric 1.37 P', e['record']['values'].get('1.37') == 'P')
    check('electric deficiency 1.28', any(x['item'] == '1.28' for x in e['record']['defs']))
    check('diesel file covers 2 tests', 'Diesel Fire Pump Weekly' in d['fileName'])
    txt = pdftext(os.path.join(OUT, d['fileName']))
    check('diesel PDF has two date columns', len(re.findall(r'\b\d\d/\d\d\b', txt.split('Fire Pump Start Pressure')[0])) >= 2 or txt.count('Scott Morris') >= 3)
    etxt = pdftext(os.path.join(OUT, e['fileName']))
    check('electric PDF prefilled 162/182', '162' in etxt and '182' in etxt)
    check('electric PDF deficiency', 'controller timer short' in etxt)
    render(os.path.join(OUT, d['fileName']), 'diesel2')
    render(os.path.join(OUT, e['fileName']), 'electric1')

def t_cancel(page, srv):
    print('Cancel: restore only what was changed')
    page.evaluate("startTest('diesel')")
    page.evaluate("__run({}, {stopAt:'p_fans'})")
    check('restore list after valves', page.evaluate("cancelRestoreList(T)") == ['r_valves', 'r_ann', 'r_sec'], page.evaluate("cancelRestoreList(T)"))
    page.click('#t-cancel'); page.wait_for_selector('#ov-tcancel.open')
    page.click('#ov-tcancel >> text=Save as Incomplete')
    page.wait_for_selector('#s-test.active')
    check('cancel shows restore steps', page.evaluate("TS.map(s=>s.id)") == ['r_valves', 'r_ann', 'r_sec'])
    page.evaluate("__run({})")
    page.wait_for_selector('#ov-treason.open')
    page.fill('#reason-ta', 'Diesel would not start, vendor called')
    page.click('#ov-treason .btn-acc')
    page.wait_for_selector('#s-rounds.active')
    wait_sent(page)
    rec = srv.submits('diesel')[-1]['record']
    check('saved as incomplete', rec['status'] == 'incomplete')
    check('reason on deficiency page', any('vendor called' in d['text'] for d in rec['defs']))
    # discard before any procedural step: no restore
    n = len(srv.submits())
    page.evaluate("startTest('generator')")
    page.evaluate("openCancel()"); page.click('#ov-tcancel >> text=Discard Test')
    page.wait_for_selector('#s-rounds.active')
    check('discard with nothing done needs no restore', page.evaluate("T") is None and len(srv.submits()) == n)

def t_generator(page, srv):
    print('Generator: ATS test, reading sets, same as last, flags')
    page.evaluate("startTest('generator')")
    page.evaluate("__run({'g_type':'ATS Transfer','g_ats2':'N/A','g_bat':'27.6','g_hrs1':'1284.2'}, {stopAt:'g_hub'})")
    check('at hub', page.evaluate("curStep().kind") == 'hub')
    page.click('text=+ Add Reading Set')
    check('set 1 first field is oil (no kW on ATS test)', page.evaluate("curStep().field") == 'oil')
    for k in '46':
        page.click('#t-keypad .key >> text="%s"' % k)
    check('keypad entry', page.evaluate("T.v['s0.oil']") == '46')
    page.evaluate("__run({'s0.ehx_ci':'168'}, {stopAt:'g_hub'})")
    page.click('text=+ Add Reading Set')
    page.evaluate("__run({}, {stopAt:'s1.v_ab'})")
    page.click('text=Same as last set (voltage and current)')
    check('same as last copied', page.evaluate("T.v['s1.a_c']") == page.evaluate("T.v['s0.a_c']") and page.evaluate("curStep().field") == 'ehx_ci')
    page.evaluate("setT(curStep(),'170');refreshTStatus()")
    check('out of range flagged red', 'alert' in page.get_attribute('#t-vbox', 'class'))
    restore = page.evaluate("cancelRestoreList(T)")
    check('generator cancel restore list', restore == ['g_stop', 'g_ctl2', 'g_ats1r', 'g_atsal2', 'g_secd'], restore)
    r = page.evaluate("__run({}, {sets:2})")
    check('generator reaches review', r == 's-treview', r)
    check('no ATS-2 retransfer when N/A', not page.evaluate("TS.some(s=>s.id==='g_ats2r')"))
    page.click('#tr-save'); page.wait_for_selector('#s-done.active'); wait_sent(page)
    rec = srv.submits('generator')[-1]['record']
    check('two sets saved', len(rec['sets']) == 2)
    check('set values saved', rec['sets'][0]['vals']['ehx_ci'] == '168' and rec['sets'][1]['vals']['ehx_ci'] == '170')
    check('test type saved', rec['testType'] == 'ATS Transfer')
    check('event times saved', bool(rec['values'].get('g_start')) and bool(rec['values'].get('g_stop')))
    check('no PDF sent for sheet forms', not srv.submits('generator')[-1].get('pdf'))

def t_elevator(page, srv):
    print('Elevator: order, F needs note')
    page.evaluate("startTest('elevator')")
    ids = page.evaluate("TS.map(s=>s.id)")
    check('Phase 1 item-by-item across cars', ids[:7] == ['p1.fcc.A', 'p1.fcc.B', 'p1.fcc.C', 'p1.fcc.D', 'p1.fcc.E', 'p1.fcc.P', 'p1.lobby.A'], ids[:7])
    p2a = [i for i in ids if i.startswith('p2.') and i.endswith('.A')]
    check('Phase 2 car A order', [i.split('.')[1] for i in p2a] == ['lamp', 'bell_l', 'bell_r', 'close_l', 'close_r', 'photo', 'open_l', 'open_r', 'hold', 'phone', 'addr', 'carid', 'cancel'], p2a)
    check('Reset last, per car', ids[-6:] == ['p3.normal.' + c for c in 'ABCDEP'])
    page.evaluate("__run({}, {stopAt:'p2.close_l.C'})")
    page.click('.opt >> text=F · Fail')
    page.wait_for_selector('#ov-tnote.open')
    pre = page.input_value('#tnote-ta')
    check('note prefilled with car and item', pre.startswith('Car C (F): Door close button / left side'), pre)
    page.fill('#tnote-ta', pre + 'Button sticks.'); page.click('#ov-tnote .btn-acc')
    r = page.evaluate("__run({})")
    check('elevator reaches review', r == 's-treview', r)
    page.click('#tr-save'); page.wait_for_selector('#s-done.active'); wait_sent(page)
    rec = srv.submits('elevator')[-1]['record']
    check('F stored', rec['values']['p2.close_l.C'] == 'F')
    check('note stored', any('Button sticks' in n for n in rec['notes']))

def t_edit_offline_resume(page, srv):
    print('Edit later, offline, resume')
    page.evaluate("goRounds()")
    page.evaluate("openTestList()")
    page.wait_for_selector('#s-tlist.active')
    rid = srv.submits('diesel')[0]['record']['id']
    page.evaluate("editRecord('%s')" % rid)
    page.wait_for_selector('#s-treview.active')
    check('edit has no procedure steps', not page.evaluate("TS.some(s=>s.kind==='proc'||s.kind==='event')"))
    page.evaluate("testGoTo(TS.findIndex(s=>s.id==='suction'))")
    page.evaluate("setT(curStep(),'47')"); page.evaluate("testReview()")
    srv.offline = True
    page.click('#tr-save'); page.wait_for_selector('#s-done.active')
    page.evaluate("processOutbox()"); page.wait_for_timeout(1500)
    page.evaluate("goRounds()"); page.wait_for_timeout(300)
    bar = page.text_content('#sync-text')
    check('offline: waiting to send 1 test', '1 test' in bar, bar)
    srv.offline = False
    wait_sent(page)
    last = srv.submits('diesel')[-1]['record']
    check('edit kept the same record id', last['id'] == rid and last['values']['suction'] == '47')
    # resume after closing the app mid-test
    page.evaluate("startTest('elevator')"); page.evaluate("__run({}, {stopAt:'p1.lobby.C'})")
    boot(page, srv, clear=False)
    check('resume card shown', 'Resume Elevator' in page.text_content('#test-resume'))
    page.click('#test-resume .btn-acc')
    check('resumes at same step', page.evaluate("curStep().id") == 'p1.lobby.C')
    page.evaluate("openCancel()"); page.click('#ov-tcancel >> text=Discard Test'); page.wait_for_selector('#s-rounds.active')

def t_screens(page, srv):
    print('Screenshots for review')
    page.evaluate("startTest('diesel')"); page.evaluate("__run({}, {stopAt:'1.48'})")
    page.screenshot(path=os.path.join(OUT, 'phone_diesel_1.48.png'))
    page.evaluate("openCancel()"); page.screenshot(path=os.path.join(OUT, 'phone_cancel.png'))
    page.click('#ov-tcancel >> text=Discard Test'); page.evaluate("__run({})")
    page.wait_for_selector('#s-rounds.active'); page.screenshot(path=os.path.join(OUT, 'phone_home.png'), full_page=True)
    page.evaluate("startTest('generator')"); page.evaluate("__run({'g_type':'Load Bank'}, {stopAt:'g_hub'})"); page.evaluate("addSet()")
    page.evaluate("__run({}, {stopAt:'s0.ehx_ci'})"); page.evaluate("setT(curStep(),'170');renderTest()")
    page.screenshot(path=os.path.join(OUT, 'phone_generator_flag.png'))
    page.evaluate("openCancel()"); page.click('#ov-tcancel >> text=Discard Test')
    page.evaluate("__run({})"); page.wait_for_selector('#s-rounds.active')

# ---------------- run ----------------
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    page = ctx.new_page()
    srv = Server()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    ctx.route(re.compile(r'https://script\.google\.com/.*'), srv.handle)
    ctx.route(re.compile(r'https://accounts\.google\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/javascript'))
    boot(page, srv)
    for t in [t_home_and_rounds, t_diesel, t_chain, t_cancel, t_generator, t_elevator, t_edit_offline_resume, t_screens]:
        try:
            t(page, srv)
        except Exception as e:
            FAIL.append(t.__name__); print('  FAIL ' + t.__name__ + ' crashed: ' + str(e)); traceback.print_exc()
            try: page.screenshot(path=os.path.join(OUT, 'crash_' + t.__name__ + '.png'))
            except Exception: pass
    check('no JavaScript errors', not errors, errors)
    b.close()
httpd.shutdown()
print('\n%d passed, %d failed' % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)
