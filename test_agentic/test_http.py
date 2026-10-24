import base64
import json
import httpx
import pytest
from backend.app import create_app
from .test_runtime import TestIdentity, Model, text

@pytest.mark.asyncio
async def test_hosted_api_requires_allowed_operator_and_rejects_foreign_origin(tmp_path):
    tenant = "test-tenant"
    env = {"WEBSITE_HOSTNAME": "example.azurewebsites.net", "IDENTITY_MODE": "entra", "AZURE_TENANT_ID": tenant,
           "GOVERNANCE_ADMIN_IDS": "admin-id", "SPONSOR_OBJECT_ID": "admin-id", "AGENTIC_DATA_FILE": str(tmp_path / "test.sqlite"), "DATA_FILE": str(tmp_path / "none.json")}
    app = create_app(env, Model([text()]).factory, TestIdentity())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://example.azurewebsites.net") as client:
        assert (await client.get("/healthz")).status_code == 200
        assert (await client.get("/api/state")).status_code == 403
        principal = base64.b64encode(json.dumps({"claims": [{"typ": "tid", "val": tenant}, {"typ": "oid", "val": "admin-id"}]}).encode()).decode()
        headers = {"x-ms-client-principal": principal}
        assert (await client.get("/api/state", headers=headers)).status_code == 200
        result = await client.post("/api/control", headers={**headers, "origin": "https://attacker.invalid"}, json={"target": "blueprint", "action": "toggle"})
        assert result.status_code == 403
        assert app.state.store.state["blueprint"]["enabled"]
        invalid = await client.post("/api/collaborate", headers=headers, json={"kind": "unrecognized-mission"})
        assert invalid.status_code == 400
        assert app.state.store.state["missions"] == []
        result = await client.get("/")
        assert result.status_code == 200 and "frame-ancestors 'none'" in result.headers["content-security-policy"]
    app.state.store.db.close()

@pytest.mark.asyncio
async def test_unexpected_api_errors_are_not_exposed(tmp_path):
    env = {"AGENTIC_DATA_FILE": str(tmp_path / "test.sqlite"), "DATA_FILE": str(tmp_path / "none.json")}
    app = create_app(env, identity=TestIdentity())

    def fail_approval(*args, **kwargs):
        raise RuntimeError("secret database connection details")

    app.state.runtime.approve = fail_approval
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://localhost") as client:
        response = await client.post("/api/approve", json={"runId": "test"})
    assert response.status_code == 500
    assert response.json() == {"error": "Internal server error"}
    app.state.store.db.close()
