const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-IE', {style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
let state, selectedRun, selectedMission, sending = false;
const statusLabel = status => ({queued:'Queued',running:'Running',completed:'Completed',denied:'Blocked',awaiting_approval:'Approval needed',partial:'Partially completed'}[status] || status);
async function api(path, body) {
  const response = await fetch(`/api/${path}`, body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`); return result;
}
function render() {
  $('mode').textContent = state.mode === 'entra' ? 'LIVE ENTRA IDENTITY' : 'SIMULATED IDENTITY';
  $('operator').textContent = state.operator.name;
  $('notice').textContent = `Microsoft Agent Framework · Model: ${state.model} · ${state.mode === 'entra' ? 'Live Entra tool authentication' : 'Local simulated tool identity'} · Synthetic suppliers and orders.`;
  $('stats').innerHTML = [['Regional agents','02','Distinct identities'],['Purchase orders',state.orders.length,'Synthetic ledger'],['Awaiting approval',state.runs.filter(r=>r.status==='awaiting_approval').length,'Saved framework sessions'],['Runtime',state.busy?'Running':'Ready','Model-driven tool execution']].map(([label,n,note])=>`<div class="stat"><span class="stat-title">${esc(label)}</span><span class="stat-number">${esc(n)}</span><span class="stat-note">${esc(note)}</span></div>`).join('');
  $('blueprint-control').textContent = state.blueprint.enabled ? 'Pause all class activity' : 'Resume class activity';
  $('agents').innerHTML = state.agents.map(a=>`<article class="panel agent-card"><div class="agent-icon">◈</div><div><h3>${esc(a.name)}</h3><p>${esc(a.region)} · ${esc(a.sponsor)}</p><span class="subtle">${a.roles.map(esc).join(' · ')}</span><div class="agent-actions"><button class="text-button" data-control="${a.id}" data-action="toggle">${a.enabled?'Suspend agent':'Reactivate agent'}</button><button class="text-button" data-control="${a.id}" data-action="${Date.parse(a.reviewDue)>Date.now()?'expire':'renew'}">${Date.parse(a.reviewDue)>Date.now()?'Expire access review':'Renew review (30 days)'}</button></div></div><span class="badge ${!a.enabled||Date.parse(a.reviewDue)<=Date.now()?'amber':''}">${!a.enabled?'Suspended':Date.parse(a.reviewDue)<=Date.now()?'Review overdue':'Active'}</span></article>`).join('');
  $('scenarios').innerHTML = state.cases.map((c,i)=>`<button class="scenario" data-case="${esc(c.id)}"><span class="number">0${i+1}</span><strong>${esc(c.title)}</strong><small>Model-driven task</small><span class="run-link">Start agent ↗</span></button>`).join('');
  $('run-select').innerHTML = '<option value="">Select a run</option>'+state.runs.map(r=>`<option value="${esc(r.id)}" ${r.id===selectedRun?'selected':''}>${esc(r.agentId)} · ${esc(r.scenarioId)} · ${esc(r.status)}</option>`).join('');
  $('orders').innerHTML = state.orders.map(o=>`<article class="order"><strong>${esc(o.id)}</strong><span class="money">${money(o.amount)}</span><p>${esc(o.quantity ? `${o.quantity} × `:'')}${esc(o.item)} · ${esc(o.region)}<br>${esc(o.supplier||'Legacy order')}<br>${esc(o.agentId)} · ${esc(o.principalId)}</p></article>`).join('') || '<div class="empty-state">No orders yet. Ask an agent to inspect and replenish its depot.</div>';
  $('registry').innerHTML = state.agents.map(a=>`<article class="panel registry-card"><h3>${esc(a.name)}</h3><div class="meta"><span>Region<strong>${esc(a.region)}</strong></span><span>Review due<strong>${esc(a.reviewDue.slice(0,10))}</strong></span></div><p>Principal: <code>${esc(a.principalId)}</code></p><p>Client identifier: <code>${esc(a.clientId)}</code></p><p>Blueprint: <code>${esc(state.blueprint.id)}</code></p><p>Roles: ${a.roles.map(esc).join(', ')}</p></article>`).join('');
  $('audit-table').innerHTML = '<table><thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Details / run correlation</th></tr></thead><tbody>'+[...state.audit].reverse().map(e=>`<tr><td>${esc(e.at)}</td><td>${esc(e.type)}</td><td><code>${esc(e.actor)}</code></td><td><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k])=>!['id','at','type','actor'].includes(k)))))}</code></td></tr>`).join('')+'</tbody></table>';
  renderMission();
  renderDecision();
  document.querySelectorAll('[data-case],[data-mission],#send,[data-approve],[data-reject]').forEach(b=>b.disabled=state.busy||sending);
}
function renderMission() {
  const missions=state.missions||[];
  if(!selectedMission&&missions.length)selectedMission=missions[0].id;
  $('mission-select').innerHTML='<option value="">Select a mission</option>'+missions.map(m=>`<option value="${esc(m.id)}" ${m.id===selectedMission?'selected':''}>${esc(m.title)} · ${esc(statusLabel(m.status))}</option>`).join('');
  const mission=missions.find(m=>m.id===selectedMission);if(!mission)return;
  const children=mission.runIds.map(id=>state.runs.find(r=>r.id===id)).filter(Boolean);
  $('mission-detail').innerHTML=`<div class="mission-summary"><strong>${esc(mission.title)}</strong><span class="badge ${mission.status==='denied'?'red':['partial','awaiting_approval'].includes(mission.status)?'amber':''}">${esc(statusLabel(mission.status))}</span><p>${esc(mission.summary)}</p><span class="subtle">Mission ${esc(mission.id)} · Each sponsor decision applies to one regional request.</span></div><div class="mission-cards">${children.map(r=>`<article class="panel mission-agent"><div class="panel-heading"><strong>${esc(state.agents.find(a=>a.id===r.agentId)?.name||r.agentId)}</strong><span class="badge ${r.status==='denied'?'red':r.status==='awaiting_approval'?'amber':''}">${esc(statusLabel(r.status))}</span></div><p>${r.tools.length} tool calls · ${r.orderId?esc(r.orderId):'No confirmed order'}</p><p class="subtle">${r.tokenEvidence?`Verified principal: ${esc(r.tokenEvidence.oid)}`:'No tool identity evidence acquired yet.'}</p>${r.status==='awaiting_approval'?'<p class="approval-note">Review this regional request and its exact amount before approving.</p>':''}<button class="button secondary" data-open-run="${esc(r.id)}">${r.status==='awaiting_approval'?'Review approval request':'Inspect regional run'}</button></article>`).join('')}</div><details class="evidence"><summary>Shared progress reports · ${(mission.reports||[]).length}</summary><p class="subtle">Only status, assessment completion, order references, and spend are shared. Peer reports cannot grant tool access or sponsor approval.</p><pre>${esc(JSON.stringify(mission.reports,null,2))}</pre></details>`;
}
function renderDecision() {
  const r = state.runs.find(r=>r.id===selectedRun); if(!r) return;
  $('run-status').textContent = statusLabel(r.status);
  $('run-status').className = `badge ${r.status==='denied'?'red':r.status==='awaiting_approval'?'amber':''}`;
  $('decision').className='';
  $('decision').innerHTML=`<p class="section-description request-text"><strong>${esc(r.agentId)}</strong> · ${esc(r.id.slice(0,8))}<br>${esc(r.prompt)}</p>${(r.tools||[]).map(t=>`<details class="tool-entry"><summary>${esc(t.name)} · ${esc(t.status)}</summary><pre>${esc(JSON.stringify({arguments:t.arguments,result:t.result},null,2))}</pre></details>`).join('')}${r.answer?`<div class="agent-answer">${esc(r.answer)}</div>`:''}<ul class="checklist">${(r.checks||[]).map(c=>`<li class="${c.passed?'':'failed'}"><span>${esc(c.name)}</span><span>${c.passed?'✓ Passed':esc(c.reason)}</span></li>`).join('')}</ul><ol class="trace">${r.trace.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>${r.status==='awaiting_approval'?`<div class="approval-card">${(r.approvalRequests||[]).map(p=>`<p><strong>${esc(p.supplier)}</strong> · ${money(p.amount)}<br>${esc(p.arguments.quantity)} units · ${esc(p.arguments.offer_id)} · ${esc(p.arguments.region)}</p>`).join('')}<div class="approval-actions"><button class="button" data-approve="${esc(r.id)}">Approve exact request &amp; resume</button><button class="button secondary" data-reject="${esc(r.id)}">Reject request</button></div><p class="subtle">Only the configured sponsor can decide. All policy checks run again.</p></div>`:''}${r.tokenEvidence?`<details class="evidence"><summary>Verified identity evidence · ${esc(r.tokenEvidence.mode)}</summary><pre>${esc(JSON.stringify(r.tokenEvidence,null,2))}</pre></details>`:''}`;
}
async function refresh(){state=await api('state');render();}
async function act(body,path='run') {
  if(sending) return; sending=true;
  let failure;
  try { const result=await api(path,body); if(result.id) selectedRun=result.id; if(result.missionId)selectedMission=result.missionId; await refresh(); }
  catch(error){failure=error.message;}
  finally{sending=false;if(state)render();if(failure)$('notice').textContent=failure;}
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.view){document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n===b));$('view-title').textContent=b.textContent.slice(1).trim();}
  if(b.dataset.case)act({agentId:$('agent-select').value,caseId:b.dataset.case});
  if(b.dataset.mission)act({kind:b.dataset.mission},'collaborate');
  if(b.dataset.openRun){selectedRun=b.dataset.openRun;renderDecision();$('decision').scrollIntoView({behavior:'smooth',block:'start'});}
  if(b.dataset.control)act({target:b.dataset.control,action:b.dataset.action},'control');
  if(b.dataset.approve||b.dataset.reject)act({runId:b.dataset.approve||b.dataset.reject,approved:Boolean(b.dataset.approve)},'approve');
  if(b.id==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(state.audit,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='aegean-agentic-audit.json';a.click();URL.revokeObjectURL(url);}
});
$('request-form').addEventListener('submit',event=>{event.preventDefault();if($('prompt').value.trim())act({agentId:$('agent-select').value,prompt:$('prompt').value.trim(),allowOrders:$('allow-orders').checked});});
$('run-select').addEventListener('change',event=>{selectedRun=event.target.value;renderDecision();});
$('mission-select').addEventListener('change',event=>{selectedMission=event.target.value;renderMission();});
refresh().catch(e=>$('notice').textContent=e.message);
setInterval(()=>{if(!sending&&state?.busy)refresh().catch(e=>$('notice').textContent=e.message);},1200);
