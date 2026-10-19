import time
from types import SimpleNamespace
import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from backend.identity import Identity

@pytest.mark.asyncio
@pytest.mark.parametrize("alteration", [{}, {"oid": "another-agent"}, {"roles": ["Orders.Read"]}, {"aud": "wrong-api"}, {"exp": 1}])
async def test_real_exchange_forms_and_signed_jwt_validation(monkeypatch, alteration):
    tenant = "35de4c50-7dcd-4871-8685-61789c017da2"
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    claims = {"oid": "agent-eu", "azp": "agent-eu", "aud": "api-client", "tid": tenant, "ver": "2.0", "iss": f"https://login.microsoftonline.com/{tenant}/v2.0",
              "exp": int(time.time()) + 60, "nbf": int(time.time()) - 5, "roles": ["Orders.Read", "Orders.Create"], **alteration}
    signed = jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})
    identity = object.__new__(Identity)
    identity.mode = "entra"
    identity.env = {"AZURE_TENANT_ID": tenant, "BLUEPRINT_CLIENT_ID": "blueprint", "TOOL_CLIENT_ID": "api-client"}
    async def managed(scope):
        assert scope == "api://AzureADTokenExchange/.default"
        return SimpleNamespace(token="managed-assertion")
    identity.credential = SimpleNamespace(get_token=managed)
    identity.jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key()))
    requests = []
    def respond(request):
        from urllib.parse import parse_qs
        requests.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"access_token": "blueprint-token" if len(requests) == 1 else signed})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    agent = {"clientId": "agent-eu", "principalId": "agent-eu"}
    if alteration:
        with pytest.raises((PermissionError, jwt.PyJWTError)):
            await identity.authorize(agent, "Orders.Create")
    else:
        result = await identity.authorize(agent, "Orders.Create")
        assert result["oid"] == "agent-eu"
    assert requests[0]["fmi_path"] == ["agent-eu"]
    assert requests[0]["client_assertion"] == ["managed-assertion"]
    assert requests[1]["client_assertion"] == ["blueprint-token"]
    assert requests[1]["scope"] == ["api://api-client/.default"]
