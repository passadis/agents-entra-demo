#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][guid]$SubscriptionId,
  [Parameter(Mandatory)][guid]$TenantId,
  [Parameter(Mandatory)][guid]$SponsorObjectId,
  [string]$Location = 'westeurope',
  [string]$ResourceGroup = 'rg-aegean-agent-demo',
  [ValidatePattern('^[a-z0-9-]{2,60}$')][string]$AppName = 'app-aegean-agents-c6e08b90',
  [string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json')
)
$ErrorActionPreference = 'Stop'
function Invoke-AzureCli { & az @args; if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($args[0]) $($args[1])" } }
$root = Split-Path $PSScriptRoot
Invoke-AzureCli account set --subscription $SubscriptionId
$account = (Invoke-AzureCli account show -o json) | ConvertFrom-Json
if ($account.tenantId -ne $TenantId.ToString()) { throw 'Azure subscription belongs to a different tenant' }
$user = (Invoke-AzureCli ad signed-in-user show --query id -o tsv).Trim()
if ($user -ne $SponsorObjectId.ToString()) { throw 'Run this presentation deployment as its designated sponsor (the vault writer)' }
& (Join-Path $PSScriptRoot 'Provision-Identity.ps1') -TenantId $TenantId -SponsorObjectId $SponsorObjectId -AppName $AppName -StatePath $StatePath
$s = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
Invoke-AzureCli group create --name $ResourceGroup --location $Location --tags project=aegean-agent-governance environment=demo --output none
$params = @{
  appName = @{ value = $AppName }; workforceClientId = @{ value = $s.workforce.appId }; sponsorObjectId = @{ value = $SponsorObjectId.ToString() }
  governanceAdminIds = @{ value = $SponsorObjectId.ToString() }; deployedBy = @{ value = $account.user.name }; tenantId = @{ value = $TenantId.ToString() }
  blueprintClientId = @{ value = $s.blueprint.appId }; blueprintPrincipalId = @{ value = $s.blueprintPrincipal.id }; toolClientId = @{ value = $s.tools.appId }
  agentEuId = @{ value = $s.agentEU.id }; agentUsId = @{ value = $s.agentUS.id }
}
$paramFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$packageDir = Join-Path ([IO.Path]::GetTempPath()) ('aegean-' + [guid]::NewGuid())
$zipFile = "$packageDir.zip"
try {
  @{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = $params } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $paramFile -Encoding utf8NoBOM
  Invoke-AzureCli deployment group what-if --resource-group $ResourceGroup --template-file (Join-Path $root 'infra/main.bicep') --parameters "@$paramFile"
  $deployment = (Invoke-AzureCli deployment group create --name aegean-demo --resource-group $ResourceGroup --template-file (Join-Path $root 'infra/main.bicep') --parameters "@$paramFile" -o json) | ConvertFrom-Json
  $outputs = $deployment.properties.outputs
  & (Join-Path $PSScriptRoot 'Complete-Federation.ps1') -ManagedIdentityPrincipalId $outputs.managedIdentityPrincipalId.value -VaultName $outputs.vaultName.value -StatePath $StatePath
  $null = New-Item -ItemType Directory -Path $packageDir
  Copy-Item -LiteralPath (Join-Path $root 'src'), (Join-Path $root 'public'), (Join-Path $root 'package.json') -Destination $packageDir -Recurse
  [IO.Compression.ZipFile]::CreateFromDirectory($packageDir, $zipFile)
  Invoke-AzureCli webapp deploy --resource-group $ResourceGroup --name $AppName --src-path $zipFile --type zip --output none
  Invoke-AzureCli webapp restart --resource-group $ResourceGroup --name $AppName
  $healthy = $false
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try { $health = Invoke-RestMethod -Uri "$($outputs.appUrl.value)/healthz" -TimeoutSec 10; if ($health.status -eq 'ok') { $healthy = $true; break } } catch { Write-Host 'Waiting for app health...' }
    Start-Sleep -Seconds 10
  }
  if (-not $healthy) { throw 'App health did not become ready. Inspect App Service logs before presenting.' }
  Write-Host "Demo: $($outputs.appUrl.value)"
  Write-Host 'Sign in as the configured sponsor, run the routine scenario, and confirm LIVE ENTRA identity evidence.'
} finally {
  if (Test-Path -LiteralPath $paramFile) { Remove-Item -LiteralPath $paramFile -Force }
  if (Test-Path -LiteralPath $zipFile) { Remove-Item -LiteralPath $zipFile -Force }
  # Only remove the exact random temp directory created by this script.
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedPackage = [IO.Path]::GetFullPath($packageDir)
  if ($resolvedPackage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedPackage -Leaf) -like 'aegean-*' -and (Test-Path -LiteralPath $resolvedPackage)) { Remove-Item -LiteralPath $resolvedPackage -Recurse -Force }
}
