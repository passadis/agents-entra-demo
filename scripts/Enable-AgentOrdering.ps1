#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Authentication
[CmdletBinding()]
param([string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json'))
$ErrorActionPreference = 'Stop'
$state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
Connect-MgGraph -TenantId $state.tenantId -Scopes 'Application.Read.All','AppRoleAssignment.ReadWrite.All' -NoWelcome -ContextScope Process
if ((Get-MgContext).TenantId -ne $state.tenantId) { throw 'Wrong Graph tenant' }
function Graph([string]$Method,[string]$Path,$Body) {
  $request = @{ Method=$Method; Uri="https://graph.microsoft.com/v1.0/$Path"; Headers=@{'OData-Version'='4.0'}; OutputType='PSObject' }
  if ($null -ne $Body) { $request.Body=$Body|ConvertTo-Json; $request.ContentType='application/json' }
  Invoke-MgGraphRequest @request
}
$tools = Graph GET "applications/$($state.tools.id)" $null
$role = $tools.appRoles | Where-Object { $_.value -eq 'Orders.Create' -and $_.isEnabled -and $_.allowedMemberTypes -contains 'Application' }
if (-not $role -or @($role).Count -ne 1) { throw 'Expected exactly one enabled Orders.Create application role' }
foreach ($region in @('EU','US')) {
  $agentId = $state."agent$region".id
  $agent = Graph GET "servicePrincipals/$agentId/microsoft.graph.agentIdentity" $null
  if ($agent.agentIdentityBlueprintId -ne $state.blueprint.appId) { throw 'Agent belongs to an unexpected blueprint' }
  $grants = Graph GET "servicePrincipals/$agentId/appRoleAssignments" $null
  if (-not ($grants.value | Where-Object { $_.resourceId -eq $state.toolPrincipal.id -and $_.appRoleId -eq $role.id })) {
    $null = Graph POST "servicePrincipals/$agentId/appRoleAssignments" @{principalId=$agentId;resourceId=$state.toolPrincipal.id;appRoleId=$role.id}
    Write-Host "${region}: granted Orders.Create on the fictional Orders API."
  } else { Write-Host "${region}: Orders.Create already present." }
}
Write-Host 'Both existing agent identities can now create orders. Regional boundaries remain enforced by application policy.'
