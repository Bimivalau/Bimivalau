"""Iteration 2 additions: featured stylist, booking code, check-in-by-code,
verification workflow, admin endpoints, phone privacy, RegisterIn role guard."""
import requests
import uuid
import re
from datetime import datetime, timedelta, timezone
from conftest import BASE_URL, auth_headers, _login


ALLOWED_CHARS = re.compile(r"^[A-HJ-NP-Z2-9]{6}$")  # excludes 0,O,1,I


def _admin_auth():
    d = _login("admin@braids.demo", "demo1234")
    return {"token": d["access_token"], "user": d["user"]}


def _pending_pro_auth():
    d = _login("simone@braids.demo", "demo1234")
    return {"token": d["access_token"], "user": d["user"]}


# ---------------- FEATURED STYLIST ----------------
class TestFeaturedStylist:
    def test_returns_approved_unlimited(self):
        r = requests.get(f"{BASE_URL}/api/featured-stylist")
        assert r.status_code == 200
        d = r.json()
        assert d is not None, "No featured stylist returned"
        assert d.get("verification_status") == "approved"
        assert "name" in d and "salon_name" in d
        # phone must not be exposed
        assert "phone" not in d or d.get("phone") is None

    def test_deterministic_rotation(self):
        r1 = requests.get(f"{BASE_URL}/api/featured-stylist").json()
        r2 = requests.get(f"{BASE_URL}/api/featured-stylist").json()
        assert r1["id"] == r2["id"], "Featured stylist not deterministic within same ISO week"


# ---------------- BOOKING CODE & CHECK-IN-BY-CODE ----------------
class TestBookingCode:
    def _create_booking(self, customer_auth, pro_auth):
        cust_tok = customer_auth["token"]
        pro_id = pro_auth["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}", headers=auth_headers(cust_tok))
        style_id = r.json()["specialties"][0]["id"]
        d = datetime.now() + timedelta(days=35)
        while d.weekday() > 5:
            d += timedelta(days=1)
        date_str = d.strftime("%Y-%m-%d")
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={date_str}").json()["slots"]
        # pick a slot far enough to avoid conflicts
        slot = slots[3] if len(slots) > 3 else slots[0]
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slot},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200, r.text
        return r.json()

    def test_booking_returns_valid_code(self, customer_auth, pro_auth):
        b = self._create_booking(customer_auth, pro_auth)
        assert "code" in b, "Booking response missing code"
        code = b["code"]
        assert ALLOWED_CHARS.match(code), f"Code {code} contains forbidden chars"
        # cleanup
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel",
                      headers=auth_headers(customer_auth["token"]))

    def test_codes_unique_across_bookings(self, customer_auth, pro_auth):
        codes = set()
        created = []
        for _ in range(3):
            b = self._create_booking(customer_auth, pro_auth)
            codes.add(b["code"])
            created.append(b["id"])
        assert len(codes) == 3, "Booking codes are not unique"
        for bid in created:
            requests.post(f"{BASE_URL}/api/bookings/{bid}/cancel",
                          headers=auth_headers(customer_auth["token"]))

    def test_checkin_by_code_success(self, customer_auth, pro_auth):
        b = self._create_booking(customer_auth, pro_auth)
        code = b["code"]
        r = requests.post(f"{BASE_URL}/api/bookings/check-in-by-code",
                          json={"code": code},
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/bookings/{b['id']}", headers=auth_headers(customer_auth["token"]))
        assert r2.json()["status"] == "checked_in"

    def test_checkin_by_code_wrong_returns_404(self, customer_auth):
        r = requests.post(f"{BASE_URL}/api/bookings/check-in-by-code",
                          json={"code": "ZZZZZZ"},
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 404

    def test_checkin_by_code_wrong_user_returns_403(self, customer_auth, pro_auth):
        # Create booking as sara; try to check in as amara (pro is booked-with, so allowed)
        # We need another user unrelated to the booking. Register a fresh customer.
        b = self._create_booking(customer_auth, pro_auth)
        email = f"test_wrong_{uuid.uuid4().hex[:6]}@example.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "test1234", "name": "Wrong", "role": "customer"})
        other_tok = reg.json()["access_token"]
        r = requests.post(f"{BASE_URL}/api/bookings/check-in-by-code",
                          json={"code": b["code"]},
                          headers=auth_headers(other_tok))
        assert r.status_code == 403, r.text
        # cleanup
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel",
                      headers=auth_headers(customer_auth["token"]))

    def test_legacy_checkin_still_works(self, customer_auth, pro_auth):
        b = self._create_booking(customer_auth, pro_auth)
        r = requests.post(f"{BASE_URL}/api/bookings/{b['id']}/check-in",
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200

    def test_bookings_me_includes_code(self, customer_auth, pro_auth):
        b = self._create_booking(customer_auth, pro_auth)
        my = requests.get(f"{BASE_URL}/api/bookings/me",
                          headers=auth_headers(customer_auth["token"])).json()
        found = next((x for x in my if x["id"] == b["id"]), None)
        assert found is not None
        assert found.get("code") == b["code"]
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel",
                      headers=auth_headers(customer_auth["token"]))


# ---------------- VERIFICATION WORKFLOW ----------------
class TestVerification:
    def test_submit_and_get_verification(self):
        # register a new pro
        email = f"test_verif_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "Verif Pro", "role": "hairdresser"})
        tok = r.json()["access_token"]
        # submit
        r = requests.post(f"{BASE_URL}/api/hairdressers/me/submit-verification",
                          json={"license_url": "https://example.com/lic.jpg"},
                          headers=auth_headers(tok))
        assert r.status_code == 200
        # get status
        r = requests.get(f"{BASE_URL}/api/hairdressers/me/verification", headers=auth_headers(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "pending"
        assert d["submitted_at"] is not None
        assert d["license_url"] == "https://example.com/lic.jpg"
        assert d["overdue"] is False  # just submitted
        assert d["days_left_sla"] in (2, 3)

    def test_pending_pro_verification_overdue(self):
        # simone is seeded pending 4 days ago
        tok = _pending_pro_auth()["token"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/me/verification", headers=auth_headers(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "pending"
        assert d["overdue"] is True, f"Simone should be overdue: {d}"
        assert d["days_left_sla"] == 0


# ---------------- PENDING PRO EXCLUSION ----------------
class TestPendingProExclusion:
    def test_pending_excluded_from_hairstyle_pros(self, customer_auth):
        simone_id = _pending_pro_auth()["user"]["id"]
        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        tok = customer_auth["token"]
        # unlimited to see all
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "unlimited"}, headers=auth_headers(tok))
        found_simone = False
        for s in styles:
            r = requests.get(f"{BASE_URL}/api/hairstyles/{s['id']}/hairdressers",
                             headers=auth_headers(tok))
            for h in r.json()["results"]:
                if h["id"] == simone_id:
                    found_simone = True
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"}, headers=auth_headers(tok))
        assert not found_simone, "Pending pro Simone leaked into style hairdressers"

    def test_pending_excluded_from_search(self, customer_auth):
        simone_id = _pending_pro_auth()["user"]["id"]
        tok = customer_auth["token"]
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "unlimited"}, headers=auth_headers(tok))
        r = requests.get(f"{BASE_URL}/api/search", headers=auth_headers(tok))
        results = r.json()["results"]
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"}, headers=auth_headers(tok))
        assert not any(h["id"] == simone_id for h in results), "Pending pro leaked into /search"

    def test_booking_against_pending_pro_returns_400(self, customer_auth):
        simone_id = _pending_pro_auth()["user"]["id"]
        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": simone_id, "hairstyle_id": styles[0]["id"],
                                "appointment_datetime": (datetime.now() + timedelta(days=40)).isoformat()},
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 400, f"Expected 400 for non-approved pro, got {r.status_code}: {r.text}"


# ---------------- ADMIN ----------------
class TestAdmin:
    def test_admin_list_verifications(self):
        tok = _admin_auth()["token"]
        r = requests.get(f"{BASE_URL}/api/admin/verifications", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4
        # overdue flag exists
        assert any(h.get("overdue") is True for h in data), "No overdue flagged"
        # simone should be overdue
        simone = next((h for h in data if h.get("email") == "simone@braids.demo"), None)
        assert simone is not None
        assert simone["overdue"] is True

    def test_admin_filter_by_status(self):
        tok = _admin_auth()["token"]
        r = requests.get(f"{BASE_URL}/api/admin/verifications?status=pending", headers=auth_headers(tok))
        assert r.status_code == 200
        assert all(h["verification_status"] == "pending" for h in r.json())
        r = requests.get(f"{BASE_URL}/api/admin/verifications?status=approved", headers=auth_headers(tok))
        assert all(h["verification_status"] == "approved" for h in r.json())

    def test_admin_forbidden_for_non_admin(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/admin/verifications",
                         headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 403

    def test_admin_decide_approve_and_reject(self):
        admin_tok = _admin_auth()["token"]
        # Create new pending pro to decide on
        email = f"test_admin_dec_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "Dec Pro", "role": "hairdresser"})
        pro_data = r.json()
        pro_id = pro_data["user"]["id"]
        pro_tok = pro_data["access_token"]
        # submit
        requests.post(f"{BASE_URL}/api/hairdressers/me/submit-verification",
                      json={"license_url": "https://example.com/l.jpg"},
                      headers=auth_headers(pro_tok))
        # approve
        r = requests.post(f"{BASE_URL}/api/admin/verifications/{pro_id}/decide",
                          json={"status": "approved", "reason": None},
                          headers=auth_headers(admin_tok))
        assert r.status_code == 200
        # verify status
        r = requests.get(f"{BASE_URL}/api/hairdressers/me/verification", headers=auth_headers(pro_tok))
        d = r.json()
        assert d["status"] == "approved"
        assert d["decided_at"] is not None
        # notification created
        n = requests.get(f"{BASE_URL}/api/notifications/me", headers=auth_headers(pro_tok)).json()
        assert any("approved" in x["type"] for x in n)

        # reject
        r = requests.post(f"{BASE_URL}/api/admin/verifications/{pro_id}/decide",
                          json={"status": "rejected", "reason": "TEST bad photo"},
                          headers=auth_headers(admin_tok))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/hairdressers/me/verification", headers=auth_headers(pro_tok))
        d = r.json()
        assert d["status"] == "rejected"
        assert d["reason"] == "TEST bad photo"


# ---------------- PHONE PRIVACY ----------------
class TestPhonePrivacy:
    def test_auth_me_returns_own_phone(self):
        # register with phone
        email = f"test_phone_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "PhoneUser",
                                "role": "customer", "phone": "+15551234567"})
        tok = r.json()["access_token"]
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(tok))
        assert r.status_code == 200
        assert r.json().get("phone") == "+15551234567"

    def test_hairdresser_detail_no_phone(self, customer_auth, pro_auth):
        pro_id = pro_auth["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}",
                         headers=auth_headers(customer_auth["token"]))
        d = r.json()
        assert "phone" not in d or d.get("phone") is None, f"Phone leaked: {d.get('phone')}"

    def test_search_results_no_phone(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/search", headers=auth_headers(customer_auth["token"]))
        for h in r.json()["results"]:
            assert "phone" not in h or h.get("phone") is None

    def test_hairstyle_hairdressers_no_phone(self, customer_auth):
        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.get(f"{BASE_URL}/api/hairstyles/{styles[0]['id']}/hairdressers",
                         headers=auth_headers(customer_auth["token"]))
        for h in r.json()["results"]:
            assert "phone" not in h or h.get("phone") is None

    def test_booking_response_no_other_phone(self, customer_auth, pro_auth):
        cust_tok = customer_auth["token"]
        pro_id = pro_auth["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}", headers=auth_headers(cust_tok))
        style_id = r.json()["specialties"][0]["id"]
        d = datetime.now() + timedelta(days=45)
        while d.weekday() > 5:
            d += timedelta(days=1)
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={d.strftime('%Y-%m-%d')}").json()["slots"]
        slot = slots[5] if len(slots) > 5 else slots[0]
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slot},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200
        b = r.json()
        assert "phone" not in b
        # cleanup
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel", headers=auth_headers(cust_tok))


# ---------------- REGISTER SCHEMA GUARD ----------------
class TestRegisterSchema:
    def test_register_admin_role_rejected(self):
        email = f"test_admin_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "Sneaky", "role": "admin"})
        assert r.status_code == 422, f"Expected 422 schema rejection, got {r.status_code}: {r.text}"


# ---------------- SEED IDEMPOTENCY (extended) ----------------
class TestSeedIter2:
    def test_admin_and_pending_exist(self):
        # admin login works
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@braids.demo", "password": "demo1234"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"
        # pending pro
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "simone@braids.demo", "password": "demo1234"})
        assert r.status_code == 200
