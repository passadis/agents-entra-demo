targetScope = 'subscription'

param resourceGroupName string = 'rg-aegean-agent-demo'
param location string = 'swedencentral'
@description('Non-secret application configuration prepared from identity-state.json.')
param application object
param deploymentSessionId string = 'a512fdde-1808-46e8-9f63-e8325790fa7d'
@allowed(['node', 'python'])
param applicationRuntime string = 'node'
@allowed(['fixture', 'azure-openai', 'microsoft-agent-framework'])
param plannerMode string = 'fixture'
param openAiEndpoint string = ''
param openAiDeployment string = ''

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    project: 'aegean-agent-governance'
    environment: 'demo'
    'deployed-by': application.deployedBy
    'app-onboard-session-id': deploymentSessionId
  }
}

module app './main.bicep' = {
  name: 'aegean-application'
  scope: group
  params: {
    location: location
    appName: application.appName
    tenantId: application.tenantId
    workforceClientId: application.workforceClientId
    sponsorObjectId: application.sponsorObjectId
    governanceAdminIds: application.sponsorObjectId
    deployedBy: application.deployedBy
    deploymentSessionId: deploymentSessionId
    blueprintClientId: application.blueprintClientId
    blueprintPrincipalId: application.blueprintPrincipalId
    toolClientId: application.toolClientId
    agentEuId: application.agentEuId
    agentUsId: application.agentUsId
    identityMode: 'entra'
    plannerMode: plannerMode
    applicationRuntime: applicationRuntime
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
  }
}

output appUrl string = app.outputs.appUrl
output managedIdentityClientId string = app.outputs.managedIdentityClientId
output managedIdentityPrincipalId string = app.outputs.managedIdentityPrincipalId
output vaultName string = app.outputs.vaultName
output appResourceId string = app.outputs.appResourceId
