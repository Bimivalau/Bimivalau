"""Iteration 4 — Google Sign-In (Emergent-managed) auth endpoint tests.
Covers /api/auth/google contract + regression on /api/auth/login."""
import os
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


# ---- /api/auth/google endpoint contract ----
class TestGoogleAuthContract:
    def test_missing_session_id_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={}, timeout=15)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text}"

    def test_wrong_type_session_id_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": None}, timeout=15)
        assert r.status_code == 422

    def test_invalid_session_id_returns_401_with_detail(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google",
            json={"session_id": "definitely-not-a-real-session-id-xyz-42"},
            timeout=15,
        )
        # Must be 401 (not 500 / not 502). Detail must match spec.
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("detail") == "Invalid or expired Google session"

    def test_empty_string_session_id_returns_401_or_422(self):
        # Backend should treat empty session_id as invalid — but allow either 401 (upstream rejects) or 422 (pydantic constraint).
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": ""}, timeout=15)
        assert r.status_code in (401, 422), f"got {r.status_code}: {r.text}"


# ---- /api/auth/login regression ----
class TestLoginRegression:
    def test_customer_login_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "sara@braids.demo", "password": "demo1234"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert data["user"]["email"] == "sara@braids.demo"
        assert data["user"]["role"] == "customer"

    def test_pro_login_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "amara@braids.demo", "password": "demo1234"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "hairdresser"

    def test_admin_login_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@braids.demo", "password": "demo1234"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"

    def test_wrong_password_still_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "sara@braids.demo", "password": "wrongwrong"},
            timeout=15,
        )
        assert r.status_code == 401


# ---- Regression: JWT from other endpoints (login) still opens all resource routes ----
class TestExistingEndpointsUnbroken:
    @pytest.fixture(scope="class")
    def customer_token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "sara@braids.demo", "password": "demo1234"},
            timeout=15,
        )
        assert r.status_code == 200
        return r.json()["access_token"]

    def test_hairstyles_list_ok(self):
        r = requests.get(f"{BASE_URL}/api/hairstyles", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1

    def test_search_ok(self):
        r = requests.get(f"{BASE_URL}/api/search", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # /api/search returns {results: [...], gated: bool}
        assert isinstance(body, dict) and "results" in body
        assert isinstance(body["results"], list)

    def test_bookings_me_ok_for_customer(self, customer_token):
        r = requests.get(
            f"{BASE_URL}/api/bookings/me",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_auth_me_returns_userout_shape(self, customer_token):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        u = r.json()
        # UserOut shape unchanged
        for k in ("id", "email", "name", "role", "plan"):
            assert k in u, f"UserOut missing key {k}: {u}"
