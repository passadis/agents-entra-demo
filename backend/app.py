import base64
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from .data import CASES, DEPOTS
from .identity import Identity
from .runtime import Runtime
from .store import Store

ROOT = Path(__file__).resolve().parent.parent

def create_app(env=None, client_factory=None, identity=None):
    env = dict(os.environ if env is None else env)
    hosted = bool(env.get("WEBSITE_HOSTNAME"))
    admins = set(filter(None, (v.strip() for v in env.get("GOVERNANCE_ADMIN_IDS", "").split(","))))
    if hosted and (env.get("IDENTITY_MODE") != "entra" or not admins or not env.get("SPONSOR_OBJECT_ID")):
        raise ValueError("Hosted agentic mode requires live Entra identity, governance administrators, and a sponsor")
    identity = identity or Identity(env)
    store = Store(env.get("AGENTIC_DATA_FILE", "/home/data/aegean/agentic.sqlite" if hosted else "data/agentic.sqlite"), env)
    runtime = Runtime(store, identity, env, client_factory)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await runtime.close()
        await identity.close()
        store.db.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.runtime, app.state.store = runtime, store

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception):
        return JSONResponse({"error": "Internal server error"}, status_code=500)

    def operator(request):
        if not hosted:
            return {"id": "local-demo-sponsor", "name": "Local presenter"}
        try:
            principal = json.loads(base64.b64decode(request.headers.get("x-ms-client-principal", ""), validate=True))
            claims = {c["typ"]: c["val"] for c in principal["claims"]}
            oid = claims.get("oid") or claims.get("http://schemas.microsoft.com/identity/claims/objectidentifier")
            tid = claims.get("tid") or claims.get("http://schemas.microsoft.com/identity/claims/tenantid")
            if tid != env["AZURE_TENANT_ID"] or oid not in admins:
                raise ValueError()
            return {"id": oid, "name": request.headers.get("x-ms-client-principal-name", oid)}
        except (ValueError, KeyError, TypeError):
            raise PermissionError("Sign in as an allowed governance administrator")

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        try:
            if request.url.path.startswith("/api/"):
                request.state.operator = operator(request)
                if request.method == "POST":
                    expected = f"https://{env['WEBSITE_HOSTNAME']}" if hosted else str(request.base_url).rstrip("/")
                    if request.headers.get("origin", expected) != expected:
                        raise PermissionError("Origin rejected")
                    if not request.headers.get("content-type", "").startswith("application/json"):
                        return JSONResponse({"error": "JSON required"}, status_code=415)
                    if len(await request.body()) > 16384:
                        return JSONResponse({"error": "Request too large"}, status_code=413)
            response = await call_next(request)
        except PermissionError as error:
            response = JSONResponse({"error": str(error)}, status_code=403)
        except (ValueError, KeyError, StopIteration) as error:
            response = JSONResponse({"error": str(error) or "Unknown request target"}, status_code=400)
        response.headers.update({"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
                                 "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        return response

    @app.get("/healthz")
    @app.get("/readyz")
    async def health():
        return {"status": "ok", "mode": identity.mode, "runtime": "microsoft-agent-framework", "modelConfigured": bool(env.get("AZURE_OPENAI_ENDPOINT") and env.get("AZURE_OPENAI_DEPLOYMENT"))}

    @app.get("/api/state")
    async def state(request: Request):
        return {**store.public(), "mode": identity.mode, "planner": "microsoft-agent-framework", "cases": CASES, "depots": DEPOTS,
                "operator": request.state.operator, "busy": runtime.busy, "model": env.get("AZURE_OPENAI_DEPLOYMENT", "Not configured")}

    @app.post("/api/run")
    async def run(request: Request):
        body = await request.json()
        result = runtime.launch(body["agentId"], request.state.operator["id"], body.get("prompt"), body.get("caseId"), body.get("allowOrders") is True)
        return {"id": result["id"]}

    @app.post("/api/approve")
    async def approve(request: Request):
        body = await request.json()
        approved = body.get("approved", True)
        if type(approved) is not bool:
            raise ValueError("Approval decision must be a boolean")
        result = runtime.approve(body["runId"], request.state.operator["id"], approved)
        return {"id": result["id"], "missionId": result.get("missionId")}

    @app.post("/api/collaborate")
    async def collaborate(request: Request):
        body = await request.json()
        mission = runtime.collaboration.launch(body["kind"], request.state.operator["id"])
        return {"missionId": mission["id"], "id": mission["runIds"][0]}

    @app.post("/api/control")
    async def control(request: Request):
        body = await request.json()
        entity = store.state["blueprint"] if body["target"] == "blueprint" else store.agent(body["target"])
        action = body["action"]
        if action == "toggle":
            entity["enabled"] = not entity["enabled"]
        elif body["target"] != "blueprint" and action in ["expire", "renew"]:
            entity["reviewDue"] = "2000-01-01T00:00:00Z" if action == "expire" else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        else:
            raise ValueError("Unknown control")
        store.event(f"governance.{action}", request.state.operator["id"], {"target": body["target"]})
        return {"ok": True}

    @app.get("/api/audit")
    async def audit():
        return store.state["audit"]

    @app.get("/")
    async def index():
        return FileResponse(ROOT / "agentic-public/index.html")

    @app.get("/app.js")
    async def script():
        return FileResponse(ROOT / "agentic-public/app.js", media_type="text/javascript")

    @app.get("/styles.css")
    async def style():
        return FileResponse(ROOT / "public/styles.css", media_type="text/css")

    @app.get("/agentic.css")
    async def agentic_style():
        return FileResponse(ROOT / "agentic-public/agentic.css", media_type="text/css")

    return app

app = create_app()
