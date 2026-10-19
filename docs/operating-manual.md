# Aegean Agent Operations — Operating manual

**Current edition: 19 October 2026 · Microsoft Agent Framework, Entra Agent ID, and coordinated regional missions**

This guide is for someone seeing the project for the first time: a presenter, operator, architect, or technical reviewer. You can follow the walkthrough in the browser without installing software or knowing the repository. An authorized sign-in account is required.

**Open the application:** [Aegean Agent Operations](https://app-aegean-agents-c6e08b90.azurewebsites.net/).

## 1. What this demo offers

Aegean Freight is a fictional shipping company with depots in **Piraeus, EU**, and **Newark, US**. Each depot has a procurement agent that can inspect inventory, compare supplier offers, and arrange supplies before a sailing.

The demo answers a practical question: **How can AI agents do useful work while remaining identifiable, limited in authority, accountable to a human, and auditable?**

You can demonstrate:

- **Real agent operation:** a model chooses tools, receives their results, and continues a multi-step task using Microsoft Agent Framework.
- **Distinct agent identities:** each regional agent uses its own Microsoft Entra agent identity when calling protected tools, under a shared agent identity blueprint.
- **Independent authorization:** the application checks identity, API roles, region, spending, request authority, and lifecycle status around tool execution.
- **Human oversight:** a purchase above €1,000 pauses for the configured sponsor to review an exact request. Approval resumes the saved framework session.
- **Coordinated work:** one mission dispatches both agents, shares limited progress, and combines confirmed outcomes while retaining their separate permissions.
- **Evidence:** inspect tool activity, verified identity claims, approvals, orders, and correlated application audit events.

The scenario is procurement, but the pattern illustrates how to govern agents that operate other business tools.

### What is real and what is synthetic

| Component | In this demonstration |
|---|---|
| Agent runtime | Real Microsoft Agent Framework agents in a Python application. |
| Model | Real GPT-5 mini inference through Microsoft Foundry. |
| Workforce sign-in | Real Entra sign-in through App Service authentication. |
| Blueprint and identities | Actual Entra directory objects: blueprint, blueprint principal, and two agent identities. |
| Tool authentication | Actual Entra token exchange and validation in the deployed live mode. |
| Business tools | Executable functions for depot status, supplier offers, and purchase creation. |
| Inventory, sailings, suppliers, prices | Synthetic application records. EUR is the reporting currency for both depots. |
| Purchase orders | Fictional ledger entries. No supplier is contacted and no payment is made. |
| Pause, suspension, review deadline, and spending rules | Application-enforced controls. They do not change Entra directory objects or configure native tenant governance policies. |

This manual covers the current model-driven application. The repository also retains an older Node fixture demo; running npm start launches that older version.

## 2. Meet the actors and understand the design

| Actor or component | Job |
|---|---|
| Signed-in operator | Starts requests, inspects evidence, and uses controls. Must be an allowed governance administrator. |
| Agent sponsor | Approves or rejects a purchase requiring oversight. Administrator access alone does not make someone the sponsor. This deployment uses the configured tenant sponsor for both agents. |
| Piraeus agent | Performs EU depot work using its EU agent identity. |
| Newark agent | Performs US depot work using its US agent identity. Both agents have Orders.Read and Orders.Create; region limits are application policy. |
| Agent identity blueprint | Shared Entra identity foundation for this class of agents. Its tenant representation is the blueprint principal. Spending and depot restrictions are not native blueprint fields. |
| Host managed identity | Authenticates the Web App to model inference and blueprint federation. It is separate from either regional agent identity. |
| Tool boundary | Validates the agent's token and current policy before reading protected data or recording an order. |
| Application coordinator | Routes a shared mission to the two framework sessions, publishes allowlisted progress summaries, and calculates combined results. |

~~~mermaid
flowchart TD
  Person[Authorized operator] --> App[Azure Web App: UI and Python backend]
  App --> EU[Piraeus framework agent / EU identity]
  App --> US[Newark framework agent / US identity]
  EU <--> Model[Foundry-hosted GPT-5 mini]
  US <--> Model
  EU --> Boundary[Tool boundary: token validation and application policy]
  US --> Boundary
  Sponsor[Configured sponsor] --> Approval[Exact-request approval and session resume]
  Approval --> Boundary
  Boundary --> Tools[Synthetic depot, supplier, and purchase tools]
  Tools --> Evidence[Persistent orders, sessions, and audit]
~~~

The Python backend and light blue UI run in the **same Azure Web App**, on the existing **P0v3** plan. The Foundry account, project, and model deployment are separate resources in the same resource group, **rg-aegean-agent-demo**, in **Sweden Central**.

The agents run in App Service using the framework; Foundry hosts the model. Creating a Foundry project is therefore not a separate agent-deployment step for this design.

For protected tools, the host's managed identity authenticates through blueprint federation to obtain a regional agent resource token. The resource validates the token's signature, issuer, audience, lifetime, principal, client identifier, and required role. A framework agent name or system prompt does not establish identity or grant permission.

## 3. Before you begin

1. Open the application home page and sign in with an authorized account. Do not open the authentication callback URL directly.
2. Check the badge says **LIVE ENTRA IDENTITY** and the notice identifies **Microsoft Agent Framework** and the model.
3. Confirm both agents are **Active**, their reviews are current, and class activity is enabled.
4. If necessary, use **Resume class activity**, **Reactivate agent**, and **Renew review (30 days)** to restore the starting state.
5. Note the existing order count. The shared ledger persists; earlier demonstrations may have created orders or left approvals pending.

The live badge and application health prove configuration/startup, not successful inference or token exchange. Use actual tool results and identity evidence to establish those.

## 4. Find your way around

| View or control | Purpose |
|---|---|
| **Command center** | Lifecycle controls, shared missions, individual requests, detailed activity, and orders. |
| **Coordinate both depots** | Starts one shared mission with a separate run for each agent. Always targets both agents; the Acting agent dropdown does not change it. |
| **Previous mission** | Reopens a mission and its regional cards, including pending approvals. |
| **Acting agent** | Selects the agent for individual scenario cards and free-text requests. |
| **Inspect a previous run** | Reopens a regional trace or saved pending approval. |
| **Identity registry** | Principal/client identifiers, blueprint, region, sponsor, review date, and roles. |
| **Audit trail → Export JSON** | Downloads the application events currently loaded in the browser. |
| **Operating guide** | Short in-app instructions for the workflows and controls. |

Clicking a scenario or mission starts work immediately. Purchase missions carry authority for their defined task, subject to policy. The purchasing checkbox applies to free-text requests only.

## 5. Recommended first walkthrough

### A. Assess both depots without purchasing

In **Coordinate both depots**, click **Assess both depots**.

Each agent should inspect its own inventory and compare supplier offers. This mission is research-only: the server rejects a purchase even if the model attempts one.

Choose **Inspect regional run** on each card to see the tools and responses. Confirm this mission created **no new orders**; historical orders can remain in the global ledger.

### B. Let both agents complete useful work

Click **Add sailing reserves**. This explicitly requests **20 additional safety seals per depot**, so it remains useful after previous replenishment runs.

With the fast catalogue offers selected, expect:

| Agent | Quantity | Unit price | New fictional order |
|---|---|---|---|
| Piraeus / EU | 20 seals | €4.20 | €84 |
| Newark / US | 20 seals | €3.80 | €76 |
| **Mission total** | **40 seals** | | **€160** |

For each regional run:

1. Look for depot status, supplier comparison, and purchase tool activity.
2. Expand tool results to see the facts supplied to the model.
3. Confirm the order exists in the ledger and belongs to the correct region/run.
4. Expand **Verified identity evidence · entra** and compare the principal/client identifiers with **Identity registry**. The two agents should have distinct identities.
5. Inspect **Shared progress reports** and the mission's confirmed order count and spend.

Expected amounts come from the synthetic catalogue. The model chooses tools/offers; a narrative answer or expected price alone is not evidence of execution.

### C. Demonstrate two independent approvals

Click **Sensors for both depots**. Each agent is asked to arrange one additional engine sensor.

| Request | Catalogue amount | Required decision |
|---|---|---|
| Piraeus / EU | €2,400 | EU agent's sponsor approval |
| Newark / US | €2,250 | US agent's sponsor approval |

1. Wait for both cards to show **Approval needed**.
2. Select Piraeus's **Review approval request**. The detailed trace appears farther down Command center.
3. Review supplier, quantity, region, and calculated amount. Click **Approve exact request & resume** as its sponsor.
4. Confirm the EU order is recorded while Newark remains pending. Approving EU must not approve US.
5. Refresh the page and reopen the mission using **Previous mission**, if necessary.
6. Review and approve Newark's exact request.
7. Confirm two new orders, distinct regional identity evidence, and **€4,650** combined confirmed spend when those catalogue offers are used.

You can **Reject request** instead. A rejection does not authorize the other region. Approval cannot add a missing API role or override suspension, an expired review, a regional restriction, or the spending ceiling. Current policy is checked again before execution.

### D. Demonstrate a truthful partial result

1. Use Newark's **Suspend agent** control.
2. Start **Add sailing reserves** again.
3. Piraeus may create its authorized €84 order; Newark should be blocked before its tools execute.
4. Confirm **Partially completed**, with only confirmed orders/spend counted.
5. Use **Reactivate agent** afterward.

This is not a transaction that rolls back both depots. An EU order already recorded remains recorded if US fails. Restoring an agent does not replay a denied run; start a new request when more work is needed.

## 6. Individual requests and scenarios

Choose **Piraeus · EU** or **Newark · US** in **Acting agent**. Individual requests use that identity and region.

### Free-text requests

Enter a request and click **Start agent run**. For research, leave **Allow this request to create one fictional order within policy** unchecked. For procurement, select it explicitly; purchases above €1,000 still need sponsor approval.

| Example request | Purchasing checkbox |
|---|---|
| “Check my depot's next two sailings and explain whether incoming supplies cover demand.” | Off |
| “Compare safety-seal prices and delivery times for my depot. Do not buy.” | Off |
| “Order 20 additional safety seals for my depot from a supplier delivering within 12 hours.” | On |
| “Arrange one additional engine sensor for my depot and request any required sponsor approval.” | On |

Each submission creates a new run/session, rather than continuing a general chat thread. Approval resumes the exact saved session for its request.

### Scenario cards

| Card | What to inspect | Expected business outcome |
|---|---|---|
| **Replenish the depot** | Inventory, incoming orders, offers, and any purchase. | Buy only the shortage. With a fresh ledger, 100 fast-delivery seals cost EU €420 or US €380. No new order is correct when demand is covered. |
| **Urgent engine sensor** | Exact proposal and saved approval request. | A purchase above €1,000 waits for its sponsor. |
| **Spending boundary** | Compressor offer and any model refusal/policy failure. | No compressor order: EU €12,500 and US €12,000 exceed the €5,000 ceiling. |
| **Cross-region request** | Task targets the other depot; inspect checks if a tool call is attempted. | No cross-region tool access or order. The selected agent retains its own regional authority. |
| **Untrusted supplier note** | Supplier-result text, model response, and any denied attempt. | No bank-data export or purchase. This is a research-only task with an adversarial supplier note. |

Model behavior can vary. It may refuse an inappropriate request before calling a tool, or the server may deny an attempted call. The untrusted-note task may finish **Completed** with an explanation because handling it safely completes research. No bank-export/external-transfer tool is exposed. This demonstrates a bounded tool environment and request authority, not a universal prompt-injection detector.

Delivery time guides model selection. The application independently enforces the identity, role, region, spending, approval, request-authority, and lifecycle checks below; it does not implement a shipping SLA or independently enforce every preference in arbitrary natural-language requests.

## 7. Understand the governance rules

| Boundary | Enforced behavior |
|---|---|
| Workforce access | Only configured governance administrators in the expected tenant can use its protected API. This is an application allowlist, not a requirement to hold a tenant administrator directory role. |
| Tool identity | Token validation for the bound regional agent and required Orders.Read or Orders.Create role. |
| Region | Piraeus tools operate on EU resources; Newark tools operate on US resources. Peer progress does not grant cross-region access. |
| Request authority | Free-text requests are research-only unless purchasing is enabled. Presets carry their defined authority. |
| Spending | A single purchase cannot exceed €5,000. The server calculates price from its catalogue. |
| Approval | Above €1,000, the exact saved purchase needs the bound agent's sponsor. |
| Purchase count | At most one order per regional run. A mission explicitly authorizes up to two, one per depot. The €5,000 ceiling is per purchase, not an aggregate mission budget. |
| Lifecycle | Class/agent activity, accountable sponsor, and current review deadline; rechecked after token acquisition and approval. |

| Control | Effect on new/rechecked work | Restore afterward |
|---|---|---|
| **Pause all class activity** | Blocks both agents. | **Resume class activity** |
| **Suspend agent** | Blocks that agent. | **Reactivate agent** |
| **Expire access review** | Makes its local review deadline overdue and blocks it. | **Renew review (30 days)** |

These controls persist inside the application. They do not disable Entra identities, revoke issued tokens, configure Conditional Access, or create native Entra access-review campaigns. Sponsor approval is application oversight; it does not turn the autonomous agent token into a user-delegated/OBO token.

## 8. How the agents coordinate

The application assigns fixed regional tasks to two separate framework sessions and executes them sequentially. After Piraeus responds or pauses, Newark receives Piraeus's latest progress summary. On a later approval/resume, an agent receives the peer's current summary.

Only these fields are shared: regional agent label, run status, whether an inventory assessment completed, confirmed order references, confirmed spend, and pending-approval status. Raw inventory, supplier notes, credentials, tokens, and framework checkpoints are excluded.

The coordinator calculates combined results from stored regional outcomes and ledger records. A peer report cannot grant a role, change the human's task, select another identity, or approve a purchase. Full regional details remain inspectable by the authorized operator in the UI.

This is application-managed coordination of real framework agents. There is no additional AI manager with procurement authority or unrestricted delegation of regional powers.

## 9. Read status and evidence correctly

| Status | Meaning |
|---|---|
| **Queued** | Regional task assigned but not started. |
| **Running** | Model/tool execution is in progress. |
| **Approval needed** | Saved request awaits a sponsor decision. No order for that request should exist yet. |
| **Completed** | Execution finished: this can mean an order, research answer, or refusal. Check tools and ledger. |
| **Blocked** | A policy check, authorization failure, rejection, or runtime error prevented completion. Read the trace for the cause. |
| **Partially completed** | One region completed while another was blocked/rejected. Confirmed orders remain recorded. |

A mission remains **Approval needed** while any region awaits a decision, including when another region completed or was blocked. Inspect both cards.

Evidence of a live purchase combines a completed purchase-tool call, verified Entra claims, a matching order/region/run reference, and correlated audit events. Raw tokens and private model chain of thought are not displayed.

In **Audit trail**, look for:

- agent.requested, tool.requested, tool.completed, and tool.denied;
- approval.requested, approval.recorded, and approval.rejected;
- order.created, agent.finished, and lifecycle events;
- collaboration.requested, collaboration.dispatched, and collaboration.report_published for shared work.

Use the **run ID** for one regional task and **mission ID** for both agents. Export JSON after refreshing if another presenter has used the app. The export is an application-event record, not a full conversation export, protected audit archive, or copy of Entra sign-in logs. Tenant sign-in records are inspected separately.

## 10. Repeat demonstrations and recover work

- Orders accumulate; use mission/run references to distinguish new work. Order numbers will not always start at PO-0001.
- Incoming orders count toward demand. Replenishment may need no purchase. **Add sailing reserves** explicitly requests additional units and is useful for repeat presentations.
- There is no reset button. Normal operation does not require deleting files or redeploying.
- Restore class/agents to active and renew overdue reviews before a positive demonstration. Check pending approvals before changing controls.
- **Previous mission** and **Inspect a previous run** reopen saved work. Refreshing the browser does not erase it.
- A process restart marks unfinished/queued work as interrupted instead of replaying purchases. Saved pending approvals remain reviewable. Request new work for interrupted or denied runs.

The deployed ledger and framework checkpoints use persistent SQLite at /home/data/aegean/agentic.sqlite. Publishing application code preserves this data. The demo uses one worker and serializes execution; one presenter at a time makes the evidence easiest to follow.

## 11. Troubleshooting

| Symptom | Next action |
|---|---|
| Sign-in ends at a callback 401 | Start fresh from the application home page, optionally InPrivate. If persistent, ask the maintainer to inspect App Service authentication and Entra sign-in logs. |
| “Sign in as an allowed governance administrator” | Confirm the account's tenant and object ID are configured for this app. |
| Approval returns 403 | Use the configured sponsor's account. Administrator access alone is insufficient. |
| Run is Blocked | Read failed checks, tool results, and trace. Correct the request/control and start a new run after denial. |
| No order after replenishment | Inspect on-hand inventory and incoming orders: the shortage may be covered. |
| No order after free-text procurement | Check purchasing was enabled for that request, then inspect policy/approval requirements. |
| Mission partially completes | Inspect both regions; preserve the completed order and address the blocked region. |
| Checks pass but execution fails | Maintainer should inspect model access, managed-identity federation, token exchange, and API grants. |
| Another agent is running | Wait for execution to finish. A saved pending approval is not a continuously running model call. |
| Page loads but state does not | Check the notice and authorized account; inspect service logs if the API remains unavailable. |

For maintainers, /healthz checks startup/configuration, not live inference or agent-token acquisition. The publisher checks HTTP readiness separately from Azure CLI startup tracking, which previously timed out despite successful worker startup. Diagnose current health/logs before retrying deployment.

## 12. Suggested presentation and completion checklist

Introduce the story: “Two depots need supplies before sailing. Each AI agent can plan and act, but only under its own identity, within its region, with the required human oversight.”

Then demonstrate:

1. **Identity registry:** two distinct agents and one blueprint.
2. **Assess both depots:** useful research with purchasing disabled.
3. **Add sailing reserves:** two agent/tool executions with combined confirmed results.
4. **Sensors for both depots:** independent approvals, refreshing between decisions.
5. **Cross-region request** and **Spending boundary:** distinguish model refusal from actual policy-denial evidence.
6. **Suspend Newark** and run a reserve mission: honest partial completion, then reactivate.
7. **Audit trail:** correlate by mission ID and export.

The audience should be able to identify who requested the work, which agent acted, what the model proposed, which tool executed, what authority was checked, who approved, and what was recorded.

### Scope and further reading

This is a working identity/governance demonstration with synthetic commercial records. Production use needs appropriate business-system integration, shared transactional storage for scale, protected audit retention, monitoring, and native tenant governance/lifecycle policies. The host is a shared trust boundary because it can authenticate for both agents under the blueprint.

- [Focused shared-mission walkthrough](collaboration-guide.md)
- [Framework architecture, rollout, and maintenance](agentic-upgrade.md)
- [Research and conceptual background](research.md)

Normal presenters need only the browser steps above. Deployment scripts are maintenance tools, not prerequisites for each demonstration.
