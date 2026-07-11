"""Iteration 5 (Part 1): Auth/verification/profile completion tests.

Covers:
- POST /auth/register with accept_terms → email_verified=false + terms_accepted_at
- POST /auth/send-verification → dev_code + cooldown (429)
- POST /auth/verify-email wrong/expired/correct
- POST /auth/change-email invalidates + updates
- POST /customers/me/profile (403 for pros)
- POST /hairdressers/me/basics (403 for customers, updates user.name)
- Regression: seeded login + email_verified backfill
"""
import os, time, uuid
import pytest, requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else None
# fallback to frontend .env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = ln.split("=",1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _reg(role="customer", accept=True, phone=None):
    email = f"TEST_{uuid.uuid4().hex[:10]}@iter5.example.com"
    body = {"email": email, "password": "pw123456", "name": "Iter5 User", "role": role, "accept_terms": accept}
    if phone: body["phone"] = phone
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return email, d["access_token"], d["user"]


def _hdrs(tok): return {"Authorization": f"Bearer {tok}"}


# ---------- Register + terms ----------
class TestRegister:
    def test_register_customer_sets_email_verified_false_and_terms(self):
        email, tok, user = _reg(accept=True)
        assert user["email_verified"] is False
        # verify DB has terms_accepted_at
        async def check():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            u = await db.users.find_one({"email": email})
            c.close()
            return u
        u = asyncio.run(check())
        assert u["terms_accepted_at"] is not None
        assert u["email_verified"] is False

    def test_register_without_accept_terms_terms_none(self):
        email, tok, user = _reg(accept=False)
        async def check():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            u = await db.users.find_one({"email": email})
            c.close(); return u
        u = asyncio.run(check())
        assert u["terms_accepted_at"] is None

    def test_register_pro_with_phone(self):
        email, tok, user = _reg(role="hairdresser", phone="+15551234567")
        assert user["role"] == "hairdresser"


# ---------- Send-verification / cooldown / dev_code ----------
class TestSendVerification:
    def test_send_returns_dev_code_when_resend_unset(self):
        _, tok, _ = _reg()
        r = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sent"] is True
        # Dev mode expected (no RESEND key)
        if not os.environ.get("RESEND_API_KEY", "").strip():
            assert "dev_code" in d
            assert len(d["dev_code"]) == 6
            assert d["dev_code"].isdigit()
            assert d["delivered_via_email"] is False
        assert d["resend_after_sec"] == 45

    def test_cooldown_429_on_rapid_retry(self):
        _, tok, _ = _reg()
        r1 = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15)
        assert r2.status_code == 429
        assert "wait" in r2.json()["detail"].lower()


# ---------- Verify-email ----------
class TestVerifyEmail:
    def test_wrong_code_400_incorrect(self):
        _, tok, _ = _reg()
        requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15)
        r = requests.post(f"{API}/auth/verify-email", json={"code": "999999"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 400
        assert "incorrect" in r.json()["detail"].lower()

    def test_new_code_invalidates_old_code(self):
        """Rule: requesting a new code (after cooldown) must invalidate the previous code."""
        email, tok, _ = _reg()
        s1 = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15).json()
        old_code = s1["dev_code"]
        # Force cooldown to elapse
        async def age():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            u = await db.users.find_one({"email": email})
            await db.email_verification_codes.update_many(
                {"user_id": u["id"], "consumed": False},
                {"$set": {"created_at": (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()}},
            )
            c.close()
        asyncio.run(age())
        s2 = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15).json()
        new_code = s2["dev_code"]
        assert old_code != new_code
        # Old code must now fail
        r_old = requests.post(f"{API}/auth/verify-email", json={"code": old_code}, headers=_hdrs(tok), timeout=15)
        assert r_old.status_code == 400
        # New code must succeed
        r_new = requests.post(f"{API}/auth/verify-email", json={"code": new_code}, headers=_hdrs(tok), timeout=15)
        assert r_new.status_code == 200
        assert r_new.json()["email_verified"] is True

    def test_max_5_wrong_attempts_consumes_code(self):
        """Rule: after 5 wrong attempts, code is invalidated (429)."""
        _, tok, _ = _reg()
        requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15)
        for _ in range(5):
            requests.post(f"{API}/auth/verify-email", json={"code": "000000"}, headers=_hdrs(tok), timeout=15)
        r = requests.post(f"{API}/auth/verify-email", json={"code": "000000"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 429
        assert "too many" in r.json()["detail"].lower()

    def test_correct_code_sets_email_verified_true(self):
        email, tok, _ = _reg()
        s = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15).json()
        code = s.get("dev_code")
        assert code
        r = requests.post(f"{API}/auth/verify-email", json={"code": code}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 200
        assert r.json()["email_verified"] is True
        me = requests.get(f"{API}/auth/me", headers=_hdrs(tok), timeout=15).json()
        assert me["email_verified"] is True

    def test_expired_code_400_expired(self):
        email, tok, _ = _reg()
        s = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15).json()
        # backdate expires_at in Mongo
        async def expire():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            u = await db.users.find_one({"email": email})
            await db.email_verification_codes.update_many(
                {"user_id": u["id"], "consumed": False},
                {"$set": {"expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}},
            )
            c.close()
        asyncio.run(expire())
        r = requests.post(f"{API}/auth/verify-email", json={"code": s["dev_code"]}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 400
        assert "expired" in r.json()["detail"].lower()

    def test_invalid_format_400(self):
        _, tok, _ = _reg()
        r = requests.post(f"{API}/auth/verify-email", json={"code": "abc"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 400


# ---------- Change-email ----------
class TestChangeEmail:
    def test_change_email_invalidates_codes_and_resets_verified(self):
        email, tok, _ = _reg()
        s = requests.post(f"{API}/auth/send-verification", json={}, headers=_hdrs(tok), timeout=15).json()
        old_code = s["dev_code"]
        new_email = f"TEST_new_{uuid.uuid4().hex[:8]}@iter5.example.com"
        r = requests.post(f"{API}/auth/change-email", json={"new_email": new_email}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == new_email.lower()
        # old code should no longer verify (consumed)
        r2 = requests.post(f"{API}/auth/verify-email", json={"code": old_code}, headers=_hdrs(tok), timeout=15)
        assert r2.status_code == 400  # no active code
        me = requests.get(f"{API}/auth/me", headers=_hdrs(tok), timeout=15).json()
        assert me["email"] == new_email.lower()
        assert me["email_verified"] is False


# ---------- Post-verify profile completion ----------
class TestProfileCompletion:
    def test_customer_profile_stores_country_city(self):
        email, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/customers/me/profile", json={"country": "US", "city": "Brooklyn"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 200
        async def check():
            c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
            u = await db.users.find_one({"email": email}); c.close(); return u
        u = asyncio.run(check())
        assert u["country"] == "US" and u["city"] == "Brooklyn"
        assert u["profile_completed"] is True

    def test_customer_profile_hairdresser_403(self):
        _, tok, _ = _reg(role="hairdresser", phone="+1555")
        r = requests.post(f"{API}/customers/me/profile", json={"country": "US", "city": "NY"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 403

    def test_pro_basics_stores_and_updates_name(self):
        _, tok, u = _reg(role="hairdresser", phone="+15551110000")
        r = requests.post(f"{API}/hairdressers/me/basics", json={
            "display_name": "New Braider Name", "country": "US",
            "service_area": "Harlem", "salon_name": "Salon X", "bio": "hello",
        }, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=_hdrs(tok), timeout=15).json()
        assert me["name"] == "New Braider Name"

    def test_pro_basics_customer_403(self):
        _, tok, _ = _reg(role="customer")
        r = requests.post(f"{API}/hairdressers/me/basics", json={"country":"US","service_area":"NY"}, headers=_hdrs(tok), timeout=15)
        assert r.status_code == 403


# ---------- Regression: seeded login + email_verified backfill ----------
class TestSeededLoginRegression:
    def test_sara_login_returns_email_verified_true(self):
        r = requests.post(f"{API}/auth/login", json={"email": "sara@braids.demo", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email_verified"] is True, "Seeded user should be backfilled to email_verified=true"

    def test_amara_login_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": "amara@braids.demo", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email_verified"] is True

    def test_admin_login_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@braids.demo", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200


# ---------- Cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    async def wipe():
        c = AsyncIOMotorClient(MONGO_URL); db = c[DB_NAME]
        ids = []
        async for u in db.users.find({"email": {"$regex": "^TEST_.*@iter5.example.com$"}}):
            ids.append(u["id"])
        if ids:
            await db.users.delete_many({"id": {"$in": ids}})
            await db.email_verification_codes.delete_many({"user_id": {"$in": ids}})
            await db.hairdressers.delete_many({"user_id": {"$in": ids}})
            await db.subscriptions.delete_many({"user_id": {"$in": ids}})
        c.close()
    asyncio.run(wipe())
