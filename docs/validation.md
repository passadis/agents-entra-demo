# Validation record

## Collaboration enhancement — 19 October 2026

The user confirmed both deployed regional agents and the original approval, regional, spending, and lifecycle demonstrations work. The new shared-mission enhancement is built locally and awaits user-run publication.

| Check | Result |
|---|---|
| Python test suite | 23 pass, including shared mission correlation, two bound identities, minimal peer context, independent sponsor decisions, approval resume after restart, partial outcomes, queued-work interruption, and additive migration of the existing ledger |
| Browser checks | Individual flows plus joint reserves, two sensor approvals across page reload, progress reports, all views, and desktop/mobile layout pass using the real framework against the scripted test model |
| Clean hosted startup | Pass using deployment-only dependencies and the App Service credential constructor; no live Azure/model calls |
| Infrastructure and directory changes | None required; existing app, model, blueprint, identities, and role grants are reused |
| ZIP | 13 selected files, including `backend/collaboration.py`; development environments/test services/state are excluded |
| Live acceptance | Pending publication and demonstration of joint reserves, separate sensor approvals, and partial completion with one agent suspended |

See [the coordinated missions guide](collaboration-guide.md).

## Current agentic upgrade — 18 October 2026

The user confirmed Foundry deployment and both agent directory checks. Python remote build now succeeds on the existing P0v3 app in Sweden Central. Hosted startup exposed a missing `aiohttp` transport; the corrected requirements and ZIP are prepared for republishing. Live inference and agent tool exchange remain pending.

| Check | Result |
|---|---|
| Python framework integration and identity tests | 16 pass, including both regional agents, real SDK tool loops against a scripted HTTP model service, approval checkpoint/resume, replay prevention, signed JWT validation, request-level purchasing authority, and HTTP operator/origin enforcement |
| Deployment-only environment cold startup | Pass with `scripts/Check-AgenticStartup.py`: actual App Service async credential constructor, HTTP health response, graceful shutdown, and `pip check`; no live Azure/model calls. Checked locally on Windows/Python 3.14; cloud runtime is Linux/Python 3.13. |
| Legacy Node regression tests / syntax | 18 pass / syntax passes |
| New UI browser verification | Both agents, approval/resume, tool results, cross-region denial, four views, desktop/mobile widths, and no page exceptions pass against the local test service |
| Foundry and host Bicep compilation | Pass |
| Foundry ARM what-if | Pass: 4 creates, 7 existing resources ignored; no changes to the running host |
| Foundry model selection | Sweden Central, GPT-5 mini `2025-08-07`, DataZoneStandard, capacity 30; supported SKU and sufficient subscription quota confirmed at preview time |
| Runtime availability | Azure CLI lists `PYTHON\|3.13` as active |
| Replacement package | `artifacts/aegean-agentic.zip`, 12 selected files including root `.deployment` for Python remote build; no local environment, credentials, session data, or scripted model service |
| Live acceptance of replacement | Pending user-run rollout and both agents' live inference, token exchange, order creation, and sponsor approval tests |

See [architecture, exact rollout commands, and rollback](agentic-upgrade.md), [new desktop capture](../artifacts/agentic-desktop.png), and [new mobile capture](../artifacts/agentic-mobile.png). The older deployment notes below are historical and do not describe the current region or installed prerequisites.

## Historical original scaffold record

Prepared 18 October 2026. This record describes local checks, not successful live cloud provisioning.

Fresh-session update: the user requires Premium v3 **P0v3**, replacing B1. The current subscription is Visual Studio Enterprise Subscription (`9d47bf93-091d-480e-a512-1e918864fee7`); the latest VS Code launch task targets East US 2. P0V3 Linux is listed in that region, and the public retail API returned $0.0775/hour. The earlier B1 availability and pricing rows below are historical evidence only; they do not validate the new SKU. The user reports a separate failed VS Code provisioning attempt and is handling deletion of its resource group. The new session must recheck inventory, deletion completion, quota, and deployment readiness.

| Check | Result |
|---|---|
| `npm run check` | JavaScript syntax passes |
| `npm test` | 18 tests pass; HTTP, policy, identity, JWT, persistence, and model-planner boundaries |
| `node scripts/Verify-Browser.mjs` | Desktop/mobile interaction checks pass in headless Edge; no page exceptions |
| PowerShell parser | All three provisioning/deployment scripts parse successfully |
| PowerShell runtime prerequisites | PowerShell 7 and Microsoft.Graph.Authentication still need installation; scripts have not executed against Graph |
| `az bicep build --file infra/main.bicep` | Passes; generated ARM template is ignored by Git |
| Azure scaffold conformance script | Passes with zero failures (loaded as UTF-8 for the Windows PowerShell host) |
| Azure account | Active subscription and tenant read successfully |
| B1 Linux region | West Europe listed as eligible |
| Microsoft.Web regional usage | Returned aggregate usage 0/30; this is not SKU reservation |
| Current retail price | B1 Linux West Europe $0.018/hour, USD |
| ARM deployment validation / what-if | Pending approved deployment and target resource group |
| Live Graph provisioning, federation, consent | Pending |
| Live agent token exchange | Pending; unit tests validate request shapes using mocks |
| Live model inference | Pending; optional adapter tested using mocks |

Browser verification runs a fresh isolated ledger and checks a successful order, pending approval, approved execution, all three denied fixtures, blueprint pause/resume, all four views, and no horizontal overflow at 390px. The script saves [desktop](../artifacts/dashboard-desktop.png) and [mobile](../artifacts/dashboard-mobile.png) captures. It can leave a locked temporary browser profile while Edge shuts down; that profile is isolated from the user's browser data.

The live demo must pass the smoke test in [deployment.md](deployment.md) before it is described as an Azure-hosted, live Entra demonstration. Prerequisites and limitations remain visible in the app and documentation.
