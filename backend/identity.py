"""Actual Entra blueprint -> agent token exchange; local mode is explicitly labelled."""
import asyncio
from time import time
from uuid import UUID
import httpx
import jwt
from azure.identity.aio import ManagedIdentityCredential

ASSERTION = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

class Identity:
    def __init__(self, env):
        self.env = env
        self.mode = env.get("IDENTITY_MODE", "simulation")
        if self.mode not in ["entra", "simulation"]:
            raise ValueError("Unsupported identity mode")
        self.credential = None
        if self.mode == "entra":
            for key in ["AZURE_TENANT_ID", "BLUEPRINT_CLIENT_ID", "TOOL_CLIENT_ID", "MANAGED_IDENTITY_CLIENT_ID", "AGENT_EU_CLIENT_ID", "AGENT_US_CLIENT_ID", "AGENT_EU_PRINCIPAL_ID", "AGENT_US_PRINCIPAL_ID"]:
                UUID(env[key])
            self.credential = ManagedIdentityCredential(client_id=env["MANAGED_IDENTITY_CLIENT_ID"])
            self.jwks = jwt.PyJWKClient(f"https://login.microsoftonline.com/{env['AZURE_TENANT_ID']}/discovery/v2.0/keys")

    async def authorize(self, agent, role):
        if self.mode == "simulation":
            return {"oid": agent["principalId"], "azp": agent["clientId"], "aud": "local-demo-tools", "roles": agent["roles"], "exp": int(time()) + 60}
        managed = await self.credential.get_token("api://AzureADTokenExchange/.default")
        endpoint = f"https://login.microsoftonline.com/{self.env['AZURE_TENANT_ID']}/oauth2/v2.0/token"
        async with httpx.AsyncClient(timeout=20) as client:
            async def token(form):
                response = await client.post(endpoint, data={"grant_type": "client_credentials", "client_assertion_type": ASSERTION, **form})
                if response.is_error:
                    # Never include token endpoint bodies/assertions in browser logs.
                    raise PermissionError(f"Entra token exchange returned HTTP {response.status_code}; inspect tenant sign-in logs")
                return response.json()["access_token"]
            t1 = await token({"client_id": self.env["BLUEPRINT_CLIENT_ID"], "scope": "api://AzureADTokenExchange/.default", "fmi_path": agent["clientId"], "client_assertion": managed.token})
            t2 = await token({"client_id": agent["clientId"], "scope": f"api://{self.env['TOOL_CLIENT_ID']}/.default", "client_assertion": t1})
        def validate():
            key = self.jwks.get_signing_key_from_jwt(t2)
            return jwt.decode(t2, key.key, algorithms=["RS256"], audience=self.env["TOOL_CLIENT_ID"],
                              issuer=f"https://login.microsoftonline.com/{self.env['AZURE_TENANT_ID']}/v2.0",
                              options={"require": ["exp", "nbf", "iss", "aud", "tid", "oid", "azp", "ver"]})
        claims = await asyncio.to_thread(validate)
        if claims["tid"] != self.env["AZURE_TENANT_ID"] or claims["ver"] != "2.0" or claims["oid"] != agent["principalId"] or claims["azp"] != agent["clientId"] or not isinstance(claims.get("roles"), list) or role not in claims["roles"]:
            raise PermissionError("Tool rejected the agent identity or required API role")
        return claims

    async def close(self):
        if self.credential:
            await self.credential.close()
