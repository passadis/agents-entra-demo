# Eight-minute presentation

Start the local app with `npm start` and open `http://localhost:3000`. Optional slide introduction: open [presentation.html](presentation.html). Default fixture mode requires no internet and makes every scenario repeatable. For a verified Azure tenant deployment use the same walkthrough after confirming the live identity badge and the routine scenario's token evidence.

## 0:00–1:00 — The business problem

“Aegean Freight operates depots in Piraeus and Newark. An agent can help buy supplies before a ship sails. Our question is not simply whether the model can place an order. It is which identity acts, what authority it has, who is accountable, and how we stop it.”

Point to the mode badge. Say explicitly whether the demonstration is simulated or uses live Entra tokens. Both modes write fictional orders only.

## 1:00–2:00 — Explain the identity chain

Point to the procurement blueprint and two agents. The blueprint is the shared class/authentication foundation. A tenant blueprint principal represents it. Piraeus and Newark have distinct identities. Piraeus can read and create orders; Newark can only read.

“An inherited configuration is not the same thing as an approved permission. This demo uses direct role grants so you can see the difference between siblings. Native blueprint inheritance is available with explicit configuration and consent.”

## 2:00–3:00 — A permitted action

Select Piraeus. Run **Routine replenishment** (€420). Show all checks passing and `PO-0001`. Expand the verified identity evidence. Explain that the raw token is never shown to the browser. In live mode the role and principal came from a verified Entra JWT; in simulation they came from a signed local capability.

“The token identifies the caller and API roles. Our application also checks depot, spending, review status, and approval.”

## 3:00–4:00 — Human oversight

Run **Urgent spare part** (€2,400). Show that no order exists yet. Approve the exact saved request. Show the audit entries for the human approval and subsequent agent execution. Approval does not add OAuth permissions or turn the autonomous token into an OBO token.

For an extra demonstration, create another pending request, pause the blueprint, and approve it. The request is denied because current policy is rechecked. Resume the blueprint afterward.

## 4:00–5:00 — Least privilege and business boundaries

Run **Spending limit** (€12,500), then **Regional boundary** using Piraeus. Explain the individual failing check. Select Newark and rerun the regional scenario: its depot matches US, but the create role is missing.

“Sharing a blueprint does not mean these instances need identical direct grants. A model cannot grant itself the missing permission.”

## 5:00–6:00 — Untrusted instructions and lifecycle

Switch back to Piraeus. Run **Malicious supplier note**. The fixture deliberately proposes bank-data export; the allowlist denies it before token acquisition. Say that this demonstrates containment of an ungranted proposal, not a universal prompt-injection detector. In model mode the model may avoid that proposal, so outcomes can vary.

Expire Piraeus's review, run the routine request, and show denial. Renew the review. Suspend the agent, repeat, and reactivate. Pause the blueprint and show both identities are locally blocked.

## 6:00–7:00 — Evidence and boundaries

Open **Audit trail**, export JSON, and inspect the actor IDs and run correlation. In live mode compare with Entra sign-in logs separately.

“These switches are enforced application policy. They do not modify our Entra tenant. Tenant Conditional Access, risk policies, and access governance must also be configured for a real rollout.”

## 7:00–8:00 — Show the Azure architecture

Open **Field guide**, then the architecture document if needed. Explain workforce sign-in, the host's managed identity, blueprint federation, agent resource token, and resource-side policy. The host's managed identity and agent identity have different jobs.

Finish by identifying the next production changes: separate tool service, transactional database, protected audit sink, tenant governance policies, and explicit lifecycle ownership. The current deployment stays at one process/instance because the ledger is a JSON demo store.

## Reset and presentation recovery

- Use the previous-run selector to reopen a pending approval or inspect earlier results after a page refresh.
- Resume paused identities/blueprint and renew expired reviews before the success scenarios.
- For a clean local ledger, stop the server, **move** `data/state.json` to an archive filename, and restart. This creates a fresh fictional registry. Do not reset a live ledger during execution.
- If a live exchange fails, preserve its denied run and inspect tenant grants, federation, consent, and sign-in logs. Do not describe simulation as live evidence.
