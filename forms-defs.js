// ============================================================
// TEST FORM DEFINITIONS (Elevator, Generator, Diesel / Electric Fire Pump)
// Spec: TEST_FORMS_SPEC.md in the Rounds project. Edit here, not in admin.
// ============================================================
const CARS=['A','B','C','D','E','P'];
const CAR_NAME=c=>c==='P'?'Parking Car P':'Car '+c;
const FRACTIONS=['Empty','1/8','1/4','3/8','1/2','5/8','3/4','7/8','Full'];

// ---------- Fire pump items (as printed on the state forms) ----------
const DIESEL_ITEMS={
 '1.1':'Fire Pump Start Pressure','1.2':'Fire Pump Stop Pressure','1.3':'Pressure Maintenance Pump Start Pressure','1.4':'Pressure Maintenance Pump Stop Pressure',
 '1.5':'Pump House Heating and Ventilating Louvers','1.6':'Control Valves: Identification Sign','1.7':'Control Valves: Inspection','1.8':'Pump Suction, Discharge & Bypass Valves Open',
 '1.9':'Normally Closed Valves are Closed (Test Header / Venturi Meter)','1.10':'Valve Supervisory Devices','1.11':'Control Valve Maintenance','1.12':'Piping is Free of Leaks',
 '1.13':'Suction Reservoir is Full','1.14':'Suction Line Pressure Gauge Reading within Acceptable Range','suction':'Suction Pressure Reading',
 '1.15':'System Line Pressure Gauge Reading within Acceptable Range','system':'System Pressure Reading','1.16':'Wet Pit Suction Screens Unobstructed and in Place',
 '1.17':'Verify Pump Packing Glands for Slight Discharge (pump not running)','1.18':'Suction Pressure Gauge Reading (pump running)','1.19':'Discharge Pressure Gauge Reading (pump running)',
 '1.20':'Check Pump Packing Glands for Slight Discharge (pump running)','1.21':'Adjust Gland Nuts if Necessary','1.22':'Check for Unusual Noise or Vibration',
 '1.23':'Check Packing Boxes, Bearings, or Pump Casing for Overheating','1.24':'Circulation Relief Valve Operating Properly (No Flow)','1.25':'Pressure Relief Valve Operating Properly (No Flow)',
 '1.26':'Pressure Relief Valve Operating Properly (Flowing)','1.27':'Observe Time for Engine to Crank','1.28':'Observe Time for Engine to Reach Running Speed',
 '1.29':'Record Time Controller is on First Step','1.30':'Record Time Pump Runs After Starting','1.31a':'Engine Oil Pressure Gauge','1.31b':'Speed Indicator Reading',
 '1.31c':'Water Temperature','1.31d':'Oil Temperature','1.32':'Pump Operation (No Flow Condition, 30 min)','1.33':'Record Any Abnormalities',
 '1.34':'Controller "Power On" Power Light is Illuminated','1.35':'Transfer Switch Pilot Light is Illuminated','1.36':'Isolating Switch is Closed (Standby Source)',
 '1.37':'Electrical System: General Inspection','1.38':'Reverse Phase Alarm Pilot Light','1.39':'Oil Level in Vertical Motor Sight Glass','1.40':'Power to Pressure Maintenance (Jockey) Pump is Provided',
 '1.41':'Controller Selector Switch is in "Auto" Position','1.42':'Batteries (2) Voltage Readings are Within Acceptable Range','1.43':'Batteries (2) Charging Current Readings are Within Acceptable Range',
 '1.44':'Batteries (2) Pilot Lights are On or Battery Failure (2) Lights are Off','1.45':'All Alarm Pilot Lights are Off','1.46':'Electrolyte Level in Batteries is Within Acceptable Range',
 '1.47':'Battery Terminals are Free from Corrosion','1.48':'Cranking Voltage','1.49':'Engine Running Time Meter is Reading','1.50':'Oil Level in Right Angle Gear Drive',
 '1.51':'Cooling Water Level is within Acceptable Range','1.52':'Water Jacket Heater is Operating','1.53':'Fuel: Tank Level','1.54':'Fuel: Tank Float Switch','1.55':'Fuel: Solenoid Valve Operation',
 '1.56':'Fuel: Flexible Hoses and Connectors','1.57':'Lubrication System: Oil Level is within Acceptable Range','1.58':'Cooling System: Level','1.59':'Cooling System: Adequate Cooling Water to Heat Exchanger',
 '1.60':'Cooling System: Water Pumps','1.61':'Cooling System: Condition of Flexible Hoses and Connections','1.62':'Cooling System: Jacket Water Heater','1.63':'Exhaust System: Leakage',
 '1.64':'Control Maintenance','1.65':'Fuel: Water in System','1.66':'Exhaust System: Drain Condensate Trap','1.67':'Lubrication System: Lube Oil Heater','1.68':'System Returned to Service'
};
const ELECTRIC_ITEMS={
 '1.1':'Fire Pump Start Pressure','1.2':'Fire Pump Stop Pressure','1.3':'Pressure Maintenance Pump Start Pressure','1.4':'Pressure Maintenance Pump Stop Pressure',
 '1.5':'Pump House Heating and Ventilating Louvers','1.6':'Control Valves: Identification Sign','1.7':'Control Valves: Inspection','1.8':'Pump Suction, Discharge & Bypass Valves Open',
 '1.9':'Normally Closed Valves are Closed (Test Header / Venturi Meter)','1.10':'Valve Supervisory Devices','1.11':'Piping is Free of Leaks','1.12':'Suction Reservoir is Full',
 '1.13':'Suction Line Pressure Gauge Reading within Acceptable Range','suction':'Suction Pressure Reading','1.14':'System Line Pressure Gauge Reading within Acceptable Range','system':'System Pressure Reading',
 '1.15':'Wet Pit Suction Screens Unobstructed and in Place','1.16':'Verify Pump Packing Glands for Slight Discharge (pump not running)','1.17':'Pump Operation (No Flow, 10 min)',
 '1.18':'Observe Time for Motor to Accelerate to Full Speed','1.19':'Check Pump Packing Glands for Slight Discharge (pump running)','1.20':'Suction Pressure Gauge Reading (pump running)',
 '1.21':'Discharge Pressure Gauge Reading (pump running)','1.22':'Pressure Readings Acceptable','1.23':'Adjust Gland Nuts if Necessary','1.24':'Check for Unusual Noise or Vibration',
 '1.25':'Check Packing Boxes, Bearings, or Pump Casing for Overheating','1.26':'Circulation Relief Valve Operating Properly (No Flow)','1.27':'Record Time Controller is on First Step',
 '1.28':'Record Time Pump Runs After Starting','1.29':'Controller "Power On" Power Light is Illuminated','1.30':'Engine Generator Sets (monthly)','1.31':'Transfer Switch Pilot Light is Illuminated',
 '1.32':'Isolating Switch is Closed (Standby Source)','1.33':'Reverse Phase Alarm Pilot Light','1.34':'Oil Level in Vertical Motor Sight Glass','1.35':'Exercise Isolating Switch Circuit Breaker',
 '1.36':'Power to Pressure Maintenance (Jockey) Pump is Provided','1.37':'System Returned to Service'
};
const NUM_ITEMS={ // fire pump items entered as numbers
 diesel:{suction:'psi',system:'psi','1.18':'psi','1.19':'psi','1.27':'sec','1.28':'sec','1.30':'min','1.31a':'psi','1.31b':'rpm','1.31c':'°F'},
 electric:{suction:'psi',system:'psi','1.18':'sec','1.20':'psi','1.21':'psi','1.27':'sec','1.28':'min'}
};
const FP_PREFILL={diesel:{'1.1':'160','1.2':'185','1.3':'203','1.4':'225'},electric:{'1.1':'162','1.2':'182','1.3':'203','1.4':'225'}};
const FP_NA={diesel:['1.29','1.31d','1.35','1.36','1.38','1.39','1.50','1.54','1.55','1.67'],electric:['1.30','1.31','1.32','1.33','1.34']};
const FP_HINT={
 diesel:{'1.48':'12 V system: below 9 V = Fail','1.53':'Pick the tank level as read on the gauge'},
 electric:{'1.28':'Required: 10 min. Under 10 is marked Fail.'}
};

// ---------- Procedural steps (fire pumps) ----------
const FP_PROC={
 p_mon:'Monitoring company: ignore supervisory signals',
 p_sec:'Notify Security of fire pump testing',
 p_valves:'Close Stair 1 and Stair 2 standpipe isolation valves',
 p_fans:'Turn on fire pump supply and exhaust fans',
 p_knife:'Open electric fire pump knife switch',
 p_dieseloff:'Turn off diesel fire pump',
 p_jauto:'Ensure jockey pump is in Auto',
 p_jtest:'Test jockey pump operation',
 c_knife:'Close electric fire pump knife switch (electric fire pump to Auto)',
 r_hoa:'Pump stops automatically. Switch HOA on diesel controller to Off',
 r_knife:'Open electric fire pump knife switch',
 r_valves:'Open Stair 1 and Stair 2 standpipe isolation valves',
 r_fans:'Turn off fire pump supply and exhaust fans',
 r_auto:'Close electric fire pump knife switch; confirm jockey, electric, and diesel fire pumps are in Auto',
 r_ann:'Check Life Safety System annunciator: all supervisory signals cleared',
 r_sec:'Inform Security fire pump test is complete'
};
// Which restore step undoes each procedural step (used by Cancel)
const FP_UNDO={p_mon:['r_ann'],p_sec:['r_sec'],p_valves:['r_valves'],p_fans:['r_fans'],p_knife:['r_auto'],p_dieseloff:['r_auto'],c_knife:['r_auto'],
  start_diesel:['r_hoa','r_auto'],start_electric:['r_knife','r_auto']};

const DIESEL_PRE=['1.6','1.7','1.8','1.9','1.10','1.11','1.12','1.13','1.14','suction','1.15','system','1.16','1.17','1.34','1.37','1.40','1.41','1.42','1.43','1.44','1.45','1.46','1.47',
  '1.51','1.52','1.53','1.56','1.57','1.58','1.61','1.62','1.63','1.64','1.65','1.66'];
const DIESEL_RUN=['1.48','1.20','1.22','1.27','1.28','1.18','1.19','1.21','1.23','1.24','1.25','1.26','1.30','1.31a','1.31b','1.31c','1.49','1.59','1.60','1.32','1.33'];
const ELECTRIC_PRE=['1.6','1.7','1.8','1.9','1.10','1.11','1.12','1.13','suction','1.14','system','1.15','1.16','1.26','1.29','1.35'];
const ELECTRIC_RUN=['1.27','1.18','1.19','1.24','1.20','1.21','1.22','1.23','1.25','1.28','1.17'];

// ---------- Generator ----------
const GEN_FIELDS=[ // one reading set
 {id:'kw',label:'Load',unit:'kW',grp:'',loadBankOnly:true},
 {id:'oil',label:'Oil pressure',unit:'psi',lo:40,hi:50,grp:''},
 {id:'ect',label:'Engine coolant temp',unit:'°F',lo:160,hi:180,grp:''},
 {id:'hz',label:'Frequency',unit:'Hz',grp:''},
 {id:'v_ab',label:'A-B',unit:'V',grp:'Voltage',same:true},{id:'v_ac',label:'A-C',unit:'V',grp:'Voltage',same:true},{id:'v_bc',label:'B-C',unit:'V',grp:'Voltage',same:true},
 {id:'a_a',label:'Phase A',unit:'A',grp:'Current',same:true},{id:'a_b',label:'Phase B',unit:'A',grp:'Current',same:true},{id:'a_c',label:'Phase C',unit:'A',grp:'Current',same:true},
 {id:'ehx_ci',label:'Engine coolant in',unit:'°F',lo:100,hi:165,grp:'Engine Heat Exchanger'},{id:'ehx_co',label:'Engine coolant out',unit:'°F',lo:100,hi:165,grp:'Engine Heat Exchanger'},
 {id:'ehx_ri',label:'Radiator loop in',unit:'°F',lo:75,hi:105,grp:'Engine Heat Exchanger'},{id:'ehx_ro',label:'Radiator loop out',unit:'°F',lo:75,hi:105,grp:'Engine Heat Exchanger'},
 {id:'fhx_i',label:'Fuel heat exchanger inlet',unit:'°F',lo:70,hi:110,grp:'Fuel Heat Exchanger'},{id:'fhx_o',label:'Fuel heat exchanger outlet',unit:'°F',lo:70,hi:90,grp:'Fuel Heat Exchanger'},
 {id:'fuel_sup',label:'Engine fuel supply temp',unit:'°F',lo:65,hi:85,grp:'Fuel Heat Exchanger'},
 {id:'rlp_i',label:'Inlet pressure',unit:'psi',lo:10,hi:14,grp:'Radiator Loop Pressure'},{id:'rlp_o',label:'Outlet pressure',unit:'psi',lo:2,hi:6,grp:'Radiator Loop Pressure'},
 {id:'c_cool',label:'Engine coolant level',check:true,grp:'Checked every reading set'},
 {id:'c_rcf',label:'Radiator Cooling Fan 1 running',check:true,grp:'Checked every reading set'},
 {id:'c_rcfa',label:'Radiator Cooling Fan 1 area: general condition',check:true,grp:'Checked every reading set'}
];
const GEN_MAX_SETS=6;

// ---------- Elevator ----------
const ELEV_P1=[['fcc','Fire Recall Function FCC Room'],['lobby','Fire Recall Function Lobby'],['parked','Verify cars are parked and locked out on fire mode']];
const ELEV_P2=[['lamp','Emergency recall lamp activated'],['bell_l','Emergency Bell function / left side'],['bell_r','Emergency Bell function / right side'],
 ['close_l','Door close button / left side'],['close_r','Door close button / right side'],['photo','Photo over-ride disabled'],['open_l','Door open button / left side'],
 ['open_r','Door open button / right side'],['hold','Car Hold function'],['phone','Confirm elevator phone operation'],['addr','Operator identifies building address'],
 ['carid','Operator identifies car ID'],['cancel','Call cancel function']];
const ELEV_P3=[['normal','Ensure car returns to normal operation']];

const TEST_FORMS={
 elevator:{id:'elevator',name:'Elevator Phase I & II',short:'Elevator Phase I and II Test',icon:'🛗',desc:'Monthly emergency operations test, Cars A to E and P',kind:'sheet'},
 generator:{id:'generator',name:'Generator Monthly Test',short:'Generator Monthly Test',icon:'⚡',desc:'No-Load, ATS Transfer, or Load Bank',kind:'sheet'},
 diesel:{id:'diesel',name:'Diesel Fire Pump Weekly',short:'Diesel Fire Pump Weekly Test',icon:'🛢️',desc:'NFPA 25 Form AES 5.1, one form per month',kind:'aes',items:DIESEL_ITEMS,cols:5},
 electric:{id:'electric',name:'Electric Fire Pump Monthly',short:'Electric Fire Pump Monthly Test',icon:'🔌',desc:'NFPA 25 Form AES 5.3, six months per form',kind:'aes',items:ELECTRIC_ITEMS,cols:6}
};

// ============================================================
// STEP BUILDERS: the ordered screens a tester walks through.
// A step: {id, kind, sec, label, desc, hint, unit, lo, hi, opts, item, marks, gate}
// kinds: proc (Done), procpf (P/F that marks an item), pf, check (✓/F), num, frac, choice, event (stamps time), hub (generator sets), chain (Yes/No)
// gate: must be answered before moving on.
// ============================================================
function fpItemStep(form,key,sec){
  const items=TEST_FORMS[form].items,unit=NUM_ITEMS[form][key];
  const s={id:key,item:key,sec,label:items[key],num:key.startsWith('1.')?key.replace(/[a-d]$/,''):'',hint:(FP_HINT[form]||{})[key]||''};
  if(key==='1.53'&&form==='diesel'){s.kind='frac';return s;}
  if(unit){s.kind='num';s.unit=unit;if(form==='electric'&&key==='1.28')s.failBelow=10;return s;}
  s.kind='pf';return s;
}
function buildDieselSteps(T){
  const S=[],P='Pre-run procedure';
  const proc=(id,sec,extra)=>S.push(Object.assign({id,kind:'proc',sec,label:FP_PROC[id],gate:true},extra||{}));
  proc('p_mon',P);proc('p_sec',P);proc('p_valves',P);
  S.push({id:'p_fans',kind:'procpf',sec:P,label:FP_PROC.p_fans,marks:'1.5',num:'1.5',gate:true});
  proc('p_knife',P);proc('p_jauto',P);proc('p_jtest',P);
  DIESEL_PRE.forEach(k=>S.push(fpItemStep('diesel',k,'Pre-checks')));
  S.push({id:'start_diesel',kind:'event',sec:'Start',label:'Start the diesel fire pump',desc:'Drop pressure at the test valve beneath the diesel fire pump controller.',btn:'Pump started',gate:true});
  DIESEL_RUN.forEach(k=>S.push(fpItemStep('diesel',k,'While running')));
  proc('r_hoa','End of test');
  S.push({id:'q_chain',kind:'chain',sec:'End of test',label:'Running the Electric Monthly next?',desc:'Yes: the diesel stays Off, the standpipe valves stay closed and the fans stay on. The electric test starts next and everything is restored at the end.',gate:true});
  if(T.v.q_chain!=='Yes')['r_valves','r_fans','r_auto','r_ann','r_sec'].forEach(id=>proc(id,'Restore to normal'));
  return S;
}
function buildElectricSteps(T){
  const S=[],P='Pre-run procedure';
  const proc=(id,sec,extra)=>S.push(Object.assign({id,kind:'proc',sec,label:FP_PROC[id],gate:true},extra||{}));
  if(T.chained){proc('c_knife','Start of electric test');}
  else{proc('p_mon',P);proc('p_sec',P);proc('p_valves',P);
    S.push({id:'p_fans',kind:'procpf',sec:P,label:FP_PROC.p_fans,marks:'1.5',num:'1.5',gate:true});
    proc('p_dieseloff',P);proc('p_jauto',P);
    S.push({id:'p_jtest',kind:'procpf',sec:P,label:FP_PROC.p_jtest,marks:'1.36',num:'1.36',gate:true});}
  ELECTRIC_PRE.forEach(k=>{if(k==='1.35'&&T.chained)return;S.push(fpItemStep('electric',k,'Pre-checks'));});
  S.push({id:'start_electric',kind:'event',sec:'Start',label:'Start the electric fire pump',desc:'Open the sensing line valve at the electric fire pump controller.',btn:'Pump started',gate:true});
  ELECTRIC_RUN.forEach(k=>S.push(fpItemStep('electric',k,'While running')));
  const R='Restore to normal';
  ['r_knife','r_valves','r_fans'].forEach(id=>proc(id,R));
  proc('r_auto',R,T.chained?{desc:'Includes switching the diesel controller HOA back to Auto.'}:null);
  proc('r_ann',R);proc('r_sec',R);
  return S;
}
function buildGeneratorSteps(T){
  const S=[],ats=T.v.g_type==='ATS Transfer',lb=T.v.g_type==='Load Bank';
  S.push({id:'g_type',kind:'choice',sec:'Test type',label:'Which test is this?',opts:['No-Load','ATS Transfer','Load Bank'],gate:true});
  const P='Pre-run procedure';
  [['g_sec','Notify Security of generator test'],['g_sie','Siemens monitoring: put supervisories on ignore'],['g_atsal','Basement ATS: no active alarms'],
   ['g_cond1','General condition: generator and day tank'],['g_cond2','General condition: Radiator Cooling Fan 1, Generator Cooling Fan 1, Generator Cooling Pump 1']]
    .forEach(([id,l])=>S.push({id,kind:'check',sec:P,label:l,gate:true}));
  const Q='Pre-start readings';
  S.push({id:'g_ctl',kind:'choice',sec:Q,label:'Control switch status',opts:['Auto','Off','Run']});
  S.push({id:'g_bat',kind:'num',sec:Q,label:'Battery (charger reading)',unit:'VDC'});
  S.push({id:'g_cool',kind:'check',sec:Q,label:'Engine coolant level'});
  S.push({id:'g_oillvl',kind:'check',sec:Q,label:'Oil level'});
  S.push({id:'g_blk',kind:'num',sec:Q,label:'Block heater temp',unit:'°F'});
  S.push({id:'g_day',kind:'frac',sec:Q,label:'Day tank fuel level (pre)'});
  S.push({id:'g_hrs1',kind:'num',sec:Q,label:'Hours (start)',unit:'hrs'});
  S.push({id:'g_start',kind:'event',sec:'Start',label:ats?'Start the generator (ATS transfer)':'Start the generator',btn:'Engine started',gate:true});
  if(ats){S.push({id:'g_ats1',kind:'choice',sec:'ATS transfer',label:'ATS-1',opts:['Transferred to Emergency','N/A'],gate:true});
    S.push({id:'g_ats2',kind:'choice',sec:'ATS transfer',label:'ATS-2',opts:['Transferred to Emergency','N/A'],gate:true});}
  (T.sets||[]).forEach((set,k)=>{
    GEN_FIELDS.forEach(f=>{
      if(f.loadBankOnly&&!lb)return;
      S.push({id:'s'+k+'.'+f.id,set:k,field:f.id,kind:f.check?'check':'num',sec:'Reading set '+(k+1)+' · '+set.time,grp:f.grp,
        label:(f.grp&&!f.check?f.grp+': ':'')+f.label,unit:f.unit,lo:f.lo,hi:f.hi,same:f.same});
    });
  });
  S.push({id:'g_hub',kind:'hub',sec:'Running readings',label:'Running readings',gate:true});
  S.push({id:'g_gcf',kind:'check',sec:'Confirm once while running',label:'Generator Cooling Fan 1 running'});
  S.push({id:'g_gcp',kind:'check',sec:'Confirm once while running',label:'Generator Cooling Pump 1 running'});
  const D='Shutdown';
  S.push({id:'g_stop',kind:'event',sec:D,label:'Stop the generator',btn:'Engine stopped',gate:true});
  S.push({id:'g_hrs2',kind:'num',sec:D,label:'Hours (stop)',unit:'hrs'});
  S.push({id:'g_ctl2',kind:'check',sec:D,label:'Control switch returned to Auto',gate:true});
  if(ats){['1','2'].forEach(n=>{if(T.v['g_ats'+n]!=='N/A')S.push({id:'g_ats'+n+'r',kind:'check',sec:D,label:'ATS-'+n+' retransferred to normal',gate:true});});}
  S.push({id:'g_atsal2',kind:'check',sec:D,label:'Basement ATS: no active alarms',gate:true});
  S.push({id:'g_secd',kind:'check',sec:D,label:'Security notified test complete',gate:true});
  return S;
}
function buildElevatorSteps(T){
  const S=[];
  ELEV_P1.forEach(([id,l])=>CARS.forEach(c=>S.push({id:'p1.'+id+'.'+c,kind:'check',car:c,sec:'Phase 1 · '+l,label:CAR_NAME(c),desc:l,itemLabel:l})));
  CARS.forEach(c=>ELEV_P2.forEach(([id,l])=>S.push({id:'p2.'+id+'.'+c,kind:'check',car:c,sec:'Phase 2 · '+CAR_NAME(c),label:l,itemLabel:l})));
  ELEV_P3.forEach(([id,l])=>CARS.forEach(c=>S.push({id:'p3.'+id+'.'+c,kind:'check',car:c,sec:'Reset / Return to Normal',label:CAR_NAME(c),desc:l,itemLabel:l})));
  return S;
}
function buildSteps(T){
  if(T.cancel)return T.cancel.steps.map(id=>restoreStep(T,id));
  const f={diesel:buildDieselSteps,electric:buildElectricSteps,generator:buildGeneratorSteps,elevator:buildElevatorSteps}[T.form](T);
  if(T.mode==='edit'){
    // Editing a saved test: only the recorded answers, no procedure steps
    const out=[];
    f.forEach(s=>{
      if(s.kind==='procpf'){const items=TEST_FORMS[T.form].items;out.push({id:s.marks,item:s.marks,kind:'pf',sec:'Pre-run procedure',label:items[s.marks],num:s.marks});return;}
      if(['proc','event','chain','hub'].includes(s.kind))return;
      out.push(Object.assign({},s,{gate:false}));
    });
    if(T.form==='electric'&&T.v['1.35']!==undefined&&!out.some(s=>s.id==='1.35'))out.push(fpItemStep('electric','1.35','Pre-checks'));
    return out;
  }
  return f;
}
function restoreStep(T,id){
  if(T.form==='generator'){
    const L={g_stop:['event','Stop the generator'],g_ctl2:['check','Control switch returned to Auto'],g_ats1r:['check','ATS-1 retransferred to normal'],g_ats2r:['check','ATS-2 retransferred to normal'],
      g_atsal2:['check','Basement ATS: no active alarms'],g_secd:['check','Security notified test complete']}[id];
    return {id,kind:L[0],sec:'Restore before canceling',label:L[1],btn:'Engine stopped',gate:true};
  }
  return {id,kind:'proc',sec:'Restore before canceling',label:FP_PROC[id],gate:true};
}
// Restore steps needed if the test is canceled now (only what undoes steps already done)
function cancelRestoreList(T){
  const done=id=>T.v[id]!==undefined&&T.v[id]!=='';
  if(T.form==='generator'){
    const out=[];
    if(done('g_start')&&!done('g_stop'))out.push('g_stop');
    if(done('g_start'))out.push('g_ctl2');
    ['1','2'].forEach(n=>{if(T.v['g_ats'+n]==='Transferred to Emergency'&&!done('g_ats'+n+'r'))out.push('g_ats'+n+'r');});
    if(done('g_start'))out.push('g_atsal2');
    if(done('g_sec'))out.push('g_secd');
    return out.filter((id,i,a)=>a.indexOf(id)===i&&!done(id));
  }
  if(T.form==='elevator')return [];
  const order=T.form==='diesel'?['r_hoa','r_valves','r_fans','r_auto','r_ann','r_sec']:['r_knife','r_valves','r_fans','r_auto','r_ann','r_sec'];
  const need={};
  const doneIds=Object.keys(FP_UNDO).filter(id=>done(id)||(T.chainDone||[]).includes(id));
  doneIds.forEach(id=>FP_UNDO[id].forEach(r=>need[r]=1));
  if(T.chained)need.r_auto=1; // diesel was left Off for the chained test
  if(T.form==='electric'&&T.chained){need.r_valves=1;need.r_fans=1;need.r_ann=1;need.r_sec=1;}
  if(need.r_hoa&&T.form==='electric')delete need.r_hoa;
  if(need.r_knife&&T.form==='diesel')delete need.r_knife;
  return order.filter(r=>need[r]&&!done(r));
}
