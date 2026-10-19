targetScope = 'resourceGroup'

param location string = resourceGroup().location
param appName string
param tenantId string = tenant().tenantId
param workforceClientId string
param sponsorObjectId string
param deployerObjectId string = sponsorObjectId
param governanceAdminIds string
param deployedBy string
param deploymentSessionId string = 'aegean-demo'
param createdAt string = utcNow()
param enableDiagnostics bool = false
@allowed(['simulation', 'entra'])
param identityMode string = 'entra'
@allowed(['fixture', 'azure-openai', 'microsoft-agent-framework'])
param plannerMode string = 'fixture'
@allowed(['node', 'python'])
param applicationRuntime string = 'node'
param blueprintClientId string = ''
param blueprintPrincipalId string = ''
param toolClientId string = ''
param agentEuId string = ''
param agentUsId string = ''
param openAiEndpoint string = ''
param openAiDeployment string = ''

var suffix = uniqueString(resourceGroup().id)
var tags = {
  project: 'aegean-agent-governance'
  environment: 'demo'
  'deployed-by': deployedBy
  'app-onboard-skill': 'true'
  'app-onboard-session-id': deploymentSessionId
  'created-at': createdAt
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-aegean-${suffix}'
  location: location
  tags: tags
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-aeg-${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
    accessPolicies: []
  }
}
resource vaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, 'secrets-user')
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}
resource vaultWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, deployerObjectId, 'secrets-officer')
  scope: vault
  properties: {
    principalId: deployerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-aegean-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-aegean-${suffix}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}
resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: 'plan-aegean-${suffix}'
  location: location
  tags: tags
  kind: 'linux'
  sku: { name: 'P0v3', tier: 'PremiumV3', capacity: 1 }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: applicationRuntime == 'python' ? 'PYTHON|3.13' : 'NODE|24-lts'
      appCommandLine: applicationRuntime == 'python' ? 'python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1' : ''
      alwaysOn: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/healthz'
      appSettings: concat([
        { name: 'IDENTITY_MODE', value: identityMode }
        { name: 'PLANNER_MODE', value: plannerMode }
        { name: 'AZURE_TENANT_ID', value: tenantId }
        { name: 'WORKFORCE_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/workforce-client-secret/)' }
        { name: 'GOVERNANCE_ADMIN_IDS', value: governanceAdminIds }
        { name: 'SPONSOR_OBJECT_ID', value: sponsorObjectId }
        { name: 'MANAGED_IDENTITY_CLIENT_ID', value: identity.properties.clientId }
        { name: 'BLUEPRINT_CLIENT_ID', value: blueprintClientId }
        { name: 'BLUEPRINT_PRINCIPAL_ID', value: blueprintPrincipalId }
        { name: 'TOOL_CLIENT_ID', value: toolClientId }
        { name: 'AGENT_EU_CLIENT_ID', value: agentEuId }
        { name: 'AGENT_EU_PRINCIPAL_ID', value: agentEuId }
        { name: 'AGENT_US_CLIENT_ID', value: agentUsId }
        { name: 'AGENT_US_PRINCIPAL_ID', value: agentUsId }
        { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'AZURE_OPENAI_DEPLOYMENT', value: openAiDeployment }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: applicationRuntime == 'python' ? 'true' : 'false' }
        { name: 'DATA_FILE', value: '/home/data/aegean/state.json' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
      ], applicationRuntime == 'python' ? [
        { name: 'ENABLE_ORYX_BUILD', value: 'true' }
      ] : [
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
      ])
    }
  }
}
resource auth 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: app
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true, runtimeVersion: '~1' }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: ['/healthz', '/readyz']
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: workforceClientId
          clientSecretSettingName: 'WORKFORCE_CLIENT_SECRET'
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
        validation: { allowedAudiences: [workforceClientId, 'api://${workforceClientId}'] }
      }
    }
    login: { tokenStore: { enabled: true } }
    httpSettings: { requireHttps: true }
  }
}
resource scmAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}
resource ftpAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'app-audit'
  scope: app
  properties: {
    workspaceId: logs.id
    logs: [
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceHTTPLogs', enabled: true }
    ]
  }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output managedIdentityClientId string = identity.properties.clientId
output managedIdentityPrincipalId string = identity.properties.principalId
output vaultName string = vault.name
output appResourceId string = app.id
