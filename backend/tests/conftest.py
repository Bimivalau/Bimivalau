import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
# Load frontend env for public URL
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def customer_auth():
    data = _login("sara@braids.demo", "demo1234")
    return {"token": data["access_token"], "user": data["user"]}


@pytest.fixture(scope="session")
def pro_auth():
    data = _login("amara@braids.demo", "demo1234")
    return {"token": data["access_token"], "user": data["user"]}


@pytest.fixture(scope="session")
def pro_standard_auth():
    # Kenya is standard-plan pro
    data = _login("kenya@braids.demo", "demo1234")
    return {"token": data["access_token"], "user": data["user"]}


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
