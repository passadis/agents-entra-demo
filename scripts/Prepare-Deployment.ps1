#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json'),
  [string]$SessionPath = (Join-Path $PSScriptRoot '../.copilot-azure/sessions/a512fdde-1808-46e8-9f63-e8325790fa7d')
)
$ErrorActionPreference = 'Stop'
$state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$context = Get-Content -LiteralPath (Join-Path $SessionPath 'context.json') -Raw | ConvertFrom-Json
if ($state.tenantId -ne $context.azure.tenantId -or $state.sponsorObjectId -ne $context.azure.userObjectId) { throw 'Identity state does not match the deployment tenant and sponsor' }
foreach ($key in @('workforce', 'blueprint', 'blueprintPrincipal', 'tools', 'agentEU', 'agentUS')) {
  $parsedId = [guid]::Empty
  if (-not [guid]::TryParse($state.$key.id, [ref]$parsedId)) { throw "Missing or invalid $key object ID" }
}
foreach ($key in @('workforce', 'blueprint', 'tools')) {
  $parsedId = [guid]::Empty
  if (-not [guid]::TryParse($state.$key.appId, [ref]$parsedId)) { throw "Missing or invalid $key application ID" }
}
if ($state.agentEU.id -eq $state.agentUS.id) { throw 'The two agents must have distinct identities' }
$configuration = @{
  appName = $state.appName
  tenantId = $state.tenantId
  workforceClientId = $state.workforce.appId
  sponsorObjectId = $state.sponsorObjectId
  deployedBy = $state.sponsorObjectId
  blueprintClientId = $state.blueprint.appId
  blueprintPrincipalId = $state.blueprintPrincipal.id
  toolClientId = $state.tools.appId
  agentEuId = $state.agentEU.id
  agentUsId = $state.agentUS.id
}
$parameters = @{
  '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
  contentVersion = '1.0.0.0'
  parameters = @{
    resourceGroupName = @{ value = $context.azure.resourceGroup }
    location = @{ value = $context.azure.region }
    application = @{ value = $configuration }
    deploymentSessionId = @{ value = $context.sessionId }
  }
}
$outputPath = Join-Path $SessionPath 'deployment.parameters.json'
$parameters | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding utf8NoBOM
Write-Host "Prepared non-secret deployment parameters: $outputPath"
Write-Host 'No Azure or Entra resources were modified. Existing directory objects still need live verification.'
