"""Local browser-test server only; excluded from deployment packages."""
import os
from backend.app import create_app
from .test_runtime import Model, call, text

outputs = []
for region in ["EU", "US"]:
    outputs.extend([call("get_depot_status", region=region), call("compare_supplier_offers", region=region, sku="safety-seals"),
                    call("place_standard_order", offer_id=f"{region}-SEAL-FAST", quantity=100, region=region),
                    text(f"Created a fictional order for 100 safety seals for the {region} depot, using the local fast supplier.")])
outputs.extend([call("get_depot_status", region="US"), call("compare_supplier_offers", region="US", sku="engine-sensor"),
                call("place_approved_order", offer_id="US-SENSOR", quantity=1, region="US"), text("Sponsor approved. Created the fictional engine-sensor order."),
                call("get_depot_status", region="EU"), text("The regional tool denied access to the other depot.")])
for region in ["EU", "US"]:
    outputs.extend([call("get_depot_status", region=region), call("compare_supplier_offers", region=region, sku="safety-seals"),
                    call("place_standard_order", offer_id=f"{region}-SEAL-FAST", quantity=20, region=region), text(f"{region} reserve created; peer progress reviewed.")])
outputs.extend([call("place_approved_order", offer_id="EU-SENSOR", quantity=1, region="EU"),
                call("place_approved_order", offer_id="US-SENSOR", quantity=1, region="US"), text("EU sponsor approved"), text("US sponsor approved")])
model = Model(outputs)
app = create_app({"AGENTIC_DATA_FILE": os.environ["AGENTIC_BROWSER_DATA_FILE"], "DATA_FILE": "not-a-legacy-test-file.json",
                  "AZURE_OPENAI_DEPLOYMENT": "Scripted browser test service"}, model.factory)
