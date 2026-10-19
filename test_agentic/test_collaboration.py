import asyncio
import json
import pytest
from .test_runtime import Model, call, text, runtime_at, finish


def reserve(region):
    return [call("get_depot_status", region=region), call("compare_supplier_offers", region=region, sku="safety-seals"),
            call("place_standard_order", offer_id=f"{region}-SEAL-FAST", quantity=20, region=region), text(f"{region} reserve arranged")]


@pytest.mark.asyncio
async def test_joint_mission_shares_minimal_peer_report_and_keeps_identities(tmp_path):
    model = Model(reserve("EU") + reserve("US"))
    runtime = runtime_at(tmp_path, model)
    mission = runtime.collaboration.launch("reserve", "local-demo-sponsor")
    await finish(runtime)
    assert mission["status"] == "completed"
    assert mission["orderCount"] == 2 and mission["totalEUR"] == 160
    assert [o["region"] for o in runtime.store.state["orders"]] == ["US", "EU"]
    assert all(o["missionId"] == mission["id"] for o in runtime.store.state["orders"])
    assert runtime.identity.calls == [(agent, role) for agent in ["piraeus", "newark"] for role in ["Orders.Read", "Orders.Read", "Orders.Create"]]
    us_request = json.dumps(model.requests[4])
    assert "spendEUR" in us_request and "assessmentCompleted" in us_request and "PO-0001" in us_request
    assert "EU-SEAL-FAST" not in us_request and "onHand" not in us_request
    events = [e for e in runtime.store.state["audit"] if e["type"].startswith("tool.")]
    assert events and all(e["missionId"] == mission["id"] for e in events)
    assert all("checkpoint" not in run for run in runtime.store.public()["runs"])
    runtime.store.db.close()


@pytest.mark.asyncio
async def test_each_approval_is_independent_and_pending_peer_resumes_after_restart(tmp_path):
    model = Model([call("place_approved_order", offer_id="EU-SENSOR", quantity=1, region="EU"),
                   call("place_approved_order", offer_id="US-SENSOR", quantity=1, region="US"), text("EU approved"), text("US approved")])
    runtime = runtime_at(tmp_path, model)
    mission = runtime.collaboration.launch("sensors", "local-demo-sponsor")
    await finish(runtime)
    eu_id, us_id = mission["runIds"]
    assert mission["status"] == "awaiting_approval" and mission["orderCount"] == 0
    runtime.approve(eu_id, "local-demo-sponsor")
    await finish(runtime)
    assert mission["status"] == "awaiting_approval" and mission["totalEUR"] == 2400
    assert runtime.store.run(us_id)["status"] == "awaiting_approval"
    with pytest.raises(ValueError, match="not awaiting"):
        runtime.approve(eu_id, "local-demo-sponsor")
    mission_id = mission["id"]
    runtime.store.db.close()
    resumed = runtime_at(tmp_path, model)
    resumed.approve(us_id, "local-demo-sponsor")
    await finish(resumed)
    restored = resumed.collaboration.get(mission_id)
    assert restored["status"] == "completed" and restored["totalEUR"] == 4650
    assert len(resumed.store.state["orders"]) == 2
    assert "2400" in json.dumps(model.requests[-1])  # US resume receives the updated EU progress report.
    resumed.store.db.close()


@pytest.mark.asyncio
async def test_suspended_peer_leaves_honest_partial_result(tmp_path):
    runtime = runtime_at(tmp_path, Model(reserve("EU")))
    runtime.store.agent("newark")["enabled"] = False
    mission = runtime.collaboration.launch("reserve", "local-demo-sponsor")
    await finish(runtime)
    assert mission["status"] == "partial" and mission["totalEUR"] == 84
    assert "US: denied" in mission["summary"]
    assert all(agent == "piraeus" for agent, _ in runtime.identity.calls)
    runtime.store.db.close()


@pytest.mark.asyncio
async def test_research_mission_cannot_use_peer_context_to_authorize_purchase(tmp_path):
    outputs = [call("place_standard_order", offer_id=f"{region}-SEAL-FAST", quantity=20, region=region) for region in ["EU", "US"]]
    runtime = runtime_at(tmp_path, Model([outputs[0], text("Research only"), outputs[1], text("Research only")]))
    mission = runtime.collaboration.launch("assessment", "local-demo-sponsor")
    await finish(runtime)
    assert mission["status"] == "denied" and not runtime.store.state["orders"]
    assert runtime.identity.calls == []
    runtime.store.db.close()


@pytest.mark.asyncio
async def test_rejecting_one_sponsor_request_does_not_approve_the_other(tmp_path):
    runtime = runtime_at(tmp_path, Model([call("place_approved_order", offer_id="EU-SENSOR", quantity=1, region="EU"),
                                         call("place_approved_order", offer_id="US-SENSOR", quantity=1, region="US"), text("EU rejected"), text("US approved")]))
    runtime.store.agent("piraeus")["sponsorId"] = "eu-sponsor"
    runtime.store.agent("newark")["sponsorId"] = "us-sponsor"
    mission = runtime.collaboration.launch("sensors", "presenter")
    await finish(runtime)
    eu_id, us_id = mission["runIds"]
    with pytest.raises(PermissionError, match="sponsor"):
        runtime.approve(us_id, "eu-sponsor")
    runtime.approve(eu_id, "eu-sponsor", False)
    await finish(runtime)
    assert not runtime.store.state["orders"]
    assert runtime.store.run(us_id)["status"] == "awaiting_approval"
    runtime.approve(us_id, "us-sponsor")
    await finish(runtime)
    assert mission["status"] == "partial" and mission["totalEUR"] == 2250
    runtime.store.db.close()


@pytest.mark.asyncio
async def test_interrupted_mission_never_replays_queued_purchases(tmp_path):
    model = Model([])
    runtime = runtime_at(tmp_path, model)
    mission = runtime.collaboration.launch("reserve", "local-demo-sponsor")
    tasks = list(runtime.tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    runtime.store.save()
    runtime.store.db.close()
    resumed = runtime_at(tmp_path, model)
    restored = resumed.collaboration.get(mission["id"])
    assert restored["status"] == "denied"
    assert not resumed.store.state["orders"] and not resumed.tasks
    assert not model.requests
    resumed.store.db.close()


@pytest.mark.asyncio
async def test_old_snapshot_receives_missions_without_losing_orders(tmp_path):
    model = Model(reserve("EU"))
    runtime = runtime_at(tmp_path, model)
    run = runtime.launch("piraeus", "local-demo-sponsor", prompt="Order twenty reserve seals", allow_orders=True)
    await finish(runtime)
    order_id = run["orderId"]
    del runtime.store.state["missions"]  # Simulate the already deployed snapshot schema.
    runtime.store.save()
    runtime.store.db.close()
    upgraded = runtime_at(tmp_path, model)
    assert upgraded.store.state["missions"] == []
    assert upgraded.store.state["orders"][0]["id"] == order_id
    assert upgraded.store.run(run["id"])["status"] == "completed"
    upgraded.store.db.close()
