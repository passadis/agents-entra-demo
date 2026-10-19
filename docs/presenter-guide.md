# Presenting Aegean Agent Operations

Use this short narrative alongside the [operating manual](operating-manual.md), which contains the complete steps, expected amounts, and troubleshooting. This guide covers the current Python/Microsoft Agent Framework application.

## Prepare

Open the [deployed application](https://app-aegean-agents-c6e08b90.azurewebsites.net/) and sign in as an authorized operator. To demonstrate approvals, use the configured sponsor's account. Confirm both agents are active, class activity is enabled, and reviews are current. Check existing orders and pending requests before presenting.

Allow time for model calls and human decisions. Never promise a fixed order number or identical wording on every run.

## 1. Explain the business problem

“Aegean Freight has depots in Piraeus and Newark. Each depot has an AI procurement agent. We want agents to prepare supplies before sailing while knowing which identity acts, which boundaries apply, and who must approve.”

Explain the scope: real framework agents, model inference, Entra sign-in, and agent identities; synthetic stock, suppliers, and purchase orders. No supplier receives an order and no money moves.

## 2. Introduce identity and authority

Open **Identity registry**. Show one blueprint and two distinct regional agent identities. Both have Orders.Read and Orders.Create; the application enforces their regional boundaries.

“The host managed identity accesses the model and blueprint federation. The regional identity authenticates business-tool calls. A prompt does not grant permission: the tool boundary validates the token and current policy.”

The framework runs in App Service. Foundry hosts the model in the same resource group. This is not a Foundry-hosted agent runtime.

## 3. Show two agents doing useful work

In **Coordinate both depots**, run **Assess both depots**, then **Add sailing reserves**. The first task is research-only; the second authorizes 20 additional seals per depot.

Inspect each regional trace, verified identity evidence, and ledger order. Fast catalogue offers produce EU €84 and US €76, totaling €160. Confirm the actual recorded result rather than relying on model prose.

Show **Shared progress reports**: agents receive limited status summaries, not another region's inventory or credentials. The application coordinates separate framework sessions and combines confirmed outcomes.

## 4. Show independent human oversight

Run **Sensors for both depots**. Open each saved approval request. Review its exact region, supplier, quantity, and amount.

Approve Piraeus and show Newark still waiting. Refresh and reopen the mission if useful, then approve Newark separately. Catalogue amounts are €2,400 and €2,250.

“Approval resumes the saved session. It cannot override a missing role, suspension, regional boundary, expired review, or the €5,000 purchase ceiling.”

## 5. Show boundaries and partial completion

Run **Cross-region request** or **Spending boundary** as an individual agent. Explain whether the model refused or a tool call was actually denied; the trace distinguishes them.

Suspend Newark, then start **Add sailing reserves**. Inspect Piraeus's outcome and Newark's blocked task. Only confirmed purchases count toward the mission total. Restore Newark afterward.

“One region's failure does not erase an order already recorded in the other. Restoring an agent does not replay denied work.”

## 6. Finish with evidence and scope

Open **Audit trail**, correlate mission and run IDs, and export JSON. Show the chain from human request through agent identity, tool activity, sponsor decision, and ledger outcome. Raw access tokens are not displayed.

“The pause, suspension, and review switches enforce application policy. They do not disable directory identities or configure native Entra Conditional Access or access reviews. Production adoption needs those tenant processes, business integrations, and protected audit retention.”

For a shorter presentation, show identity, sailing reserves, and separate sensor approvals. Keep the full [operating manual](operating-manual.md) available for questions.
