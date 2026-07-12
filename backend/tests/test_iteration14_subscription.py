"""
Iteration 14 — Subscription Architecture (mocked purchases) tests
Covers: /api/subscription/*, /api/entitlements/*, /api/founding-pro/*,
        /api/notifications/preferences
"""
import os
import base64
import time
import uuid
import pytest
import requests
from conftest import BASE_URL, auth_headers, _login


# ---------- Section 1: Public config ----------
class TestSubscriptionConfig:
    def test_config_no_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/subscription/config", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["launch_mode"] is True
        assert "pricing" in j and "customer_unlimited" in j["pricing"]
        assert "trials" in j
        assert j["founding_pro"]["slots"] == 100
        assert "notification_channels" in j


# ---------- Section 2: /subscription/me for customer (launch override) ----------
class TestCustomerSubscriptionMe:
    def test_sara_snapshot(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/subscription/me", headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["plan_slug"] == "customer_free"
        assert j["launch_mode"] is True
        assert j["entitlements"]["customer.ai.style_match"] is True
        assert j["entitlements"]["braider.ai.business_coach"] is False


# ---------- Section 3: /subscription/me for pro (unlimited) ----------
class TestProSubscriptionMe:
    def test_amara_snapshot(self, pro_auth):
        r = requests.get(f"{BASE_URL}/api/subscription/me", headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["plan_slug"] == "braider_unlimited"
        assert j["portfolio_cap"] == 40
        assert j["entitlements"]["braider.ai.business_coach"] is True
        assert j["entitlements"]["braider.analytics.revenue"] is True


# ---------- Section 4: /entitlements/{key} check ----------
class TestEntitlementCheck:
    def test_customer_style_match_launch_override(self, customer_auth):
        r = requests.get(
            f"{BASE_URL}/api/entitlements/customer.ai.style_match",
            headers=auth_headers(customer_auth["token"]),
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["allowed"] is True
        assert j["reason"]["target_plan"] == "customer_unlimited"


# ---------- Section 5: mock-purchase / cancel / restore  ----------
class TestMockPurchaseFlow:
    """These tests intentionally modify amara's plan — reset at teardown via DB."""

    @pytest.fixture(scope="class", autouse=True)
    def _reset_amara(self, pro_auth):
        yield
        # Direct DB reset (mock-purchase doesn't clear trial fields)
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            from dotenv import load_dotenv
            load_dotenv("/app/backend/.env")
            async def _reset():
                c = AsyncIOMotorClient(os.environ["MONGO_URL"])
                d = c[os.environ["DB_NAME"]]
                await d.users.update_one(
                    {"email": "amara@braids.demo"},
                    {"$set": {"plan": "unlimited", "plan_status": "active",
                              "plan_cancel_at_period_end": False},
                     "$unset": {"trial_plan": "", "trial_ends_at": ""}},
                )
            asyncio.get_event_loop().run_until_complete(_reset())
        except Exception:
            pass

    def test_start_trial_standard(self, pro_auth):
        r = requests.post(
            f"{BASE_URL}/api/subscription/mock-purchase",
            headers=auth_headers(pro_auth["token"]),
            json={"plan": "braider_standard", "cycle": "monthly", "start_trial": True},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["plan_status"] == "trialing"
        assert j["trial_ends_at"] is not None

    def test_me_shows_trial(self, pro_auth):
        r = requests.get(f"{BASE_URL}/api/subscription/me", headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["trial_plan"] == "standard"
        assert j["trial_days_left"] is not None
        assert 28 <= j["trial_days_left"] <= 30

    def test_mock_cancel(self, pro_auth):
        r = requests.post(
            f"{BASE_URL}/api/subscription/mock-cancel",
            headers=auth_headers(pro_auth["token"]),
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True

    def test_mock_restore(self, pro_auth):
        r = requests.post(
            f"{BASE_URL}/api/subscription/mock-restore",
            headers=auth_headers(pro_auth["token"]),
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # Restore returns a subscription snapshot
        assert "plan_slug" in j
        assert "entitlements" in j


# ---------- Section 6: Founding Pro flow ----------
class TestFoundingPro:
    @pytest.fixture(scope="class")
    def fresh_pro(self):
        """Create a new hairdresser account for founding pro tests."""
        suffix = uuid.uuid4().hex[:6]
        email = f"newpro_fp_{suffix}@braids.demo"
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "demo1234", "name": f"New Pro {suffix}", "role": "hairdresser"},
        )
        assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
        data = r.json()
        token = data.get("access_token") or _login(email, "demo1234")["access_token"]
        return {"token": token, "email": email, "user_id": data.get("user", {}).get("id")}

    def test_status_as_amara(self, pro_auth):
        r = requests.get(f"{BASE_URL}/api/founding-pro/status", headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["spots_remaining"] <= 100
        assert j["slots"] == 100

    def test_apply_missing_availability(self, fresh_pro):
        r = requests.post(
            f"{BASE_URL}/api/founding-pro/apply",
            headers=auth_headers(fresh_pro["token"]),
            json={"intro": "Studio in Brooklyn"},
        )
        assert r.status_code == 400, r.text
        assert "availability" in r.text.lower()

    def test_apply_after_completing_setup(self, fresh_pro):
        h = auth_headers(fresh_pro["token"])
        # Set availability Mon-Sat 9-18 via correct endpoint (list body)
        avail_list = [
            {"day_of_week": i, "start_time": "09:00", "end_time": "18:00"} for i in range(0, 6)
        ]
        r_av = requests.put(f"{BASE_URL}/api/availability/me", headers=h, json=avail_list)
        assert r_av.status_code == 200, f"availability failed: {r_av.status_code} {r_av.text}"
        # Update hairdressers/me with required fields
        tiny_png_full = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        r = requests.put(f"{BASE_URL}/api/hairdressers/me", headers=h, json={
            "bio": "Test bio for FP apply", "salon_name": "Test Studio FP", "city": "Brooklyn",
            "specialties": ["Box Braids"], "years_experience": 5,
            "address": "123 Test St, Brooklyn NY",
            "latitude": 40.6782, "longitude": -73.9442,
            "cover_photo": tiny_png_full,
        })
        assert r.status_code in (200, 201), f"update me failed: {r.status_code} {r.text}"
        # Grab a hairstyle_id
        hs = requests.get(f"{BASE_URL}/api/hairstyles").json()
        hairstyle_id = hs[0]["id"] if isinstance(hs, list) and hs else "box-braids"
        # Add 3 portfolio items
        for i in range(3):
            rp = requests.post(f"{BASE_URL}/api/portfolio", headers=h, json={
                "hairstyle_id": hairstyle_id,
                "photo_url": tiny_png_full,
                "caption": f"pf {i}",
            })
            assert rp.status_code == 200, f"portfolio {i} failed: {rp.status_code} {rp.text}"
        # Apply
        r = requests.post(
            f"{BASE_URL}/api/founding-pro/apply",
            headers=h,
            json={"intro": "Studio in Brooklyn"},
        )
        assert r.status_code == 200, f"apply failed: {r.status_code} {r.text}"
        assert r.json().get("status") == "pending"

    def test_customer_forbidden(self, customer_auth):
        r = requests.post(
            f"{BASE_URL}/api/founding-pro/apply",
            headers=auth_headers(customer_auth["token"]),
            json={"intro": "test"},
        )
        assert r.status_code == 403


# ---------- Section 7: Notification preferences ----------
class TestNotificationPreferences:
    def test_get_default_prefs(self, customer_auth):
        r = requests.get(
            f"{BASE_URL}/api/notifications/preferences",
            headers=auth_headers(customer_auth["token"]),
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "prefs" in j

    def test_put_then_get(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        new_prefs = {"prefs": {"*": {"in_app": True, "push": False, "email": True}}}
        r = requests.put(f"{BASE_URL}/api/notifications/preferences", headers=h, json=new_prefs)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{BASE_URL}/api/notifications/preferences", headers=h)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert j["prefs"]["*"]["email"] is True
        assert j["prefs"]["*"]["push"] is False
