"""Sprint 2 (iteration 7): Home experience — saves, collections, inspiration, hairstyle enrichment."""
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
    email = f"TEST_i7_{uuid.uuid4().hex[:8]}@iter7.example.com"
    body = {"email": email, "password": "pw123456", "name": "Iter7", "role": role, "accept_terms": True}
    if role == "hairdresser":
        body["phone"] = "+15550001111"
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return email, d["access_token"], d["user"]


def _h(t): return {"Authorization": f"Bearer {t}"}


class TestHairstyleEnrichment:
    def test_list_returns_new_fields(self):
        r = requests.get(f"{API}/hairstyles?limit=5", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        s0 = data[0]
        for k in ("difficulty", "hair_length", "tags", "style_score", "nearby_pros_count"):
            assert k in s0, f"missing {k}"

    def test_section_filter_returns_trending(self):
        r = requests.get(f"{API}/hairstyles?section=trending", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert all("trending" in (h.get("tags") or []) for h in arr)

    def test_get_style_returns_similar(self):
        arr = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()
        hid = arr[0]["id"]
        r = requests.get(f"{API}/hairstyles/{hid}", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert "similar" in s
        assert isinstance(s["similar"], list)

    def test_multiple_sections_return_content(self):
        for sect in ["trending", "new", "bridal", "vacation", "kids", "office", "event", "most_loved"]:
            r = requests.get(f"{API}/hairstyles?section={sect}", timeout=15)
            assert r.status_code == 200


class TestCollectionsAndSaves:
    def test_default_collections_seeded_on_first_read(self):
        _, tok, _ = _reg()
        r = requests.get(f"{API}/collections/me", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        cols = r.json()
        names = {c["name"] for c in cols}
        for expected in ("Favorites", "Vacation", "Wedding", "Birthday", "Kids", "Next Appointment", "Summer"):
            assert expected in names

    def test_save_toggles_and_incs_counter(self):
        _, tok, _ = _reg()
        # pick a style
        st = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()[0]
        base = int(st.get("saves_count") or 0)
        r = requests.post(f"{API}/style-saves", json={"hairstyle_id": st["id"]}, headers=_h(tok), timeout=15)
        assert r.status_code == 200
        # count went up
        st2 = requests.get(f"{API}/hairstyles/{st['id']}", timeout=15).json()
        assert int(st2["saves_count"]) == base + 1
        # unsave decreases
        r = requests.delete(f"{API}/style-saves/{st['id']}", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        st3 = requests.get(f"{API}/hairstyles/{st['id']}", timeout=15).json()
        assert int(st3["saves_count"]) == base

    def test_save_appears_in_my_saves(self):
        _, tok, _ = _reg()
        st = requests.get(f"{API}/hairstyles?limit=1", timeout=15).json()[0]
        requests.post(f"{API}/style-saves", json={"hairstyle_id": st["id"]}, headers=_h(tok), timeout=15)
        saved = requests.get(f"{API}/style-saves/me", headers=_h(tok), timeout=15).json()
        assert any(x["id"] == st["id"] for x in saved)

    def test_create_and_delete_custom_collection(self):
        _, tok, _ = _reg()
        r = requests.post(f"{API}/collections/me", json={"name": "Spring 2027"}, headers=_h(tok), timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        r = requests.delete(f"{API}/collections/me/{cid}", headers=_h(tok), timeout=15)
        assert r.status_code == 200

    def test_default_collection_cannot_be_deleted(self):
        _, tok, _ = _reg()
        cols = requests.get(f"{API}/collections/me", headers=_h(tok), timeout=15).json()
        fav = next(c for c in cols if c["name"] == "Favorites")
        r = requests.delete(f"{API}/collections/me/{fav['id']}", headers=_h(tok), timeout=15)
        assert r.status_code == 400


class TestInspiration:
    def test_add_list_delete(self):
        _, tok, _ = _reg()
        r = requests.post(f"{API}/inspiration", json={"photo_url": "https://example.com/x.jpg"}, headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        iid = r.json()["id"]
        arr = requests.get(f"{API}/inspiration/me", headers=_h(tok), timeout=15).json()
        assert any(x["id"] == iid for x in arr)
        r = requests.delete(f"{API}/inspiration/{iid}", headers=_h(tok), timeout=15)
        assert r.status_code == 200

    def test_add_requires_photo_url(self):
        _, tok, _ = _reg()
        r = requests.post(f"{API}/inspiration", json={"photo_url": ""}, headers=_h(tok), timeout=15)
        assert r.status_code == 400


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    async def wipe():
        c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
        ids = []
        async for u in db.users.find({"email": {"$regex": "^TEST_i7_.*@iter7.example.com$"}}):
            ids.append(u["id"])
        if ids:
            await db.users.delete_many({"id": {"$in": ids}})
            await db.style_saves.delete_many({"user_id": {"$in": ids}})
            await db.style_collections.delete_many({"user_id": {"$in": ids}})
            await db.inspiration_photos.delete_many({"user_id": {"$in": ids}})
        c.close()
    asyncio.run(wipe())
