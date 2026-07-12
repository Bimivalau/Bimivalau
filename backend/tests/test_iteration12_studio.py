"""Iteration 12 — Studio Hub / Services CRUD backend tests.

Covers all 10 backend spec items:
  1. GET /api/hairdressers/me returns hairdresser profile
  2. GET /api/hairdressers/me/studio-status baseline (amara has no services)
  3. POST /api/hairdressers/me/services creates a service with new fields
  4. GET /api/hairdressers/me/services returns the row with new fields
  5. studio-status after creation: first_incomplete no longer "services"
  6. POST /api/services/{sid}/toggle flips active
  7. GET /api/studios/{hid}/services public read (no auth)
  8. DELETE /api/hairdressers/me/services/{sid}
  9. Regression: onboarding-status + onboarding-complete still identical
 10. Auth: non-hairdresser hitting studio-status → 403
"""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def amara():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "amara@braids.demo", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def sara():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "sara@braids.demo", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def hairstyle_id():
    r = requests.get(f"{BASE}/api/hairstyles", timeout=15)
    assert r.status_code == 200
    styles = r.json()
    assert len(styles) > 0
    return styles[0]["id"]


# --- 1. GET /hairdressers/me returns profile ---
def test_1_get_me_returns_profile(amara):
    r = requests.get(f"{BASE}/api/hairdressers/me", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # amara is a fully seeded pro
    assert data.get("bio"), "bio missing"
    assert data.get("salon_name"), "salon_name missing"
    assert data.get("user_id") == amara["user"]["id"]


# --- 2. studio-status baseline ---
def test_2_studio_status_baseline(amara):
    # clean any pre-existing services this test may have left
    lst = requests.get(f"{BASE}/api/hairdressers/me/services", headers=H(amara["access_token"]), timeout=15).json()
    for s in lst:
        requests.delete(f"{BASE}/api/hairdressers/me/services/{s['id']}", headers=H(amara["access_token"]), timeout=15)

    r = requests.get(f"{BASE}/api/hairdressers/me/studio-status", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["onboarding_completed"] is True
    assert isinstance(d["sections"], list) and len(d["sections"]) == 5
    keys = [s["key"] for s in d["sections"]]
    for k in ["availability", "services", "portfolio", "info", "verification"]:
        assert k in keys, f"missing section {k}"
    assert d["first_incomplete"] == "services", f"expected first_incomplete=services, got {d['first_incomplete']}"
    assert d["progress"]["total"] == 5
    assert d["progress"]["done"] == 4
    assert d["progress"]["percent"] == 80


# --- 3. Create service with new fields ---
@pytest.fixture(scope="module")
def created_sid(amara, hairstyle_id):
    body = {
        "hairstyle_id": hairstyle_id,
        "price": 180,
        "price_max": 220,
        "duration_minutes": 240,
        "hair_included": False,
        "hair_lengths": ["Long"],
        "hair_brands": ["Kanekalon"],
        "difficulty": "Advanced",
        "active": True,
    }
    r = requests.post(f"{BASE}/api/hairdressers/me/services", json=body, headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("id")
    return d["id"]


def test_3_create_service(created_sid):
    assert created_sid  # created via fixture


# --- 4. list services returns new fields ---
def test_4_list_services_returns_new_fields(amara, created_sid):
    r = requests.get(f"{BASE}/api/hairdressers/me/services", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200
    items = r.json()
    match = next((it for it in items if it["id"] == created_sid), None)
    assert match, f"created service {created_sid} not in list"
    assert match["price_max"] == 220
    assert match["hair_lengths"] == ["Long"]
    assert match["hair_brands"] == ["Kanekalon"]
    assert match["difficulty"] == "Advanced"
    assert match["price"] == 180
    assert match["duration_minutes"] == 240


# --- 5. studio-status after creation ---
def test_5_studio_status_after_service_create(amara, created_sid):
    r = requests.get(f"{BASE}/api/hairdressers/me/studio-status", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["first_incomplete"] != "services", f"services should be complete now, got first_incomplete={d['first_incomplete']}"
    svc_section = next(s for s in d["sections"] if s["key"] == "services")
    assert svc_section["complete"] is True
    assert svc_section["count"] >= 1


# --- 6. toggle active ---
def test_6_toggle_service_active(amara, created_sid):
    tok = H(amara["access_token"])
    r1 = requests.post(f"{BASE}/api/services/{created_sid}/toggle", headers=tok, timeout=15)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["active"] is False

    r2 = requests.post(f"{BASE}/api/services/{created_sid}/toggle", headers=tok, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["active"] is True


# --- 7. Public studio services endpoint ---
def test_7_public_studio_services(amara, created_sid):
    hid = amara["user"]["id"]
    # no auth headers
    r = requests.get(f"{BASE}/api/studios/{hid}/services?active_only=false", timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    ids = [it["id"] for it in items]
    assert created_sid in ids


def test_7b_public_studio_services_default_active_only(amara, created_sid):
    # Flip inactive, then default (active_only=True) should exclude it
    tok = H(amara["access_token"])
    requests.post(f"{BASE}/api/services/{created_sid}/toggle", headers=tok, timeout=15)  # → false
    try:
        hid = amara["user"]["id"]
        r = requests.get(f"{BASE}/api/studios/{hid}/services", timeout=15)
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()]
        assert created_sid not in ids, "inactive service should be hidden by default"
    finally:
        requests.post(f"{BASE}/api/services/{created_sid}/toggle", headers=tok, timeout=15)  # → true


# --- 8. Delete ---
def test_8_delete_service(amara, hairstyle_id):
    # create a fresh one to delete
    body = {"hairstyle_id": hairstyle_id, "price": 100, "duration_minutes": 60, "hair_included": False, "active": True}
    tok = H(amara["access_token"])
    cr = requests.post(f"{BASE}/api/hairdressers/me/services", json=body, headers=tok, timeout=15)
    assert cr.status_code == 200
    sid = cr.json()["id"]
    dr = requests.delete(f"{BASE}/api/hairdressers/me/services/{sid}", headers=tok, timeout=15)
    assert dr.status_code == 200
    # verify: it's hard-deleted — should no longer show up anywhere
    hid = amara["user"]["id"]
    pub = requests.get(f"{BASE}/api/studios/{hid}/services", timeout=15).json()
    ids = [it["id"] for it in pub]
    assert sid not in ids


# --- 9. Regression: onboarding-status + onboarding-complete ---
def test_9a_onboarding_status_regression(amara):
    r = requests.get(f"{BASE}/api/hairdressers/me/onboarding-status", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    # amara has completed onboarding
    assert d["completed"] is True
    assert d["has_availability"] is True
    assert d["has_portfolio"] is True


def test_9b_onboarding_complete_idempotent(amara):
    r = requests.post(f"{BASE}/api/hairdressers/me/onboarding-complete", headers=H(amara["access_token"]), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("completed") is True


# --- 10. Auth: non-hairdresser 403 ---
def test_10_customer_forbidden_on_studio_status(sara):
    r = requests.get(f"{BASE}/api/hairdressers/me/studio-status", headers=H(sara["access_token"]), timeout=15)
    assert r.status_code == 403, r.text


def test_10b_customer_forbidden_on_me(sara):
    r = requests.get(f"{BASE}/api/hairdressers/me", headers=H(sara["access_token"]), timeout=15)
    assert r.status_code == 403


def test_10c_unauth_forbidden_on_toggle():
    r = requests.post(f"{BASE}/api/services/anything/toggle", timeout=15)
    assert r.status_code in (401, 403)


# --- Cleanup for created_sid — soft-delete so amara returns to services-empty state ---
def test_zz_cleanup(amara, created_sid):
    tok = H(amara["access_token"])
    lst = requests.get(f"{BASE}/api/hairdressers/me/services", headers=tok, timeout=15).json()
    for s in lst:
        requests.delete(f"{BASE}/api/hairdressers/me/services/{s['id']}", headers=tok, timeout=15)
