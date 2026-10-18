const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
let state; let currentRun; let busy = false;
const badge = (text, style = '') => `<span class="badge ${style}">${esc(text)}</span>`;
async function api(path, body) {
  const res = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!res.ok) { let message = `HTTP ${res.status}`; try { message = (await res.json()).error || message; } catch {} throw new Error(message); }
  return res.json();
}
async function refresh() { state = await api('state'); render(); }
function render() {
  const b = state.blueprint;
  $('mode').textContent = state.mode === 'entra' ? 'LIVE ENTRA IDENTITY' : 'SIMULATION MODE';
  $('operator').textContent = state.operator.name;
  $('notice').textContent = (state.mode === 'entra' ? 'Live Entra authentication · Fictional purchase orders · Switches enforce application policy; tenant settings are separate.' : 'Simulated agent identity · Local signed capabilities demonstrate the identity boundary; no live Entra agent token exchange.') + (state.planner === 'azure-openai' ? ' Azure OpenAI tool-calling planner enabled.' : ' Deterministic fixture planner; no model calls.');
  $('stats').innerHTML = [
    ['Governed blueprints', '01', b.enabled ? 'Class policy active' : 'Class suspended'],
    ['Agent identities', String(state.agents.length).padStart(2, '0'), `${state.agents.filter(a => a.enabled).length} active · distinct principals`],
    ['Actions prevented', String(state.runs.filter(r => r.status === 'denied').length).padStart(2, '0'), 'Policy enforced at tool boundary'],
    ['Awaiting approval', String(state.runs.filter(r => r.status === 'awaiting_approval').length).padStart(2, '0'), 'Human oversight before execution']
  ].map(([title, n, note]) => `<div class="stat"><span class="stat-title">${title}</span><span class="stat-number">${n}</span><span class="stat-note">${esc(note)}</span></div>`).join('');
  $('blueprint').innerHTML = `<div class="panel-heading"><span class="eyebrow">▧ &nbsp; AGENT IDENTITY BLUEPRINT</span>${badge(b.enabled ? 'Active' : 'Suspended', b.enabled ? '' : 'red')}</div><h3>${esc(b.name)}</h3><p>One agent class. Shared authentication foundation.<br>Each instance keeps a distinct permission boundary.</p><div class="meta"><span>Sponsor<strong>${esc(b.sponsor)}</strong></span><span>Spend ceiling<strong>${money(b.maxAmount)}</strong></span><span>Approval above<strong>${money(b.approvalThreshold)}</strong></span></div><button class="button secondary" data-control="blueprint" data-action="toggle">${b.enabled ? 'Pause all class activity' : 'Resume class activity'}</button>`;
  $('agents').innerHTML = state.agents.map(a => `<article class="panel agent-card"><div class="agent-icon">◈</div><div><h3>${esc(a.name)}</h3><p>${esc(a.region)} region · ${esc(a.sponsor)}</p><span class="subtle">${a.roles.map(esc).join(' · ')}</span><div class="agent-actions"><button class="text-button" data-control="${esc(a.id)}" data-action="toggle">${a.enabled ? 'Suspend agent' : 'Reactivate agent'}</button><button class="text-button" data-control="${esc(a.id)}" data-action="${Date.parse(a.reviewDue) > Date.now() ? 'expire' : 'renew'}">${Date.parse(a.reviewDue) > Date.now() ? 'Expire access review' : 'Renew review (30 days)'}</button></div></div>${badge(!a.enabled ? 'Suspended' : Date.parse(a.reviewDue) <= Date.now() ? 'Review overdue' : 'Active', !a.enabled || Date.parse(a.reviewDue) <= Date.now() ? 'amber' : '')}</article>`).join('');
  $('scenarios').innerHTML = state.cases.map((c, i) => `<button class="scenario ${currentRun?.scenarioId === c.id ? 'selected' : ''}" data-case="${esc(c.id)}"><span class="number">0${i + 1}</span><strong>${esc(c.title)}</strong><small>${c.action === 'Orders.Create' ? `${money(c.amount)} · ${esc(c.region)} depot` : 'Ungranted tool proposal'}</small><span class="run-link">Run scenario ↗</span></button>`).join('');
  $('run-select').innerHTML = '<option value="">Select a run</option>' + state.runs.map(r => `<option value="${esc(r.id)}" ${currentRun?.id === r.id ? 'selected' : ''}>${esc(r.scenarioId)} · ${esc(r.agentId)} · ${esc(r.status)}</option>`).join('');
  $('orders').innerHTML = state.orders.length ? state.orders.map(o => `<article class="order"><strong>${esc(o.id)}</strong><span class="money">${money(o.amount)}</span><p>${esc(o.item)} · ${esc(o.region)}<br>${esc(o.agentId)} · ${esc(o.principalId)}</p></article>`).join('') : '<div class="empty-state"><span class="empty-icon">▱</span><h3>No orders yet.</h3><p>Authorized actions appear here after all checks pass.</p></div>';
  $('registry').innerHTML = state.agents.map(a => `<article class="panel registry-card"><div class="panel-heading"><h3>${esc(a.name)}</h3>${badge(a.enabled ? 'Enabled' : 'Suspended')}</div><div class="meta"><span>Blueprint<strong>${esc(b.id)}</strong></span><span>Sponsor<strong>${esc(a.sponsor)}</strong></span><span>Region<strong>${esc(a.region)}</strong></span><span>Review due<strong>${esc(a.reviewDue.slice(0, 10))}</strong></span></div><p>Principal ID: <code>${esc(a.principalId)}</code></p><p>Token client identifier: <code>${esc(a.clientId)}</code></p><p class="subtle">Application roles: ${a.roles.map(esc).join(', ')}. Simulation baseline: Orders.Read; live provisioning uses direct grants.</p></article>`).join('');
  $('audit-table').innerHTML = state.audit.length ? `<table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Actor</th><th>Correlation / details</th></tr></thead><tbody>${[...state.audit].reverse().map(e => `<tr><td>${esc(e.at)}</td><td>${esc(e.type)}</td><td><code>${esc(e.actor)}</code></td><td><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'at', 'type', 'actor'].includes(k)))))}</code></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Run a scenario to create auditable events.</div>';
  $('mode-detail').textContent = state.mode === 'entra' ? 'Live mode acquires a real agent resource token through managed identity and blueprint federation, then verifies its signature, issuer, audience, lifetime, agent identity, and role at the tool boundary. No raw token is returned to the browser.' : 'Simulation mode uses locally signed HMAC capabilities and distinct fictional principals. It works offline and demonstrates server-enforced governance. It does not prove tenant policy enforcement or a live Entra token exchange.';
  if (currentRun) { currentRun = state.runs.find(r => r.id === currentRun.id) || currentRun; renderDecision(); }
}
function renderDecision() {
  const r = currentRun;
  const labels = { completed: 'Completed', denied: 'Blocked', awaiting_approval: 'Approval needed', executing: 'Executing' };
  $('run-status').textContent = labels[r.status] || r.status;
  $('run-status').className = `badge ${r.status === 'denied' ? 'red' : r.status === 'awaiting_approval' ? 'amber' : ''}`;
  $('decision').className = '';
  $('decision').innerHTML = `<p class="section-description">${esc(state.cases.find(c => c.id === r.scenarioId)?.description)}<br><strong>${esc(state.agents.find(a => a.id === r.agentId)?.name)}</strong> · <code>${esc(r.id.slice(0, 8))}</code></p><ul class="checklist">${r.checks.map(c => `<li class="${c.passed ? '' : 'failed'}"><span>${esc(c.name)}</span><span>${c.passed ? '✓ Passed' : esc(c.reason)}</span></li>`).join('')}</ul><ol class="trace">${r.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol>${r.status === 'awaiting_approval' ? `<button class="button" data-approve="${esc(r.id)}">Approve exact request & execute</button><p class="subtle">Approval is recorded as ${esc(state.operator.name)}. All controls are checked again.</p>` : ''}${r.tokenEvidence ? `<details class="evidence"><summary>Verified identity evidence · ${esc(r.tokenEvidence.mode)}</summary><pre>${esc(JSON.stringify(r.tokenEvidence, null, 2))}</pre></details>` : ''}`;
}
async function act(action) {
  if (busy) return;
  busy = true; document.body.classList.add('busy');
  document.querySelectorAll('[data-case], [data-control], [data-approve]').forEach(b => b.disabled = true);
  try { await action(); await refresh(); }
  catch (error) { $('notice').textContent = error.message; }
  finally { busy = false; document.body.classList.remove('busy'); document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.view) {
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== button.dataset.view);
    document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b === button));
    $('view-title').textContent = button.textContent.trim().slice(1).trim();
  }
  if (button.dataset.case) act(async () => { currentRun = await api('run', { agentId: $('agent-select').value, caseId: button.dataset.case }); });
  if (button.dataset.control) act(() => api('control', { target: button.dataset.control, action: button.dataset.action }));
  if (button.dataset.approve) act(async () => { currentRun = await api('approve', { runId: button.dataset.approve }); });
  if (button.id === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.audit, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'aegean-audit.json'; a.click(); URL.revokeObjectURL(url);
  }
});
refresh().catch(e => { $('notice').textContent = `Unable to load governance state: ${e.message}`; });
$('run-select').addEventListener('change', e => { currentRun = state.runs.find(r => r.id === e.target.value); if (currentRun) renderDecision(); });
