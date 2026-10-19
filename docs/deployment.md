# Azure deployment runbook

For the real Microsoft Agent Framework replacement, Foundry in the existing resource group, and both agents' procurement roles, follow [the agentic rollout guide](agentic-upgrade.md). The legacy commands below apply to the original Node/fixture deployment; do not use the legacy publisher after switching the Web App to Python.

## Prepared target

- Subscription: **Visual Studio Enterprise Subscription** (`9d47bf93-091d-480e-a512-1e918864fee7`).
- Tenant: `35de4c50-7dcd-4871-8685-61789c017da2`.
- Proposed resource group: `rg-aegean-agent-demo`.
- Proposed region: `swedencentral` (Sweden Central), selected by the user after the East US 2 quota blocker.
- Required App Service plan: **Premium v3 P0v3**, one Linux instance. Do not substitute B1 or another SKU.
- Proposed web app: `app-aegean-agents-c6e08b90` (global name availability is checked during deployment).
- Proposed tenant sponsor: the signed-in user, object ID `7e35709d-f693-4896-9599-146e27046ef4`. This is a proposed assignment, not an existing live sponsor relationship.

These targets were refreshed for the user's fresh-session request. The user reports that a separate VS Code deployment attempt created only the resource group and will delete it. Verify deletion has completed before recreating it. Keep any `identity-state.json` after provisioning; deleting an Azure resource group does not delete Entra objects. It records object IDs for resumable setup and cleanup, contains no tokens or secrets, and is ignored by Git.

## Prerequisites

1. PowerShell **7**, Azure CLI, Bicep CLI, Node.js 24, and `Microsoft.Graph.Authentication`. On this workstation Azure CLI and Node work; a runnable PowerShell 7 executable and the Graph module were not found during preparation. Install PowerShell 7 first, then run the following from its terminal:

   ```powershell
   Install-Module Microsoft.Graph.Authentication -Scope CurrentUser
   az login --tenant 35de4c50-7dcd-4871-8685-61789c017da2
   ```

2. An eligible work/school tenant where Agent ID APIs and required licenses are available. The current user must be allowed to create/manage blueprints and agents. Role names and specific restrictions are described in [blueprint prerequisites](https://learn.microsoft.com/en-us/entra/agent-id/create-blueprint#prerequisites).
3. Graph admin consent for the setup client's delegated permissions: `Application.ReadWrite.All`, `AppRoleAssignment.ReadWrite.All`, `AgentIdentityBlueprint.ReadWrite.All`, `AgentIdentityBlueprintPrincipal.Create`, `AgentIdentity.Create.All`, `AgentIdentity.ReadWrite.All`, `AgentIdentityBlueprint.AddRemoveCreds.All`, and `User.Read`. This sample intentionally uses broad setup administration permissions for a small, resumable bootstrap; they are never granted to runtime agents. Confirm tenant consent policy and least privileged role requirements before using them. [Agent create permissions](https://learn.microsoft.com/en-us/graph/api/agentidentity-post?view=graph-rest-v1.0), [Blueprint create permissions](https://learn.microsoft.com/en-us/graph/api/agentidentityblueprint-post?view=graph-rest-v1.0).
4. Azure rights to deploy the resources and create the two Key Vault scoped role assignments, for example Contributor plus Role Based Access Control Administrator at the proposed group/subscription scope. Run as the designated sponsor so that the configured vault writer matches the deploying user.
5. Registered resource providers for Microsoft.Web, Microsoft.ManagedIdentity, Microsoft.KeyVault, Microsoft.OperationalInsights, and Microsoft.Insights. Tenant role, consent, provider-registration, and Azure Policy readiness require deployment preflight; an Azure subscription login alone does not establish those permissions.

Do not use an Azure CLI Graph token to provision Agent ID resources: the Azure skill guidance describes rejection of tokens carrying `Directory.AccessAsUser.All`. These scripts use `Connect-MgGraph` with explicit scopes. Azure CLI is used for Azure resource management and Key Vault only. [Microsoft Azure Entra Agent ID skill documentation](https://learn.microsoft.com/en-us/azure/developer/azure-skills/skills/entra-agent-id).

## Deploy after approval

Review [infra/main.bicep](../infra/main.bicep) and the three scripts. Then, from the repository in PowerShell 7:

```powershell
./scripts/Deploy.ps1 `
  -SubscriptionId 9d47bf93-091d-480e-a512-1e918864fee7 `
  -TenantId 35de4c50-7dcd-4871-8685-61789c017da2 `
  -SponsorObjectId 7e35709d-f693-4896-9599-146e27046ef4 `
  -Location swedencentral
```

The script connects to Microsoft Graph interactively, creates/verifies the identity objects, creates the resource group, runs ARM what-if, deploys infrastructure, configures MI federation on the blueprint, stores the separate workforce application's sign-in secret in Key Vault, deploys a ZIP containing only the application assets, and checks health. It defaults to **live Entra identity + fixture planner**. A separate Graph authentication session may require your interaction; Azure RBAC and Graph permissions are independent.

The Bicep file creates two narrow vault role assignments: the host identity gets **Key Vault Secrets User** and the sponsor/deployer gets **Key Vault Secrets Officer**. The vault uses RBAC and soft deletion. It is publicly addressable with access controlled by Entra RBAC; private endpoints are not included. The login secret expires after 90 days and must be rotated. Blueprint authentication uses managed identity federation and stores no blueprint client secret.

State is checkpointed after each directory object creation. If a later step fails, retain the state file and rerun with the same tenant and app name. Reruns verify saved object IDs and missing blueprint principals. If a response is lost between Graph object creation and local checkpointing, inspect the directory before retrying to avoid duplicates. Do not delete the state file as a troubleshooting shortcut.

Permission/federation propagation can take time. A denied live run produces no fictional order. After fixing tenant grants or allowing propagation, start a new scenario; do not retry a completed order. A Key Vault secret reference may remain cached after setup; use App Service's Key Vault reference refresh action or restart and verify reference status before diagnosing sign-in failures. The scripts fail with an actionable error rather than silently falling back to simulation.

## Smoke test the live integration

1. Open the resulting Azure URL. Anonymous access should redirect to Entra sign-in. An unlisted user must be denied by the application API even if workforce authentication succeeds.
2. Sign in as the configured sponsor. Confirm the **LIVE ENTRA IDENTITY** badge.
3. Run Piraeus routine replenishment. Confirm completion and inspect identity evidence: real agent object ID, expected Orders API audience, and `Orders.Create` role. This is the essential live token-exchange proof.
4. Run the €2,400 request and approve it. Confirm the audit trail records your workforce object ID, then the agent's object ID for execution.
5. Run the Newark regional scenario. Its US region should pass, but its missing create role should block execution.
6. Exercise local suspension and review expiry. These do not modify the directory. Separately use Entra admin center to disable an actual test agent and verify that new token acquisition is denied. Existing token lifetimes still matter.
7. Inspect Entra sign-in logs and application audit side-by-side using time and agent object ID. The app's run ID is an application correlation key, not an automatic Entra log join field.

The automated test suite mocks token services. **Live smoke-test results are pending until deployment and tenant setup succeed.**

## Optional model planner

Use an existing Azure OpenAI resource/deployment with tool calling and structured tool parameters. Grant **Cognitive Services OpenAI User** to the host managed identity at that resource scope. Set `PLANNER_MODE=azure-openai`, `AZURE_OPENAI_ENDPOINT`, and `AZURE_OPENAI_DEPLOYMENT` on the app, or supply the equivalent Bicep parameters. This application uses the public Azure OpenAI `/openai/v1/chat/completions` endpoint with managed identity; sovereign cloud endpoint variants are not implemented. [Azure OpenAI structured tool calling](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs?pivots=programming-language-javascript).

Model configuration is independent of Agent ID. The host identity may call the inference service; the individual agent identity authorizes the business tool. Provisioning a new model is outside this demo's default infrastructure and needs its own quota/availability and cost decision. Model inference usage is excluded from the hosting estimate.

## Costs and availability

The current target is **Sweden Central**. The Azure Retail Prices API returned **Premium v3 P0v3 Linux, USD $0.089 per hour**, approximately **$64.97/month** for one instance at 730 hours. Sweden Central reports a Total Regional VMs allowance of 30 with usage 0; its quota API exposes only the aggregate entry, not a separate P0v3 entry. The actual subscription-scope ARM what-if passed with P0v3, proposing 12 creates and no deletes. This supersedes the previous East US 2 and B1 estimates. It is a successful preview, not a reservation or a completed deployment. Never fall back to B1 to bypass a quota or capacity error.

Key Vault operations, Log Analytics ingestion/retention, Application Insights usage, bandwidth, taxes, workforce licensing, Agent ID/Agent 365/Entra Governance licensing, and optional model inference are additional. Log Analytics uses a 1 GB/day ingestion cap as a guardrail; it is not a total spending cap. Do not assume licenses or free credits are present. [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [Agent governance licensing requirements](https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview), [Agent Conditional Access licensing](https://learn.microsoft.com/en-us/entra/identity/conditional-access/agent-id).

The Application Insights resource is prepared but the app has no automatic telemetry SDK. Optional App Service HTTP/console diagnostics target Log Analytics when the Bicep parameter `enableDiagnostics=true` is supplied after initial deployment; they default off. Application audit JSON is stored separately.

## Cleanup

Export audit evidence first. Inspect the exact resource group before deletion:

```powershell
az resource list --resource-group rg-aegean-agent-demo -o table
# Run only after explicitly choosing to delete the demonstration:
az group delete --name rg-aegean-agent-demo
```

Deleting the resource group does not delete Entra directory objects. Use the saved `identity-state.json` to review and remove the two agents, blueprint principal and blueprint application, tool API app/principal, and workforce app/principal in Entra admin center or Graph. Do not remove a shared identity or unrelated application. Key Vault soft deletion retains the deleted vault and can affect name reuse; retain state if a redeployment may follow.
