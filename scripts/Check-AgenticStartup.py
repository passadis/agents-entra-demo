"""Cold-start the hosted code path without contacting Azure or a model.

Run with an environment installed only from requirements.txt. Local integration
environments can hide missing optional SDK transports through other packages.
"""
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import urllib.request

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="aegean-startup-") as directory:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    env = dict(os.environ)
    fields = ["AZURE_TENANT_ID", "BLUEPRINT_CLIENT_ID", "TOOL_CLIENT_ID", "MANAGED_IDENTITY_CLIENT_ID",
              "AGENT_EU_CLIENT_ID", "AGENT_US_CLIENT_ID", "AGENT_EU_PRINCIPAL_ID", "AGENT_US_PRINCIPAL_ID", "SPONSOR_OBJECT_ID"]
    env.update({key: f"00000000-0000-4000-8000-{index:012d}" for index, key in enumerate(fields, 1)})
    env.update({"WEBSITE_HOSTNAME": "startup-check.invalid", "IDENTITY_MODE": "entra", "GOVERNANCE_ADMIN_IDS": env["SPONSOR_OBJECT_ID"],
                "IDENTITY_ENDPOINT": "http://127.0.0.1:1/identity", "IDENTITY_HEADER": "startup-check-only",
                "AZURE_OPENAI_ENDPOINT": "https://startup-check.openai.azure.com/", "AZURE_OPENAI_DEPLOYMENT": "startup-check-model",
                "AGENTIC_DATA_FILE": str(Path(directory) / "state.sqlite"), "DATA_FILE": str(Path(directory) / "absent-legacy.json")})
    os.environ.update(env)
    sys.path.insert(0, str(root))
    import uvicorn
    server = uvicorn.Server(uvicorn.Config("backend.app:app", host="127.0.0.1", port=port, workers=1, log_level="warning"))
    worker = threading.Thread(target=server.run)
    worker.start()
    try:
        healthy = False
        for _ in range(100):
            if not worker.is_alive():
                break
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=1) as response:
                    body = json.load(response)
                assert body["mode"] == "entra" and body["runtime"] == "microsoft-agent-framework" and body["modelConfigured"]
                healthy = True
                break
            except OSError:
                time.sleep(0.1)
        if not healthy:
            raise RuntimeError("Hosted startup failed; inspect the server error above")
        print("Hosted startup check passed. Actual App Service credential constructor and HTTP health endpoint work; no Azure or model call was made.")
    finally:
        server.should_exit = True
        worker.join(timeout=10)
        if worker.is_alive():
            raise RuntimeError("Startup check server did not shut down")
