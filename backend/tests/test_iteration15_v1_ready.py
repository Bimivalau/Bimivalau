"""Iteration 15 — v1 store-ready backend tests.

Covers:
- DELETE /api/auth/me (self account deletion, token invalidated)
- POST /api/auth/report (user reports; self-report → 400)
- POST/DELETE /api/auth/block/{id} (block/unblock; self-block → 400)
- Booking check-in code: 6 chars, no confusable 0/O/I/1.
"""
import uuid
import requests
from datetime import datetime, timezone, timedelta

from conftest import BASE_URL, auth_headers


# ---------------- Account deletion ----------------
class TestDeleteAccount:
    def _register(self):
        email = f"test_del_{uuid.uuid4().hex[:8]}@braids.demo"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "demo1234",
            "name": "Test Delete",
            "role": "customer",
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        return email, r.json()["access_token"]

    def test_delete_me_then_me_returns_401(self):
        email, token = self._register()
        h = auth_headers(token)
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == email

        d = requests.delete(f"{BASE_URL}/api/auth/me", headers=h, timeout=15)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

        me2 = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=15)
        assert me2.status_code == 401, f"expected 401 after delete, got {me2.status_code}"


# ---------------- Report user ----------------
class TestReportUser:
    def test_report_success(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        r = requests.post(f"{BASE_URL}/api/auth/report", headers=h, json={
            "target_user_id": "stub_target_" + uuid.uuid4().hex[:6],
            "reason": "harassment",
            "details": "test iteration 15",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_report_self_returns_400(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        r = requests.post(f"{BASE_URL}/api/auth/report", headers=h, json={
            "target_user_id": customer_auth["user"]["id"],
            "reason": "spam",
        }, timeout=15)
        assert r.status_code == 400, r.text


# ---------------- Block / Unblock ----------------
class TestBlockUser:
    def test_block_and_unblock(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        tgt = "stub_target_" + uuid.uuid4().hex[:6]
        r = requests.post(f"{BASE_URL}/api/auth/block/{tgt}", headers=h, timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True

        u = requests.delete(f"{BASE_URL}/api/auth/block/{tgt}", headers=h, timeout=15)
        assert u.status_code == 200 and u.json().get("ok") is True

    def test_block_self_returns_400(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        own = customer_auth["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/auth/block/{own}", headers=h, timeout=15)
        assert r.status_code == 400, r.text


# ---------------- Booking code format ----------------
class TestBookingCode:
    def test_booking_code_shape(self, customer_auth):
        h = auth_headers(customer_auth["token"])
        # find a hairstyle and a hairdresser that specializes in it
        hairstyles = requests.get(f"{BASE_URL}/api/hairstyles?limit=5", headers=h, timeout=15).json()
        assert hairstyles, "no hairstyles seeded"
        hs = hairstyles[0]
        hs_id = hs["id"]
        r_hd = requests.get(f"{BASE_URL}/api/hairstyles/{hs_id}/hairdressers", headers=h, timeout=15)
        assert r_hd.status_code == 200, r_hd.text
        hds = r_hd.json().get("results", [])
        assert hds, "no hairdressers for this style"
        hd = hds[0]

        # far-future datetime avoids conflicts
        dt = (datetime.now(timezone.utc) + timedelta(days=45)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "hairdresser_id": hd["id"],
            "hairstyle_id": hs_id,
            "appointment_datetime": dt.isoformat(),
        }
        r = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        # Occasional 409 if collision — retry with +1 hour
        if r.status_code == 409:
            payload["appointment_datetime"] = (dt + timedelta(hours=3)).isoformat()
            r = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        code = b.get("code") or b.get("booking_code")
        assert code, f"no code in {b}"
        assert len(code) == 6, f"expected 6 chars, got {code!r}"
        for c in code:
            assert c not in "0OI1", f"confusable char {c!r} in code {code!r}"
        # cleanup — cancel
        try:
            requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel", headers=h, timeout=15)
        except Exception:
            pass
