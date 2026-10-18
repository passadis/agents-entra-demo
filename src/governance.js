import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPlanner } from './planner.js';

export const cases = [
  { id: 'routine', title: 'Routine replenishment', description: 'Order safety seals for the Piraeus depot.', region: 'EU', amount: 420, item: 'Safety seals', action: 'Orders.Create' },
  { id: 'approval', title: 'Urgent spare part', description: 'An engine sensor is needed before the next sailing.', region: 'EU', amount: 2400, item: 'Engine sensor', action: 'Orders.Create' },
  { id: 'over-budget', title: 'Spending limit', description: 'A replacement compressor exceeds the class spending ceiling.', region: 'EU', amount: 12500, item: 'Compressor', action: 'Orders.Create' },
  { id: 'cross-region', title: 'Regional boundary', description: 'The EU agent attempts to order for the US depot.', region: 'US', amount: 420, item: 'Safety seals', action: 'Orders.Create' },
  { id: 'exfiltration', title: 'Malicious supplier note', description: 'Supplier text asks the agent to export bank details. The untrusted proposal requests an ungranted tool.', region: 'EU', amount: 0, item: 'Vendor bank details', action: 'Vendors.ExportBankDetails' }
];
export function seed() {
  return {
    blueprint: { id: 'procurement-v1', name: 'Procurement Operations', enabled: true, sponsor: 'Maya Stavrou · Procurement Director',
      version: '1.0', maxAmount: 5000, approvalThreshold: 1000, declaredPermissions: ['Orders.Read', 'Orders.Create'],
      inheritedRoles: ['Orders.Read'], note: 'Local policy attached to a blueprint; monetary rules are application controls.' },
    agents: [
      { id: 'piraeus', name: 'Piraeus procurement', region: 'EU', sponsor: 'Maya Stavrou', sponsorId: 'local-demo-sponsor', enabled: true, reviewDue: '2027-12-31T23:59:59Z', clientId: 'sim-agent-eu', principalId: 'sim-principal-eu', roles: ['Orders.Read', 'Orders.Create'] },
      { id: 'newark', name: 'Newark procurement', region: 'US', sponsor: 'Daniel Reed', sponsorId: 'local-demo-sponsor', enabled: true, reviewDue: '2027-12-31T23:59:59Z', clientId: 'sim-agent-us', principalId: 'sim-principal-us', roles: ['Orders.Read'] }
    ], runs: [], orders: [], audit: []
  };
}
export class Governance {
  constructor(identity, { file, mapping = {}, now = () => new Date(), planner = createPlanner({}) } = {}) {
    this.identity = identity; this.file = file; this.now = now;
    this.state = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : seed();
    for (const agent of this.state.agents) if (mapping[agent.id]) Object.assign(agent, mapping[agent.id]);
    this.busy = false;
    this.planner = planner;
    // Runs interrupted by a process restart require a new human request, never automatic replay.
    for (const run of this.state.runs) if (['evaluating', 'executing'].includes(run.status)) {
      run.status = this.state.orders.some(o => o.runId === run.id) ? 'completed' : 'denied';
      run.trace.push('Recovered after restart; incomplete work is never replayed automatically.');
    }
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  event(type, actor, details = {}) {
    this.state.audit.push({ id: randomUUID(), at: this.now().toISOString(), type, actor, ...details });
    this.save();
  }
  agent(id) {
    const agent = this.state.agents.find(a => a.id === id);
    if (!agent) throw Object.assign(new Error('Unknown agent'), { status: 400 });
    return agent;
  }
  evaluate(agent, proposal, approved = false) {
    const b = this.state.blueprint;
    return [
      ['Blueprint active', b.enabled, 'Blueprint is suspended'],
      ['Agent active', agent.enabled, 'Agent is suspended'],
      ['Accountable sponsor', Boolean(agent.sponsor), 'Agent has no sponsor'],
      ['Access review current', Date.parse(agent.reviewDue) > +this.now(), 'Access review has expired'],
      ['Tool allowlist', b.declaredPermissions.includes(proposal.action) && agent.roles.includes(proposal.action), 'Tool permission is not granted'],
      ['Regional scope', agent.region === proposal.region, 'Agent cannot cross its regional boundary'],
      ['Spending ceiling', Number.isFinite(proposal.amount) && proposal.amount >= 0 && proposal.amount <= b.maxAmount, 'Amount exceeds the class spending ceiling'],
      ['Human approval', proposal.amount <= b.approvalThreshold || approved, 'Sponsor approval is required']
    ].map(([name, passed, reason]) => ({ name, passed, reason: passed ? 'Passed' : reason }));
  }
  async run(agentId, caseId, actor) {
    if (this.busy) throw Object.assign(new Error('Another operation is in progress; retry shortly'), { status: 409 });
    const scenario = cases.find(c => c.id === caseId);
    if (!scenario) throw Object.assign(new Error('Unknown scenario'), { status: 400 });
    const agent = this.agent(agentId);
    // The browser selects a scenario. The planner proposes; policy decides.
    const run = { id: randomUUID(), agentId, scenarioId: caseId, proposal: { action: scenario.action, amount: scenario.amount, region: scenario.region, item: scenario.item },
      createdAt: this.now().toISOString(), requestedBy: actor, status: 'evaluating', checks: [], trace: [] };
    this.state.runs.unshift(run);
    this.busy = true;
    try {
      run.proposal = await this.planner.propose(scenario);
      run.trace.push(`${this.planner.mode} planner selected a tool proposal. Planner output carries no authority.`);
      this.event('proposal.created', actor, { runId: run.id, agentId, planner: this.planner.mode });
      await this.process(run);
    } catch (error) {
      run.status = 'denied'; run.trace.push(`Planner failed closed: ${error.message}`);
      this.event('planner.denied', actor, { runId: run.id, reason: error.message });
    } finally { this.busy = false; this.save(); }
    return run;
  }
  async process(run) {
    const agent = this.agent(run.agentId);
    run.checks = this.evaluate(agent, run.proposal, Boolean(run.approvedBy));
    const failures = run.checks.filter(c => !c.passed);
    if (failures.length) {
      run.status = failures.every(c => c.name === 'Human approval') ? 'awaiting_approval' : 'denied';
      run.trace.push(`${run.status}: ${failures.map(c => c.reason).join('; ')}`);
      this.event(`policy.${run.status}`, 'policy-engine', { runId: run.id, agentId: agent.id, reasons: failures.map(c => c.reason) });
      return;
    }
    this.busy = true;
    run.status = 'executing';
    try {
      const token = await this.identity.acquire(agent);
      run.trace.push(this.identity.mode === 'entra' ? 'Managed identity → blueprint T1 (fmi_path) → agent T2 for the Orders API.' : 'Simulation: issued an HMAC-signed local capability. No Entra token was requested.');
      const claims = await this.identity.validate(token);
      run.tokenEvidence = { mode: this.identity.mode, oid: claims.oid, clientId: claims.azp, audience: claims.aud, roles: claims.roles, expiresAt: new Date(claims.exp * 1000).toISOString() };
      await this.executeTool(run, claims);
      run.status = 'completed';
      run.trace.push('Tool boundary validated identity, role, current policy, and the one-time run before recording a fictional purchase order.');
      this.event('order.created', agent.principalId, { runId: run.id, agentId: agent.id, orderId: run.orderId, mode: this.identity.mode });
    } catch (error) {
      run.status = 'denied';
      run.trace.push(`Execution blocked: ${error.message}`);
      this.event('execution.denied', agent.principalId, { runId: run.id, reason: error.message });
    } finally { this.busy = false; this.save(); }
  }
  async executeTool(run, claims) {
    const agent = this.agent(run.agentId);
    if (claims.oid !== agent.principalId || claims.azp !== agent.clientId || !Array.isArray(claims.roles) || !claims.roles.includes(run.proposal.action)) throw new Error('Tool rejected the agent principal or application role');
    if (this.evaluate(agent, run.proposal, Boolean(run.approvedBy)).some(c => !c.passed)) throw new Error('Tool rejected current governance policy');
    if (run.status !== 'executing' || this.state.orders.some(o => o.runId === run.id)) throw new Error('Run is not executable or was already consumed');
    if (run.proposal.action !== 'Orders.Create') throw new Error('Unknown tool');
    const order = { id: `PO-${String(this.state.orders.length + 1).padStart(4, '0')}`, runId: run.id,
      ...run.proposal, agentId: agent.id, principalId: claims.oid, createdAt: this.now().toISOString() };
    this.state.orders.unshift(order); run.orderId = order.id;
  }
  async approve(id, actor) {
    if (this.busy) throw Object.assign(new Error('Another operation is in progress'), { status: 409 });
    const run = this.state.runs.find(r => r.id === id);
    if (!run || run.status !== 'awaiting_approval') throw Object.assign(new Error('Run is not awaiting approval'), { status: 409 });
    if (this.agent(run.agentId).sponsorId !== actor) throw Object.assign(new Error('Only the configured agent sponsor may approve'), { status: 403 });
    run.approvedBy = actor; run.approvedAt = this.now().toISOString();
    this.event('approval.recorded', actor, { runId: id, proposal: run.proposal });
    await this.process(run);
    return run;
  }
  control(target, action, actor) {
    const entity = target === 'blueprint' ? this.state.blueprint : this.agent(target);
    if (action === 'toggle') entity.enabled = !entity.enabled;
    else if (action === 'expire' && target !== 'blueprint') entity.reviewDue = '2000-01-01T00:00:00Z';
    else if (action === 'renew' && target !== 'blueprint') entity.reviewDue = new Date(+this.now() + 86400000 * 30).toISOString();
    else throw Object.assign(new Error('Unknown control'), { status: 400 });
    this.event(`governance.${action}`, actor, { target, enabled: entity.enabled, reviewDue: entity.reviewDue });
    return entity;
  }
}
