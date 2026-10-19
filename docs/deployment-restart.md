# Fresh VS Code Azure deployment session

This is the historical VS Code handoff. The user subsequently stopped that agent and selected chat-led, user-executed deployment. The active region is now **Sweden Central (`swedencentral`)**, retaining P0v3; do not launch a separate agent or use the East US 2 target below. Read the current session context and deployment guide instead.

The user explicitly requested a NEW `azure-deploy` session, disregarding the previous session's progress, after two reported failed provisioning attempts. Use the Azure Resources extension's `azure-deploy` custom agent and its workspace instructions in `.github/agents/azure-deploy/instructions.md`. Do not switch to the unrelated legacy azd deployment skill.

## Fixed deployment requirements

- Workspace: `C:/projects26/blogger/entra-agents`.
- Repository: `https://github.com/passadis/agents-entra-demo.git`, branch `main`.
- New session ID: `a512fdde-1808-46e8-9f63-e8325790fa7d`.
- Subscription: Visual Studio Enterprise Subscription, `9d47bf93-091d-480e-a512-1e918864fee7` (read from the active Azure CLI account).
- Tenant: `35de4c50-7dcd-4871-8685-61789c017da2`.
- Region: `eastus2`, matching the existing VS Code launch task. Do not fall back to the old West Europe target.
- Resource group: `rg-aegean-agent-demo`.
- App name: `app-aegean-agents-c6e08b90`; verify global availability.
- Sponsor: `7e35709d-f693-4896-9599-146e27046ef4`.
- **Mandatory App Service SKU: Premium v3 P0v3, Linux, capacity 1, tier PremiumV3. Never substitute B1, another SKU, or another region without the user's explicit instruction.**

## Cleanup coordination

The user will delete the resource group from the failed attempt. Do not delete it yourself. Start the new session and perform read-only preparation now. Before any cloud or directory mutation, wait for the user to confirm that deletion is complete, verify the resource group is absent (including any asynchronous deletion finishing), and capture a fresh inventory baseline. Do not treat an Azure resource group deletion as proof that Entra identity objects were deleted.

## Fresh state and existing code

The active pointer now identifies the fresh session, whose completedPhases is empty. This is a user-authorized fresh start: do not resume `c1cef517-0fd3-430e-9b18-585398041113`, reuse its approval markers, or copy its old B1 quota/cost validations. Preserve it read-only for audit evidence. Preserve the application and inspect any existing identity-state.json before creating directory objects. Infrastructure SKU was already changed at the user's request; revalidate the template.

## Required VS Code status views

The user specifically wants the extension's native deployment tab again. Use the extension tools, not a replacement static page:

1. Report this new `azure-deploy` invocation with `report_agent_launch`.
2. Probe the CLIs and use `record_deploy_prerequisites`.
3. Generate the new plan and call **`open_deploy_plan_view`** so the deployment plan/status tab is visible.
4. Follow the pipeline's plan review and deployment approval gates, honoring the user's already-authorized P0v3 edit and fresh start.
5. Call `capture_deployment_inventory` before deployment and after each attempt.
6. Finalize actual results and call **`open_deploy_result_view`**, including on failure.

P0V3 Linux was listed in East US 2 by `az appservice list-locations`; subscription SKU quota is still unverified. The Azure Retail Prices API returned P0v3 Linux East US 2 at $0.0775/hour, approximately $56.58 per 730-hour month, excluding other services and licensing. Do not reuse the old $13.14 B1 estimate.
