import { createHmac, timingSafeEqual, randomBytes, createPublicKey, verify } from 'node:crypto';

const assertionType = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class IdentityProvider {
  constructor(config = {}, request = fetch) {
    this.mode = config.mode || 'simulation';
    if (!['simulation', 'entra'].includes(this.mode)) throw new Error('Invalid IDENTITY_MODE');
    this.config = config;
    this.request = request;
    this.key = randomBytes(32);
    this.jwks = null;
    if (this.mode === 'entra') {
      for (const field of ['tenantId', 'blueprintClientId', 'toolClientId', 'managedIdentityClientId']) {
        if (!guid.test(config[field] || '')) throw new Error(`Live identity requires ${field} GUID`);
      }
    }
  }
  async json(url, options) {
    const response = await this.request(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Identity service returned HTTP ${response.status}; check Entra sign-in logs`);
    return response.json();
  }
  async token(form) {
    const result = await this.json(`https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form)
    });
    if (!result.access_token) throw new Error('Identity service did not return an access token');
    return result.access_token;
  }
  async acquire(agent) {
    if (this.mode === 'simulation') {
      const body = Buffer.from(JSON.stringify({ oid: agent.principalId, azp: agent.clientId, aud: 'aegean-tools',
        roles: agent.roles, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
      return `${body}.${createHmac('sha256', this.key).update(body).digest('base64url')}`;
    }
    if (!guid.test(agent.clientId) || !guid.test(agent.principalId)) throw new Error('Live agent mapping is missing');
    // App Service provides this local endpoint. No blueprint secrets are stored.
    if (!process.env.IDENTITY_ENDPOINT || !process.env.IDENTITY_HEADER) throw new Error('App Service managed identity endpoint is unavailable');
    const url = new URL(process.env.IDENTITY_ENDPOINT);
    url.search = new URLSearchParams({ 'api-version': '2019-08-01', resource: 'api://AzureADTokenExchange', client_id: this.config.managedIdentityClientId });
    const managed = await this.json(url, { headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER } });
    const t1 = await this.token({ client_id: this.config.blueprintClientId, scope: 'api://AzureADTokenExchange/.default',
      grant_type: 'client_credentials', fmi_path: agent.clientId,
      client_assertion_type: assertionType, client_assertion: managed.access_token });
    return this.token({ client_id: agent.clientId, scope: `api://${this.config.toolClientId}/.default`,
      grant_type: 'client_credentials', client_assertion_type: assertionType, client_assertion: t1 });
  }
  async validate(token) {
    if (typeof token !== 'string' || token.length > 20000) throw new Error('Invalid tool token');
    if (this.mode === 'simulation') {
      const [body, sig, extra] = token.split('.');
      if (!body || !sig || extra) throw new Error('Invalid simulation token');
      const expected = createHmac('sha256', this.key).update(body).digest();
      const actual = Buffer.from(sig, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid simulation signature');
      const claims = JSON.parse(Buffer.from(body, 'base64url'));
      if (claims.exp <= Date.now() / 1000 || claims.aud !== 'aegean-tools') throw new Error('Expired or invalid audience');
      return claims;
    }
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported JWT algorithm');
    const endpoint = `https://login.microsoftonline.com/${this.config.tenantId}/discovery/v2.0/keys`;
    if (!this.jwks || this.jwks.expires < Date.now()) this.jwks = { ...(await this.json(endpoint)), expires: Date.now() + 3600000 };
    let key = this.jwks.keys.find(k => k.kid === header.kid);
    if (!key) {
      this.jwks = { ...(await this.json(endpoint)), expires: Date.now() + 3600000 };
      key = this.jwks.keys.find(k => k.kid === header.kid);
    }
    if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('JWT signature rejected');
    const now = Date.now() / 1000;
    if (claims.ver !== '2.0' || claims.iss !== `https://login.microsoftonline.com/${this.config.tenantId}/v2.0` ||
        claims.tid !== this.config.tenantId || claims.aud !== this.config.toolClientId ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 60 ||
        !guid.test(claims.oid || '') || !guid.test(claims.azp || '')) throw new Error('JWT issuer, audience, time, or identity rejected');
    return claims;
  }
}
