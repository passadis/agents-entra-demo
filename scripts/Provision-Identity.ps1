#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Authentication
[CmdletBinding()]
param(
  [Parameter(Mandatory)][guid]$TenantId,
  [Parameter(Mandatory)][guid]$SponsorObjectId,
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{2,60}$')][string]$AppName,
  [string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json')
)
$ErrorActionPreference = 'Stop'
$scopes = @('User.Read', 'Application.ReadWrite.All', 'AppRoleAssignment.ReadWrite.All',
  'AgentIdentityBlueprint.ReadWrite.All', 'AgentIdentityBlueprintPrincipal.Create', 'AgentIdentity.Create.All', 'AgentIdentity.ReadWrite.All')
Connect-MgGraph -TenantId $TenantId -Scopes $scopes -NoWelcome -ContextScope Process
$ctx = Get-MgContext
if ($ctx.TenantId -ne $TenantId.ToString()) { throw 'Connected Graph tenant does not match requested tenant' }
$script:identityState = if (Test-Path -LiteralPath $StatePath) { Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json -AsHashtable } else { @{ tenantId = $TenantId.ToString(); appName = $AppName; sponsorObjectId = $SponsorObjectId.ToString() } }
if ($script:identityState.tenantId -ne $TenantId.ToString() -or $script:identityState.appName -ne $AppName) { throw 'State file belongs to another tenant or application' }
if ($script:identityState.sponsorObjectId -and $script:identityState.sponsorObjectId -ne $SponsorObjectId.ToString()) { throw 'Change tenant sponsor relationships explicitly before reusing this state with a different sponsor' }
function Save-IdentityState { $script:identityState | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $StatePath -Encoding utf8NoBOM }
function Invoke-Graph([string]$Method, [string]$Path, $Body) {
  $graphRequest = @{ Method = $Method; Uri = "https://graph.microsoft.com/v1.0/$Path"; Headers = @{ 'OData-Version' = '4.0' }; OutputType = 'PSObject' }
  if ($null -ne $Body) { $graphRequest.Body = $Body | ConvertTo-Json -Depth 15; $graphRequest.ContentType = 'application/json' }
  Invoke-MgGraphRequest @graphRequest
}
function Ensure-Object([string]$Key, [string]$Collection, [string]$CreatePath, $Body) {
  if ($script:identityState.ContainsKey($Key)) {
    # Validate recorded IDs; never create a duplicate after a permission or network error.
    return Invoke-Graph GET "$Collection/$($script:identityState[$Key].id)" $null
  }
  $obj = Invoke-Graph POST $CreatePath $Body
  $script:identityState[$Key] = @{ id = $obj.id; appId = $obj.appId }
  Save-IdentityState
  return $obj
}
$sponsor = "https://graph.microsoft.com/v1.0/users/$SponsorObjectId"
$workforce = Ensure-Object 'workforce' 'applications' 'applications' @{
  displayName = "$AppName - Governance Console"; signInAudience = 'AzureADMyOrg'
  web = @{ redirectUris = @("https://$AppName.azurewebsites.net/.auth/login/aad/callback"); implicitGrantSettings = @{ enableIdTokenIssuance = $true } }
}
$null = Ensure-Object 'workforcePrincipal' 'servicePrincipals' 'servicePrincipals' @{ appId = $workforce.appId }
$roles = @(
  @{ id = 'bedba343-c637-4796-88da-9e136eb815ea'; allowedMemberTypes = @('Application'); description = 'Read fictional depot orders'; displayName = 'Read orders'; isEnabled = $true; value = 'Orders.Read' },
  @{ id = 'bedba343-c637-4796-88da-9e136eb815eb'; allowedMemberTypes = @('Application'); description = 'Create fictional depot purchase orders'; displayName = 'Create orders'; isEnabled = $true; value = 'Orders.Create' }
)
$tool = Ensure-Object 'tools' 'applications' 'applications' @{
  displayName = "$AppName - Orders API"; signInAudience = 'AzureADMyOrg'; appRoles = $roles; api = @{ requestedAccessTokenVersion = 2 }
}
$null = Invoke-Graph PATCH "applications/$($tool.id)" @{ identifierUris = @("api://$($tool.appId)") }
$toolPrincipal = Ensure-Object 'toolPrincipal' 'servicePrincipals' 'servicePrincipals' @{ appId = $tool.appId; appRoleAssignmentRequired = $true }
$blueprint = Ensure-Object 'blueprint' 'applications' 'applications/microsoft.graph.agentIdentityBlueprint' @{
  displayName = "$AppName - Procurement Blueprint"; 'sponsors@odata.bind' = @($sponsor); 'owners@odata.bind' = @($sponsor)
}
# Always check/create the principal separately, including when resuming a partial setup.
$null = Ensure-Object 'blueprintPrincipal' 'servicePrincipals' 'servicePrincipals/microsoft.graph.agentIdentityBlueprintPrincipal' @{ appId = $blueprint.appId }
foreach ($region in @('EU', 'US')) {
  $agent = Ensure-Object "agent$region" 'servicePrincipals' 'servicePrincipals/microsoft.graph.agentIdentity' @{
    displayName = "$AppName - Procurement $region"; agentIdentityBlueprintId = $blueprint.appId; 'sponsors@odata.bind' = @($sponsor)
  }
  # The agent identity's id is its OAuth client identifier; it has no separate application object.
  $assignments = Invoke-Graph GET "servicePrincipals/$($agent.id)/appRoleAssignments" $null
  $selected = if ($region -eq 'EU') { $roles } else { @($roles[0]) }
  foreach ($role in $selected) {
    if (-not ($assignments.value | Where-Object { $_.resourceId -eq $toolPrincipal.id -and $_.appRoleId -eq $role.id })) {
      $null = Invoke-Graph POST "servicePrincipals/$($agent.id)/appRoleAssignments" @{ principalId = $agent.id; resourceId = $toolPrincipal.id; appRoleId = $role.id }
    }
  }
}
$script:identityState.sponsorObjectId = $SponsorObjectId.ToString()
Save-IdentityState
Write-Host 'Created or verified workforce application, tool API, blueprint, blueprint principal, and two agents.'
Write-Host "Non-secret object IDs saved to $StatePath. No runtime agent has Graph directory administration permissions."
