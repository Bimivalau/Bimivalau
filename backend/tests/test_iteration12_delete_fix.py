"""Iteration 12 P1 fix — DELETE /hairdressers/me/services/{sid} hard-delete regression.

- Hard delete (row must vanish from list, not just flip active:false)
- 404 on nonexistent id (for a hairdresser caller)
- 403 for non-hairdresser (customer) caller
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
    return r.json()[0]["id"]


def test_hard_delete_removes_row_from_list(amara, hairstyle_id):
    tok = H(amara["access_token"])
    # Clean slate
    for s in requests.get(f"{BASE}/api/hairdressers/me/services", headers=tok, timeout=15).json():
        requests.delete(f"{BASE}/api/hairdressers/me/services/{s['id']}", headers=tok, timeout=15)

    body = {
        "hairstyle_id": hairstyle_id,
        "price": 180,
        "duration_minutes": 240,
        "hair_included": False,
        "active": True,
    }
    cr = requests.post(f"{BASE}/api/hairdressers/me/services", json=body, headers=tok, timeout=15)
    assert cr.status_code == 200, cr.text
    sid = cr.json()["id"]

    # Confirm listed
    lst = requests.get(f"{BASE}/api/hairdressers/me/services", headers=tok, timeout=15).json()
    assert any(s["id"] == sid for s in lst), "service should appear before delete"

    # Delete
    dr = requests.delete(f"{BASE}/api/hairdressers/me/services/{sid}", headers=tok, timeout=15)
    assert dr.status_code == 200, dr.text
    assert dr.json().get("ok") is True

    # HARD delete — row must be gone, not just active:false
    lst2 = requests.get(f"{BASE}/api/hairdressers/me/services", headers=tok, timeout=15).json()
    assert not any(s["id"] == sid for s in lst2), (
        f"service {sid} still present after delete — hard-delete regression. list={lst2}"
    )
    # For strict verification: after deletion of the only service, list must be empty
    assert len(lst2) == 0, f"expected empty list, got {lst2}"


def test_delete_nonexistent_returns_404(amara):
    tok = H(amara["access_token"])
    r = requests.delete(f"{BASE}/api/hairdressers/me/services/does-not-exist-{os.urandom(4).hex()}",
                        headers=tok, timeout=15)
    assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"


def test_delete_by_customer_returns_403(sara):
    tok = H(sara["access_token"])
    r = requests.delete(f"{BASE}/api/hairdressers/me/services/anything", headers=tok, timeout=15)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


def test_delete_unauth_returns_401_or_403():
    r = requests.delete(f"{BASE}/api/hairdressers/me/services/anything", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"
