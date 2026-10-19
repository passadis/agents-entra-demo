"""Single-worker SQLite demo ledger with atomic checkpoints and order deduplication."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from .data import seed

def utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

class Store:
    def __init__(self, path, env):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=DELETE")  # Azure /home can be a network filesystem: avoid WAL.
        self.db.execute("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY CHECK (id=1), body TEXT NOT NULL)")
        row = self.db.execute("SELECT body FROM snapshots WHERE id=1").fetchone()
        self.state = json.loads(row[0]) if row else seed(env)
        self.state.setdefault("missions", [])
        # Preserve the original demo ledger on the first migration; leave its JSON file untouched.
        legacy = Path(env.get("DATA_FILE", "/home/data/aegean/state.json"))
        if not row and legacy.is_file():
            old = json.loads(legacy.read_text(encoding="utf-8-sig"))
            for name in ["orders", "audit"]:
                self.state[name] = old.get(name, [])
            self.event("migration.imported", "system", {"orders": len(self.state["orders"]), "legacyRunsArchivedIn": str(legacy)})
        # Credentials/mappings always come from current configuration, never the saved session.
        fresh = seed(env)
        for a, configured in zip(self.state["agents"], fresh["agents"]):
            for key in ["clientId", "principalId", "sponsorId", "sponsor", "roles"]:
                a[key] = configured[key]
        self.state["blueprint"]["id"] = fresh["blueprint"]["id"]
        for run in self.state["runs"]:
            if run["status"] in ["queued", "running", "executing", "evaluating"]:
                run["status"] = "completed" if any(o["runId"] == run["id"] for o in self.state["orders"]) else "denied"
                run["trace"].append("Process restarted. Interrupted work was not replayed; create a new request.")
        self.save()

    def save(self):
        with self.db:
            self.db.execute("INSERT INTO snapshots(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body", (json.dumps(self.state),))

    def event(self, kind, actor, details=None):
        details = dict(details or {})
        if details.get("runId"):
            run = next((r for r in self.state["runs"] if r["id"] == details["runId"]), None)
            if run and run.get("missionId"):
                details["missionId"] = run["missionId"]
        self.state["audit"].append({"id": str(uuid4()), "at": utc(), "type": kind, "actor": actor, **(details or {})})
        self.save()

    def agent(self, agent_id):
        agent = next((a for a in self.state["agents"] if a["id"] == agent_id), None)
        if agent is None:
            raise ValueError("Unknown agent")
        return agent

    def run(self, run_id):
        run = next((r for r in self.state["runs"] if r["id"] == run_id), None)
        if run is None:
            raise ValueError("Unknown run")
        return run

    def public(self):
        # Framework checkpoints contain conversation/tool state. Keep them server-side.
        return {**self.state, "runs": [{k: v for k, v in r.items() if k not in ["checkpoint", "pending"]} for r in self.state["runs"]]}
