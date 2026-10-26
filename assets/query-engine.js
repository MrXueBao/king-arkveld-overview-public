// 已审计的字段传播与路径约束查询；不包含原生资源文件。

(function (host) {
  'use strict';
  // 图数据只读；同一参数对象的展开结果可复用（调用方均不修改返回值）。
  const unwrapped = new WeakMap();
  function unwrap(v) {
    if (!v || typeof v !== 'object') return v;
    let r = unwrapped.get(v);
    if (r === undefined) { r = unwrapRaw(v); unwrapped.set(v, r); }
    return r;
  }
  function unwrapRaw(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('field61' in v && Object.keys(v).every(k => k === 'field61' || k === '$type')) return unwrap(v.field61);
      return Object.fromEntries(Object.entries(v).filter(([k]) => k !== '$type').map(([k, x]) => [k, unwrap(x)]));
    }
    return Array.isArray(v) ? v.map(unwrap) : v;
  }
  function atom(state, key) { return state[key] === true ? true : state[key] === false ? false : null; }
  function evaluate(input, state, eventId) {
    if (eventId && Object.hasOwn(state.overrides || {}, eventId)) return state.overrides[eventId];
    const a = unwrap(input || {}), type = a.type;
    if (type === 'op23') {
      if (a.selected === 'Health') {
        const threshold = a.condition?.field24;
        return Number.isFinite(state.hp) && Number.isFinite(threshold) ? state.hp <= threshold : null;
      }
      if (a.selected === 'Status') {
        const v = a.condition?.field15;
        return v === 0 ? atom(state, 'angry') : v === 1 ? atom(state, 'tired') : null;
      }
      return null;
    }
    if (type === 'op21') {
      const val = a.condition?.field15;
      return a.category === 6 && Number.isFinite(state.legendary) && Number.isFinite(val) ? state.legendary === val :
        a.category === 1 && Number.isFinite(state.enemyId) && Number.isFinite(val) ? (state.enemyId >>> 0) === (val >>> 0) : null;
    }
    if (type === 'op17') return Number.isFinite(state.mode) ? state.mode === a.field38 : null;
    if (type === 'op10') return atom(state, 'charge');
    if (type === 'op12') return atom(state, 'chargeStart');
    if (type === 'op11') return atom(state, 'chargeEnd');
    if (type === 'op4') return atom(state, 'absorbed');
    if (type === 'op7') {
      if ((Number.isFinite(state.legendary) && state.legendary !== 2) || state.mode === 1 || state.validChangeModeContext === false) return false;
      if (Number.isFinite(state.hp) && state.hp >= 75) return false;
      return state.legendary === 2 && Number.isFinite(state.mode) && Number.isFinite(state.hp) && state.validChangeModeContext === true ? state.hp < 75 : null;
    }
    if (type === 'op28') return atom(state, 'unfairRoutine');
    if (type === 'op9' && [0,1].includes(a.field7) && a.field5 === 0 && a.field4 === 0 && a.field6 === 0) {
      if (Number.isFinite(state.distance)) {
        const scaled = state.aiState === 3 || state.previousAIState === 3;
        const threshold = a.field9 * (scaled ? (state.scale ?? 1) : 1) + (scaled ? (state.offset ?? 0) : 0);
        return a.field7 === 0 ? state.distance < threshold : state.distance > threshold;
      }
      const value = state.near?.[String(a.field9)];
      return typeof value === 'boolean' ? value : null;
    }
    if (type === 'op27') {
      const value = state.timers?.[a.field59];
      return typeof value === 'boolean' ? value : null;
    }
    
    return null;
  }

const api={unwrap,evaluate,describe:()=>"条件待确认"};host.DecisionValues=api;
})(typeof window!=="undefined"?window:globalThis);

(function(host){
'use strict';
const A=host.DecisionValues;
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):x);
function distance(a,s){
  if(a.type!=='op9'||![0,1].includes(a.field7)||a.field5!==0||a.field4!==0||a.field6!==0)return null;
  const scaled=s.aiState===3||s.previousAIState===3;
  const unscaled=Number.isFinite(s.aiState)&&s.aiState!==3&&Number.isFinite(s.previousAIState)&&s.previousAIState!==3;
  
  
  const identity=s.scale===1&&s.offset===0;
  if(!scaled&&!unscaled&&!identity)return null;
  if(scaled&&(!Number.isFinite(s.scale)||!Number.isFinite(s.offset)))return null;
  const scale=scaled?s.scale:1,offset=scaled?s.offset:0;
  const threshold=a.field9*scale+offset;
  if(!Number.isFinite(threshold))return null;
  return {key:'distance:SELF:XZ:height0:'+canonical({scale,offset}),field:'distance',threshold,relation:a.field7===0?'lt':'gt',geometry:{base:0,axis:0,height:0,scale,offset,regime:identity?'identity (AIState independent)':scaled?'AIState 3':'AIState non-3'}};
}
function descriptor(input,s){
  const a=A.unwrap(input||{}),d=distance(a,s);if(d)return d;
  if(a.type==='op23'&&a.selected==='Health'&&Number.isFinite(a.condition?.field24))return {key:'hp',field:'hp',threshold:a.condition.field24,relation:'le'};
  if(a.type==='op17')return {key:'mode',field:'mode',equal:a.field38};
  if(a.type==='op10')return {key:'charge',field:'charge',equal:true};
  if(a.type==='op23'&&a.selected==='Status'&&[0,1].includes(a.condition?.field15))return {key:a.condition.field15===0?'angry':'tired',field:a.condition.field15===0?'angry':'tired',equal:true};
  if(a.type==='op27')return {key:'timer:'+a.field59,field:'timers',equal:true};
  if(['op13','op6'].includes(a.type))return null; 
  if(['op9','op21','op12','op11'].includes(a.type))return {key:'read:'+canonical(a),field:a.type==='op9'?'distance':'exact',equal:true};
  return null;
}
function assume(domains,input,result,state,witness){
  const d=descriptor(input,state);if(!d)return {ok:true,domains,mode:'unresolved'};
  // 只替换被约束的字段；其余字段对象从不原地修改，可按引用共享。
  const next={...(domains||{})},old=next[d.key]||{field:d.field,witnesses:[]};
  const item={...witness,result,arg:A.unwrap(input),geometry:d.geometry};
  let value={...old,witnesses:[...old.witnesses,item]};
  if(d.relation){
    let relation=result?d.relation:({lt:'ge',gt:'le',le:'gt'})[d.relation];
    const lower=['gt','ge'].includes(relation),bound={value:d.threshold,inclusive:['ge','le'].includes(relation),witness:item};
    const k=lower?'lower':'upper',prev=value[k];
    if(!prev||(lower?bound.value>prev.value:bound.value<prev.value)||(bound.value===prev.value&&!bound.inclusive))value[k]=bound;
    const lo=value.lower,hi=value.upper;
    if(lo&&hi&&(lo.value>hi.value||(lo.value===hi.value&&(!lo.inclusive||!hi.inclusive))))return {ok:false,reason:'同一时间阶段的区间无交集',key:d.key,domain:value,attempt:item,previous:old};
  }else{
    if(result){if((Object.hasOwn(value,'equal')&&value.equal!==d.equal)||(value.not||[]).includes(d.equal))return {ok:false,reason:'同一时间阶段的状态值互斥',key:d.key,domain:value,attempt:item,previous:old};value.equal=d.equal;}
    else {if(Object.hasOwn(value,'equal')&&value.equal===d.equal)return {ok:false,reason:'同一时间阶段的状态值互斥',key:d.key,domain:value,attempt:item,previous:old};value.not=[...new Set([...(value.not||[]),d.equal])];}
  }
  next[d.key]=value;return {ok:true,domains:next,mode:'constrained',key:d.key};
}
function evaluate(arg,state,event){
  const a=A.unwrap(arg||{});
  if(a.type==='op9'){
    const d=distance(a,state);
    if(!d)return null;
    return Number.isFinite(state.distance)?(d.relation==='lt'?state.distance<d.threshold:state.distance>d.threshold):null;
  }
  return A.evaluate(arg,state,event);
}
function forget(domains,field,key){return Object.fromEntries(Object.entries(domains||{}).filter(([k,v])=>key?k!==key:v.field!==field));}
const api={descriptor,assume,evaluate,forget,canonical};host.DecisionConstraints=api;
})(typeof window!=='undefined'?window:globalThis);


(function(host){
'use strict';
const A=host.DecisionValues;
const C=host.DecisionConstraints;
const copy=x=>JSON.parse(JSON.stringify(x));
const dynamic=['hp','mode','charge','angry','tired','distance','chain','timers','aiState','previousAIState','scale','offset'];



const persistentFields=['mode','charge'];
function boundaryFacts(c,preserve=persistentFields){
 const fields=new Set(['legendary','enemyId','scale','offset',...preserve]);
 const state=Object.fromEntries(Object.entries(c.state||{}).filter(([k])=>fields.has(k)));
 const domains=Object.fromEntries(Object.entries(c.domains||{}).filter(([,d])=>preserve.includes(d.field)));
 const constraints=Object.fromEntries(Object.entries(c.constraints||{}).filter(([k])=>{
  try{return preserve.includes(C.descriptor(JSON.parse(k),state)?.field);}catch{return false;}
 }));
 return {state,domains,constraints};
}
const labels={table_entry:'进入表',row_dispatch:'原生行分派',predicate_true:'判断成立',predicate_false:'判断不成立',child_call:'调用子表',child_return_true:'子表返回 true',child_return_false:'子表返回 false（是否后备待核）',parent_saved_resume:'父表保存恢复行',normal_resume:'正常完成后恢复（有条件）',interruption_unknown:'中断 / 请求拒绝未知',command_followthrough:'请求命令后的返回（非动作完成）',next:'同步继续',pool_resource:'配置池',weighted_choice:'原始加权入口',weighted_target:'进入加权目标',history_low:'历史随机 low',history_high:'历史随机 high',requested_identity:'请求动作身份',desire_identity:'DesireRecover 身份',component_configuration:'组件配置',parameter_configuration:'参数配置',observed_exit_enter:'实录退出 / 进入',observed_next_identity:'实录下一动作'};
function create(graph,model){
  if(graph.schema!=='decision.query.v1')throw Error('Unsupported graph schema');
  const out=new Map(),inc=new Map(),N=graph.nodes;
  for(const e of graph.edges){if(!N[e.source]||!N[e.target])throw Error('Dangling edge '+e.id);for(const [map,k] of [[out,e.source],[inc,e.target]]){if(!map.has(k))map.set(k,[]);map.get(k).push(e);}}
  const title=e=>labels[e.type]||(e.type.startsWith('random_')?'原始随机分流':e.type);
  function seed(node,state={},extra={}){
    if(!N[node])throw Error('Unknown graph node '+node);
    return {node,state:copy(state),epoch:0,actionBoundaries:0,stack:[],trace:[],constraints:{},domains:{},unknown:[],timer_events:[],visited:[],depth:0,stateRow:null,context:null,...copy(extra)};
  }
  function invalidate(c,reason,{preserve=persistentFields}={}){
    return {...c,...boundaryFacts(c,preserve),epoch:c.epoch+1,unknown:[...c.unknown,reason]};
  }
  function record(c,e,addition={}){
    const marks=e.condition?.outcome?.unknown_branches||[];
    const visit=c.node+'|'+c.epoch+'|'+c.stack.map(f=>f.call).join('/');
    const outcome=e.condition?.outcome;
    let stateRow=Number.isInteger(outcome?.state_row)?outcome.state_row:(addition.stateRow??c.stateRow);
    if(N[e.target]?.kind==='row')stateRow=N[e.target].row;
    return {...c,...addition,stateRow,node:e.target,depth:c.depth+1,via:e.id,
      visited:[...c.visited,visit],trace:[...c.trace,{edge:e.id,type:e.type,source:e.source,target:e.target,epoch:c.epoch,...addition.traceMark}],
      unknown:[...(addition.unknown||c.unknown),...marks.map(x=>'未恢复的局部分支 '+x)]};
  }
  function expand(cursor,options={}){
    // 游标各字段从不原地修改（只整体替换），按引用共享即可，无需每步深拷贝。
    const c=cursor,n=N[c.node],limit=options.limit??40,offset=options.offset??0;
    const results=[],excluded=[];
    if(!n)return {children:[],excluded,terminal:'missing node',total:0};
    const visit=c.node+'|'+c.epoch+'|'+c.stack.map(f=>f.call).join('/');
    if(c.visited.includes(visit))return {children:[],excluded,terminal:'cycle_reference',reference:c.node,total:0};
    if(c.depth>=(options.maxDepth??120))return {children:[],excluded,terminal:'depth_limit',total:0};
    function add(e,base=c,extra={}){results.push({edge:e,cursor:record(base,e,extra)});}
    if(n.kind==='return'){
      const frame=c.stack.at(-1);
      if(!frame)return {children:[],excluded,terminal:'return_without_caller',total:0,
        message:'子表已返回；未选定调用现场。请向上选择父调用，不能任接所有父表。'};
      const value=n.outcome?.value;
      for(const e of out.get(frame.call)||[]){
        if((e.type==='child_return_true'&&value!==false)||(e.type==='child_return_false'&&value!==true)){
          const base={...c,stack:c.stack.slice(0,-1),stateRow:frame.saved_row??frame.stateRow??null};
          add(e,base,{unknown:value===undefined||value===null?[...c.unknown,'子表返回值未知']:c.unknown,
            traceMark:{return_value:value,after_action_boundary:c.actionBoundaries>0,meaning:c.actionBoundaries>0?'动作时间边界后子表返回；不等于前招失败':'同步子表返回；不认证动作结果'}});
        }
      }
    }else if(n.kind==='boundary'){
      if(n.outcome?.kind==='carried_row'&&Number.isInteger(c.stateRow)&&N['row:'+n.table+':'+c.stateRow]){
        const e={id:'virtual:'+n.id+':'+c.stateRow,source:n.id,target:'row:'+n.table+':'+c.stateRow,type:'carried_row_resume',phase:'synchronous',evidence:'native_structure',native:{table:n.table,address:n.outcome.site},condition:null};add(e);
      }else return {children:[],excluded,terminal:'native_boundary',total:0};
    }
    else {
      const ee=out.get(n.id)||[];
      const arg=n.arg||{},type=arg.type||'';
      let base=c;
      if(n.kind==='effect'||n.kind==='inline_skip'){
        if(type==='op38'){
          base={...c,state:{...c.state,timers:{...c.state.timers}},domains:C.forget(c.domains,'timers','timer:'+arg.field59),timer_events:[...c.timer_events,{kind:'write',node:n.id,arg,epoch:c.epoch,phase:c.actionBoundaries?'after_action':'before_action'}]};
          delete base.state.timers[arg.field59];
        }else if(type==='op29'){
          
          
          
          base={...c,unknown:[...c.unknown,'随机/历史参数命令；已核验不写 Mode、Charge、HP 或位置']};
        }else if(type==='op35'){
          const state={...c.state};delete state.distance;delete state.near;
          base={...c,state,domains:C.forget(c.domains,'distance'),unknown:[...c.unknown,'op35 改写目标/目的地上下文；只失效目标距离，不清空 Mode、Charge、HP']};
        }else if(type==='op36'){
          base={...c,unknown:[...c.unknown,'写入已识别的 BTable float 变量；不等同于 HP、Mode 或 Charge 字段']};
        }else if(n.kind==='inline_skip')base={...c,unknown:[...c.unknown,'Skip / 候选构造未模拟 @ '+n.address]};
        else if(['op36','op34','op37'].includes(type))base={...c,unknown:[...c.unknown,'副作用值未求解 '+type+'（不清空无关几何与Mode条件）']};
        else base=invalidate(c,'副作用未闭合 '+type+'；其他动态字段失效，未获 Mode/Charge 转换证据');
      }
      let v=null,ck=null;
      if(n.kind==='predicate'||n.kind==='unknown_command'){
        if(n.kind==='unknown_command')base=invalidate(c,'未校准命令的副作用未知；不据此假定 Mode/Charge 已转换');
        v=C.evaluate(arg,base.state,n.table+':'+n.address);
        
        if(['op10','op17','op23','op9','op21','op5'].includes(type)){
          ck=JSON.stringify(arg)+(type==='op5'?'@'+n.id:'');if(v===null&&Object.hasOwn(base.constraints,ck))v=base.constraints[ck];
        }
        if(type==='op27')base={...base,timer_events:[...base.timer_events,{kind:'check',node:n.id,arg,value:v,epoch:c.epoch,phase:c.actionBoundaries?'after_action':'before_action'}]};
      }
      for(const e of ee){
        if(e.phase==='identity_only'||e.phase==='component_config'||e.phase==='recording_only')continue;
        if(e.type==='child_return_true'||e.type==='child_return_false'||e.type==='parent_saved_resume')continue;
        if(e.type==='predicate_true'||e.type==='predicate_false'){
          const result=e.type==='predicate_true';
          if(v!==null&&v!==result){excluded.push({edge:e.id,reason:'当前同步条件排除',value:v,arg});continue;}
          const proof=C.assume(base.domains,arg,result,base.state,{node:n.id,address:n.address,epoch:base.epoch});
          if(!proof.ok){excluded.push({edge:e.id,reason:proof.reason,arg,proof,epoch:base.epoch,trace:[...base.trace,{edge:e.id,type:e.type,source:e.source,target:e.target,epoch:base.epoch,arg,result}]});continue;}
          add(e,base,{domains:proof.domains,constraints:ck?{...base.constraints,[ck]:result}:base.constraints,
            unknown:v===null?[...base.unknown,'未知判断 '+type+' = '+result+' @ '+n.address]:base.unknown,
            traceMark:{arg,result,value:v}});
        }else if(e.type==='child_call'){
          if(c.stack.length>=(options.maxStack??16)){excluded.push({edge:e.id,reason:'call_stack_limit'});continue;}
          add(e,base,{stack:[...c.stack,{call:n.id,table:n.table,saved_row:n.data.packed_resume_before_call,stateRow:c.stateRow,entered_epoch:c.epoch}],stateRow:0});
        }else if(n.kind==='action'){
          const route=options.route||'normal';
          if((route==='normal'&&e.type==='normal_resume')||(route==='interrupt'&&e.type==='interruption_unknown')){
            let after={...invalidate(c,'假设动作完成/恢复：继承 Mode、Charge；其他动态字段待重判',{preserve:route==='normal'?persistentFields:[]}),actionBoundaries:c.actionBoundaries+1};
            if(options.postState){
              const supplied=Object.fromEntries(Object.entries(copy(options.postState)).filter(([k])=>!persistentFields.includes(k)));
              after={...after,state:{...after.state,...supplied},unknown:[...after.unknown,'显式动作后假设；Mode/Charge 仍须服从本链保留约束']};
            }
            add(e,after);
          }else if(route==='command'&&e.type==='command_followthrough')add(e,c,{unknown:[...c.unknown,'命令返回不等于实际动作完成']});
        }else if(n.kind==='pool'&&n.pool&&options.stopAtPool){continue;}
        else if(e.type.startsWith('random_')||e.type.startsWith('history_'))add(e,base,{unknown:[...base.unknown,title(e)+'未模拟']});
        else add(e,base);
      }
    }
    return {children:results.slice(offset,offset+limit),total:results.length,offset,more:offset+limit<results.length,excluded,
      terminal:results.length?null:(n.kind==='action'?'no_saved_normal_resume':'leaf')};
  }

return {nodes:N,out,inc,seed,expand,invalidate,evaluate:C.evaluate};
}
host.DecisionFlow={create,labels,persistentFields,boundaryFacts};
})(typeof window!=="undefined"?window:globalThis);

(function(host){
'use strict';
const A=host.DecisionValues;
const Flow=host.DecisionFlow;
const C=host.DecisionConstraints;
const clone=x=>JSON.parse(JSON.stringify(x));
const scope={legendary:2,enemyId:1,tired:false,scale:1,offset:0};
function groundValue(arg){const a=A.unwrap(arg||{}),s=a.condition?.field35;
  return a.type==='op23'&&a.selected==='StandState'&&s?.field1===0&&Number.isInteger(s.field2)?s.field2===0:null;
}
function signature(c){
 const ds=Object.fromEntries(Object.entries(c.domains).sort().map(([k,d])=>[k,{equal:d.equal,not:d.not,lower:d.lower&&[d.lower.value,d.lower.inclusive],upper:d.upper&&[d.upper.value,d.upper.inclusive]}]));
 
 
 
 const initialFilters=c.trace.filter(t=>t.epoch===0&&t.type.startsWith('predicate_')&&(
  ['op17','op10','op9','op7'].includes(t.arg?.type)||
  t.arg?.type==='op23'&&['Health','Status'].includes(t.arg.selected)
 )).map(t=>[t.source,t.result]);
 const timerHistory=(c.timer_events||[]).map(t=>[t.kind,t.node,t.arg?.field59,t.arg?.field53,t.epoch,t.phase]);
 return JSON.stringify([c.node,c.state,c.stack,c.constraints,ds,c.epoch,c.stateRow,initialFilters,timerHistory]);
}
function create(F){
 const N=F.nodes;
 function expand(c,options={}){
  const r=F.expand(c,{limit:4000,maxDepth:1000,...options}),keep=[];
  for(const x of r.children){
   const v=options.initialGround!==false&&c.epoch===0&&c.actionBoundaries===0?groundValue(N[c.node].arg):null;
   if(v!==null&&/^predicate_/.test(x.edge.type)&&v!==(x.edge.type==='predicate_true')){
    r.excluded.push({edge:x.edge.id,reason:'scope_initial_ground_no_override',source:c.node});continue;
   }
   
   x.cursor.state={...x.cursor.state,tired:false};keep.push(x);
  }
  return {...r,children:keep,total:keep.length};
 }
 function walk(initial,options={}){
  const q=[initial],seen=new Map(),hits=[],boundaries=[],excluded=[],folded=[];
  const budget=options.budget??16000;let head=0;
  while(head<q.length&&head<budget){const c=q[head++],n=N[c.node];
   if(!n)continue;
   if(c.depth>initial.depth&&((n.kind==='action')||n.pool||options.stopNodes?.includes(n.id))){hits.push(c);continue;}
   if(['op31','op2','op33'].includes(n.arg?.type)){
    boundaries.push({node:c.node,reason:'other_request_mechanism',cursor:c});continue;
   }
   if(c.depth-initial.depth>(options.maxDepth??240)){
    boundaries.push({node:c.node,reason:'query_depth_limit',cursor:c});continue;
   }
   const k=signature(c);
   if(seen.has(k)){folded.push({node:c.node,representative:seen.get(k),trace:c.trace.map(t=>t.edge)});continue;}
   seen.set(k,c.trace.map(t=>t.edge));
   const r=expand(c,{...options,maxDepth:initial.depth+(options.maxDepth??240)});
   excluded.push(...r.excluded.map(x=>({...x,source:x.source||n.id})));
   if(r.terminal)boundaries.push({node:c.node,reason:r.terminal,cursor:c});
   for(const x of r.children)q.push(x.cursor);
  }
  const frontier=q.slice(head).map(c=>c.node);
  const limits=boundaries.filter(x=>/limit|cycle/.test(x.reason));
  return {hits,boundaries,excluded,folded,steps:head,frontier,
   incomplete:frontier.length>0||limits.length>0,
   coverage:{steps:head,frontier:[...new Set(frontier)],folded:folded.length,limits:limits.length,budget}};
 }
 function continuation(cursor,options={}){
  
  return walk(cursor,{...options,initialGround:false});
 }
 return {expand,walk,continuation};
}
function condition(){return "条件待确认";}

// replay 是沿路径的顺序折叠；拆成 开始／推进／分叉／结果，便于共享相同前缀的中间状态。
function replayStart(state){
 return {known:clone(state),domains:{},lastEpoch:0,unknown:0,reads:{},checks:[],incompatible:[],directConflicts:[],pending:[],rechecked:false};
}
// 分叉后继续推进不会改写原状态：known、reads 会被原地写入，故复制；domains 只整体替换。
function replayFork(s){
 const known={...s.known};if(known.timers)known.timers={...known.timers};
 return {...s,known,reads:{...s.reads},checks:[...s.checks],incompatible:[...s.incompatible],directConflicts:[...s.directConflicts],pending:[...s.pending]};
}
function replayResult(s){
 return {ok:!s.incompatible.length&&!s.directConflicts.length,unknown:s.unknown,state:s.known,domains:s.domains,checks:s.checks,incompatible:[...s.incompatible,...s.directConflicts],pending:s.pending,rechecked:s.rechecked};
}
function replay(path,N,E,state){return replayResult(replayStep(replayStart(state),path,N,E));}
// 尾段的所有时间阶段都晚于前缀，第一条边必然触发阶段重置：此后只剩 boundaryFacts 保留的字段。
// tailEntry 预先做这次重置；签名只含会影响判断的值（去掉仅用于冲突说明的 witness）。
function tailEntry(s){
 const kept=Flow.boundaryFacts({state:s.known,domains:s.domains});
 const t={known:{...kept.state,tired:false},domains:kept.domains,lastEpoch:NaN,unknown:0,reads:{},checks:[],incompatible:[],directConflicts:[],pending:[],rechecked:false};
 const ds=Object.keys(t.domains).sort().map(k=>{const d=t.domains[k];return [k,d.field,d.equal,d.not,d.lower&&[d.lower.value,d.lower.inclusive],d.upper&&[d.upper.value,d.upper.inclusive]];});
 // full 连同 witness 一起签名：冲突说明会引用 witness，只有完整入口相同才可共享含冲突的尾段增量。
 return {entry:t,sig:JSON.stringify([t.known,ds]),full:JSON.stringify([t.known,t.domains]),failed:s.incompatible.length+s.directConflicts.length>0};
}
// 从已重置入口推进尾段，返回增量；lastEpoch 为 NaN 保证与原重放一样在首条边重置一次。
// 无冲突时增量（checks/pending/unknown）只取决于签名与尾段；冲突说明会引用前缀 witness，调用方需按自身前缀重算。
function tailDelta(t,tail,N,E){
 const s=replayStep({...t.entry,known:{...t.entry.known},checks:[],incompatible:[],directConflicts:[],pending:[],reads:{}},tail,N,E);
 return {checks:s.checks,incompatible:s.incompatible,directConflicts:s.directConflicts,pending:s.pending,unknown:s.unknown,rechecked:s.rechecked,conflict:s.incompatible.length+s.directConflicts.length>0};
}
// 与 replayResult(replayStep(replayFork(prefix),tail)) 逐项相同（数组顺序：前缀 incompatible、尾段 incompatible、前缀冲突、尾段冲突）。
function joinDelta(s,d){
 const incompatible=[...s.incompatible,...d.incompatible],directConflicts=[...s.directConflicts,...d.directConflicts];
 return {ok:!incompatible.length&&!directConflicts.length,unknown:s.unknown+d.unknown,checks:[...s.checks,...d.checks],incompatible:[...incompatible,...directConflicts],pending:[...s.pending,...d.pending],rechecked:s.rechecked||d.rechecked};
}
function replayStep(s,path,N,E){
 let {known,domains,lastEpoch,unknown,reads,rechecked}=s;
 const {checks,incompatible,directConflicts,pending}=s;
 for(const [eid,epoch] of path||[]){const e=E[eid];if(!e)continue;const n=N[e.source],a=A.unwrap(n?.arg||{});
  if(epoch!==lastEpoch||e.type==='normal_resume'){
   const kept=Flow.boundaryFacts({state:known,domains});known={...kept.state,tired:false};domains=kept.domains;lastEpoch=epoch;
   rechecked=true;reads={};
  }
  
  
  if(n?.kind==='unknown_command'||e.type==='interruption_unknown'||
    n?.kind==='effect'&&!['op38','op29','op35','op36','op34','op37'].includes(a.type)){
   const kept=Flow.boundaryFacts({state:known,domains},e.type==='interruption_unknown'?[]:Flow.persistentFields);
   known={...kept.state,tired:false};domains=kept.domains;reads={};
  }
  if(n?.kind==='effect'&&a.type==='op35'){delete known.distance;delete known.near;}
  if(n?.kind==='effect'&&a.type==='op35'){domains=C.forget(domains,'distance');reads={};}
  if(n?.kind==='effect'&&a.type==='op38'){
   domains=C.forget(domains,'timers','timer:'+a.field59);
   if(known.timers){known.timers={...known.timers};delete known.timers[a.field59];}
  }
  if(!e.type.startsWith('predicate_'))continue;
  const result=e.type==='predicate_true',v=C.evaluate(a,known,n?.table+':'+n?.address),d=C.descriptor(a,known);
  const persistent=Flow.persistentFields.includes(d?.field);
  const item={field:d?.field==='charge'?'Charge MAX':d?.field==='mode'?'Mode':a.selected==='StandState'?'StandState':a.type||'未知条件',node:n?.id,address:n?.address,epoch,result,
   before:persistent?known[d.field]:undefined,required:a.type==='op17'?(result?a.field38:`?${a.field38}`):a.type==='op10'?(result?'MAX':'?MAX'):result};
  
  
  if(a.type==='op23'||a.type==='op5'){
   const key=(n?.id||e.source)+'|'+JSON.stringify(a);if(Object.hasOwn(reads,key)&&reads[key].result!==result)directConflicts.push({...item,reason:'同阶段同一原生谓词得到互斥分支',previous:reads[key]});
   reads[key]={result,node:n?.id,address:n?.address,epoch};
  }
  if(v!==null&&v!==result){(persistent?incompatible:directConflicts).push({...item,reason:'已知条件明确矛盾；普通完成保留 Mode/Charge'});}
  if(persistent){
   const proof=C.assume(domains,a,result,known,{node:n.id,address:n.address,epoch});
   if(!proof.ok)incompatible.push({...item,reason:'同一执行链的持久字段约束互斥'});
   else {domains=proof.domains;const value=domains[d.key];
    if(Object.hasOwn(value,'equal'))known[d.field]=value.equal;
    else if(d.field==='charge'&&value.not?.includes(true))known.charge=false;
    else if(d.field==='mode'&&value.not?.length===1&&[0,1].includes(value.not[0]))known.mode=1-value.not[0];
   }
   if(v===null){unknown++;pending.push({...item,reason:'入口状态未知；保留条件候选'});}else if(v===result)checks.push(item);
  }else {
   const proof=C.assume(domains,a,result,known,{node:n.id,address:n.address,epoch});
   if(!proof.ok)directConflicts.push({...item,field:d?.field||item.field,reason:proof.reason,proof});
   else domains=proof.domains;
   if(v===null){unknown++;pending.push({...item,reason:'动态条件待重新判断'});}
  }
 }
 Object.assign(s,{known,domains,lastEpoch,unknown,reads,rechecked});return s;
}
function matches(path,N,E,state){const r=replay(path,N,E,state);return {ok:r.ok,unknown:r.unknown};}
function stateTransitionRequirements(paths,N,E,state,entryState=state){return requirementsFromRuns((paths||[]).map(p=>replay(p,N,E,state)));}
function requirementsFromRuns(runs){
 const checks=runs.flatMap(r=>r.checks),unknown=runs.flatMap(r=>r.pending),incompatible=runs.flatMap(r=>r.incompatible);
 
 
 return {class:incompatible.length?'same_stage_conflict':unknown.length?(runs.some(r=>r.rechecked)?'post_action_recheck':'unknown_condition'):'compatible_static_guards',checks,changes:[],unknown,incompatible};
}



function deriveReachability(D,getPath){
 const N=D.graph.nodes,E=Object.fromEntries(D.graph.edges.map(e=>[e.id,e])),masks={},contexts={},structural={},witnesses={},structuralWitnesses={},pc=new Map();
 const put=(map,proof,cid,bits,chain)=>{const old=map[cid]||0;map[cid]=old|bits;proof[cid]??={};for(let i=0;i<4;i++)if((bits&(1<<i))&&!(old&(1<<i)))proof[cid][i]=chain;return old!==map[cid];};
 const routes=Object.values(D.routes),incoming={};for(const r of routes)if(r.context)(incoming[r.context]??=[]).push(r.id);
 for(const r of routes){if(!pc.has(r.path))pc.set(r.path,pathMask(getPath(r.path),N,E));masks[r.id]=pc.get(r.path);if(r.kind==='first'&&r.context){put(contexts,witnesses,r.context,masks[r.id],[r.id]);put(structural,structuralWitnesses,r.context,masks[r.id],[r.id]);}}
 let changed=true;while(changed){changed=false;for(const r of routes)if(r.kind==='continuation'&&r.context)for(let i=0;i<4;i++){
  const bit=1<<i;
  if((contexts[r.source_context]||0)&bit)changed=put(contexts,witnesses,r.context,masks[r.id]&bit,[...witnesses[r.source_context][i],r.id])||changed;
  if((structural[r.source_context]||0)&bit)changed=put(structural,structuralWitnesses,r.context,bit,[...structuralWitnesses[r.source_context][i],r.id])||changed;
 }}
 return {pairs:statePairs,contexts,structural,witnesses,structuralWitnesses,masks,incoming,scope:'Indexed ingress witnesses only; uncompiled native ingress is not an absence proof.'};
}
function contextRequirements(D,context,path,N,E,state){
 const status=stateTransitionRequirements([path],N,E,state),facts=D.derivation_reachability;
 if(status.incompatible.length||!facts||!Object.hasOwn(facts.structural,context))return status;
 const entry=facts.contexts[context]||0,required=pathMask(path,N,E),allowed=entry&required&stateMask(state);
 status.entry_evidence=Object.keys(facts.witnesses[context]||{}).length?facts.witnesses[context]:facts.structuralWitnesses[context];
 status.query_complete=false; 
 const label=bits=>statePairs.filter((_,i)=>bits&(1<<i)).map(p=>`Mode${p.mode}/${p.charge?'MAX':'非MAX'}`).join(' 或 ')||'已记录入口链均含矛盾';
 if(!allowed){status.class='same_stage_conflict';status.incompatible.push({field:'Mode/Charge',epoch:'indexed_ingress',before:label(entry),required:label(required),reason:'全部已记录入口见证与此后续或当前条件互斥；不代表未搜索入口不存在',entry_evidence:status.entry_evidence});}
 return status;
}
function continuationSeed(F,context,entry={}){
 const facts=Flow.boundaryFacts({state:entry.state||entry,domains:entry.domains||{}});
 return F.seed(context.node,{...scope,...facts.state},{stack:context.stack,stateRow:context.stateRow,epoch:1,actionBoundaries:1,domains:facts.domains,constraints:facts.constraints});
}
const statePairs=[{mode:0,charge:false},{mode:0,charge:true},{mode:1,charge:false},{mode:1,charge:true}];
function stateMask(state){return statePairs.reduce((mask,pair,i)=>mask|((state.mode===undefined||state.mode===pair.mode)&&(state.charge===undefined||state.charge===pair.charge)?1<<i:0),0);}
function maskEdges(path,N,E){
 return path.filter(([id])=>{const e=E[id],a=A.unwrap(N[e?.source]?.arg||{});return e?.type==='interruption_unknown'||e?.type.startsWith('predicate_')&&['op17','op10'].includes(a.type);});
}
// pathMask 按路径顺序折叠，可先对公共前缀求四种 Mode/Charge 组合的中间状态，再分别接上不同尾段。
function maskStart(path,N,E){
 const relevant=maskEdges(path,N,E);
 return {any:relevant.length>0,runs:statePairs.map(pair=>replayStep(replayStart({...scope,...pair}),relevant,N,E))};
}
function maskFinish(m,tail,N,E){
 const relevant=maskEdges(tail,N,E);
 if(!m.any&&!relevant.length)return 15;
 return statePairs.reduce((mask,pair,i)=>mask|(replayResult(relevant.length?replayStep(replayFork(m.runs[i]),relevant,N,E):m.runs[i]).ok?1<<i:0),0);
}
function pathMask(path,N,E){return maskFinish(maskStart(path,N,E),[],N,E);}
// maskFinish 的共享版本：掩码只看 ok，与 witness 无关；尾段从重置后的签名出发，结果可按 (签名, 尾段) 复用。
function maskEntries(m){return {any:m.any,pairs:m.runs.map(tailEntry)};}
// tailKey 标识尾段（含时间偏移）；memo 按 (前缀重置后签名, 尾段) 复用。
function maskJoin(me,relevant,tailKey,N,E,memo){
 if(!me.any&&!relevant.length)return 15;
 return me.pairs.reduce((mask,t,i)=>{
  if(t.failed)return mask;if(!relevant.length)return mask|(1<<i);
  const k=t.sig+'|'+tailKey;let ok=memo.get(k);if(ok===undefined){ok=!tailDelta(t,relevant,N,E).conflict;memo.set(k,ok);}
  return ok?mask|(1<<i):mask;
 },0);
}
// 等价于 inheritedRequirements([path]) 未冲突时再接 contextRequirements(path)；两者对同一路径的重放与掩码只算一次。
function chainRequirements(D,context,run,mask,state,entryMask){
 const status=requirementsFromRuns([run]);
 if(status.incompatible.length)return status;
 if(entryMask){
  if(!(entryMask&stateMask(state)&mask)){status.class='same_stage_conflict';status.incompatible.push({field:'Mode/Charge',before:`Mode ${state.mode??'?'} / Charge ${state.charge??'?'}`,required:statePairs.filter((_,i)=>entryMask&(1<<i)).map(p=>`Mode ${p.mode} / ${p.charge?'MAX':'非MAX'}`).join(' 或 '),reason:'所选入口继承的两字段约束与当前条件后续互斥',epoch:'inherited'});return status;}
 }
 const facts=D.derivation_reachability;
 if(!facts||!Object.hasOwn(facts.structural,context))return status;
 const entry=facts.contexts[context]||0,allowed=entry&mask&stateMask(state);
 status.entry_evidence=Object.keys(facts.witnesses[context]||{}).length?facts.witnesses[context]:facts.structuralWitnesses[context];
 status.query_complete=false;
 const label=bits=>statePairs.filter((_,i)=>bits&(1<<i)).map(p=>`Mode${p.mode}/${p.charge?'MAX':'非MAX'}`).join(' 或 ')||'已记录入口链均含矛盾';
 if(!allowed){status.class='same_stage_conflict';status.incompatible.push({field:'Mode/Charge',epoch:'indexed_ingress',before:label(entry),required:label(mask),reason:'全部已记录入口见证与此后续或当前条件互斥；不代表未搜索入口不存在',entry_evidence:status.entry_evidence});}
 return status;
}
function compiledInheritance(D,getPath){
 
 
 
 const N=D.graph.nodes,E=Object.fromEntries(D.graph.edges.map(e=>[e.id,e])),masks={},contexts={},cache=new Map();
 for(const r of Object.values(D.routes)){if(!cache.has(r.path))cache.set(r.path,pathMask(getPath(r.path),N,E));masks[r.id]=cache.get(r.path);if(r.kind==='first'&&r.context)contexts[r.context]=(contexts[r.context]||0)|masks[r.id];}
 let changed=true;while(changed){changed=false;for(const r of Object.values(D.routes))if(r.kind==='continuation'&&r.context){
  const next=(contexts[r.context]||0)|((contexts[r.source_context]||0)&masks[r.id]);
  if(next!==(contexts[r.context]||0)){contexts[r.context]=next;changed=true;}
 }}
 return {pairs:statePairs,contexts,paths:Object.fromEntries(cache),semantics:'Union of Mode/Charge conditions over retained witnesses only; zero is not an absence proof.'};
}
function inheritedRequirements(paths,N,E,state,entryMask=15){
 const status=stateTransitionRequirements(paths,N,E,state);if(status.incompatible.length||!entryMask)return status;
 let allowed=entryMask&stateMask(state);for(const p of paths)allowed&=pathMask(p,N,E);
 if(!allowed){status.class='same_stage_conflict';status.incompatible.push({field:'Mode/Charge',before:`Mode ${state.mode??'?'} / Charge ${state.charge??'?'}`,required:statePairs.filter((_,i)=>entryMask&(1<<i)).map(p=>`Mode ${p.mode} / ${p.charge?'MAX':'非MAX'}`).join(' 或 '),reason:'所选入口继承的两字段约束与当前条件后续互斥',epoch:'inherited'});}
 return status;
}
const api={scope,create,signature,condition,groundValue,matches,replay,replayStart,replayStep,replayFork,replayResult,continuationSeed,stateTransitionRequirements,stateMask,pathMask,maskStart,maskFinish,maskEdges,maskEntries,maskJoin,tailEntry,tailDelta,joinDelta,chainRequirements,compiledInheritance,inheritedRequirements,deriveReachability,contextRequirements};
host.DecisionSemantic=api;
})(typeof window!=='undefined'?window:globalThis);
