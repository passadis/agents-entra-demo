import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { IdentityProvider } from '../src/identity.js';
const config = { mode: 'entra', tenantId: '11111111-1111-1111-1111-111111111111', blueprintClientId: '22222222-2222-2222-2222-222222222222', toolClientId: '33333333-3333-3333-3333-333333333333', managedIdentityClientId: '44444444-4444-4444-4444-444444444444' };
test('live JWT verification accepts signed expected claims and rejects wrong audience, expiry, issuer, and signature', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }); jwk.kid = 'test-key';
  const identity = new IdentityProvider(config, async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }));
  const claims = { ver: '2.0', iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`, tid: config.tenantId, aud: config.toolClientId,
    oid: '55555555-5555-5555-5555-555555555555', azp: '55555555-5555-5555-5555-555555555555', nbf: Math.floor(Date.now() / 1000) - 1, exp: Math.floor(Date.now() / 1000) + 100, roles: ['Orders.Create'] };
  const jwt = value => { const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'); const body = Buffer.from(JSON.stringify(value)).toString('base64url'); return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')}`; };
  assert.equal((await identity.validate(jwt(claims))).oid, claims.oid);
  for (const patch of [{ aud: 'wrong' }, { exp: 1 }, { iss: 'https://attacker.invalid' }, { tid: config.toolClientId }, { exp: undefined }, { nbf: Date.now() }]) await assert.rejects(identity.validate(jwt({ ...claims, ...patch })), /rejected/);
  const token = jwt(claims); const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...claims, roles: ['Admin'] })).toString('base64url');
  await assert.rejects(identity.validate(parts.join('.')), /signature/);
});
test('live adapter uses MI assertion and correct fmi_path two-step exchange without exposing tokens', async () => {
  const saved = [process.env.IDENTITY_ENDPOINT, process.env.IDENTITY_HEADER];
  process.env.IDENTITY_ENDPOINT = 'http://localhost/identity'; process.env.IDENTITY_HEADER = 'test-header';
  const calls = [];
  const identity = new IdentityProvider(config, async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ access_token: ['managed', 'T1', 'T2'][calls.length - 1] }) };
  });
  try {
    const agent = { clientId: '55555555-5555-5555-5555-555555555555', principalId: '55555555-5555-5555-5555-555555555555' };
    assert.equal(await identity.acquire(agent), 'T2');
    assert.equal(calls[1].options.body.get('fmi_path'), agent.clientId);
    assert.equal(calls[1].options.body.get('client_assertion'), 'managed');
    assert.equal(calls[2].options.body.get('client_assertion'), 'T1');
    assert.equal(calls[2].options.body.get('scope'), `api://${config.toolClientId}/.default`);
    assert.equal(calls[2].options.body.get('client_id'), agent.clientId);
  } finally { ['IDENTITY_ENDPOINT', 'IDENTITY_HEADER'].forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
});
