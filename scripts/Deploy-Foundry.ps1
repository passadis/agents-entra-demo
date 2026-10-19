#Requires -Version 7.0
[CmdletBinding()]
param(
  [switch]$Apply,
  [guid]$SubscriptionId = '9d47bf93-091d-480e-a512-1e918864fee7',
  [string]$ResourceGroup = 'rg-aegean-agent-demo',
  [string]$Location = 'swedencentral',
  [string]$IdentityName = 'id-aegean-lcflylmsv3gzc',
  [string]$ModelName = 'gpt-5-mini',
  [string]$ModelVersion = '2025-08-07',
  [ValidateSet('DataZoneStandard','GlobalStandard')][string]$Sku = 'DataZoneStandard',
  [ValidateRange(1,1000)][int]$Capacity = 30
)
$ErrorActionPreference = 'Stop'
function Invoke-AzureCli { & az @args; if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($args[0]) $($args[1])" } }
$account = Invoke-AzureCli account show --subscription $SubscriptionId -o json | ConvertFrom-Json
if ($account.state -ne 'Enabled') { throw 'Subscription is not enabled' }
$group = Invoke-AzureCli group show --subscription $SubscriptionId --name $ResourceGroup -o json | ConvertFrom-Json
$identity = Invoke-AzureCli identity show --subscription $SubscriptionId --resource-group $ResourceGroup --name $IdentityName -o json | ConvertFrom-Json
$provider = Invoke-AzureCli provider show --subscription $SubscriptionId --namespace Microsoft.CognitiveServices --query registrationState -o tsv
if ($provider -ne 'Registered') { throw 'Register Microsoft.CognitiveServices before applying this template' }
$models = Invoke-AzureCli cognitiveservices model list --subscription $SubscriptionId --location $Location -o json | ConvertFrom-Json
$selected = @($models | Where-Object { $_.model.name -eq $ModelName -and $_.model.version -eq $ModelVersion -and $_.model.skus.name -contains $Sku })
if (-not $selected.Count) { throw 'Selected model/version/SKU is not offered in this region' }
$usage = Invoke-AzureCli cognitiveservices usage list --subscription $SubscriptionId --location $Location -o json | ConvertFrom-Json
$quota = $usage | Where-Object { $_.name.value -eq "OpenAI.$Sku.$ModelName" } | Select-Object -First 1
if (-not $quota -or ($quota.limit - $quota.currentValue) -lt $Capacity) { throw 'Insufficient unallocated quota for this deployment; inspect current deployments before proceeding' }
Write-Host "Subscription: $($account.name) ($SubscriptionId)"
Write-Host "Resource group: $ResourceGroup; Foundry region: $Location; existing group region: $($group.location)"
Write-Host "Foundry account + project + $ModelName/$ModelVersion ($Sku, capacity $Capacity) + model access for the existing host identity."
Write-Host 'Existing Web App, P0v3 plan, authentication, and Key Vault are untouched. Model inference is billed by usage.'
$parameters = @("managedIdentityPrincipalId=$($identity.principalId)","location=$Location","modelName=$ModelName","modelVersion=$ModelVersion","deploymentSku=$Sku","capacity=$Capacity")
$template = Join-Path $PSScriptRoot '../infra/foundry.bicep'
if (-not $Apply) {
  Invoke-AzureCli deployment group what-if --subscription $SubscriptionId --resource-group $ResourceGroup --name aegean-foundry --template-file $template --parameters @parameters
  Write-Host 'Preview only. Run the same script with -Apply to provision Foundry.'
  return
}
$result = Invoke-AzureCli deployment group create --subscription $SubscriptionId --resource-group $ResourceGroup --name aegean-foundry --template-file $template --parameters @parameters -o json | ConvertFrom-Json
if ($result.properties.provisioningState -ne 'Succeeded') { throw 'Foundry provisioning did not succeed' }
$configuration = @{ subscriptionId=$SubscriptionId.ToString(); resourceGroup=$ResourceGroup; location=$Location; deployedUtc=[DateTime]::UtcNow.ToString('o') }
foreach ($property in $result.properties.outputs.PSObject.Properties) { $configuration[$property.Name] = $property.Value.value }
$configuration | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../foundry-deployment.json') -Encoding utf8NoBOM
Write-Host 'Foundry provisioned. Non-secret outputs saved to foundry-deployment.json. Allow model-access RBAC to propagate before live validation.'
