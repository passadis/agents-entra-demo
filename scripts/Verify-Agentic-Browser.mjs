import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const browserPath=[process.env.BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
if(!browserPath)throw new Error('Set BROWSER_PATH to a Chromium browser executable');
const python=process.env.PYTHON_PATH||resolve('.venv/Scripts/python.exe');
const temp=mkdtempSync(join(tmpdir(),'aegean-agentic-browser-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const port=await freePort(),debugPort=await freePort();
const server=spawn(python,['-m','uvicorn','test_agentic.browser_server:app','--host','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,AGENTIC_BROWSER_DATA_FILE:join(temp,'state.sqlite')},stdio:'ignore'});
let browser,socket;
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`,{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}await sleep(100);}if(!ready)throw new Error('Python test server did not start');
  browser=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${join(temp,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let pages;for(let i=0;i<100;i++){try{pages=await(await fetch(`http://127.0.0.1:${debugPort}/json`,{signal:AbortSignal.timeout(500)})).json();if(pages.some(p=>p.type==='page'))break;}catch{}await sleep(100);}
  const page=pages?.find(p=>p.type==='page');if(!page)throw new Error('Browser did not start');
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let sequence=0;const pending=new Map(),errors=[];
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(m.error.message)):p?.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const until=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});await until(`document.querySelectorAll('[data-case]').length===5`);
  for(const [agent,count]of [['piraeus',1],['newark',2]]){
    await evaluate(`document.getElementById('agent-select').value='${agent}';document.querySelector('[data-case="routine"]').click()`);
    await until(`document.getElementById('run-status').textContent==='Completed'&&document.querySelectorAll('.order').length===${count}`);
  }
  await evaluate(`document.querySelector('[data-case="approval"]').click()`);await until(`document.querySelector('[data-approve]')!==null`);
  assert.equal(await evaluate(`document.querySelectorAll('.order').length`),2);
  await evaluate(`document.querySelector('[data-approve]').click()`);await until(`document.getElementById('run-status').textContent==='Completed'&&document.querySelectorAll('.order').length===3`);
  await evaluate(`document.querySelector('[data-case="cross-region"]').click()`);await until(`document.getElementById('run-status').textContent==='Blocked'`);
  await evaluate(`document.querySelector('[data-mission="reserve"]').click()`);
  await until(`document.querySelector('#mission-detail .mission-summary>.badge')?.textContent==='Completed'&&document.querySelectorAll('.order').length===5`);
  assert.equal(await evaluate(`document.querySelectorAll('.mission-agent').length`),2);
  assert.equal(await evaluate(`document.getElementById('mission-detail').textContent.includes('160.00')`),true);
  await evaluate(`document.querySelector('[data-mission="sensors"]').click()`);
  await until(`document.querySelectorAll('.mission-agent .approval-note').length===2`);
  await evaluate(`document.querySelector('.mission-agent [data-open-run]').click();document.querySelector('[data-approve]').click()`);
  await until(`document.querySelectorAll('.order').length===6&&document.querySelectorAll('.mission-agent .approval-note').length===1`);
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  await until(`document.querySelectorAll('.mission-agent .approval-note').length===1`);
  await evaluate(`document.querySelectorAll('.mission-agent [data-open-run]')[1].click();document.querySelector('[data-approve]').click()`);
  await until(`document.querySelector('#mission-detail .mission-summary>.badge')?.textContent==='Completed'&&document.querySelectorAll('.order').length===7`);
  assert.equal(await evaluate(`document.getElementById('mission-detail').textContent.includes('4650.00')`),true);
  for(const view of ['identities','audit','guide','overview']){await evaluate(`document.querySelector('[data-view="${view}"]').click()`);assert.equal(await evaluate(`document.getElementById('${view}').hidden`),false);}
  const artifactDir=resolve('artifacts');mkdirSync(artifactDir,{recursive:true});
  await evaluate('window.scrollTo(0,0)');await sleep(100);
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(join(artifactDir,name),Buffer.from(shot.data,'base64'));};
  await capture('agentic-desktop.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true,'Mobile layout overflows');await capture('agentic-mobile.png');
  assert.deepEqual(errors,[]);console.log('Agentic browser checks passed: individual agents, joint missions, peer reports, independent approvals, page reload with pending approval, region denial, all views, desktop/mobile layout. Model service was scripted; live inference/Entra remain deployment checks.');
}finally{
  socket?.close();browser?.kill();server.kill();await sleep(1000);
  if(dirname(resolve(temp))===resolve(tmpdir())&&basename(temp).startsWith('aegean-agentic-browser-')){try{rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.log(`Locked temporary browser profile: ${temp}`);}}
}
