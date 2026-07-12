"""
P0 Onboarding Navigation Trap fix — backend tests.

Covers spec items 1-9 from review request:
- POST /api/hairdressers/me/onboarding-complete (upsert + safety net; returns {ok, completed})
- GET  /api/hairdressers/me/onboarding-status  (completed/has_availability flags)
- PUT  /api/availability/me                    (sets weekly hours)
- Idempotency, persistence across login, and regression for seeded pros.
"""
import os
import time
import uuid
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# Register a fresh pro shared across all sequenced tests in this module.
@pytest.fixture(scope="module")
def new_pro():
    suffix = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    email = f"TEST_iter11_pro_{suffix}@braids.demo"
    password = "demo1234!TEST"
    payload = {
        "email": email,
        "password": password,
        "name": "Iter11 Test Pro",
        "role": "hairdresser",
        "phone": "5551230000",
        "accept_terms": True,
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    yield {"email": email, "password": password, "token": data["access_token"], "user": data["user"]}


# 1. fresh pro: onboarding-status → completed=false, has_availability=false
def test_1_fresh_pro_onboarding_status_incomplete(new_pro):
    r = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["completed"] is False
    assert js["has_availability"] is False


# 2. onboarding-complete before availability → 400 about weekly hours
def test_2_complete_before_availability_returns_400(new_pro):
    r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete",
                      headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert "weekly" in detail or "hours" in detail, f"unexpected error message: {detail}"


# 3. PUT /availability/me → 200
def test_3_set_weekly_availability(new_pro):
    body = [{"day_of_week": 0, "start_time": "09:00", "end_time": "18:00"}]
    r = requests.put(f"{BASE_URL}/api/availability/me", json=body,
                     headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200, r.text
    arr = r.json()
    assert isinstance(arr, list) and len(arr) == 1
    assert arr[0]["day_of_week"] == 0
    assert arr[0]["start_time"] == "09:00"
    assert arr[0]["end_time"] == "18:00"


# 4. status → has_availability=true, completed still false
def test_4_status_shows_availability_after_set(new_pro):
    r = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200
    js = r.json()
    assert js["has_availability"] is True
    assert js["completed"] is False


# 5. onboarding-complete → 200 {ok:true, completed:true}
def test_5_onboarding_complete_success(new_pro):
    r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete",
                      headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js.get("ok") is True
    assert js.get("completed") is True


# 6. status → completed=true (persisted)
def test_6_status_reflects_completion(new_pro):
    r = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200
    assert r.json()["completed"] is True


# 7. Idempotency: second POST still 200
def test_7_onboarding_complete_idempotent(new_pro):
    r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete",
                      headers=_hdr(new_pro["token"]), timeout=10)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js.get("completed") is True


# 8. Login again → completed still true (persistence across sessions)
def test_8_persistence_across_login(new_pro):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": new_pro["email"], "password": new_pro["password"]},
                      timeout=10)
    assert r.status_code == 200, r.text
    new_token = r.json()["access_token"]
    s = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(new_token), timeout=10)
    assert s.status_code == 200
    assert s.json()["completed"] is True


# 9. Regression: seeded amara@braids.demo → completed=true
def test_9_regression_amara_completed():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "amara@braids.demo", "password": "demo1234"},
                      timeout=10)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(tok), timeout=10)
    assert s.status_code == 200
    assert s.json()["completed"] is True, f"amara should be completed=true: {s.json()}"


# 10. Regression: all other seeded pros are onboarding-completed
@pytest.mark.parametrize("email", ["zara@braids.demo", "kenya@braids.demo", "simone@braids.demo"])
def test_10_regression_other_seeded_pros_completed(email):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": "demo1234"}, timeout=10)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status",
                     headers=_hdr(tok), timeout=10)
    assert s.status_code == 200, s.text
    assert s.json()["completed"] is True, f"{email} should be completed=true: {s.json()}"


# 11. Non-hairdresser cannot call onboarding-complete (customer sara → 403)
def test_11_customer_cannot_complete_onboarding():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "sara@braids.demo", "password": "demo1234"}, timeout=10)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    x = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete",
                      headers=_hdr(tok), timeout=10)
    assert x.status_code == 403, x.text
