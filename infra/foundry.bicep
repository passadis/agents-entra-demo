targetScope = 'resourceGroup'

param location string = resourceGroup().location
param accountName string = 'ai-aegean-${uniqueString(resourceGroup().id)}'
param projectName string = 'aegean-procurement'
param managedIdentityPrincipalId string
param deploymentName string = 'procurement-model'
param modelName string = 'gpt-5-mini'
param modelVersion string = '2025-08-07'
@allowed(['DataZoneStandard', 'GlobalStandard'])
param deploymentSku string = 'DataZoneStandard'
@minValue(1)
param capacity int = 30

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  tags: { project: 'aegean-agent-governance', environment: 'demo' }
  properties: {
    allowProjectManagement: true
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: projectName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Aegean procurement agents'
    description: 'Regional agent operations, governed with Entra Agent ID. Runtime hosted in the existing App Service.'
  }
}
resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: account
  // Foundry serializes account mutations: project creation and model deployment
  // must not run concurrently, even though both only reference the parent.
  dependsOn: [project]
  name: deploymentName
  sku: { name: deploymentSku, capacity: capacity }
  properties: {
    model: { format: 'OpenAI', name: modelName, version: modelVersion }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}
resource modelUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, managedIdentityPrincipalId, 'openai-user')
  scope: account
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  }
}
output foundryAccountName string = account.name
output foundryProjectName string = project.name
output openAiEndpoint string = 'https://${account.name}.openai.azure.com/'
output projectEndpoint string = 'https://${account.name}.services.ai.azure.com/api/projects/${project.name}'
output modelDeployment string = model.name
output accountResourceId string = account.id
