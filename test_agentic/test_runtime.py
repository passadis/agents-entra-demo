"""Actual framework loop and approval binding against a scripted model HTTP service.

No live inference or Entra calls are made by this suite. It tests the integration,
not model intelligence or tenant consent.
"""
import asyncio
import json
import time
import httpx2
import pytest
from openai import AsyncOpenAI
from agent_framework.openai import OpenAIChatClient
from backend.runtime import Runtime
from backend.store import Store

class TestIdentity:
    __test__ = False
    mode = "entra"
    def __init__(self):
        self.calls = []
    async def authorize(self, agent, role):
        self.calls.append((agent["id"], role))
        return {"oid": agent["principalId"], "azp": agent["clientId"], "roles": agent["roles"], "aud": "tools", "exp": int(time.time()) + 60}
    async def close(self):
        pass

def call(name, **arguments):
    return {"type": "function_call", "name": name, "arguments": json.dumps(arguments), "call_id": "call_" + name, "id": "fc_" + name, "status": "completed"}

def text(value="Done"):
    return {"type": "message", "id": "msg_done", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": value, "annotations": []}]}

class Model:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.requests = []
    def factory(self):
        def respond(request):
            self.requests.append(json.loads(request.content))
            assert self.outputs, "Framework made an unexpected model call"
            return httpx2.Response(200, json={"id": f"resp_{len(self.requests)}", "object": "response", "created_at": 1,
                                             "status": "completed", "model": "scripted-test-model", "output": [self.outputs.pop(0)],
                                             "usage": {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20}})
        return OpenAIChatClient(model="scripted-test-model", async_client=AsyncOpenAI(api_key="unit-test-only", base_url="https://model.invalid/v1",
                                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(respond))),
                                function_invocation_configuration={"max_iterations": 8})

async def finish(runtime):
    await asyncio.gather(*list(runtime.tasks))
    if hasattr(runtime, "last_error") and not isinstance(runtime.last_error, (PermissionError, ValueError)):
        raise runtime.last_error

def runtime_at(tmp_path, model, identity=None):
    env = {"AGENTIC_DATA_FILE": str(tmp_path / "agentic.sqlite"), "DATA_FILE": str(tmp_path / "no-legacy.json")}
    store = Store(env["AGENTIC_DATA_FILE"], env)
    return Runtime(store, identity or TestIdentity(), env, model.factory)

@pytest.mark.asyncio
@pytest.mark.parametrize("agent_id,region,offer,total", [("piraeus", "EU", "EU-SEAL-FAST", 420), ("newark", "US", "US-SEAL-FAST", 380)])
async def test_both_agents_use_framework_tools_and_distinct_identity(tmp_path, agent_id, region, offer, total):
    model = Model([call("get_depot_status", region=region), call("compare_supplier_offers", region=region, sku="safety-seals"),
                   call("place_standard_order", offer_id=offer, quantity=100, region=region), text()])
    runtime = runtime_at(tmp_path, model)
    run = runtime.launch(agent_id, "local-demo-sponsor", case_id="routine")
    await finish(runtime)
    assert run["status"] == "completed", run["trace"]
    assert len(runtime.store.state["orders"]) == 1
    order = runtime.store.state["orders"][0]
    assert order["region"] == region and order["amount"] == total
    assert run["tokenEvidence"]["oid"] == runtime.store.agent(agent_id)["principalId"]
    assert len(runtime.identity.calls) == 3
    assert len(model.requests) == 4
    assert "checkpoint" not in runtime.store.public()["runs"][0]
    runtime.store.db.close()

@pytest.mark.asyncio
async def test_approval_survives_restart_and_cannot_replay(tmp_path):
    model = Model([call("get_depot_status", region="US"), call("compare_supplier_offers", region="US", sku="engine-sensor"),
                   call("place_approved_order", offer_id="US-SENSOR", quantity=1, region="US"), text()])
    runtime = runtime_at(tmp_path, model)
    run = runtime.launch("newark", "local-demo-sponsor", case_id="approval")
    await finish(runtime)
    assert run["status"] == "awaiting_approval", run["trace"]
    assert runtime.store.state["orders"] == []
    assert run["approvalRequests"][0]["amount"] == 2250
    run_id = run["id"]
    runtime.store.db.close()
    resumed = runtime_at(tmp_path, model)
    resumed.approve(run_id, "local-demo-sponsor")
    await finish(resumed)
    assert resumed.store.run(run_id)["status"] == "completed", resumed.store.run(run_id)["trace"]
    assert len(resumed.store.state["orders"]) == 1
    with pytest.raises(ValueError, match="not awaiting"):
        resumed.approve(run_id, "local-demo-sponsor")
    resumed.store.db.close()

@pytest.mark.asyncio
async def test_wrong_sponsor_and_suspension_cannot_be_overridden(tmp_path):
    model = Model([call("place_approved_order", offer_id="EU-SENSOR", quantity=1, region="EU")])
    runtime = runtime_at(tmp_path, model)
    run = runtime.launch("piraeus", "local-demo-sponsor", case_id="approval")
    await finish(runtime)
    with pytest.raises(PermissionError, match="sponsor"):
        runtime.approve(run["id"], "someone-else")
    runtime.store.agent("piraeus")["enabled"] = False
    runtime.approve(run["id"], "local-demo-sponsor")
    await finish(runtime)
    assert run["status"] == "denied" and not runtime.store.state["orders"]
    runtime.store.db.close()

@pytest.mark.asyncio
@pytest.mark.parametrize("output", [call("get_depot_status", region="US"), call("place_standard_order", offer_id="EU-SENSOR", quantity=1, region="EU"),
                                        call("place_approved_order", offer_id="EU-COMPRESSOR", quantity=1, region="EU")])
async def test_tool_boundaries_deny_foreign_region_approval_bypass_and_overspend(tmp_path, output):
    runtime = runtime_at(tmp_path, Model([output, text("Cannot execute")]))
    run = runtime.launch("piraeus", "local-demo-sponsor", prompt="Exercise boundary", allow_orders=True)
    await finish(runtime)
    assert run["status"] == "denied", run["trace"]
    assert not runtime.store.state["orders"]
    runtime.store.db.close()

@pytest.mark.asyncio
async def test_two_tool_calls_cannot_split_or_duplicate_purchase(tmp_path):
    runtime = runtime_at(tmp_path, Model([call("place_standard_order", offer_id="EU-SEAL-FAST", quantity=100, region="EU"),
                                         call("place_standard_order", offer_id="EU-SEAL-FAST", quantity=100, region="EU"), text()]))
    run = runtime.launch("piraeus", "local-demo-sponsor", prompt="Order seals", allow_orders=True)
    await finish(runtime)
    assert len(runtime.store.state["orders"]) == 1
    assert any("duplicate or split" in t for t in run["trace"])
    runtime.store.db.close()

@pytest.mark.asyncio
async def test_control_changed_while_token_is_acquired_blocks_action(tmp_path):
    identity = TestIdentity()
    runtime = runtime_at(tmp_path, Model([call("place_standard_order", offer_id="US-SEAL-FAST", quantity=100, region="US"), text()]), identity)
    original = identity.authorize
    async def acquire(agent, role):
        result = await original(agent, role)
        runtime.store.state["blueprint"]["enabled"] = False
        return result
    identity.authorize = acquire
    run = runtime.launch("newark", "local-demo-sponsor", prompt="Order seals", allow_orders=True)
    await finish(runtime)
    assert not runtime.store.state["orders"]
    assert run["status"] == "denied"
    runtime.store.db.close()

@pytest.mark.asyncio
async def test_model_cannot_purchase_on_a_research_only_request(tmp_path):
    runtime = runtime_at(tmp_path, Model([call("place_standard_order", offer_id="EU-SEAL-FAST", quantity=100, region="EU"), text("Research only")]))
    run = runtime.launch("piraeus", "local-demo-sponsor", prompt="Compare prices without purchasing")
    await finish(runtime)
    assert run["status"] == "denied"
    assert not runtime.store.state["orders"]
    assert runtime.identity.calls == []
    assert any("research only" in line for line in run["trace"])
    runtime.store.db.close()
