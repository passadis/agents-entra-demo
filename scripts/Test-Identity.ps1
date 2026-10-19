#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Authentication
[CmdletBinding()]
param(
  [switch]$BothAgentsCanOrder,
  [string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json'),
  [string]$SessionPath = (Join-Path $PSScriptRoot '../.copilot-azure/sessions/a512fdde-1808-46e8-9f63-e8325790fa7d')
)
$ErrorActionPreference = 'Stop'
$state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
# Read permission suffices for all three object classes and direct app-role assignments.
Connect-MgGraph -TenantId $state.tenantId -Scopes 'Application.Read.All' -NoWelcome -ContextScope Process
if ((Get-MgContext).TenantId -ne $state.tenantId) { throw 'Graph signed into the wrong tenant' }
$checks = [System.Collections.Generic.List[object]]::new()
function Get-Graph([string]$Path) {
  Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/$Path" -Headers @{ 'OData-Version' = '4.0' } -OutputType PSObject
}
function Check([string]$Name, [bool]$Passed, [string]$Detail = '') {
  $checks.Add([pscustomobject]@{ name = $Name; passed = $Passed; detail = $Detail })
}
try {
  $workforce = Get-Graph "applications/$($state.workforce.id)"
  Check 'Workforce application ID' ($workforce.appId -eq $state.workforce.appId)
  $callback = "https://$($state.appName).azurewebsites.net/.auth/login/aad/callback"
  Check 'Workforce sign-in callback' ($workforce.web.redirectUris -contains $callback)
  $tools = Get-Graph "applications/$($state.tools.id)"
  Check 'Tool application ID' ($tools.appId -eq $state.tools.appId)
  Check 'Tool API requests v2 tokens' ($tools.api.requestedAccessTokenVersion -eq 2)
  Check 'Tool API audience URI' ($tools.identifierUris -contains "api://$($state.tools.appId)")
  $blueprint = Get-Graph "applications/$($state.blueprint.id)/microsoft.graph.agentIdentityBlueprint"
  Check 'Typed agent identity blueprint' ($blueprint.appId -eq $state.blueprint.appId)
  $principal = Get-Graph "servicePrincipals/$($state.blueprintPrincipal.id)/microsoft.graph.agentIdentityBlueprintPrincipal"
  Check 'Blueprint principal' ($principal.appId -eq $state.blueprint.appId -and $principal.accountEnabled -ne $false)
  $toolPrincipal = Get-Graph "servicePrincipals/$($state.toolPrincipal.id)"
  Check 'Tool resource principal' ($toolPrincipal.appId -eq $state.tools.appId)
  $workforcePrincipal = Get-Graph "servicePrincipals/$($state.workforcePrincipal.id)"
  Check 'Workforce principal' ($workforcePrincipal.appId -eq $state.workforce.appId)
  foreach ($region in @('EU', 'US')) {
    $id = $state."agent$region".id
    $agent = Get-Graph "servicePrincipals/$id/microsoft.graph.agentIdentity"
    Check "$region agent blueprint binding" ($agent.agentIdentityBlueprintId -eq $state.blueprint.appId -and $agent.accountEnabled -ne $false)
    $sponsors = Get-Graph "servicePrincipals/$id/sponsors"
    Check "$region sponsor relationship" ([bool]($sponsors.value | Where-Object id -eq $state.sponsorObjectId))
    $grants = Get-Graph "servicePrincipals/$id/appRoleAssignments"
    $effectiveRoles = @($grants.value | Where-Object resourceId -eq $state.toolPrincipal.id | ForEach-Object {
      $roleId = $_.appRoleId
      $tools.appRoles | Where-Object { $_.id -eq $roleId -and $_.isEnabled -and $_.allowedMemberTypes -contains 'Application' } | ForEach-Object value
    })
    Check "$region Orders.Read grant" ($effectiveRoles -contains 'Orders.Read')
    $expectCreate = $BothAgentsCanOrder -or $region -eq 'EU'
    Check "$region Orders.Create grant matches policy" (($expectCreate -and $effectiveRoles -contains 'Orders.Create') -or (-not $expectCreate -and $effectiveRoles -notcontains 'Orders.Create'))
  }
} catch {
  Check 'Directory lookup' $false $_.Exception.Message
}
$passed = @($checks | Where-Object { -not $_.passed }).Count -eq 0
$report = @{ checkedUtc = [DateTime]::UtcNow.ToString('o'); passed = $passed; tenantId = $state.tenantId; checks = @($checks) }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $SessionPath 'identity-verification.json') -Encoding utf8NoBOM
$checks | Format-Table name,passed,detail -Wrap
if (-not $passed) { throw 'Identity verification failed. No resources were modified; inspect the failed checks before provisioning.' }
Write-Host 'Identity verification PASSED. No Azure or Entra resources were modified.'
