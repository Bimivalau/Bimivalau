"""Sprint 2 UX refinement (iteration 8):
- Country trending endpoint
- Continue Dreaming / Start Your Journey
- View tracking
- country_tags field on hairstyles
"""
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


def _reg():
    email = f"TEST_i8_{uuid.uuid4().hex[:8]}@iter8.example.com"
    body = {"email": email, "password": "pw123456", "name": "Iter8", "role": "customer", "accept_terms": True}
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return email, d["access_token"], d["user"]


def _h(t): return {"Authorization": f"Bearer {t}"}


class TestCountryTrending:
    def test_countries_list(self):
        r = requests.get(f"{API}/trending/countries", timeout=15)
        assert r.status_code == 200
        data = r.json()
        codes = {c["code"] for c in data}
        for expected in ("WW", "US", "FR", "NG", "GH", "SN", "KE", "ZA", "BR", "JM", "GB", "CM", "CI", "CG"):
            assert expected in codes, f"missing {expected}"

    def test_country_filter_returns_different_lists(self):
        us = requests.get(f"{API}/trending/US?limit=5", timeout=15).json()
        ng = requests.get(f"{API}/trending/NG?limit=5", timeout=15).json()
        assert len(us) > 0 and len(ng) > 0
        # Names should differ for at least one style — mock data enforces this
        us_names = [x["name"] for x in us]
        ng_names = [x["name"] for x in ng]
        assert us_names != ng_names, "country trending should differ between US and NG"

    def test_ww_returns_top_styles(self):
        r = requests.get(f"{API}/trending/WW?limit=5", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        # scores are non-increasing
        scores = [x.get("style_score", 0) for x in arr]
        assert scores == sorted(scores, reverse=True)

    def test_country_tags_present_on_seed(self):
        arr = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()
        assert arr and "country_tags" in arr[0]
        assert isinstance(arr[0]["country_tags"], list)
        assert len(arr[0]["country_tags"]) >= 1

    def test_hairstyles_filter_by_country_param(self):
        r = requests.get(f"{API}/hairstyles?country=NG", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert all("NG" in h.get("country_tags", []) for h in arr), "all results should have NG in country_tags"


class TestViewsAndContinueDreaming:
    def test_new_user_gets_new_user_mode(self):
        _, tok, _ = _reg()
        r = requests.get(f"{API}/continue-dreaming/me", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "new_user"
        assert d["items"] == []

    def test_view_makes_returning_user(self):
        _, tok, _ = _reg()
        st = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()[0]
        r = requests.post(f"{API}/hairstyles/{st['id']}/view", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = requests.get(f"{API}/continue-dreaming/me", headers=_h(tok), timeout=15).json()
        assert d["mode"] == "returning_user"
        assert any(x["id"] == st["id"] for x in d["items"])
        # personal_reason set
        assert d["items"][0]["personal_reason"] in ("Saved", "Last viewed")

    def test_save_prioritizes_over_view(self):
        _, tok, _ = _reg()
        # Add two styles, one viewed one saved
        arr = requests.get(f"{API}/hairstyles?limit=3", timeout=15).json()
        viewed_id = arr[0]["id"]
        saved_id = arr[1]["id"]
        requests.post(f"{API}/hairstyles/{viewed_id}/view", headers=_h(tok), timeout=15)
        requests.post(f"{API}/style-saves", json={"hairstyle_id": saved_id}, headers=_h(tok), timeout=15)
        d = requests.get(f"{API}/continue-dreaming/me", headers=_h(tok), timeout=15).json()
        assert d["mode"] == "returning_user"
        ids = [x["id"] for x in d["items"]]
        # Saved should come before viewed
        assert ids.index(saved_id) < ids.index(viewed_id)
        # And the saved item has reason "Saved"
        by_id = {x["id"]: x for x in d["items"]}
        assert by_id[saved_id]["personal_reason"] == "Saved"
        assert by_id[viewed_id]["personal_reason"] == "Last viewed"

    def test_anonymous_view_returns_ok(self):
        st = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()[0]
        r = requests.post(f"{API}/hairstyles/{st['id']}/view", timeout=15)
        assert r.status_code == 200
        assert r.json().get("anonymous") is True


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    async def wipe():
        c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
        ids = []
        async for u in db.users.find({"email": {"$regex": "^TEST_i8_.*@iter8.example.com$"}}):
            ids.append(u["id"])
        if ids:
            await db.users.delete_many({"id": {"$in": ids}})
            await db.style_views.delete_many({"user_id": {"$in": ids}})
            await db.style_saves.delete_many({"user_id": {"$in": ids}})
            await db.style_collections.delete_many({"user_id": {"$in": ids}})
        c.close()
    asyncio.run(wipe())
