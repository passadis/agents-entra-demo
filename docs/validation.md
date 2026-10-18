# Validation record

Prepared 18 October 2026. This record describes local checks, not successful live cloud provisioning.

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
