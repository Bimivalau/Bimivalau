"""Sprint 3 (iteration 9): Subscription redesign + Business Success Score."""
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


def _reg(role="hairdresser"):
    email = f"TEST_i9_{uuid.uuid4().hex[:8]}@iter9.example.com"
    body = {"email": email, "password": "pw123456", "name": "Iter9", "role": role, "accept_terms": True}
    if role == "hairdresser":
        body["phone"] = "+15550009999"
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["access_token"]
    # Cancel any auto-granted Founding Pro subscription so tests can target
    # a specific tier deterministically.
    if role == "hairdresser":
        async def _clear():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            await db.subscriptions.update_many({"user_id": d["user"]["id"], "status": "active"},
                                               {"$set": {"status": "cancelled", "is_founding_pro": False}})
            await db.users.update_one({"id": d["user"]["id"]}, {"$set": {"plan": "free"}})
            c.close()
        asyncio.run(_clear())
    return email, tok, d["user"]


def _h(t): return {"Authorization": f"Bearer {t}"}


class TestPlansCatalog:
    def test_catalog_shape(self):
        d = requests.get(f"{API}/plans/catalog", timeout=15).json()
        assert set(d["customer"].keys()) == {"free", "unlimited"}
        assert set(d["professional"].keys()) == {"free", "standard", "unlimited"}

    def test_pricing(self):
        d = requests.get(f"{API}/plans/catalog", timeout=15).json()
        assert d["customer"]["unlimited"]["price_monthly"] == 4.99
        assert d["customer"]["unlimited"]["price_yearly"] == 47.88
        assert d["professional"]["standard"]["price_monthly"] == 9.99
        assert d["professional"]["standard"]["price_yearly"] == 95.88
        assert d["professional"]["unlimited"]["price_monthly"] == 15.99
        assert d["professional"]["unlimited"]["price_yearly"] == 143.88

    def test_registered_user_defaults_to_free(self):
        _, tok, _ = _reg(role="customer")
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15).json()
        assert me["plan"] == "free"


class TestSubscribeFlow:
    def test_customer_unlimited_subscribe(self):
        _, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/subscriptions/subscribe",
                          json={"plan_type": "unlimited", "billing_interval": "monthly"},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15).json()
        assert me["plan"] == "unlimited"

    def test_customer_cannot_subscribe_to_standard(self):
        _, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/subscriptions/subscribe",
                          json={"plan_type": "standard", "billing_interval": "monthly"},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 400

    def test_braider_standard_subscribe(self):
        _, tok, _ = _reg(role="hairdresser")
        r = requests.post(f"{API}/subscriptions/subscribe",
                          json={"plan_type": "standard", "billing_interval": "yearly"},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/subscriptions/me", headers=_h(tok), timeout=15).json()
        assert d["subscription"]["plan_type"] == "standard"
        assert d["subscription"]["billing_interval"] == "yearly"
        assert d["subscription"]["price"] == 95.88

    def test_braider_unlimited_subscribe(self):
        _, tok, _ = _reg(role="hairdresser")
        r = requests.post(f"{API}/subscriptions/subscribe",
                          json={"plan_type": "unlimited", "billing_interval": "monthly"},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15).json()
        assert me["plan"] == "unlimited"

    def test_downgrade_to_free(self):
        _, tok, _ = _reg(role="hairdresser")
        requests.post(f"{API}/subscriptions/subscribe",
                      json={"plan_type": "unlimited", "billing_interval": "monthly"},
                      headers=_h(tok), timeout=15)
        r = requests.post(f"{API}/subscriptions/subscribe",
                          json={"plan_type": "free"}, headers=_h(tok), timeout=15)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15).json()
        assert me["plan"] == "free"


class TestBusinessScore:
    def test_my_score_returns_full_breakdown(self):
        _, tok, _ = _reg(role="hairdresser")
        r = requests.get(f"{API}/braiders/me/business-score", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("score", "tier", "breakdown", "recommendations"):
            assert k in d
        assert d["tier"] in ("Building", "Growing", "Excellent", "Elite")
        for k in ("profile_completeness", "portfolio_strength", "customer_signals", "booking_activity", "recent_engagement"):
            assert k in d["breakdown"]
            assert "score" in d["breakdown"][k] and "max" in d["breakdown"][k]

    def test_public_score_hides_breakdown(self):
        # amara is a seeded pro
        amara = requests.post(f"{API}/auth/login", json={"email": "amara@braids.demo", "password": "demo1234"}, timeout=15).json()
        me = amara["user"]
        r = requests.get(f"{API}/braiders/{me['id']}/business-score", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "score" in d and "tier" in d
        assert "breakdown" not in d
        assert "recommendations" not in d

    def test_customer_cannot_access_business_score(self):
        _, tok, _ = _reg(role="customer")
        r = requests.get(f"{API}/braiders/me/business-score", headers=_h(tok), timeout=15)
        assert r.status_code == 403


class TestAnalyticsGating:
    def test_free_braider_denied_analytics(self):
        _, tok, _ = _reg(role="hairdresser")
        for path in ("analytics", "trending-report", "weekly-report"):
            r = requests.get(f"{API}/braiders/me/{path}", headers=_h(tok), timeout=15)
            assert r.status_code == 402, path

    def test_standard_braider_gets_analytics(self):
        _, tok, _ = _reg(role="hairdresser")
        requests.post(f"{API}/subscriptions/subscribe",
                      json={"plan_type": "standard", "billing_interval": "monthly"},
                      headers=_h(tok), timeout=15)
        r = requests.get(f"{API}/braiders/me/analytics", headers=_h(tok), timeout=15)
        assert r.status_code == 200


class TestPortfolioCaps:
    """Free=10 · Standard=25 · Unlimited=40 (validated indirectly via /media/sign)."""
    def test_sign_rejects_at_free_cap(self):
        _, tok, _ = _reg(role="hairdresser")
        # No Cloudinary → 503 before cap check. So we validate business logic via /portfolio (URL).
        # Seed 10 stubs, then confirm 11th 402s.
        style = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()[0]
        for _ in range(10):
            requests.post(f"{API}/portfolio",
                          json={"hairstyle_id": style["id"], "photo_url": "https://x/y.jpg", "caption": ""},
                          headers=_h(tok), timeout=15)
        r = requests.post(f"{API}/portfolio",
                          json={"hairstyle_id": style["id"], "photo_url": "https://x/y.jpg", "caption": ""},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 402
        assert "Free" in r.json()["detail"]


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    async def wipe():
        c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
        ids = []
        async for u in db.users.find({"email": {"$regex": "^TEST_i9_.*@iter9.example.com$"}}):
            ids.append(u["id"])
        if ids:
            await db.users.delete_many({"id": {"$in": ids}})
            await db.subscriptions.delete_many({"user_id": {"$in": ids}})
            await db.portfolio_items.delete_many({"hairdresser_id": {"$in": ids}})
        c.close()
    asyncio.run(wipe())
