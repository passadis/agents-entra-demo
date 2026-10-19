#Requires -Version 7.0
[CmdletBinding()]
param(
  [guid]$SubscriptionId = '9d47bf93-091d-480e-a512-1e918864fee7',
  [string]$ResourceGroup = 'rg-aegean-agent-demo',
  [ValidatePattern('^[a-z0-9-]{2,60}$')][string]$AppName = 'app-aegean-agents-c6e08b90',
  [string]$PackagePath = (Join-Path $PSScriptRoot '../artifacts/aegean-app.zip'),
  [string]$SessionPath = (Join-Path $PSScriptRoot '../.copilot-azure/sessions/a512fdde-1808-46e8-9f63-e8325790fa7d')
)
$ErrorActionPreference = 'Stop'
function Invoke-AzureCli {
  & az @args
  if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($args[0]) $($args[1])" }
}
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw 'Application ZIP is missing. Run scripts/Package-App.ps1 first.' }
$resourceId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$AppName"
$resultPath = Join-Path $SessionPath 'application-publish-result.json'
$result = @{
  status = 'in-progress'; startedUtc = [DateTime]::UtcNow.ToString('o'); appName = $AppName
  subscriptionId = $SubscriptionId.ToString(); resourceGroup = $ResourceGroup
  packageSha256 = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash
  url = "https://$AppName.azurewebsites.net"; keyVaultReferenceStatus = 'unknown'
  healthStatus = 'unknown'; liveAgentTokenExchange = 'pending browser smoke test'
}
try {
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8NoBOM
  Write-Host 'Refreshing App Service Key Vault references...'
  Invoke-AzureCli rest --method post --url "https://management.azure.com$resourceId/config/configreferences/appsettings/refresh?api-version=2024-11-01" --output none
  $resolved = $false
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    $reference = Invoke-AzureCli rest --method get --url "https://management.azure.com$resourceId/config/configreferences/appsettings?api-version=2024-11-01" --query "value[?name=='WORKFORCE_CLIENT_SECRET'].properties.status | [0]" -o tsv
    $result.keyVaultReferenceStatus = ($reference | Out-String).Trim()
    if ($result.keyVaultReferenceStatus -eq 'Resolved') { $resolved = $true; break }
    Write-Host "Reference status: $($result.keyVaultReferenceStatus). Waiting for propagation..."
    Start-Sleep -Seconds 5
  }
  if (-not $resolved) { throw "Workforce sign-in secret reference did not resolve ($($result.keyVaultReferenceStatus)); no package was uploaded." }
  Write-Host 'Key Vault reference resolved. Publishing application ZIP...'
  Invoke-AzureCli webapp deploy --subscription $SubscriptionId --resource-group $ResourceGroup --name $AppName --src-path $PackagePath --type zip --restart true --track-status true --output json
  Write-Host 'Checking application health...'
  $healthy = $false
  for ($attempt = 0; $attempt -lt 18; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "$($result.url)/healthz" -TimeoutSec 10
      if ($health.status -eq 'ok' -and $health.mode -eq 'entra') { $healthy = $true; break }
    } catch { Write-Host 'Waiting for the application to start...' }
    Start-Sleep -Seconds 5
  }
  if (-not $healthy) { throw 'The uploaded application did not report healthy Entra mode. Inspect App Service logs before retrying.' }
  $result.status = 'succeeded'; $result.healthStatus = 'healthy'; $result.identityMode = 'entra'
  Write-Host "Application published and healthy: $($result.url)"
  Write-Host 'Next: sign in as the configured sponsor and run Routine replenishment to verify the live agent exchange.'
} catch {
  $result.status = 'failed'; $result.error = $_.Exception.Message
  throw
} finally {
  $result.completedUtc = [DateTime]::UtcNow.ToString('o')
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8NoBOM
}
