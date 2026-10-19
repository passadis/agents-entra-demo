#Requires -Version 7.0
[CmdletBinding()]
param(
  [switch]$Rollback,
  [guid]$SubscriptionId='9d47bf93-091d-480e-a512-1e918864fee7',
  [string]$ResourceGroup='rg-aegean-agent-demo',
  [string]$AppName='app-aegean-agents-c6e08b90',
  [string]$FoundryPath=(Join-Path $PSScriptRoot '../foundry-deployment.json')
)
$ErrorActionPreference='Stop'
function Invoke-AzureCli { & az @args; if($LASTEXITCODE -ne 0){throw "Azure CLI failed: $($args[0]) $($args[1])"} }
$root=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
$snapshotPath=Join-Path $root 'artifacts/agentic-rollback.json'
$configFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$settingsFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$target=@('--subscription',$SubscriptionId.ToString(),'--resource-group',$ResourceGroup,'--name',$AppName)
try {
  if($Rollback) {
    if(-not (Test-Path $snapshotPath)){throw 'No saved pre-migration configuration exists'}
    $snapshot=Get-Content $snapshotPath -Raw|ConvertFrom-Json
    if($snapshot.appName -ne $AppName -or $snapshot.resourceGroup -ne $ResourceGroup -or $snapshot.subscriptionId -ne $SubscriptionId.ToString()){throw 'Rollback snapshot belongs to another app'}
    $package=Join-Path $root 'artifacts/aegean-app.zip'
    if(-not (Test-Path $package)){throw 'Original Node ZIP is missing; do not switch the runtime'}
    [IO.File]::WriteAllText($configFile,($snapshot.config|ConvertTo-Json))
    $restoreSettings=@{}
    foreach($property in $snapshot.settings.PSObject.Properties){$restoreSettings[$property.Name]=$property.Value}
    if(-not $restoreSettings.ContainsKey('ENABLE_ORYX_BUILD')){$restoreSettings.ENABLE_ORYX_BUILD='false'}
    [IO.File]::WriteAllText($settingsFile,($restoreSettings|ConvertTo-Json))
  } else {
    $foundry=Get-Content -LiteralPath $FoundryPath -Raw|ConvertFrom-Json
    if($foundry.subscriptionId -ne $SubscriptionId.ToString() -or $foundry.resourceGroup -ne $ResourceGroup){throw 'Foundry outputs target a different subscription/resource group'}
    $package=Join-Path $root 'artifacts/aegean-agentic.zip'
    if(-not (Test-Path $package)){throw 'Run scripts/Package-Agentic.ps1 first'}
    $runtimeInventory=Invoke-AzureCli webapp list-runtimes --os linux -o json|ConvertFrom-Json
    if(-not ($runtimeInventory|Where-Object { $_.config -eq 'python|3.13' })){throw 'Python 3.13 runtime is not listed by Azure CLI; inspect supported runtimes before switching'}
    if(-not (Test-Path $snapshotPath)) {
      $config=Invoke-AzureCli webapp config show @target --query '{linuxFxVersion:linuxFxVersion,appCommandLine:appCommandLine}' -o json|ConvertFrom-Json
      $settings=Invoke-AzureCli webapp config appsettings list @target --query "[?name=='PLANNER_MODE' || name=='WEBSITE_RUN_FROM_PACKAGE' || name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='ENABLE_ORYX_BUILD']" -o json|ConvertFrom-Json
      $saved=@{};foreach($setting in $settings){$saved[$setting.name]=$setting.value}
      if(-not $saved.ContainsKey('SCM_DO_BUILD_DURING_DEPLOYMENT')){$saved.SCM_DO_BUILD_DURING_DEPLOYMENT='false'}
      @{subscriptionId=$SubscriptionId.ToString();resourceGroup=$ResourceGroup;appName=$AppName;config=$config;settings=$saved}|ConvertTo-Json -Depth 5|Set-Content $snapshotPath -Encoding utf8NoBOM
    }
    [IO.File]::WriteAllText($configFile,(@{linuxFxVersion='PYTHON|3.13';appCommandLine='python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1'}|ConvertTo-Json))
    [IO.File]::WriteAllText($settingsFile,(@{AZURE_OPENAI_ENDPOINT=$foundry.openAiEndpoint;AZURE_OPENAI_DEPLOYMENT=$foundry.modelDeployment;PLANNER_MODE='microsoft-agent-framework';SCM_DO_BUILD_DURING_DEPLOYMENT='true';ENABLE_ORYX_BUILD='true'}|ConvertTo-Json))
  }
  Write-Host "Updating existing app $AppName. The URL, P0v3 plan, workforce authentication and managed identity remain in place. A restart is expected."
  Invoke-AzureCli webapp config appsettings set @target --settings "@$settingsFile" --output none
  Invoke-AzureCli webapp config set @target --generic-configurations "@$configFile" --output none
  if(-not $Rollback){
    # Python needs an extracted remote build. Even a retained value of '0' left
    # this migrated site in Run-From-Zip mode and skipped all dependencies.
    Invoke-AzureCli webapp config appsettings delete @target --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_ZIP --output none
    $flags=Invoke-AzureCli webapp config appsettings list @target --query "[?name=='WEBSITE_RUN_FROM_PACKAGE' || name=='WEBSITE_RUN_FROM_ZIP' || name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='ENABLE_ORYX_BUILD']" -o json|ConvertFrom-Json
    if($flags|Where-Object {$_.name -in @('WEBSITE_RUN_FROM_PACKAGE','WEBSITE_RUN_FROM_ZIP')}){throw 'Run-from-package settings remain; no new deployment was submitted'}
    foreach($requiredFlag in @('SCM_DO_BUILD_DURING_DEPLOYMENT','ENABLE_ORYX_BUILD')){
      if(-not ($flags|Where-Object {$_.name -eq $requiredFlag -and $_.value -in @('true','1')})){throw "Required remote-build flag is missing: $requiredFlag"}
    }
    Write-Host 'Python remote build enabled; run-from-package flags removed. Oryx will install requirements.txt.'
  }
  # Kudu still reports build/deployment errors. Check readiness ourselves below:
  # the CLI startup tracker reported an old worker failure even after the new
  # worker and platform startup probe had succeeded (91707df5-fc14-4368-91df-c060b89eb2ce).
  Invoke-AzureCli webapp deploy @target --src-path $package --type zip --restart true --track-status false --output none
  Write-Host 'Deployment completed. Verifying application readiness through /healthz...'
  $healthy=$false
  for($attempt=0;$attempt -lt 24;$attempt++) {
    try {
      $health=Invoke-RestMethod "https://$AppName.azurewebsites.net/healthz" -TimeoutSec 10
      if($health.status -eq 'ok' -and $health.mode -eq 'entra' -and ($Rollback -or ($health.runtime -eq 'microsoft-agent-framework' -and $health.modelConfigured))){$healthy=$true;break}
    } catch { Write-Host 'Waiting for application startup...' }
    Start-Sleep -Seconds 5
  }
  if(-not $healthy){throw 'Health verification failed; inspect deployment logs. Roll back with scripts/Publish-Agentic.ps1 -Rollback if needed.'}
  Write-Host "Healthy: https://$AppName.azurewebsites.net/"
  if(-not $Rollback){Write-Host 'Health proves startup/configuration. Next validate both regional replenishment runs and both sponsor approval flows in the browser.'}
} finally {
  foreach($temporary in @($configFile,$settingsFile)){if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}
}
