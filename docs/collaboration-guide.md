# Coordinated regional agent missions

New to this project? Start with the [operating manual](operating-manual.md) for the business scenario, identity model, complete browser walkthrough, and governance boundaries.

The enhancement adds one shared objective across the existing **Piraeus** and **Newark** Microsoft Agent Framework agents. It runs in the same Python Web App and uses the existing Foundry model, Entra blueprint, identities, and permissions. No additional Azure resources or directory grants are required.

## How to demonstrate it

Open **Command center → Coordinate both depots**.

| Mission | What happens | Initial expected purchase outcome |
|---|---|---|
| Assess both depots | Each agent inspects its own inventory and supplier offers. Purchasing is disabled at the server boundary. | No orders. |
| Add sailing reserves | Each agent compares offers and orders 20 additional seals for its own depot, delivery within 12 hours. | EU €84 + US €76 = €160 if the fast catalogue offers are selected. |
| Replenish both depots | Each agent checks demand, on-hand inventory, and incoming orders, then arranges any shortage. | May create zero orders if earlier demonstrations already covered the demand. |
| Sensors for both depots | Each agent proposes one additional engine sensor for its own depot. | Separate approvals for EU €2,400 and US €2,250; €4,650 after both complete. |

The model still selects and invokes tools; the expected amounts come from server-owned synthetic catalogue prices. The workflow is not a set of precomputed model responses.

Start with **Add sailing reserves**. The mission panel shows each regional run, order references, identity evidence, overall status, and a summary calculated from confirmed ledger records. Use **Inspect regional run** to see the existing detailed tools/decisions view below the mission panel. Expand **Shared progress reports** to inspect the context made available to the other agent.

Then run **Sensors for both depots**:

1. Wait for both regional cards to show **Approval needed**.
2. Choose Piraeus's **Review approval request**. Inspect the exact supplier, region, quantity, and amount, then approve in the detailed trace below.
3. Confirm the EU order is recorded while Newark remains pending. One approval cannot authorize the other agent.
4. Refresh the page. Select the mission if necessary and review Newark's pending approval.
5. Approve Newark's exact request and confirm the mission completes with two orders and the combined amount.

Each approval still requires that regional agent's configured sponsor. The current demo uses your configured tenant sponsor for both identities. Rejection, suspension, expiry, missing role, or a token failure in one region never creates authority in the other.

## What is shared, and what remains isolated

Application-managed orchestration dispatches the two real framework sessions sequentially. After Piraeus responds or pauses, Newark receives its latest progress summary as context. On a later approval/resume, an agent receives the peer's current summary. Both work under the original human's fixed regional assignments.

The shared report is allowlisted: agent/region label, run status, whether inventory was assessed, confirmed order references, confirmed spend, and pending-approval status. It does not contain the peer's inventory, supplier notes, raw tokens, framework checkpoint, or credentials. The report cannot change a task, select another identity, grant a role, or approve a call. Full regional details remain available to the signed-in governance administrator through the existing run inspection UI.

There is no additional model manager with procurement authority. The Python application coordinates, persists, and aggregates; each Microsoft Agent Framework agent performs its own model/tool loop. Shared reports are progress context, not delegated regional tool access.

## Partial completion and recovery

A mission can be running, awaiting approval, completed, blocked, or **Partially completed**. For example, suspend Newark and run **Add sailing reserves**: Piraeus may create its authorized order while Newark is denied. The mission must show partial completion and the actual spend. Reactivate Newark afterward.

The workflow is not a transaction spanning two regions: an already recorded fictional order remains recorded if the other region fails or is rejected. Never describe a partial mission as success for both depots.

Mission records, regional framework checkpoints, approvals, reports, orders, and audit correlation persist in the existing SQLite ledger. A process restart marks unfinished/queued work as interrupted instead of replaying purchases. Already pending approvals remain reviewable. Create a new mission if interrupted regional work needs to be requested again.

The existing **Audit trail → Export JSON** includes the mission ID on regional events. Look for `collaboration.requested`, `collaboration.dispatched`, `collaboration.report_published`, and the related tool/approval/order events. No raw access tokens are exported.

## Publish this enhancement

The deployment ZIP is rebuilt locally. Following the established user-run deployment flow:

```powershell
pwsh -NoProfile -File .\scripts\Package-Agentic.ps1
pwsh -NoProfile -File .\scripts\Publish-Agentic.ps1
```

Refresh the app after the health check succeeds. Existing orders and approvals are retained; the SQLite snapshot receives an additive `missions` collection. Existing single-agent scenarios continue to work. The publisher retains Python remote-build settings and checks HTTP readiness separately from Azure CLI startup tracking.

Local tests use actual framework tool/approval execution with a scripted model HTTP service. Live acceptance after publication should demonstrate both reserve purchases, separate sensor approvals/resume, and honest partial completion with one agent suspended.
