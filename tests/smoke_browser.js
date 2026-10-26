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
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},12000);
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
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(err,data)=>{
      if(err){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',file.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');res.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.PUBLIC_SITE_URL||`http://127.0.0.1:${server.address().port}/`;
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
  await rpc('Page.navigate',{url});
  await until(`document.querySelector('#notice')?.textContent.includes('当前仅为界面样例')`);

  assert.equal(await evaluate(`document.querySelectorAll('#actions article').length`),2);
  assert.equal(await evaluate(`document.querySelectorAll('#relations .relation').length`),0);
  assert.equal(await evaluate(`document.querySelector('video')===null`),true,'no video should load before a click');
  assert.equal(await evaluate(`document.body.textContent.includes('三连鞭（快速大砸收尾）')`),true);
  assert.equal(await evaluate(`document.body.textContent.includes('护龙飞天俯冲连段终结（仅四叉地火）')`),true);

  await evaluate(`document.querySelector('#search').value='GuardianRushOnlyFinish';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelectorAll('#actions article').length`),1,'search filters actions');
  assert.equal(await evaluate(`document.querySelector('#actions article').dataset.actionCode`),'cGuardianRushOnlyFinish');

  await evaluate(`document.querySelector('#search').value='三连鞭';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelectorAll('#actions article').length`),1,'Chinese search filters actions');
  assert.equal(await evaluate(`document.querySelector('#actions article').dataset.actionCode`),'cRampageBarrage');
  await evaluate(`dataset.relations=[{from:'cRampageBarrage',to:'cGuardianRushOnlyFinish',condition:'TEST ONLY',evidence:'TEST ONLY'}];render()`);
  assert.equal(await evaluate(`document.querySelectorAll('#relations .relation').length`),1,'temporary fixture renders a relation');
  assert.equal(await evaluate(`document.querySelectorAll('#actions article .relation').length`),1,'temporary fixture renders an outgoing action');
  await evaluate(`dataset.relations=[];render()`);

  await evaluate(`document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));dataset.actions[0].video='./media/videos/smoke.mp4';render();document.querySelector('#actions article button').click()`);
  await until(`Boolean(document.querySelector('video source')?.src.endsWith('/media/videos/smoke.mp4'))`);
  console.log('PASS: public labels, Chinese/code search, empty derivation state, relation fixture, and click-to-load video UI');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket){socket.close();}
  if(proc)proc.kill();
  if(server)server.close();
  await delay(200);
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
});
