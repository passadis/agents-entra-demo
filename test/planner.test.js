import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner } from '../src/planner.js';
import { Governance, cases } from '../src/governance.js';
import { IdentityProvider } from '../src/identity.js';
const env = { PLANNER_MODE: 'azure-openai', AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com', AZURE_OPENAI_DEPLOYMENT: 'test-deployment', MANAGED_IDENTITY_CLIENT_ID: 'test-mi', IDENTITY_ENDPOINT: 'http://localhost/identity', IDENTITY_HEADER: 'header' };
const plannerWith = tool => createPlanner(env, async url => ({ ok: true, json: async () => String(url).startsWith('http://localhost') ? { access_token: 'test-managed-token' } : { choices: [{ message: { tool_calls: [{ type: 'function', function: tool }] } }] } }));
test('model proposal keeps the exact business request and carries no authorization', async () => {
  const planner = plannerWith({ name: 'create_purchase_order', arguments: JSON.stringify({ amount: 420, region: 'EU', item: 'Safety seals' }) });
  const proposal = await planner.propose(cases[0]); assert.deepEqual(proposal, { action: 'Orders.Create', amount: 420, region: 'EU', item: 'Safety seals' });
});
test('model cannot lower an amount to bypass sponsor approval', async () => {
  const planner = plannerWith({ name: 'create_purchase_order', arguments: JSON.stringify({ amount: 420, region: 'EU', item: 'Engine sensor' }) });
  await assert.rejects(planner.propose(cases[1]), /changed the authorized/);
});
test('malicious model tool call is denied by the same policy boundary', async () => {
  const planner = plannerWith({ name: 'export_vendor_bank_details', arguments: '{}' });
  const g = new Governance(new IdentityProvider(), { planner }); const r = await g.run('piraeus', 'exfiltration', 'operator');
  assert.equal(r.status, 'denied'); assert.equal(g.state.orders.length, 0);
});
test('planner service failure fails closed without a token or order', async () => {
  const g = new Governance(new IdentityProvider(), { planner: { mode: 'test', propose: async () => { throw new Error('Model unavailable'); } } });
  const r = await g.run('piraeus', 'routine', 'operator'); assert.equal(r.status, 'denied'); assert.equal(g.state.orders.length, 0); assert.match(r.trace[0], /failed closed/);
});
