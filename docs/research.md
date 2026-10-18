# Entra ID and agentic development: research brief

Research checked against Microsoft Learn on **18 October 2026**. Preview availability, licensing, API capabilities, and tenant rollout vary. Consult the linked reference pages before provisioning. Microsoft documentation currently labels Entra Agent ID as preview. [Microsoft Entra Agent ID overview](https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id).

## Why agent identity matters

An agent is software that can select tools and take actions toward a goal. Model reasoning does not establish authority. An agent that can read an invoice does not automatically have authority to approve it, export supplier bank details, or spend money. Authentication, resource authorization, and business policy must remain outside the model's control.

Microsoft Entra ID is the directory and identity provider underlying this design. It represents people and software principals, issues OAuth access tokens, and supports access policies and audit records. Resource APIs validate those tokens and enforce authorization. Azure RBAC governs Azure resource access; Microsoft Graph application permissions, OAuth delegated scopes, and a custom API's app roles are separate permission systems. [Identity platform overview](https://learn.microsoft.com/en-us/entra/identity-platform/v2-overview), [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-overview), [Azure RBAC overview](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview).

## The object model

| Object | Purpose | Demo mapping |
|---|---|---|
| Agent identity blueprint | Application object defining an agent class, authentication configuration, credentials, and permission declarations | Procurement Operations |
| Blueprint principal | Service principal representing that blueprint in a tenant | Procurement blueprint principal |
| Agent identity | Specialized service principal representing an agent instance; no separate application object or stored per-agent credential | Piraeus and Newark agents |
| Agent user | Optional special user account for workloads that require a user presence, such as mailbox access | Deliberately not needed |
| Owner | Administrative relationship for managing the object | Setup administrator |
| Sponsor | Accountable person or supported group for purpose, lifecycle, and governance | Fictional Maya/Daniel; an explicit tenant sponsor in live deployment |

Credentials live on the blueprint. Individual agent identities use it as their authentication foundation while retaining distinct identity and authorization. Programmatic creation must explicitly ensure the blueprint principal exists; the admin center wizard creates both. Agent identity API `id` identifies the agent and is used as its client identifier in the flows here; do not substitute the blueprint application ID. [Blueprint concepts](https://learn.microsoft.com/en-us/entra/agent-id/agent-blueprint), [Blueprint creation](https://learn.microsoft.com/en-us/entra/agent-id/create-blueprint), [Agent resource schema](https://learn.microsoft.com/en-us/graph/api/resources/agentidentity?view=graph-rest-v1.0), [Administrative relationships](https://learn.microsoft.com/en-us/entra/agent-id/agent-owners-sponsors-managers).

An agent identity blueprint is not Azure Blueprints, an infrastructure template, or a prompt template. The local `maxAmount`, region, approval threshold, and review deadline in this app are **application policy**, not Graph blueprint properties.

## Authentication: autonomous and delegated agents

The demo uses an **autonomous application-only** flow. A human can approve the business action, but that does not make the downstream token a delegated user token. The action is executed as the agent. An attended agent can instead use an on-behalf-of flow with a real user token and delegated permissions; that flow is documented but not implemented here. [Autonomous authentication](https://learn.microsoft.com/en-us/entra/agent-id/autonomous-agent-authentication-authorization-flow), [On-behalf-of protocol](https://learn.microsoft.com/en-us/entra/agent-id/agent-on-behalf-of-oauth-flow).

For Azure hosting, the blueprint trusts a user-assigned managed identity through a federated identity credential. At runtime:

1. The host obtains a managed identity token for `api://AzureADTokenExchange` from App Service's local identity endpoint.
2. The blueprint requests T1 with `client_credentials`, that assertion, scope `api://AzureADTokenExchange/.default`, and `fmi_path=<agent-id>`.
3. The agent requests T2 with `client_id=<agent-id>`, T1 as its assertion, and the tool API's `/.default` scope.
4. The tool API verifies T2's signature, issuer, tenant, audience, validity, agent identifier, and required app role.

This is the documented agent client-credentials exchange, not a generic RFC 8693 token-exchange grant. An agent's identity is distinct from the Azure managed identity hosting the process. The managed identity authenticates the blueprint; the agent token identifies the actor at the tool boundary. [Autonomous authentication](https://learn.microsoft.com/en-us/entra/agent-id/autonomous-agent-authentication-authorization-flow), [Managed identity federation](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity).

## Declaration, consent, inheritance, and direct grants

The following are different things:

| Layer | Effect |
|---|---|
| Required resource access | Declares requested APIs and permissions for consent review; grants nothing itself |
| Inheritable permissions | Configures which resource permissions are eligible to flow from the blueprint principal |
| Administrator consent | Actually grants permissions |
| Direct agent grant | Authorizes a specific agent independently |
| Effective token permissions | Runtime result after the platform combines applicable grants and inheritance |

Current detailed documentation describes inheritance for both delegated scopes and application roles when the resource is eligible **and** consent has been granted. Inherited permissions may only be visible in issued tokens rather than as direct grants on each agent. Older summaries and skill guidance can differ; the detailed concept and API references take precedence for this research. This implementation uses **direct custom API application-role assignments** for predictable per-agent differences; it does not provision inheritable permissions. [Inheritable permissions](https://learn.microsoft.com/en-us/entra/agent-id/concept-inheritable-permissions), [Autonomous app-role grants](https://learn.microsoft.com/en-us/entra/agent-id/autonomous-agent-authentication-authorization-flow#grant-application-permissions).

The runtime agents receive no directory-management privileges and no Microsoft Graph data permissions. Piraeus receives `Orders.Read` and `Orders.Create`; Newark receives only `Orders.Read`. Setup privileges belong to the separate administrator session.

## Governance lifecycle

An organization's governance extends beyond acquiring a token:

1. Inventory the agent, blueprint, purpose, owner, sponsor, and data boundary.
2. Approve and grant the minimum resource access; keep setup permissions separate.
3. Apply relevant tenant Conditional Access policies and Identity Protection controls.
4. Review access, renew only when justified, and revoke access when its purpose ends.
5. Correlate agent sign-ins with application decisions, tool executions, and human approvals.
6. Disable or retire an individual agent, or disable a class through its blueprint controls.

Microsoft describes agent entitlement management, sponsor accountability, lifecycle workflows, and Conditional Access targeting by agent identity or blueprint. These native capabilities depend on product availability and licensing. The application lab illustrates the same concerns using local controls; it does not create those tenant features. [Governing agent identities](https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview), [Conditional Access for agents](https://learn.microsoft.com/en-us/entra/identity/conditional-access/agent-id).

Disabling an identity affects future authentication. Do not assume it immediately invalidates every existing bearer token or stops in-flight work. The application's own pause check is re-evaluated immediately before recording an action. Treat token caching, token lifetime, and resource-side enforcement as explicit design considerations.

## Security conclusions for this demo

- The model is a proposer. The host controls identity selection, token acquisition, policy, and execution.
- A signed token is necessary for a live tool call but insufficient to approve a purchase.
- A human approving an exact saved request does not grant the agent new OAuth roles.
- Prompt-injection resistance requires tool allowlists, data boundaries, and argument checks as well as model defenses. The malicious-note fixture proves one denied proposal, not comprehensive injection protection.
- A blueprint is a shared authentication trust boundary. Separate classes when compromise or administration should not affect both.
- Managed identity avoids a blueprint client secret. The separate workforce sign-in application in this design uses a short-lived secret stored in Key Vault; it must be rotated.

## Research limits

The linked official pages contain some inconsistent examples, including preview `beta` examples alongside available `v1.0` resource references, and broad inheritance descriptions alongside more precise consent conditions. The scripts follow the typed `v1.0` create endpoints in the Graph API references and use explicit grants. Automated tests validate protocol construction with mocks; only a tenant smoke test can establish end-to-end availability for a specific organization. [Blueprint API](https://learn.microsoft.com/en-us/graph/api/agentidentityblueprint-post?view=graph-rest-v1.0), [Agent API](https://learn.microsoft.com/en-us/graph/api/agentidentity-post?view=graph-rest-v1.0).
