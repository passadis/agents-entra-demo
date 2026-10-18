import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { IdentityProvider } from './identity.js';
import { Governance, cases } from './governance.js';
import { createPlanner } from './planner.js';

export function createApp(env = process.env) {
  const hosted = Boolean(env.WEBSITE_HOSTNAME);
  const identity = new IdentityProvider({ mode: env.IDENTITY_MODE, tenantId: env.AZURE_TENANT_ID,
    blueprintClientId: env.BLUEPRINT_CLIENT_ID, toolClientId: env.TOOL_CLIENT_ID, managedIdentityClientId: env.MANAGED_IDENTITY_CLIENT_ID });
  const mapping = identity.mode === 'entra' ? {
    piraeus: { clientId: env.AGENT_EU_CLIENT_ID, principalId: env.AGENT_EU_PRINCIPAL_ID, sponsorId: env.SPONSOR_OBJECT_ID, sponsor: 'Tenant sponsor' },
    newark: { clientId: env.AGENT_US_CLIENT_ID, principalId: env.AGENT_US_PRINCIPAL_ID, sponsorId: env.SPONSOR_OBJECT_ID, sponsor: 'Tenant sponsor' }
  } : hosted ? { piraeus: { sponsorId: env.SPONSOR_OBJECT_ID }, newark: { sponsorId: env.SPONSOR_OBJECT_ID } } : {};
  const planner = createPlanner(env);
  const governance = new Governance(identity, { file: env.DATA_FILE || (hosted ? '/home/data/aegean/state.json' : 'data/state.json'), mapping, planner });
  if (identity.mode === 'entra' && Object.values(mapping).some(a => !a.clientId || !a.principalId || !a.sponsorId)) throw new Error('Configure both live agent identities and sponsor');
  if (identity.mode === 'entra') {
    governance.state.blueprint.id = env.BLUEPRINT_CLIENT_ID;
    governance.state.blueprint.principalId = env.BLUEPRINT_PRINCIPAL_ID || 'See Entra admin center';
    governance.state.blueprint.sponsor = `Configured tenant sponsor · ${env.SPONSOR_OBJECT_ID}`;
  }
  const admins = (env.GOVERNANCE_ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (hosted && (!env.AZURE_TENANT_ID || !admins.length || !env.SPONSOR_OBJECT_ID)) throw new Error('Hosted mode requires Entra tenant, sponsor, and governance administrator IDs');
  function operator(req) {
    if (!hosted) return { id: 'local-demo-sponsor', admin: true, name: 'Local presenter', source: 'Local simulation operator' };
    // Only supported behind App Service Easy Auth, which strips user-supplied identity headers.
    let principal;
    try { principal = JSON.parse(Buffer.from(req.headers['x-ms-client-principal'] || '', 'base64')); } catch { /* fail closed */ }
    const claim = type => principal?.claims?.find(c => c.typ === type)?.val;
    const id = claim('http://schemas.microsoft.com/identity/claims/objectidentifier') || claim('oid');
    const tenant = claim('http://schemas.microsoft.com/identity/claims/tenantid') || claim('tid');
    if (!id || tenant !== env.AZURE_TENANT_ID || !admins.includes(id)) throw Object.assign(new Error('Sign in as an allowed governance administrator'), { status: 403 });
    return { id, admin: true, name: req.headers['x-ms-client-principal-name'] || id, source: 'App Service Easy Auth / Entra workforce identity' };
  }
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && ['/healthz', '/readyz'].includes(path)) return json(res, 200, { status: 'ok', mode: identity.mode });
      if (path.startsWith('/api/')) {
        const user = operator(req);
        if (req.method === 'GET' && path === '/api/state') return json(res, 200, { ...governance.state, cases, mode: identity.mode, operator: user,
          planner: planner.mode, enforcement: 'Application policy; tenant Conditional Access is configured separately' });
        if (req.method === 'GET' && path === '/api/audit') return json(res, 200, governance.state.audit);
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
        // Same-origin JSON requests prevent browser CSRF. Never trust forwarded host headers.
        if (req.headers.origin && req.headers.origin !== `${hosted ? 'https' : 'http'}://${hosted ? env.WEBSITE_HOSTNAME : req.headers.host}`) return json(res, 403, { error: 'Origin rejected' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return json(res, 413, { error: 'Request too large' }); }
        let body;
        try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        if (!body || Array.isArray(body) || typeof body !== 'object') return json(res, 400, { error: 'JSON object required' });
        if (path === '/api/run') return json(res, 200, await governance.run(body.agentId, body.caseId, user.id));
        if (path === '/api/approve') return json(res, 200, await governance.approve(body.runId, user.id));
        if (path === '/api/control') return json(res, 200, governance.control(body.target, body.action, user.id));
        return json(res, 404, { error: 'Unknown endpoint' });
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
      if (req.method !== 'GET' || !files[path]) return json(res, 404, { error: 'Not found' });
      const [file, type] = files[path];
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
      res.end(readFileSync(new URL(`../public/${file}`, import.meta.url)));
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Operation failed; inspect server logs' });
      console.error(error.message);
    }
  });
  return { server, governance };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT || 3000), process.env.WEBSITE_HOSTNAME ? '0.0.0.0' : '127.0.0.1', () => console.log(`Aegean governance demo listening on ${process.env.PORT || 3000}`));
}
