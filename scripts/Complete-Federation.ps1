#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Authentication
[CmdletBinding()]
param(
  [Parameter(Mandatory)][guid]$ManagedIdentityPrincipalId,
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$VaultName,
  [string]$StatePath = (Join-Path $PSScriptRoot '../identity-state.json')
)
$ErrorActionPreference = 'Stop'
$s = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
Connect-MgGraph -TenantId $s.tenantId -Scopes 'AgentIdentityBlueprint.AddRemoveCreds.All','Application.ReadWrite.All' -NoWelcome -ContextScope Process
$root = "https://graph.microsoft.com/v1.0/applications/$($s.blueprint.id)/microsoft.graph.agentIdentityBlueprint/federatedIdentityCredentials"
$headers = @{ 'OData-Version' = '4.0' }
$existing = Invoke-MgGraphRequest -Method GET -Uri $root -Headers $headers -OutputType PSObject
$fic = $existing.value | Where-Object name -eq 'azure-app-service'
if ($fic) {
  if ($fic.subject -ne $ManagedIdentityPrincipalId.ToString() -or $fic.issuer -ne "https://login.microsoftonline.com/$($s.tenantId)/v2.0") { throw 'Existing federation does not match this managed identity' }
} else {
  $body = @{ name = 'azure-app-service'; issuer = "https://login.microsoftonline.com/$($s.tenantId)/v2.0"; subject = $ManagedIdentityPrincipalId.ToString(); audiences = @('api://AzureADTokenExchange') }
  $null = Invoke-MgGraphRequest -Method POST -Uri $root -Headers $headers -Body ($body | ConvertTo-Json) -ContentType 'application/json'
}
# This is a workforce web sign-in credential, not an agent blueprint secret.
# Reuse the vault secret until explicitly rotated; never print it or include it in CLI arguments.
$secretInventory = $null
for ($attempt = 0; $attempt -lt 6; $attempt++) {
  $secretList = & az keyvault secret list --vault-name $VaultName --query "[?name=='workforce-client-secret'].id" -o json 2>$null
  if ($LASTEXITCODE -eq 0) { $secretInventory = $secretList | ConvertFrom-Json -NoEnumerate; break }
  Write-Host 'Waiting for Key Vault data-plane access...'
  Start-Sleep -Seconds 10
}
if ($null -eq $secretInventory) { throw 'Could not list vault secret metadata; verify Secrets Officer access before generating any credential' }
if (@($secretInventory).Count -eq 0) {
  $body = @{ passwordCredential = @{ displayName = 'Aegean workforce login'; endDateTime = [DateTime]::UtcNow.AddDays(90).ToString('o') } }
  $credential = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/applications/$($s.workforce.id)/addPassword" -Body ($body | ConvertTo-Json -Depth 4) -ContentType 'application/json' -OutputType PSObject
  $secretFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
  try {
    [IO.File]::WriteAllText($secretFile, $credential.secretText)
    & az keyvault secret set --vault-name $VaultName --name workforce-client-secret --file $secretFile --query id -o tsv
    if ($LASTEXITCODE -ne 0) {
      $removeBody = @{ keyId = $credential.keyId } | ConvertTo-Json
      $null = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/applications/$($s.workforce.id)/removePassword" -Body $removeBody -ContentType 'application/json'
      throw 'Could not store workforce credential; removed the newly generated application password. Check Key Vault access and retry.'
    }
  } finally {
    if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
    $credential = $null
  }
}
Write-Host 'Federation configured. Workforce secret is stored in Key Vault and expires after 90 days; rotate before expiry.'
