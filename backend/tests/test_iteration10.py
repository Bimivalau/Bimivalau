"""Pass A (iteration 10): Un-gated discovery + Studio + Business Health + Braider DNA + AI waitlist."""
import os
import uuid
import requests
import pytest
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

with open("/app/frontend/.env") as f:
    for ln in f:
        if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _reg(role="customer"):
    email = f"TEST_i10_{uuid.uuid4().hex[:8]}@iter10.example.com"
    body = {"email": email, "password": "pw123456", "name": "Iter10", "role": role, "accept_terms": True}
    if role == "hairdresser":
        body["phone"] = "+15550001010"
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return email, d["access_token"], d["user"]


def _h(t): return {"Authorization": f"Bearer {t}"}


class TestUngatedDiscovery:
    """Pass A: Free customers browse EVERYTHING. Never blurred, never truncated."""
    def test_free_customer_sees_all_hairdressers(self):
        _, tok, _ = _reg(role="customer")
        arr = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()
        r = requests.get(f"{API}/hairstyles/{arr[0]['id']}/hairdressers", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["gated"] is False
        # No blur on any result
        for h in d["results"]:
            assert not h.get("location_blurred")

    def test_compare_endpoint_ungated(self):
        _, tok, _ = _reg(role="customer")
        arr = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()
        r = requests.get(f"{API}/hairstyles/{arr[0]['id']}/compare", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["gated"] is False
        assert d["shown"] == d["total_matches"]

    def test_free_catalog_has_no_limits(self):
        d = requests.get(f"{API}/plans/catalog", timeout=15).json()
        assert d["customer"]["free"]["limits"] == []
        # Intelligence-only unlocks in Unlimited
        u_features = " ".join(d["customer"]["unlimited"]["features"]).lower()
        assert "ai style match" in u_features
        assert "price alerts" in u_features
        assert "beauty journal" in u_features


class TestBusinessHealth:
    def test_metrics_shape(self):
        d = requests.post(f"{API}/auth/login", json={"email": "amara@braids.demo", "password": "demo1234"}, timeout=15).json()
        tok = d["access_token"]
        r = requests.get(f"{API}/braiders/me/business-health", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        keys = {"customer_trust", "visibility", "portfolio_strength", "response_rate", "repeat_customers", "availability"}
        assert set(d["metrics"].keys()) == keys
        for k in keys:
            m = d["metrics"][k]
            assert 0 <= m["score"] <= 100
            assert "label" in m and "tip" in m
        assert "unique_customers" in d
        assert "repeat_customers" in d

    def test_customer_blocked(self):
        _, tok, _ = _reg(role="customer")
        r = requests.get(f"{API}/braiders/me/business-health", headers=_h(tok), timeout=15)
        assert r.status_code == 403


class TestBraiderDNA:
    def test_dna_shape_and_labels(self):
        d = requests.post(f"{API}/auth/login", json={"email": "amara@braids.demo", "password": "demo1234"}, timeout=15).json()
        tok = d["access_token"]
        r = requests.get(f"{API}/braiders/me/dna", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        dna = r.json()
        assert isinstance(dna, list)
        if dna:
            for row in dna:
                for k in ("category", "score", "label", "portfolio_count"):
                    assert k in row
                assert 0 <= row["score"] <= 100
                assert any(row["label"].endswith(suf) for suf in ("Master", "Expert", "Specialist", "Emerging"))

    def test_public_dna_endpoint(self):
        # Get amara's hairdresser id
        arr = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()
        hairdressers = requests.get(f"{API}/hairstyles/{arr[0]['id']}/hairdressers", timeout=15).json()["results"]
        assert hairdressers, "seed missing"
        hid = hairdressers[0]["id"]
        r = requests.get(f"{API}/braiders/{hid}/dna", timeout=15)
        assert r.status_code == 200


class TestAIWaitlist:
    def test_join_and_list(self):
        _, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/ai/waitlist", json={"module": "style_match", "note": "want this!"}, headers=_h(tok), timeout=15)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/ai/waitlist", json={"module": "recreate_look"}, headers=_h(tok), timeout=15)
        assert r2.status_code == 200
        d = requests.get(f"{API}/ai/waitlist/me", headers=_h(tok), timeout=15).json()
        assert set(d["modules"]) == {"style_match", "recreate_look"}

    def test_join_is_idempotent(self):
        _, tok, _ = _reg(role="customer")
        requests.post(f"{API}/ai/waitlist", json={"module": "style_match"}, headers=_h(tok), timeout=15)
        requests.post(f"{API}/ai/waitlist", json={"module": "style_match"}, headers=_h(tok), timeout=15)
        d = requests.get(f"{API}/ai/waitlist/me", headers=_h(tok), timeout=15).json()
        assert d["modules"].count("style_match") == 1

    def test_reject_unknown_module(self):
        _, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/ai/waitlist", json={"module": "hologram_braids"}, headers=_h(tok), timeout=15)
        assert r.status_code == 400


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    async def wipe():
        c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
        ids = []
        async for u in db.users.find({"email": {"$regex": "^TEST_i10_.*@iter10.example.com$"}}):
            ids.append(u["id"])
        if ids:
            await db.users.delete_many({"id": {"$in": ids}})
            await db.ai_waitlist.delete_many({"user_id": {"$in": ids}})
        c.close()
    asyncio.run(wipe())
