# Aegean Freight — Agent Governance Lab

A working demonstration of Microsoft Entra Agent ID blueprints, individual agent identities, and governance at the tool boundary. A fictional shipping company uses procurement agents to replenish depots without surrendering control over access or spending.

**Run now:** Node.js 24+, no package installation, account, or model required.

```powershell
npm start
# Open http://localhost:3000
```

The default is clearly labelled **simulation**. It uses distinct fictional identities and signed local capabilities. The included live adapter and deployment scripts acquire and validate actual Entra agent resource tokens on Azure. Live provisioning and hosting require an eligible tenant, permissions, and deployment approval; writing this repository does not provision them.

## What to open

| Deliverable | Location |
|---|---|
| Cited research and conceptual distinctions | [docs/research.md](docs/research.md) |
| Architecture, trust boundaries, control mapping | [docs/architecture.md](docs/architecture.md) |
| Eight-minute presentation walkthrough | [docs/presenter-guide.md](docs/presenter-guide.md) |
| Azure deployment, permissions, cost, cleanup | [docs/deployment.md](docs/deployment.md) |
| Browser demo | `http://localhost:3000` |

## Demonstration

1. Run **Routine replenishment** as Piraeus: a €420 fictional order completes.
2. Run **Urgent spare part**: €2,400 waits for the sponsor's approval. Approve the exact saved request to execute.
3. Run **Spending limit**, **Regional boundary**, and **Malicious supplier note**: policy denies the requests.
4. Select Newark and run **Regional boundary**: the region matches, but its read-only identity lacks `Orders.Create`.
5. Pause the blueprint, suspend an individual agent, or expire an access review; rerun the routine request.
6. Inspect identity evidence and export the audit trail. No raw access tokens are sent to the browser.

The local presenter stands in for the fictional sponsors. In Azure, workforce sign-in is enforced by App Service Easy Auth, allowed operators are checked by object ID, and approval requires the configured sponsor's object ID.

## Configuration

Copy `.env.example` to `.env` for local overrides. `IDENTITY_MODE=simulation|entra` selects authentication. `PLANNER_MODE=fixture|azure-openai` independently selects planning.

| Identity | Planner | Meaning |
|---|---|---|
| simulation | fixture | Offline presentation, repeatable outcomes; default |
| entra | fixture | Real agent token exchange and validation, repeatable scenarios |
| entra | azure-openai | Real model function-call proposals and real agent authentication |

The optional model planner uses an **existing** tool-capable Azure OpenAI deployment. Configure its endpoint and deployment, and grant the host managed identity `Cognitive Services OpenAI User` on that resource. The model proposes one call; the server validates arguments and request integrity, independently authorizes it, executes at most one fictional action, and records evidence. It cannot mint permissions, select its identity, or approve its own request. A model response that changes the authorized amount, region, or item fails closed. Model behavior is variable, including on malicious supplier notes; use fixture mode for repeatable demonstrations.

## Verification

```powershell
npm run check
npm test
az bicep build --file infra/main.bicep
```

Tests cover actual HTTP routes, cross-origin rejection, identity substitution, forged signatures, JWT validation, token exchange request shapes, approval replay, stale approval, policy changes during token acquisition, and persistence. Live services are mocked in automated tests; a successful unit test is not evidence of tenant consent or a successful live exchange.

## Scope

This is a single-process demonstration with a JSON ledger on local disk (Azure: persistent `/home/data`). It is not a financial system. The application policy switches do not call Graph or change Conditional Access. The repository does not configure entitlement management, tenant Conditional Access, Identity Protection, or access review campaigns. The review-expiry feature is an application deadline that illustrates the lifecycle concern.

For production, replace JSON state with transactional storage and concurrency control, export audit events to a durable protected sink, separate the agent worker from governance administration, and implement native tenant policies and lifecycle processes. Review the shared credential boundary: the host can act for all agent identities under its blueprint. Do not put unrelated trust domains under one blueprint.
