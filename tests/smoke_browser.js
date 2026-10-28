/* Dependency-free Chromium smoke test (Node 22+). Includes a local HTTP server. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const http=require('node:http');

const browser=process.env.PUBLIC_SITE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'king-public-site-'));
const pending=new Map();let proc,socket,server,seq=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function rpc(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},60000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression){
  for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}
  throw Error('Timed out waiting for '+expression);
}

(async()=>{
  const root=path.resolve(__dirname,'..');
  server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const testVideo=pathname==='/__test-media/1.mp4'?process.env.PUBLIC_SITE_TEST_VIDEO_1:
      pathname==='/__test-media/2.mp4'?process.env.PUBLIC_SITE_TEST_VIDEO_2:null;
    if(testVideo){
      fs.readFile(testVideo,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':data.length});res.end(data);});return;
    }
    if(pathname==='/__reference.html'&&process.env.PUBLIC_SITE_LITE){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(process.env.PUBLIC_SITE_LITE));return;}
    if(pathname==='/__audited.html'&&process.env.PUBLIC_SITE_AUDITED_LITE){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(process.env.PUBLIC_SITE_AUDITED_LITE));return;}
    const local=pathname.replace(/^\/project(?=\/)/,'');
    const file=path.resolve(root,'.'+(local==='/'?'/index.html':local));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(err,data)=>{
      if(err){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',({'.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.gz':'application/gzip'}[path.extname(file)]||'text/html; charset=utf-8'));res.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.PUBLIC_SITE_URL||`http://127.0.0.1:${server.address().port}/project/`;
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',...(process.env.PUBLIC_SITE_BROWSER_NO_SANDBOX?['--no-sandbox']:[]),'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  proc.on('error',error=>console.error(error));
  const activePort=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<150&&!fs.existsSync(activePort);i++)await delay(100);
  assert(fs.existsSync(activePort),'Chromium debugging endpoint missing');
  const port=fs.readFileSync(activePort,'utf8').split(/\r?\n/)[0];
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=targets.find(target=>target.type==='page');assert(page,'Chromium page target missing');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id&&pending.has(message.id)){
        const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);
        message.error?item.reject(message.error):item.resolve(message.result);
      }
  });
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await rpc('Runtime.enable');await rpc('Page.enable');await rpc('Network.enable');
  await rpc('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__KING_TEST__=true'});
  const started=Date.now();
  await rpc('Page.navigate',{url});


  const errors=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  await until(`Boolean(window.KingTree)`);
  const loadMs=Date.now()-started,report={loadMs,presets:{},screenshots:[],deep:[]};
  const output=process.env.PUBLIC_SITE_ARTIFACTS;
  if(output)fs.mkdirSync(output,{recursive:true});
  async function screenshot(name){if(!output)return;const shot=await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));report.screenshots.push(name+'.png');}
  const oracle=process.env.PUBLIC_SITE_ORACLE?require(path.resolve(process.env.PUBLIC_SITE_ORACLE)):null;
  async function checkChildren(bundle){
    if(!oracle)return;
    const snapshot=await evaluate(`(async()=>{const K=KingTree,g=K.bundles.get('${bundle}'),result=await K.collectContinuation(g.records),routes={};for(const record of [...g.records,...result.groups.flatMap(q=>q.records)])for(const id of record.chain){const r=K.data.routes[id];routes[id]={...r,trace:K.path(r.path),cursor:K.data.contexts[r.context]};}return {state:K.getState(),records:g.records,children:result.groups,routes};})()`);
    report.oracle??=[];report.oracle.push(oracle(snapshot));
  }
  await rpc('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`Object.keys(KingTree.data.actions).length`),59);
  assert.equal(await evaluate(`KingTree.data.model.timers.length`),28);
  for(const preset of ['m0off','m0max','m1off','m1high','m1low','all']){
    await evaluate(`document.querySelector('[data-preset="${preset}"]').click()`);
    const observed=await evaluate(`({pools:[...KingTree.visiblePools().values()].flatMap(p=>[...p.keys()]),priority:KingTree.data.priority_groups.map(g=>[...new Set(KingTree.firstRecords(g.routes).map(x=>KingTree.data.graph.requests[KingTree.data.routes[x.rid].site].actionId))]),weights:[...KingTree.visiblePools().values()].flatMap(p=>[...p.keys()].map(id=>KingTree.data.pools[id].total_weight))})`);
    observed.entries=await evaluate(`Object.fromEntries(Object.entries(KingTree.data.pools).map(([id,p])=>[id,p.entries.map(e=>({index:e.index,weight:e.raw_weight,actions:[...new Set(KingTree.firstRecords(e.routes).map(x=>KingTree.data.graph.requests[KingTree.data.routes[x.rid].site].actionId))].sort()}))]))`);
    assert(observed.weights.every(w=>w===100));report.presets[preset]=observed;
    assert.equal(await evaluate(`document.querySelectorAll('.selector').length>0`),true);
  }
  await evaluate(`document.querySelector('[data-preset="m1off"]').click();document.querySelector('.distance').open=true`);
  await until(`document.querySelectorAll('.entry').length>0`);
  await screenshot('public_overview');
  await evaluate(`document.querySelector('#search').value='Whip';KingTree.search()`);
  assert.equal(await evaluate(`document.querySelectorAll('#results .result').length>0`),true,'English search');
  await evaluate(`document.querySelector('#search').value='升龙';KingTree.search()`);
  assert.equal(await evaluate(`document.querySelectorAll('#results .result').length>0`),true,'Chinese search');
  await evaluate(`document.querySelector('#search').value='';KingTree.search();document.querySelector('#timers').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.timer-row').length`),28);
  await evaluate(`document.querySelector('#close').click()`);
  // 使用一个真实权重入口定位侧移，截图与 Lite 的首个入口对齐。
  await evaluate(`document.querySelector('[data-preset="all"]').click();(()=>{const K=KingTree,a=Object.values(K.data.actions).find(a=>K.media.get(a.id).code==='cSideWalkQuickRight'),r=K.data.routes[K.firstRecords(a.first_routes)[0].rid];const records=K.firstRecords(a.first_routes).filter(x=>{const q=K.data.routes[x.rid];return q.pool===r.pool&&q.entry===r.entry&&q.section===r.section;});K.openLocal({id:a.id,records});})()`);
  await until(`!document.querySelector('#tree .loading')`);
  await checkChildren(await evaluate(`document.querySelector('#tree > .action').dataset.bundle`));
  await evaluate(`document.querySelector('#tree').scrollIntoView({block:'start'})`);
  await screenshot('public_sidestep_selected_entry');
  // 从真实选招池定位侧移，再沿页面中的动作卡连续展开五个动作。
  await evaluate(`document.querySelector('[data-preset="all"]').click();document.querySelector('#search').value='cSideWalkQuickLeft';KingTree.search()`);
  const side=await evaluate(`Object.values(KingTree.data.actions).filter(a=>a.name.includes('快速侧移')).map(a=>a.id)`);
  assert.equal(side.length,2);
  for(const actionId of side){
    const started=Date.now();
    await evaluate(`(()=>{const D=KingTree.data,a=D.actions['${actionId}'],groups=KingTree.groupRecords(KingTree.firstRecords(a.first_routes));KingTree.openLocal(groups[0]);})()`);
    await until(`!document.querySelector('#tree .loading')`);
    const childCodes=await evaluate(`(()=>{const root=document.querySelector('#tree > .action'),resume=root.querySelector(':scope > .children > .resume');return [...resume.querySelectorAll(':scope > .children > .action')].map(n=>n.querySelector(':scope > summary .subtitle').textContent);})()`);
    assert(childCodes.some(c=>c.includes('HeadAttack')),'side-step -> bite retained: '+childCodes);
    assert(childCodes.some(c=>c.includes('NewBladeSlam')),'side-step -> catch retained: '+childCodes);
    report.deep.push({actionId,childCodes,expandMs:Date.now()-started});
    await checkChildren(await evaluate(`document.querySelector('#tree > .action').dataset.bundle`));
    await evaluate(`document.querySelector('#tree').scrollIntoView({block:'start'})`);
    await screenshot('public_'+actionId+'_sidestep');
  }
  let current=await evaluate(`document.querySelector('#tree > .action').dataset.bundle`);
  for(let depth=1;depth<=5;depth++){
    const detail=await evaluate(`(()=>{const n=document.querySelector('[data-bundle="${current}"]');n.open=true;return n.querySelector(':scope > summary .subtitle').textContent;})()`);
    await until(`!document.querySelector('[data-bundle="${current}"] .loading')`);
    report.deep.push({depth,code:detail});
    await checkChildren(current);
    if(depth<5){
      const visible=await evaluate(`(()=>{const n=document.querySelector('[data-bundle="${current}"]'),r=n.querySelector(':scope > .children > .resume');return [...r.querySelectorAll(':scope > .children > .action')].map(x=>x.dataset.action);})()`);
      const queried=await evaluate(`(async()=>{const K=KingTree,r=await K.collectContinuation(K.bundles.get('${current}').records);return r.groups.map(g=>g.id);})()`);
      assert.deepEqual(visible,queried,'visible action cards must retain all compatible results at depth '+depth);
    }
    assert.equal(await evaluate(`document.querySelectorAll('.variant,.action-group').length`),0,'no behavioral interaction layer');
    if(depth===5)break;
    const next=await evaluate(`(()=>{const n=document.querySelector('[data-bundle="${current}"]'),r=n.querySelector(':scope > .children > .resume');const choices=[...r.querySelectorAll(':scope > .children > .action')];const q=choices.find(x=>/HeadAttack|NewBladeSlam/.test(x.querySelector('.subtitle').textContent))||choices[0];return q?.dataset.bundle;})()`);
    assert(next,'continuous successor at depth '+depth);current=next;
  }
  await evaluate(`document.querySelector('[data-bundle="${current}"]').scrollIntoView({block:'center'})`);
  await screenshot('public_five_actions');
  await evaluate(`document.querySelector('[data-bundle="${current}"] .children button').click()`);
  await until(`!document.querySelector('#tree .loading')`);
  assert.equal(await evaluate(`KingTree.getView().type`),'local');
  await evaluate(`document.querySelector('#back').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.variant').length`),0);
  assert.equal(await evaluate(`/0x[0-9a-f]+|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(document.body.textContent)`),false);
  assert.equal(await evaluate(`/行为见证|预编译|路径见证|父上下文|调用现场|C2|PC认证|生命周期|实录|保存行|搜索预算|完整路径/.test(document.body.textContent)`),false);
  await rpc('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`window.scrollTo(0,0)`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'mobile viewport overflow');
  await screenshot('public_mobile');
  // 媒体预览使用页面共享播放器：按钮只在有 video 时出现，点击不展开卡片，点击后才挂载唯一 video。
  await evaluate(`(()=>{
    const ids=Object.keys(KingTree.data.actions).slice(0,2);
    ids.forEach((id,i)=>KingTree.media.get(id).video='/__test-media/'+(i+1)+'.mp4');
    const host=document.createElement('div');host.id='test-media';document.body.append(host);
    ids.forEach(id=>{const a=KingTree.data.actions[id],g=KingTree.groupRecords(KingTree.firstRecords(a.first_routes))[0];KingTree.renderAction(host,g,1,'test/'+id);});
  })()`);
  assert.equal(await evaluate(`document.querySelectorAll('#test-media .preview-button').length`),2,'preview button only for actions with video');
  assert.equal(await evaluate(`document.querySelector('#test-media video')===null`),true,'no video before preview');
  assert.equal(await evaluate(`Boolean(document.querySelector('#test-media .preview-button'))`),true,'preview button exists');
  const firstOpen=await evaluate(`document.querySelector('#test-media .action').open`);
  await evaluate(`document.querySelector('#test-media .preview-button').click()`);
  assert.equal(await evaluate(`document.querySelector('#test-media .action').open`),firstOpen,'preview does not toggle card');
  assert.equal(await evaluate(`document.querySelectorAll('#action-player video').length`),1,'video appears after preview');
  assert.equal(await evaluate(`document.querySelector('#action-player video').getAttribute('src')`),'/__test-media/1.mp4');
  if(process.env.PUBLIC_SITE_TEST_VIDEO_1)await until(`document.querySelector('#action-player video').readyState>=1`);
  await evaluate(`document.querySelectorAll('#test-media .preview-button')[1].click()`);
  assert.equal(await evaluate(`document.querySelectorAll('#action-player video').length`),1,'one shared player');
  assert.equal(await evaluate(`document.querySelector('#action-player video').getAttribute('src')`),'/__test-media/2.mp4');
  if(process.env.PUBLIC_SITE_TEST_VIDEO_2)await until(`document.querySelector('#action-player video').readyState>=1`);
  // 变体按已应用的全局 Mode 选片；播放器内可手动切换。
  const savedMode=await evaluate(`document.getElementById('mode').value`);
  await evaluate(`(()=>{const id=Object.keys(KingTree.data.actions)[0],m=KingTree.media.get(id);
    m.variants=[{label:'Mode 0',when:{mode:0},video:'/__test-media/1.mp4'},{label:'Mode 1',when:{mode:1},video:'/__test-media/2.mp4',note:'test note'}];
    document.getElementById('mode').value='1';KingTree.apply();KingTree.openActionPlayer(id);})()`);
  assert.equal(await evaluate(`document.querySelector('#action-player video').getAttribute('src')`),'/__test-media/2.mp4','variant follows Mode 1');
  assert.equal(await evaluate(`document.querySelectorAll('#action-player .action-player-variants button').length`),2,'variant buttons');
  assert.equal(await evaluate(`document.querySelector('#action-player .action-player-note').hidden`),false,'variant note shown');
  await evaluate(`document.querySelector('#action-player .action-player-variants button[data-variant="0"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#action-player video').getAttribute('src')`),'/__test-media/1.mp4','manual variant switch');
  await evaluate(`(()=>{const id=Object.keys(KingTree.data.actions)[0];document.getElementById('mode').value='0';KingTree.apply();KingTree.openActionPlayer(id);})()`);
  assert.equal(await evaluate(`document.querySelector('#action-player video').getAttribute('src')`),'/__test-media/1.mp4','variant follows Mode 0');
  assert.equal(await evaluate(`document.querySelector('#action-player .action-player-note').hidden`),true,'note hidden without note');
  await evaluate(`(()=>{const id=Object.keys(KingTree.data.actions)[0];delete KingTree.media.get(id).variants;document.getElementById('mode').value=${JSON.stringify(savedMode)};KingTree.apply();})()`);
  await evaluate(`document.querySelector('#test-media').remove();KingTree.closeActionPlayer()`);
  assert.deepEqual(errors,[],'uncaught browser errors');
  if(process.env.PUBLIC_SITE_LITE){
    await rpc('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await rpc('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/__reference.html`});
    await until(`Boolean(window.KingOverview)`);
    report.lite={};
    const mappings=process.env.PUBLIC_SITE_MAP?JSON.parse(fs.readFileSync(process.env.PUBLIC_SITE_MAP,'utf8')).map:null;
    const entriesExpression=`(()=>{const K=KingOverview,D=K.data,N=D.graph.nodes,E=Object.fromEntries(D.graph.edges.map(e=>[e.id,e])),s=K.getState();const ok=id=>K.match(id).ok&&K.path(id).every(([eid])=>{const e=E[eid],n=N[e?.source],a=n?.arg;if(!e?.type.startsWith('predicate_'))return true;const relevant=['cCheckModeArg','cCheckElementChargeMax','cCheckDistanceArg'].includes(a?.type)||a?.type==='cCheckStatusArg'&&['Health','Status'].includes(a.selected);if(!relevant)return true;const v=K.engine.evaluate(a,s,n.table+':'+n.address);return v===null||v===(e.type==='predicate_true');});return Object.fromEntries(Object.entries(D.pools).map(([id,p])=>[id,p.entries.map(e=>({index:e.index,weight:e.raw_weight,actions:[...new Set(e.routes.filter(id=>ok(D.routes[id].path)).map(id=>D.graph.requests[D.routes[id].site].action_guid))]}))]));})()`;
    const mapEntries=entries=>Object.fromEntries(Object.entries(entries).map(([id,rows])=>[mappings[id],rows.map(e=>({...e,actions:e.actions.map(x=>mappings[x]).sort()}))]));
    for(const preset of ['m0off','m0max','m1off','m1high','m1low','all']){
      await evaluate(`document.querySelector('[data-preset="${preset}"]').click();document.querySelector('.priority').open=true`);
      await delay(30);
      await evaluate(`document.querySelectorAll('.priority .guards').forEach(g=>g.open=true)`);
      await delay(30);
      const observed=await evaluate(`(()=>{const K=KingOverview,D=K.data,state=K.getState(),N=D.graph.nodes,E=Object.fromEntries(D.graph.edges.map(e=>[e.id,e]));const ok=id=>{if(!K.match(id).ok)return false;for(const [eid] of K.path(id)){const e=E[eid],n=N[e?.source],a=n?.arg;if(!e?.type.startsWith('predicate_'))continue;const relevant=['cCheckModeArg','cCheckElementChargeMax','cCheckDistanceArg'].includes(a?.type)||a?.type==='cCheckStatusArg'&&['Health','Status'].includes(a.selected);if(!relevant)continue;const value=K.engine.evaluate(a,state,n.table+':'+n.address);if(value!==null&&value!==(e.type==='predicate_true'))return false;}return true;};return {pools:[...new Set(D.initial.filter(r=>ok(r.path)).map(r=>r.pool))],priority:[...document.querySelectorAll('.priority .guards')].map(g=>[...new Set([...g.querySelectorAll('.action')].map(n=>n.dataset.action))])};})()`);
      report.lite[preset]=observed;
      const liteEntries=await evaluate(entriesExpression);
      if(mappings){const mapped=mapEntries(liteEntries);report.olderLiteDifferences??=[];for(const [pool,entries] of Object.entries(mapped))for(const e of entries){const actual=report.presets[preset].entries[pool].find(a=>a.index===e.index);if(JSON.stringify(actual)!==JSON.stringify(e))report.olderLiteDifferences.push({preset,pool,index:e.index,visible:report.presets[preset].pools.includes(pool),older:e.actions,current:actual.actions});}}
      if(mappings){assert.deepEqual([...new Set(report.presets[preset].pools)].sort(),observed.pools.map(x=>mappings[x]).sort(),preset+' Lite pools');const actual=report.presets[preset].priority.filter(g=>g.length);assert.deepEqual(actual,observed.priority.map(g=>g.map(x=>mappings[x])),preset+' priority order');}
    }
    await evaluate(`document.querySelector('[data-preset="m1off"]').click();document.querySelector('.distance').open=true;window.scrollTo(0,0)`);
    await delay(200);await screenshot('lite_overview');
    await evaluate(`document.querySelector('[data-preset="all"]').click();(()=>{const K=KingOverview,D=K.data,a=Object.values(D.actions).find(a=>a.name==='cSideWalkQuickRight');const rid=a.first_routes.find(id=>K.match(D.routes[id].path).ok);K.locate(rid);})()`);
    await delay(300);
    await screenshot('lite_sidestep');
    await evaluate(`(()=>{const a=document.querySelector('.action.focused');a?.querySelector(':scope > .children > .resume')?.setAttribute('open','');})()`);
    await delay(1000);
    await evaluate(`document.querySelector('.action.focused > .children > .resume')?.scrollIntoView({block:'start'})`);
    await screenshot('lite_sidestep_followups');
    if(process.env.PUBLIC_SITE_AUDITED_LITE&&mappings){
      await rpc('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/__audited.html`});await until(`Boolean(window.KingOverview)`);
      report.auditedEntryParity=[];
      for(const preset of ['m0off','m0max','m1off','m1high','m1low','all']){
        await evaluate(`document.querySelector('[data-preset="${preset}"]').click()`);
        const mapped=mapEntries(await evaluate(entriesExpression));
        assert.deepEqual(report.presets[preset].entries,mapped,preset+' all entry weights/action groups must match current audited Lite');report.auditedEntryParity.push(preset);
      }
    }
  }
  if(output)fs.writeFileSync(path.join(output,'browser_result.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS: Lite-style hierarchy, priority/pool comparison, Chinese/English search, timer names, five actions, both sidesteps -> HeadAttack/NewBladeSlam, local/back, no research UI, nested URL, mobile, lazy media; load '+loadMs+' ms');

})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket){socket.close();}
  if(proc)proc.kill();
  if(server)server.close();
  await delay(200);
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
});
