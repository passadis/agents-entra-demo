import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

const browserPath = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => p && existsSync(p));
if (!browserPath) throw new Error('Set BROWSER_PATH to a Chromium-family browser executable');
const temp = mkdtempSync(join(tmpdir(), 'aegean-browser-'));
const { server } = createApp({ DATA_FILE: join(temp, 'state.json') });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const portProbe = createServer(); await new Promise(r => portProbe.listen(0, '127.0.0.1', r));
const debugPort = portProbe.address().port; await new Promise(r => portProbe.close(r));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(temp, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let pages;
  for (let i = 0; i < 100; i++) { try { pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (pages.some(p => p.type === 'page')) break; } catch {} await sleep(100); }
  const page = pages?.find(p => p.type === 'page'); if (!page) throw new Error('Browser debugging endpoint did not become ready');
  socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
  let seq = 0; const pending = new Map(); const errors = [];
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(new Error(m.error.message)) : p?.resolve(m.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); } throw new Error(`UI condition timed out: ${expression}`); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await until(`document.querySelectorAll('[data-case]').length===5`);
  await evaluate(`document.querySelector('[data-case="routine"]').click()`);
  await until(`document.getElementById('run-status').textContent==='Completed'`);
  assert.equal(await evaluate(`document.querySelectorAll('.order').length`), 1);
  await evaluate(`document.querySelector('[data-case="approval"]').click()`);
  await until(`document.querySelector('[data-approve]')!==null`);
  await evaluate(`document.querySelector('[data-approve]').click()`);
  await until(`document.getElementById('run-status').textContent==='Completed' && document.querySelectorAll('.order').length===2`);
  for (const id of ['over-budget', 'cross-region', 'exfiltration']) {
    await evaluate(`document.querySelector('[data-case="${id}"]').click()`);
    await until(`!document.body.classList.contains('busy') && document.querySelector('[data-case="${id}"]').classList.contains('selected') && document.getElementById('run-status').textContent==='Blocked'`);
  }
  assert.equal(await evaluate(`document.querySelectorAll('.order').length`), 2);
  await evaluate(`document.querySelector('[data-control="blueprint"]').click()`);
  await until(`!document.body.classList.contains('busy') && document.querySelector('[data-control="blueprint"]').textContent.includes('Resume')`);
  await evaluate(`document.querySelector('[data-case="routine"]').click()`);
  await until(`!document.body.classList.contains('busy') && document.querySelector('[data-case="routine"]').classList.contains('selected') && document.getElementById('run-status').textContent==='Blocked'`);
  await evaluate(`document.querySelector('[data-control="blueprint"]').click()`);
  await until(`!document.body.classList.contains('busy') && document.querySelector('[data-control="blueprint"]').textContent.includes('Pause')`);
  await evaluate(`document.querySelector('[data-case="routine"]').click()`);
  await until(`!document.body.classList.contains('busy') && document.getElementById('run-status').textContent==='Completed'`);
  const artifactDir = resolve('artifacts'); mkdirSync(artifactDir, { recursive: true });
  const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(join(artifactDir, name), Buffer.from(shot.data, 'base64')); };
  await capture('dashboard-desktop.png');
  for (const view of ['identities', 'audit', 'guide', 'overview']) {
    await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
    assert.equal(await evaluate(`document.getElementById('${view}').hidden`), false);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(100); assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true, 'Mobile layout overflows');
  await capture('dashboard-mobile.png');
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: scenario execution, sponsor approval, denials, blueprint suspension, all four views, mobile width, and no page exceptions.');
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); await new Promise(r => server.close(r)); await sleep(1000);
  // Verify the exact generated directory remains a direct child of the intended temp root.
  if (dirname(resolve(temp)) === resolve(tmpdir()) && basename(temp).startsWith('aegean-browser-')) {
    try { rmSync(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { console.log(`Browser left a locked temporary profile at ${temp}`); }
  }
}
