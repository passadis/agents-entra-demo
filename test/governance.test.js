import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance } from '../src/governance.js';
import { IdentityProvider } from '../src/identity.js';
import { createApp } from '../src/server.js';

const demo = options => new Governance(new IdentityProvider(), options);
test('routine request creates one order attributed to the distinct agent principal', async () => {
  const g = demo(); const run = await g.run('piraeus', 'routine', 'operator');
  assert.equal(run.status, 'completed'); assert.equal(g.state.orders.length, 1);
  assert.equal(g.state.orders[0].principalId, 'sim-principal-eu');
  assert.equal(run.tokenEvidence.mode, 'simulation');
});
test('approval binds the stored proposal and cannot be replayed', async () => {
  const g = demo(); const r = await g.run('piraeus', 'approval', 'operator');
  assert.equal(r.status, 'awaiting_approval'); assert.equal(g.state.orders.length, 0);
  await assert.rejects(g.approve(r.id, 'unrelated-user'), /Only the configured agent sponsor/);
  await g.approve(r.id, 'local-demo-sponsor');
  assert.equal(r.status, 'completed'); assert.equal(g.state.orders[0].amount, 2400);
  await assert.rejects(g.approve(r.id, 'local-demo-sponsor'), /not awaiting/);
  assert.equal(g.state.orders.length, 1);
});
test('blocked scenarios never execute a tool or acquire a token', async () => {
  for (const caseId of ['over-budget', 'cross-region', 'exfiltration']) {
    const g = demo(); g.identity.acquire = () => { throw new Error('Must not be called'); };
    const run = await g.run('piraeus', caseId, 'operator');
    assert.equal(run.status, 'denied'); assert.equal(g.state.orders.length, 0);
    assert.equal(run.tokenEvidence, undefined);
  }
});
test('direct grants differ between siblings under the same blueprint', async () => {
  const g = demo(); const run = await g.run('newark', 'cross-region', 'operator');
  assert.equal(run.status, 'denied');
  assert.equal(run.checks.find(c => c.name === 'Regional scope').passed, true);
  assert.equal(run.checks.find(c => c.name === 'Tool allowlist').passed, false);
});
test('blueprint suspension, identity suspension, and expired review each deny', async () => {
  for (const [target, action] of [['blueprint', 'toggle'], ['piraeus', 'toggle'], ['piraeus', 'expire']]) {
    const g = demo(); g.control(target, action, 'operator');
    assert.equal((await g.run('piraeus', 'routine', 'operator')).status, 'denied');
  }
});
test('pending approvals recheck changed governance before any side effect', async () => {
  const g = demo(); const run = await g.run('piraeus', 'approval', 'operator');
  g.control('blueprint', 'toggle', 'operator'); await g.approve(run.id, 'local-demo-sponsor');
  assert.equal(run.status, 'denied'); assert.equal(g.state.orders.length, 0);
});
test('policy is rechecked after an asynchronous token acquisition', async () => {
  const g = demo(); const acquire = g.identity.acquire.bind(g.identity);
  g.identity.acquire = async agent => { g.control('piraeus', 'toggle', 'operator'); return acquire(agent); };
  const run = await g.run('piraeus', 'routine', 'operator');
  assert.equal(run.status, 'denied'); assert.equal(g.state.orders.length, 0);
});
test('a valid sibling token cannot be substituted at the tool boundary', async () => {
  const g = demo(); const sibling = g.agent('newark'); sibling.roles.push('Orders.Create');
  const token = await g.identity.acquire(sibling); g.identity.acquire = async () => token;
  const run = await g.run('piraeus', 'routine', 'operator');
  assert.equal(run.status, 'denied'); assert.equal(g.state.orders.length, 0);
});
test('tampered capability fails signature validation', async () => {
  const g = demo(); const token = await g.identity.acquire(g.agent('piraeus'));
  const [body, sig] = token.split('.'); const claims = JSON.parse(Buffer.from(body, 'base64url')); claims.oid = 'attacker';
  await assert.rejects(g.identity.validate(`${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${sig}`), /signature/);
});
test('state, orders, and audit survive restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aegean-'));
  try { const file = join(dir, 'state.json'); const g = demo({ file }); await g.run('piraeus', 'routine', 'operator');
    const restored = demo({ file }); assert.equal(restored.state.orders.length, 1); assert.ok(restored.state.audit.some(e => e.type === 'order.created'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('HTTP API ignores browser tool arguments and rejects cross-origin requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aegean-http-'));
  const { server } = createApp({ DATA_FILE: join(dir, 'state.json') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: 'piraeus', caseId: 'routine', amount: 999999, roles: ['Admin'] }) });
    assert.equal(res.status, 200); assert.equal((await res.json()).proposal.amount, 420);
    const csrf = await fetch(`${base}/api/control`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' }, body: JSON.stringify({ target: 'blueprint', action: 'toggle' }) });
    assert.equal(csrf.status, 403);
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
});
test('hosted app refuses missing workforce security configuration', () => {
  assert.throws(() => createApp({ WEBSITE_HOSTNAME: 'demo.azurewebsites.net', DATA_FILE: '' }), /requires Entra tenant/);
});
