// ============================================================
// TEST FORMS ENGINE: runner screens, drafts, cancel/restore, review, edit, sync, AES PDF builder
// Depends on index.html helpers ($, esc, lsGet, lsSet, lsDel, toast, show, api, dbPut/dbGet/dbAll/dbDel, SESSION)
// ============================================================
const TK={draft:'r2_test',srv:'r2_tests',local:'r2_tlocal'};
const TESTER_FULL={scott:'Scott Morris',jacky:'Jacky Cheung'};
let T=lsGet(TK.draft,null);   // test in progress (or being edited)
let TS=[];                     // steps for T
let tSyncing=false;

function testerOf(user){user=user||(SESSION&&SESSION.user)||{};const key=String(user.name||user.email||'').trim().split(/[\s@]/)[0].toLowerCase();
  return {key,name:TESTER_FULL[key]||user.name||key,email:user.email||''};}
function today(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function hhmm(iso){return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function mdy(ymd){const p=String(ymd).split('-');return p[1]+'/'+p[2]+'/'+p[0];}
function md(ymd){const p=String(ymd).split('-');return p[1]+'/'+p[2];}
function saveT(){if(T)lsSet(TK.draft,T);else lsDel(TK.draft);}
function answered(id){return T.v[id]!==undefined&&T.v[id]!=='';}

// ============================================================
// RECORDS (server list + ones saved on this phone)
// ============================================================
function allRecords(){
  const map={};
  (lsGet(TK.srv,{records:[]}).records||[]).forEach(r=>map[r.id]=r);
  lsGet(TK.local,[]).forEach(r=>{const s=map[r.id];if(!s||String(r.updated)>=String(s.updated))map[r.id]=r;});
  return Object.values(map).filter(r=>r.status!=='deleted');
}
function rememberLocal(rec){
  const list=lsGet(TK.local,[]).filter(r=>r.id!==rec.id);list.unshift(rec);
  const cutoff=Date.now()-120*86400000;lsSet(TK.local,list.filter(r=>new Date(r.updated).getTime()>cutoff).slice(0,80));
}
async function syncTests(){
  if(tSyncing||!SESSION)return;tSyncing=true;
  try{const r=await api('testSync',{});lsSet(TK.srv,{records:r.records||[],at:Date.now(),assetsVersion:r.assetsVersion});
    if(r.assetsVersion)ensureAssets(r.assetsVersion).catch(()=>{});
    if($('s-rounds').classList.contains('active'))renderTestCards();}
  catch(e){}finally{tSyncing=false;}
}
// Fire pump cycles: diesel = one form per calendar month; electric = six tests per form
function fpCycleFor(form,date,excludeId){
  if(form==='diesel')return date.slice(0,7);
  const recs=allRecords().filter(r=>r.form==='electric'&&r.id!==excludeId&&r.cycle);
  const by={};recs.forEach(r=>(by[r.cycle]=by[r.cycle]||[]).push(r));
  const keys=Object.keys(by).sort();const last=keys[keys.length-1];
  if(last&&by[last].length<6&&date>=last.slice(1))return last;
  return 'E'+date;
}
function cycleRecords(form,cycle,extra){
  const map={};allRecords().filter(r=>r.form===form&&r.cycle===cycle).forEach(r=>map[r.id]=r);
  (extra||[]).forEach(r=>map[r.id]=r);
  return Object.values(map).sort((a,b)=>(a.date+a.t0)<(b.date+b.t0)?-1:1);
}

// ============================================================
// ASSETS (blank state forms + signature stamps), cached on the phone
// Kept on the private Google side, never in the public repo.
// ============================================================
async function ensureAssets(version){
  const have=await dbGet('assets','meta').catch(()=>null);
  if(have&&(!version||have.version===version))return have;
  const r=await api('testAssets',{},90000);
  for(const k of Object.keys(r.files||{}))await dbPut('assets',{k,b64:r.files[k]});
  const meta={k:'meta',version:r.version,names:Object.keys(r.files||{})};await dbPut('assets',meta);return meta;
}
async function assetBytes(k){const a=await dbGet('assets',k);if(!a)return null;const bin=atob(a.b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}

// ============================================================
// HOME SCREEN CARDS
// ============================================================
function renderTestCards(){
  const el=$('test-cards');if(!el)return;el.innerHTML='';
  const recs=allRecords();
  Object.values(TEST_FORMS).forEach(f=>{
    const last=recs.filter(r=>r.form===f.id).sort((a,b)=>a.date<b.date?1:-1)[0];
    const b=document.createElement('button');b.className='round-card';
    b.innerHTML='<div class="round-icon">'+f.icon+'</div><div class="round-info"><div class="round-name">'+esc(f.name)+'</div><div class="round-desc">'+esc(f.desc)+'</div>'+
      (last?'<div class="round-last">Last: '+esc(mdy(last.date))+' · '+esc(last.testerName||'')+(last.status==='incomplete'?' · Incomplete':'')+'</div>':'')+'</div><div style="color:var(--txt2);font-size:20px">›</div>';
    b.onclick=()=>startTest(f.id);el.appendChild(b);
  });
  const rl=document.createElement('button');rl.className='btn btn-sec';rl.style.marginTop='4px';rl.textContent='Past tests · edit or reprint';rl.onclick=openTestList;el.appendChild(rl);
  renderTestResume();
}
function renderTestResume(){
  const el=$('test-resume');if(!el)return;
  if(!T){el.innerHTML='';return;}
  const f=TEST_FORMS[T.form];const n=Object.keys(T.v).length;
  el.innerHTML='<div class="card resume"><h3>'+(T.mode==='edit'?'Editing ':'Resume ')+esc(f.name)+(T.chained?' (after diesel)':'')+'</h3><p>'+(T.mode==='edit'?'Test from '+esc(mdy(T.date)):'Started '+esc(fmtWhen(T.t0)))+' · '+n+' entr'+(n===1?'y':'ies')+'</p>'+
    '<div class="row"><button class="btn btn-danger" style="flex:1" onclick="'+(T.mode==='edit'?'discardEdit()':'openCancel()')+'">'+(T.mode==='edit'?'Discard':'Cancel Test')+'</button><button class="btn btn-acc" style="flex:2" onclick="resumeTest()">Resume</button></div></div>';
}

// ============================================================
// START / RESUME
// ============================================================
function startTest(form){
  if(T){
    if(T.form===form&&T.mode!=='edit'){resumeTest();return;}
    toast('Finish or cancel the '+TEST_FORMS[T.form].name+' first');resumeTest();return;
  }
  T={id:uid('t'),form,mode:'new',t0:new Date().toISOString(),date:today(),tester:testerOf(),v:{},defs:[],notes:[],sets:[],idx:0};
  saveT();TS=buildSteps(T);show('test');renderTest();
}
function resumeTest(){if(!T)return;TS=buildSteps(T);T.idx=Math.max(0,Math.min(T.idx||0,TS.length-1));
  if(T.atReview){testReview();return;}show('test');renderTest();}
function leaveTest(){saveT();renderRounds();show('rounds');}
function curStep(){return TS[T.idx];}
function firstOpenGate(){for(let i=0;i<TS.length;i++){if(TS[i].gate&&!answered(TS[i].id))return i;}return TS.length;}

// ============================================================
// RENDER ONE STEP
// ============================================================
function renderTest(){
  T.atReview=false;
  if(!TS.length){testReview();return;}
  const s=curStep(),f=TEST_FORMS[T.form];
  $('t-name').textContent=(T.cancel?'Canceling · ':T.mode==='edit'?'Editing · ':'')+f.name;
  $('t-prog').textContent=(T.idx+1)+' / '+TS.length;$('t-fill').style.width=((T.idx+1)/TS.length*100)+'%';
  $('t-sec').textContent=s.sec||'';
  $('t-num').textContent=s.num?'Item '+s.num:'';$('t-num').style.display=s.num?'':'none';
  $('t-label').textContent=s.label;
  const d=$('t-desc');d.textContent=s.desc||'';d.style.display=s.desc?'':'none';
  const hint=s.hint||(s.lo!==undefined?'Normal: '+s.lo+' to '+s.hi+' '+(s.unit||''):'');
  const h=$('t-hint');h.textContent=hint;h.style.display=hint?'':'none';
  const area=$('t-input');area.innerHTML='';
  const kp=$('t-keypad');kp.style.display='none';
  const v=T.v[s.id];
  const optBtns=(opts,cls)=>{const g=document.createElement('div');g.className='opts '+(cls||(opts.length===1?'c1':opts.length===2||opts.length===4?'c2':'c3'));
    opts.forEach(o=>{const b=document.createElement('button');b.className='opt '+(o.style||'')+(String(v)===String(o.val)?' sel':'');b.innerHTML=o.html||esc(o.label);b.onclick=()=>pickTest(s,o.val);g.appendChild(b);});area.appendChild(g);};
  if(s.kind==='proc')optBtns([{val:'Done',label:'Done ✓',style:'ok'}],'c1');
  else if(s.kind==='pf'||s.kind==='procpf')optBtns([{val:'P',label:'P · Pass',style:'ok'},{val:'F',label:'F · Fail',style:'alarm'}]);
  else if(s.kind==='check')optBtns([{val:'✓',label:'✓',style:'ok'},{val:'F',label:'F · Fail',style:'alarm'}]);
  else if(s.kind==='frac')optBtns(FRACTIONS.map(x=>({val:x,label:x})),'c3');
  else if(s.kind==='choice'||s.kind==='chain')optBtns((s.kind==='chain'?['Yes','No']:s.opts).map(x=>({val:x,label:x})));
  else if(s.kind==='event'){
    const b=document.createElement('button');b.className='btn '+(v?'btn-sec':'btn-ok');b.style.padding='22px';b.textContent=v?'✓ '+s.btn+' at '+hhmm(v):s.btn;
    b.onclick=()=>{if(v&&!confirm('Record the time again?'))return;setT(s,new Date().toISOString());renderTest();if(!v)setTimeout(()=>testNext(),300);};area.appendChild(b);
  }else if(s.kind==='hub')renderHub(area);
  else if(s.kind==='num'){
    kp.style.display='grid';
    area.innerHTML='<div class="value-box" id="t-vbox"><span class="v num'+(v?'':' empty')+'" id="t-vtext">'+esc(v||'—')+'</span>'+(s.unit?'<span class="u">'+esc(s.unit)+'</span>':'')+'</div>';
    if(s.same&&s.set>0){const b=document.createElement('button');b.className='btn btn-sec';b.style.marginTop='8px';b.textContent='Same as last set (voltage and current)';b.onclick=()=>sameAsLast(s);area.appendChild(b);}
  }
  // action row
  const fp=TEST_FORMS[T.form].kind==='aes';
  const nDefs=T.defs.filter(x=>x.item===(s.item||s.marks)).length;
  $('t-note-lbl').textContent=fp?(nDefs?'Comment / Deficiency ('+nDefs+')':'Comment / Deficiency'):(T.notes.length?'Notes ('+T.notes.length+')':'Note');
  $('t-note-btn').classList.toggle('on',fp?nDefs>0:T.notes.length>0);
  $('t-cancel').textContent=T.mode==='edit'?'Discard edits':T.cancel?'':'Cancel test';
  $('t-cancel').style.display=T.cancel?'none':'';
  $('t-back').style.visibility=T.idx===0?'hidden':'visible';
  refreshTStatus();
  $('t-body').scrollTop=0;
}
function refreshTStatus(){
  const s=curStep(),v=T.v[s.id],msg=$('t-msg'),nn=$('t-next');
  let lvl='',text='';
  if(s.kind==='num'&&v!==undefined&&v!==''){
    const n=parseFloat(v);
    if(s.lo!==undefined&&(n<s.lo||n>s.hi)){lvl='alert';text='Outside normal '+s.lo+' to '+s.hi+' '+(s.unit||'')+'. Add a note if needed.';}
    if(s.failBelow!==undefined&&n<s.failBelow){lvl='alert';text='Under '+s.failBelow+' '+s.unit+': this will be marked Fail.';}
  }
  if((s.kind==='pf'||s.kind==='procpf'||s.kind==='check')&&v==='F'){lvl='alert';text='Marked Fail';}
  msg.className='msg'+(lvl?' '+lvl:'');msg.textContent=text;
  const vb=$('t-vbox');if(vb)vb.className='value-box'+(lvl?' lvl-'+lvl:'');
  const last=T.idx===TS.length-1;
  nn.className='nav-next'+(last?' review':'');nn.textContent=last?(T.cancel?'Finish ›':'Review ›'):'Next ›';
  if(s.kind==='hub'){nn.textContent=(T.sets||[]).length?'Done with readings ›':'Add a reading set first';}
}

// ============================================================
// INPUT
// ============================================================
function setT(s,val){if(val===''||val===undefined)delete T.v[s.id];else T.v[s.id]=val;
  if(s.marks){if(val===undefined||val==='')delete T.v[s.marks];else T.v[s.marks]=val;}
  saveT();}
let tPickTimer=null;
function pickTest(s,val){
  const was=T.v[s.id];
  if(val==='F'&&was!=='F'){
    const what=s.num?'item '+s.num:'"'+(s.itemLabel?CAR_NAME(s.car)+': '+s.itemLabel:s.label)+'"';
    const fp=TEST_FORMS[T.form].kind==='aes';
    if(!confirm('Mark '+what+' as FAIL?\n\n'+(fp?'A deficiency or comment entry will be required.':T.form==='elevator'?'A note will be required.':'You can add a note about what you found.')))return;
  }
  setT(s,val);
  if(s.kind==='chain'||s.kind==='choice'){TS=buildSteps(T);}
  renderTest();
  clearTimeout(tPickTimer);
  if(val==='F'){setTimeout(()=>{if(T.form==='generator')openTNote(s,false);else requireFailEntry(s);},200);return;}
  if(was!==val)tPickTimer=setTimeout(()=>{if(curStep()&&curStep().id===s.id)testNext();},260);
}
function tKey(k){
  const s=curStep();if(!s||s.kind!=='num')return;
  let v=T.v[s.id]||'';
  if(k==='del')v=v.slice(0,-1);else if(k==='.'){if(v.includes('.'))return;v=(v||'0')+'.';}
  else{if(v.replace('.','').length>=8)return;v=v==='0'?k:v+k;}
  setT(s,v);const t=$('t-vtext');t.textContent=v||'—';t.classList.toggle('empty',!v);refreshTStatus();
}
function sameAsLast(s){
  const prev=s.set-1;GEN_FIELDS.filter(f=>f.same).forEach(f=>{const pv=T.v['s'+prev+'.'+f.id];if(pv!==undefined)T.v['s'+s.set+'.'+f.id]=pv;});
  saveT();let i=T.idx;while(i<TS.length-1&&TS[i].same&&TS[i].set===s.set)i++;T.idx=i;renderTest();toast('Copied voltage and current');
}
function renderHub(area){
  const sets=T.sets||[];
  let h='<div class="card" style="padding:10px 12px"><div class="lbl" style="margin:0 0 6px">Reading sets ('+sets.length+' of '+GEN_MAX_SETS+')</div>';
  if(!sets.length)h+='<div style="color:var(--txt2);font-size:13px">No readings yet. Tap Add Reading Set to record the first set.</div>';
  sets.forEach((st,k)=>{const flags=GEN_FIELDS.filter(f=>{const v=T.v['s'+k+'.'+f.id];if(v===undefined)return false;if(f.check)return v==='F';const n=parseFloat(v);return f.lo!==undefined&&(n<f.lo||n>f.hi);}).length;
    const filled=GEN_FIELDS.filter(f=>T.v['s'+k+'.'+f.id]!==undefined).length;
    h+='<button class="jrow" onclick="goToSet('+k+')"><span class="jn">Set '+(k+1)+' · '+esc(st.time)+'</span><span class="jv '+(flags?'alert':'set')+'">'+filled+' entries'+(flags?' · '+flags+' flagged':'')+'</span></button>';});
  h+='</div>';area.innerHTML=h;
  if(sets.length<GEN_MAX_SETS){const b=document.createElement('button');b.className='btn btn-acc';b.style.marginTop='10px';b.textContent='+ Add Reading Set';b.onclick=addSet;area.appendChild(b);}
}
function addSet(){
  const now=new Date();T.sets.push({t:now.toISOString(),time:hhmm(now.toISOString())});
  TS=buildSteps(T);T.idx=TS.findIndex(s=>s.set===T.sets.length-1);T.v.g_hub=String(T.sets.length);saveT();renderTest();
}
function goToSet(k){T.idx=TS.findIndex(s=>s.set===k);saveT();renderTest();}

// Every Fail needs its entry before moving on
function failEntryMissing(s){
  const v=T.v[s.id];
  if(TEST_FORMS[T.form].kind==='aes'){
    const item=s.item||s.marks;if(!item)return false;
    const isFail=v==='F'||(s.failBelow!==undefined&&v!==undefined&&v!==''&&parseFloat(v)<s.failBelow);
    return isFail&&!T.defs.some(d=>d.item===item);
  }
  if(T.form==='elevator')return v==='F'&&!T.notes.some(n=>n.step===s.id);
  return false;
}
function requireFailEntry(s){
  if(!failEntryMissing(s))return;
  if(TEST_FORMS[T.form].kind==='aes')openDef(s,'D',true);else openTNote(s,true);
}

// ============================================================
// NAVIGATION
// ============================================================
function testNext(){
  const s=curStep();
  if(s.kind==='hub'&&!(T.sets||[]).length){toast('Add at least one reading set');return;}
  if(s.gate&&!answered(s.id)){toast('Complete this step before moving on');return;}
  if(s.failBelow!==undefined&&failEntryMissing(s)){
    if(!confirm('Item '+s.num+' is under '+s.failBelow+' '+s.unit+' and will be marked FAIL.\n\nA deficiency or comment entry will be required.'))return;
    openDef(s,'D',true);return;
  }
  if(failEntryMissing(s)){requireFailEntry(s);return;}
  if(s.kind==='chain'&&T.v.q_chain==='Yes'&&!T.cancel){startChainedElectric();return;}
  if(s.set!==undefined&&(T.idx+1>=TS.length||TS[T.idx+1].set!==s.set)){T.idx=TS.findIndex(x=>x.kind==='hub');saveT();renderTest();return;}
  if(T.idx>=TS.length-1){if(T.cancel){finishCancel();return;}testReview();return;}
  T.idx++;saveT();renderTest();
}
function testBack(){if(T.idx>0){const s=curStep();
  if(s.kind==='hub'&&(T.sets||[]).length){let i=-1;TS.forEach((x,j)=>{if(x.set===T.sets.length-1)i=j;});T.idx=i;}
  else T.idx--;saveT();renderTest();}}
function testGoTo(i){
  const g=T.mode==='edit'?TS.length:firstOpenGate();
  if(i>g){toast('Finish the earlier steps first');return;}
  T.idx=i;saveT();closeSheets();show('test');renderTest();
}
function openTJump(){
  const el=$('tjump-list');el.innerHTML='';let lastSec=null;const g=T.mode==='edit'?TS.length:firstOpenGate();
  TS.forEach((s,i)=>{
    if(s.sec!==lastSec){const h=document.createElement('div');h.className='jump-sec';h.textContent=s.sec;el.appendChild(h);lastSec=s.sec;}
    const b=document.createElement('button');b.className='jrow'+(i===T.idx?' cur':'');if(i>g)b.style.opacity='.45';
    b.innerHTML='<span class="jn">'+(s.num?'<b>'+esc(s.num)+'</b> ':'')+esc(s.label)+'</span><span class="jv num '+valClass(s)+'">'+esc(valText(s))+'</span>';
    b.onclick=()=>testGoTo(i);el.appendChild(b);
  });
  $('ov-tjump').classList.add('open');const c=el.querySelector('.cur');if(c)c.scrollIntoView({block:'center'});
}
function valText(s){const v=T.v[s.id];if(s.kind==='hub')return (T.sets||[]).length+' sets';if(v===undefined||v==='')return s.gate?'Required':'—';
  if(s.kind==='event'||s.kind==='proc')return s.kind==='event'?hhmm(v):'Done';return v+(s.kind==='num'&&s.unit?' '+s.unit:'');}
function valClass(s){const v=T.v[s.id];if(v===undefined||v==='')return s.gate?'warn':'';if(v==='F')return 'alert';
  if(s.kind==='num'){const n=parseFloat(v);if((s.lo!==undefined&&(n<s.lo||n>s.hi))||(s.failBelow!==undefined&&n<s.failBelow))return'alert';}return 'set';}

// ============================================================
// DEFICIENCY / COMMENT (fire pumps) and NOTES (generator, elevator)
// ============================================================
let defStep=null,defRequired=false;
function openTNoteBtn(){const s=curStep();if(TEST_FORMS[T.form].kind==='aes')openDef(s,'C',false);else openTNote(s,false);}
function openDef(s,dc,required){
  defStep=s;defRequired=required;const item=s.item||s.marks||'';
  $('def-title').textContent=(required?'Required · ':'')+(item?'Item '+item:'Comment');
  const list=T.defs.filter(d=>d.item===item);
  $('def-list').innerHTML=list.map(d=>'<div class="prev-note"><b>'+d.dc+'</b> · '+esc(d.text)+' <button class="link-btn" style="float:right;padding:0" onclick="delDef(\''+d.id+'\')">Remove</button></div>').join('');
  setDC(dc||'D');$('def-ta').value='';
  $('def-hint').textContent=required?'This item failed. Enter what was found: D for a deficiency, C for a comment. It prints on the Comments and Deficiencies page.':'Adds a line to the Comments and Deficiencies page for this item.';
  $('ov-tdef').classList.add('open');setTimeout(()=>$('def-ta').focus(),60);
}
let defDC='D';
function setDC(x){defDC=x;$('dc-d').classList.toggle('sel',x==='D');$('dc-c').classList.toggle('sel',x==='C');}
function saveDef(){
  const t=$('def-ta').value.trim();
  if(!t){if(defRequired&&!T.defs.some(d=>d.item===(defStep.item||defStep.marks))){toast('Enter what was found');return;}closeTSheet();return;}
  T.defs.push({id:uid('d'),item:defStep.item||defStep.marks||'',dc:defDC,text:t,date:T.date});saveT();closeTSheet();renderTest();toast('Saved to Comments and Deficiencies');
}
function delDef(id){T.defs=T.defs.filter(d=>d.id!==id);saveT();openDef(defStep,defDC,defRequired);}
let noteStep=null,noteRequired=false;
function openTNote(s,required){
  noteStep=s;noteRequired=required;
  $('tnote-title').textContent=required?'Required note':'Notes';
  $('tnote-list').innerHTML=T.notes.map(n=>'<div class="prev-note">'+esc(n.text)+' <button class="link-btn" style="float:right;padding:0" onclick="delTNote(\''+n.id+'\')">Remove</button></div>').join('');
  const pre=T.form==='elevator'&&s&&s.car&&T.v[s.id]==='F'&&required?CAR_NAME(s.car).replace('Parking ','')+' (F): '+s.itemLabel+'. ':(T.form==='generator'&&s&&s.set!==undefined&&required?'Set '+(s.set+1)+' '+s.label+': ':'');
  $('tnote-ta').value=pre;$('ov-tnote').classList.add('open');
  setTimeout(()=>{const ta=$('tnote-ta');ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);},60);
}
function saveTNote(){
  const t=$('tnote-ta').value.trim();
  if(!t){if(noteRequired&&failEntryMissing(noteStep)){toast('Enter a note for the failed item');return;}closeTSheet();return;}
  T.notes.push({id:uid('n'),step:noteStep?noteStep.id:'',text:t});saveT();closeTSheet();renderTest();toast('Note saved');
}
function delTNote(id){T.notes=T.notes.filter(n=>n.id!==id);saveT();openTNote(noteStep,noteRequired);}
function closeTSheet(){['ov-tdef','ov-tnote','ov-tjump','ov-tcancel'].forEach(i=>$(i).classList.remove('open'));}

// ============================================================
// FIRE PUMP CHAIN: diesel finishes, electric starts with the building still in test state
// ============================================================
function startChainedElectric(){
  const held=makeRecord(T,'complete');
  const chainDone=Object.keys(T.v).filter(k=>/^(p_|start_)/.test(k));
  const marks={'1.5':T.v['1.5']};if(T.v.p_knife)marks['1.35']='P';if(T.v.p_jtest)marks['1.36']='P';
  const carry=TS.filter(s=>s.id==='1.5').length?T.defs.filter(d=>d.item==='1.5').map(d=>Object.assign({},d,{id:uid('d')})):[];
  T={id:uid('t'),form:'electric',mode:'new',chained:true,held,chainDone,t0:new Date().toISOString(),date:today(),tester:testerOf(),v:Object.assign({},marks),defs:carry,notes:[],sets:[],idx:0};
  saveT();TS=buildSteps(T);renderTest();toast('Diesel test held. Electric test started.');
}

// ============================================================
// CANCEL
// ============================================================
function openCancel(){
  if(!T)return;if(T.mode==='edit'){discardEdit();return;}
  $('ov-tcancel').classList.add('open');
}
function cancelChoice(mode){
  closeTSheet();
  if(mode==='keep'){if(!$('s-test').classList.contains('active'))resumeTest();return;}
  const list=cancelRestoreList(T);
  T.cancel={mode,steps:list,returnIdx:T.idx};
  if(!list.length){saveT();finishCancel();return;}
  T.idx=0;saveT();TS=buildSteps(T);show('test');renderTest();
  toast('Restore the building before the test is closed');
}
function finishCancel(){
  if(T.cancel.mode==='incomplete'){openReason();return;}
  closeOutCancel(false);
}
function openReason(){$('ov-treason').classList.add('open');setReasonDC('D');$('reason-ta').value='';setTimeout(()=>$('reason-ta').focus(),60);}
let reasonDC='D';
function setReasonDC(x){reasonDC=x;$('rdc-d').classList.toggle('sel',x==='D');$('rdc-c').classList.toggle('sel',x==='C');}
function saveReason(){
  const t=$('reason-ta').value.trim();if(!t){toast('Enter why the test was stopped');return;}
  $('ov-treason').classList.remove('open');
  if(TEST_FORMS[T.form].kind==='aes')T.defs.push({id:uid('d'),item:'',dc:reasonDC,text:'Test incomplete: '+t,date:T.date});
  else T.notes.push({id:uid('n'),step:'',text:'INCOMPLETE ('+reasonDC+'): '+t});
  closeOutCancel(true);
}
async function closeOutCancel(keep){
  const restored=T.cancel&&T.cancel.steps.every(id=>answered(id));
  if(T.held){const d=T.held;if(restored||!T.cancel.steps.length)d.values['1.68']='P';await queueRecord(d);}
  if(keep){const rec=makeRecord(T,'incomplete');await queueRecord(rec);toast('Saved as incomplete');}
  else toast(T.held?'Electric test discarded. Diesel test saved.':'Test discarded');
  T=null;saveT();renderRounds();show('rounds');processOutbox();
}
function discardEdit(){if(!confirm('Discard your edits? The saved test stays as it was.'))return;T=null;saveT();renderRounds();show('rounds');}

// ============================================================
// REVIEW + SAVE
// ============================================================
function testReview(){
  closeTSheet();T.atReview=true;saveT();show('treview');
  const f=TEST_FORMS[T.form];let skipped=0,failed=0;const list=$('tr-list');list.innerHTML='';let lastSec=null;
  TS.forEach((s,i)=>{
    if(s.sec!==lastSec){const h=document.createElement('div');h.className='jump-sec';h.textContent=s.sec;list.appendChild(h);lastSec=s.sec;}
    const v=T.v[s.id];if((v===undefined||v==='')&&s.kind!=='hub')skipped++;if(valClass(s)==='alert')failed++;
    const b=document.createElement('button');b.className='jrow';
    b.innerHTML='<span class="jn">'+(s.num?'<b>'+esc(s.num)+'</b> ':'')+esc(s.itemLabel&&s.car?s.label+' · '+s.itemLabel:s.label)+'</span><span class="jv num '+valClass(s)+'">'+esc(v===undefined||v===''?(s.kind==='hub'?valText(s):'Skipped'):valText(s))+'</span>';
    b.onclick=()=>testGoTo(i);list.appendChild(b);
  });
  const extra=f.kind==='aes'?T.defs.map(d=>'<div class="prev-note"><b>'+esc(d.item||'Test')+' · '+d.dc+'</b> '+esc(d.text)+'</div>').join(''):T.notes.map(n=>'<div class="prev-note">'+esc(n.text)+'</div>').join('');
  $('tr-extra').innerHTML=extra?'<div class="jump-sec">'+(f.kind==='aes'?'Comments and Deficiencies':'Notes')+'</div>'+extra:'';
  $('tr-sub').textContent=f.name+' · '+mdy(T.date)+' · '+(T.tester&&T.tester.name||'');
  $('tr-sum').innerHTML='<div><b>'+(TS.length-skipped)+'</b><span>Entered</span></div><div class="skip"><b>'+skipped+'</b><span>Skipped</span></div><div class="warnc"><b>'+failed+'</b><span>Flagged</span></div><div><b>'+(f.kind==='aes'?T.defs.length:T.notes.length)+'</b><span>'+(f.kind==='aes'?'D / C':'Notes')+'</span></div>';
  $('tr-save').textContent=T.mode==='edit'?'Save Changes ✓':skipped?'Save with '+skipped+' skipped':'Save Test ✓';
  $('tr-date').style.display=T.mode==='edit'?'':'none';$('tr-date-in').value=T.date;
}
function backFromTReview(){T.atReview=false;show('test');renderTest();}
function setTestDate(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v)){T.date=v;saveT();}}
function makeRecord(D,status){
  const f=TEST_FORMS[D.form];const values={};
  Object.keys(D.v).forEach(k=>{if(!/^(p_|r_|c_|q_|start_|g_hub)/.test(k))values[k]=D.v[k];});
  const rec={id:D.recordId||D.id,form:D.form,date:D.date,t0:D.t0,t1:new Date().toISOString(),updated:new Date().toISOString(),status,
    tester:D.tester.key,testerName:D.tester.name,testerEmail:D.tester.email,values,defs:D.defs.map(d=>Object.assign({},d,{date:D.date})),notes:D.notes.map(n=>n.text)};
  if(D.form==='generator'){rec.testType=D.v.g_type||'';rec.sets=(D.sets||[]).map((s,k)=>{const vals={};GEN_FIELDS.forEach(g=>{const x=D.v['s'+k+'.'+g.id];if(x!==undefined)vals[g.id]=x;});return {t:s.t,time:s.time,vals};});
    Object.keys(rec.values).forEach(k=>{if(/^s\d+\./.test(k))delete rec.values[k];});}
  if(f.kind==='aes'){rec.cycle=D.cycle||fpCycleFor(D.form,D.date,rec.id);
    if(status==='complete'&&D.mode!=='edit')rec.values[D.form==='diesel'?'1.68':'1.37']='P';
    if(D.form==='diesel'&&D.v.q_chain==='Yes')delete rec.values['1.68'];}
  return rec;
}
async function saveTest(){
  const btn=$('tr-save');btn.disabled=true;
  try{
    if(T.mode!=='edit'){const g=firstOpenGate();if(g<TS.length){toast('Complete "'+TS[g].label+'" first');testGoTo(g);return;}}
    const bad=TS.find(s=>failEntryMissing(s));if(bad){toast('A failed item needs its entry');testGoTo(TS.indexOf(bad));requireFailEntry(bad);return;}
    const rec=makeRecord(T,T.mode==='edit'?(T.status||'complete'):'complete');
    if(T.mode==='edit'&&T.cycle&&rec.date.slice(0,7)!==T.cycle&&rec.form==='diesel')rec.cycle=fpCycleFor('diesel',rec.date,rec.id);
    if(T.held){T.held.values['1.68']='P';await queueRecord(T.held);}
    await queueRecord(rec);
    const f=TEST_FORMS[T.form];
    $('done-sum').textContent=f.name+(T.held?' and Diesel Fire Pump Weekly':'')+' · '+mdy(rec.date);
    T=null;saveT();testSavedScreen();show('done');$('done-status').className='done-status wait';$('done-status').textContent='Sending…';processOutbox();
  }catch(e){toast('Could not save: '+e.message);}
  finally{btn.disabled=false;}
}
async function queueRecord(rec){
  rememberLocal(rec);
  await dbPut('outbox',{id:'test_'+rec.id+'_'+Date.now(),type:'test',rid:rec.id,record:rec,added:Date.now(),tries:0});
}
// Sent by processOutbox in index.html
async function sendTestItem(item){
  const rec=item.record;let pdf=null,fileName='';
  if(TEST_FORMS[rec.form].kind==='aes'){
    const meta=await ensureAssets(lsGet(TK.srv,{}).assetsVersion);
    if(!meta)throw Object.assign(new Error('Form files not on this phone yet'),{code:'NET'});
    const recs=cycleRecords(rec.form,rec.cycle,[rec]).filter(r=>r.status!=='deleted');
    const bytes=await buildAesPdf(rec.form,recs);
    pdf=u8ToB64(bytes);fileName=aesFileName(rec.form,recs);
  }
  const r=await api('submitTest',{record:rec,pdf,fileName},120000);
  if(r.record)rememberLocal(r.record);
  return r;
}
function aesFileName(form,recs){const ds=recs.map(r=>r.date).sort();const a=ds[0],b=ds[ds.length-1];
  return (a===b?a:a+' to '+b)+' '+TEST_FORMS[form].short+'.pdf';}
function u8ToB64(u){let s='';const CH=0x8000;for(let i=0;i<u.length;i+=CH)s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));return btoa(s);}

// ============================================================
// PAST TESTS: edit or reprint
// ============================================================
function openTestList(){
  show('tlist');const el=$('tl-list');el.innerHTML='';
  const recs=allRecords().sort((a,b)=>(b.date+b.t0)<(a.date+a.t0)?-1:1);
  Object.values(TEST_FORMS).forEach(f=>{
    const mine=recs.filter(r=>r.form===f.id).slice(0,24);
    const h=document.createElement('div');h.className='jump-sec';h.textContent=f.name;el.appendChild(h);
    if(!mine.length){const e=document.createElement('div');e.style.cssText='color:var(--txt2);font-size:13px;padding:6px 2px';e.textContent='No saved tests yet';el.appendChild(e);}
    mine.forEach(r=>{const b=document.createElement('button');b.className='jrow';
      b.innerHTML='<span class="jn">'+esc(mdy(r.date))+' · '+esc(r.testerName||'')+(r.testType?' · '+esc(r.testType):'')+'</span><span class="jv '+(r.status==='incomplete'?'warn':'set')+'">'+(r.status==='incomplete'?'Incomplete':'Edit')+'</span>'+(r.url?'<a class="link-btn" style="padding:0 0 0 10px" href="'+esc(r.url)+'" target="_blank" onclick="event.stopPropagation()">Open</a>':'');
      b.onclick=()=>editRecord(r.id);el.appendChild(b);});
  });
}
function editRecord(id){
  if(T){toast('Finish or cancel the test in progress first');return;}
  const r=allRecords().find(x=>x.id===id);if(!r)return;
  const v=Object.assign({},r.values||{});const sets=[];
  (r.sets||[]).forEach((s,k)=>{sets.push({t:s.t,time:s.time});Object.keys(s.vals||{}).forEach(f=>v['s'+k+'.'+f]=s.vals[f]);});
  if(r.form==='generator')v.g_type=r.testType||v.g_type;
  T={id:uid('t'),recordId:r.id,form:r.form,mode:'edit',status:r.status,t0:r.t0,date:r.date,cycle:r.cycle,tester:{key:r.tester,name:r.testerName,email:r.testerEmail},
    v,defs:(r.defs||[]).map(d=>Object.assign({id:uid('d')},d)),notes:(r.notes||[]).map(t=>({id:uid('n'),step:'',text:t})),sets,idx:0};
  saveT();TS=buildSteps(T);testReview();
}

// ============================================================
// AES PDF (fire pumps): text drawn onto the blank state form
// ============================================================
// pdf-lib is only needed while sending (which needs signal anyway), so it loads on demand
let pdfLibLoading=null;
function loadPdfLib(){
  if(window.PDFLib)return Promise.resolve();
  return pdfLibLoading||(pdfLibLoading=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='vendor/pdf-lib.min.js';
    sc.onload=()=>res();sc.onerror=()=>{pdfLibLoading=null;rej(Object.assign(new Error('Could not load PDF tools'),{code:'NET'}));};document.head.appendChild(sc);}));
}
async function buildAesPdf(form,recs){
  await loadPdfLib();
  const L=AES_LAYOUT[form];const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const master=await assetBytes('master_'+form);if(!master)throw new Error('Blank form not downloaded yet');
  const doc=await PDFDocument.load(master);const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const pages=doc.getPages();const ink=rgb(0.05,0.1,0.45);
  const fit=(t,f,size,w,min)=>{let s=size;while(s>min&&f.widthOfTextAtSize(t,s)>w)s-=0.25;if(f.widthOfTextAtSize(t,s)>w){while(t.length>1&&f.widthOfTextAtSize(t+'…',s)>w)t=t.slice(0,-1);t+='…';}return {t,s};};
  const center=(p,r,t,size,f)=>{if(t===undefined||t===null||t==='')return;f=f||font;const x=fit(String(t),f,size||8,r[2]-r[0]-3,5);
    pages[p].drawText(x.t,{x:(r[0]+r[2])/2-f.widthOfTextAtSize(x.t,x.s)/2,y:(r[1]+r[3])/2-x.s*0.35,size:x.s,font:f,color:ink});};
  const right=(p,r,cap,t,size)=>{const x=fit(String(t),font,size||8,cap-r[0]-3,5);pages[p].drawText(x.t,{x:cap-2-font.widthOfTextAtSize(x.t,x.s),y:(r[1]+r[3])/2-x.s*0.35,size:x.s,font,color:ink});};
  const left=(p,r,t,size)=>{const x=fit(String(t),font,size||7.5,r[2]-r[0]-4,5);pages[p].drawText(x.t,{x:r[0]+2,y:(r[1]+r[3])/2-x.s*0.35,size:x.s,font,color:ink});};
  const cols=recs.slice(0,L.cols);
  if(cols.length){
    const d0=cols[0].date;
    Object.keys(L.hdr).forEach(p=>{const h=L.hdr[p];
      if(h.Year)pages[+p].drawText(d0.slice(0,4),{x:h.Year[0],y:h.Year[1],size:9,font:bold,color:ink});
      if(h.Month)pages[+p].drawText(new Date(d0+'T12:00:00').toLocaleDateString('en-US',{month:'long'}),{x:h.Month[0],y:h.Month[1],size:9,font:bold,color:ink});});
  }
  const na=FP_NA[form],pre=FP_PREFILL[form],units=NUM_ITEMS[form];
  cols.forEach((r,ci)=>{
    Object.keys(L.dates).forEach(p=>center(+p,L.dates[p][ci],md(r.date),8,bold));
    Object.keys(L.rows).forEach(key=>{
      const row=L.rows[key],cell=row.cells[ci],cap=row.cap[ci];
      let v=pre[key]!==undefined?pre[key]:na.includes(key)?'N/A':(r.values||{})[key];
      if(v===undefined||v==='')return;
      if(cap&&v!=='N/A')right(row.p,cell,cap,v);
      else if(units[key]&&!cap&&v!=='N/A')center(row.p,cell,v+' '+units[key]);
      else center(row.p,cell,v,v==='F'?9:8,v==='F'?bold:font);
    });
    // certification
    const C=L.cert,cp=L.pages-1;
    if(C.date[ci])center(cp,C.date[ci],mdy(r.date),8);
    if(C.name[ci])center(cp,C.name[ci],r.testerName||'',8);
  });
  // signatures
  for(let ci=0;ci<cols.length;ci++){
    const r=cols[ci],box=L.cert.sig[ci];if(!box)continue;
    const png=await assetBytes('sig_'+r.tester);if(!png)continue;
    const img=await doc.embedPng(png);const bw=box[2]-box[0]-4,bh=box[3]-box[1]-2;const sc=Math.min(bw/img.width,bh/img.height);
    pages[L.pages-1].drawImage(img,{x:(box[0]+box[2])/2-img.width*sc/2,y:box[1]+1,width:img.width*sc,height:img.height*sc});
  }
  // Comments and Deficiencies
  const defs=[];cols.forEach(r=>(r.defs||[]).forEach(d=>defs.push(Object.assign({date:r.date},d))));
  const rows=L.def_rows,dp=L.pages-1;
  defs.slice(0,rows.length).forEach((d,i)=>{const R=rows[i];
    center(dp,R.item,d.item?String(d.item).replace(/[a-d]$/,''):'',7.5);center(dp,R.date,md(d.date),7.5);
    center(dp,d.dc==='C'?R.c:R.d,'X',9,bold);left(dp,R.text,d.text,7.5);});
  if(defs.length>rows.length){
    center(dp,L.aes9,'X',8,bold);left(dp,L.aes9n,'Continued on attached page',7);
    let pg=doc.addPage([612,792]),y=740;
    pg.drawText(TEST_FORMS[form].name+': Comments and Deficiencies (continued)',{x:40,y:y,size:12,font:bold});y-=24;
    defs.slice(rows.length).forEach(d=>{
      const line=(d.item?d.item+'  ':'')+md(d.date)+'  '+d.dc+'  ';const words=String(d.text).split(/\s+/);let cur=line;
      const flush=()=>{pg.drawText(cur,{x:40,y,size:9,font});y-=13;if(y<50){pg=doc.addPage([612,792]);y=740;}cur='      ';};
      words.forEach(w=>{if(font.widthOfTextAtSize(cur+w+' ',9)>530)flush();cur+=w+' ';});flush();y-=4;
    });
  }
  return await doc.save();
}

// ============================================================
// SCREENS + SHEETS (added to the page once)
// ============================================================
(function mountTestUI(){
  const css=document.createElement('style');
  css.textContent='#s-test.active{height:100vh;height:100dvh;overflow:hidden}.t-num{display:inline-block;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:3px 9px;font-size:12px;font-weight:800;color:var(--acc);align-self:flex-start}'+
   '.t-hint{font-size:13px;color:#c9a227;background:rgba(201,162,39,.08);border:1px solid rgba(201,162,39,.3);border-radius:10px;padding:7px 10px}'+
   '.t-cancel{color:var(--danger);font-size:13px;font-weight:700;padding:6px 0}#s-treview .body,#s-tlist .body{flex:1;overflow-y:auto;padding:12px 16px}'+
   '.dc{display:flex;gap:8px}.dc .opt{flex:1;padding:12px}';
  document.head.appendChild(css);
  const html=`
<div id="s-test" class="screen">
  <div class="log-hdr">
    <div class="top"><button class="link-btn" onclick="leaveTest()">‹ Home</button><span class="tname" id="t-name"></span><button class="t-cancel" id="t-cancel" onclick="openCancel()">Cancel test</button></div>
    <div class="prog"><div class="prog-bar"><div class="prog-fill" id="t-fill"></div></div><div class="prog-txt num" id="t-prog"></div></div>
    <div class="sec-badge" id="t-sec"></div>
  </div>
  <div class="log-body" id="t-body">
    <span class="t-num" id="t-num"></span>
    <div class="lp-name" id="t-label"></div>
    <div class="lp-desc open" id="t-desc"></div>
    <div class="t-hint" id="t-hint"></div>
    <div id="t-input"></div>
    <div class="msg" id="t-msg"></div>
  </div>
  <div class="actions"><button class="act" id="t-note-btn" onclick="openTNoteBtn()">✏️ <span id="t-note-lbl">Note</span></button></div>
  <div class="keypad" id="t-keypad">
    ${['1','2','3','4','5','6','7','8','9','.','0','del'].map(k=>'<button class="key'+(k==='.'||k==='del'?' fn':'')+'" onclick="tKey(\''+k+'\')">'+(k==='del'?'⌫':k)+'</button>').join('')}
  </div>
  <div class="nav"><button class="nav-back" id="t-back" onclick="testBack()">‹</button>
    <button class="nav-list" onclick="openTJump()" aria-label="All steps"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="3" width="16" height="2.2" rx="1.1"/><rect x="2" y="9" width="16" height="2.2" rx="1.1"/><rect x="2" y="15" width="10" height="2.2" rx="1.1"/></svg></button>
    <button class="nav-next" id="t-next" onclick="testNext()">Next ›</button></div>
</div>
<div id="s-treview" class="screen">
  <div class="hdr"><div class="hdr-row"><button class="link-btn" onclick="backFromTReview()">‹ Back</button><h1>Review</h1><button class="t-cancel" onclick="openCancel()">${'Cancel'}</button></div>
    <div class="sub" id="tr-sub" style="text-align:center"></div></div>
  <div class="body"><div class="summary" id="tr-sum"></div>
    <div id="tr-date" class="card" style="margin-bottom:10px;padding:10px 12px"><div class="lbl" style="margin:0 0 6px">Test date</div><input id="tr-date-in" type="date" onchange="setTestDate(this.value)" style="width:100%;background:var(--inp);color:var(--txt);border:1px solid var(--bdr);border-radius:10px;padding:10px;font:inherit;font-size:16px"></div>
    <div id="tr-list"></div><div id="tr-extra"></div></div>
  <div class="review-foot"><button class="btn btn-ok" id="tr-save" onclick="saveTest()">Save Test ✓</button></div>
</div>
<div id="s-tlist" class="screen">
  <div class="hdr"><div class="hdr-row"><button class="link-btn" onclick="goRounds()">‹ Home</button><h1>Past Tests</h1><span style="width:44px"></span></div>
    <div class="sub" style="text-align:center">Tap a test to edit it. Saving rebuilds the printable copy.</div></div>
  <div class="body" id="tl-list"></div>
</div>
<div class="overlay" id="ov-tjump" onclick="if(event.target===this)closeTSheet()"><div class="sheet"><div class="sheet-hdr"><h2>All Steps</h2><button class="x" onclick="closeTSheet()">✕</button></div><div class="sheet-body" id="tjump-list" style="gap:0"></div></div></div>
<div class="overlay" id="ov-tdef"><div class="sheet"><div class="sheet-hdr"><h2 id="def-title">Deficiency</h2><button class="x" onclick="saveDef()">✕</button></div>
  <div class="sheet-body"><div class="msg" id="def-hint" style="text-align:left"></div><div id="def-list"></div>
  <div class="dc"><button class="opt alarm" id="dc-d" onclick="setDC('D')">D · Deficiency</button><button class="opt" id="dc-c" onclick="setDC('C')">C · Comment</button></div>
  <textarea id="def-ta" placeholder="What was found?"></textarea><button class="btn btn-acc" onclick="saveDef()">Save</button></div></div></div>
<div class="overlay" id="ov-tnote"><div class="sheet"><div class="sheet-hdr"><h2 id="tnote-title">Notes</h2><button class="x" onclick="saveTNote()">✕</button></div>
  <div class="sheet-body"><div id="tnote-list"></div><textarea id="tnote-ta" placeholder="What did you see?"></textarea><button class="btn btn-acc" onclick="saveTNote()">Save Note</button></div></div></div>
<div class="overlay" id="ov-tcancel" onclick="if(event.target===this)closeTSheet()"><div class="sheet"><div class="sheet-hdr"><h2>Cancel this test?</h2><button class="x" onclick="closeTSheet()">✕</button></div>
  <div class="sheet-body"><button class="btn btn-danger" onclick="cancelChoice('discard')">Discard Test<br><span style="font-size:12px;font-weight:600">Nothing is saved</span></button>
  <button class="btn btn-sec" onclick="cancelChoice('incomplete')">Save as Incomplete<br><span style="font-size:12px;font-weight:600;color:var(--txt2)">Keeps what you have entered, with a reason</span></button>
  <button class="btn btn-acc" onclick="cancelChoice('keep')">Keep Testing</button>
  <div class="msg">If you changed anything in the building, the app walks you through putting it back first.</div></div></div></div>
<div class="overlay" id="ov-treason"><div class="sheet"><div class="sheet-hdr"><h2>Why was the test stopped?</h2></div>
  <div class="sheet-body"><div class="dc"><button class="opt alarm" id="rdc-d" onclick="setReasonDC('D')">D · Deficiency</button><button class="opt" id="rdc-c" onclick="setReasonDC('C')">C · Comment</button></div>
  <textarea id="reason-ta" placeholder="Example: Diesel failed to start, vendor called"></textarea><button class="btn btn-acc" onclick="saveReason()">Save as Incomplete</button></div></div></div>`;
  const wrap=document.createElement('div');wrap.innerHTML=html;while(wrap.firstChild)document.body.appendChild(wrap.firstChild);
})();
