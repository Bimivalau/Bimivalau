"""Comprehensive backend tests for BraidsCommunity."""
import requests
import uuid
from datetime import datetime, timedelta, timezone
from conftest import BASE_URL, auth_headers


# ---------------- AUTH ----------------
class TestAuth:
    def test_login_customer(self, customer_auth):
        assert customer_auth["user"]["role"] == "customer"
        assert customer_auth["user"]["email"] == "sara@braids.demo"

    def test_login_hairdresser(self, pro_auth):
        assert pro_auth["user"]["role"] == "hairdresser"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "sara@braids.demo", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == "sara@braids.demo"

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_register_and_duplicate(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"email": email, "password": "test1234", "name": "Test User", "role": "customer"}
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == email
        assert "access_token" in data
        # duplicate
        r2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r2.status_code == 400

    def test_register_hairdresser_creates_profile(self):
        email = f"test_pro_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "Test Pro", "role": "hairdresser"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        # profile should exist
        r2 = requests.get(f"{BASE_URL}/api/hairdressers/me/dashboard", headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["profile"] is not None

    def test_plan_toggle(self, customer_auth):
        tok = customer_auth["token"]
        r = requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "unlimited"},
                          headers=auth_headers(tok))
        assert r.status_code == 200
        assert r.json()["plan"] == "unlimited"
        # revert
        r = requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"},
                          headers=auth_headers(tok))
        assert r.status_code == 200
        assert r.json()["plan"] == "standard"


# ---------------- HAIRSTYLES ----------------
class TestHairstyles:
    def test_list(self):
        r = requests.get(f"{BASE_URL}/api/hairstyles")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 6
        assert all("id" in x for x in data)

    def test_categories(self):
        r = requests.get(f"{BASE_URL}/api/hairstyles/categories")
        assert r.status_code == 200
        assert "categories" in r.json()
        assert len(r.json()["categories"]) >= 3

    def test_get_by_id(self):
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.get(f"{BASE_URL}/api/hairstyles/{items[0]['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == items[0]["id"]

    def test_get_by_id_404(self):
        r = requests.get(f"{BASE_URL}/api/hairstyles/does-not-exist")
        assert r.status_code == 404

    def test_hairdressers_for_style_gated_standard(self, customer_auth):
        # Ensure customer is standard
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"},
                      headers=auth_headers(customer_auth["token"]))
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        sid = items[0]["id"]
        r = requests.get(f"{BASE_URL}/api/hairstyles/{sid}/hairdressers",
                         headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["gated"] is True
        assert len(d["results"]) <= 3
        for h in d["results"]:
            assert h.get("location_blurred") is True

    def test_hairdressers_for_style_unlimited(self, customer_auth):
        tok = customer_auth["token"]
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "unlimited"}, headers=auth_headers(tok))
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        sid = items[0]["id"]
        r = requests.get(f"{BASE_URL}/api/hairstyles/{sid}/hairdressers", headers=auth_headers(tok))
        assert r.status_code == 200
        assert r.json()["gated"] is False
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"}, headers=auth_headers(tok))


# ---------------- HAIRDRESSER DETAIL ----------------
class TestHairdresserDetail:
    def test_detail_standard_blurred(self, customer_auth):
        """Use a fresh customer without any bookings to verify blur behavior."""
        # Register a fresh customer to guarantee no bookings
        email = f"test_blur_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "test1234", "name": "Blur Test", "role": "customer"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        # standard plan by default
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.get(f"{BASE_URL}/api/hairstyles/{items[0]['id']}/hairdressers",
                         headers=auth_headers(tok))
        hid = r.json()["results"][0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/hairdressers/{hid}", headers=auth_headers(tok))
        assert r2.status_code == 200
        d = r2.json()
        assert "portfolio" in d and "reviews" in d and "availability" in d
        assert "specialties" in d and "badges" in d
        assert d.get("location_blurred") is True
        assert isinstance(d["badges"], list)

    def test_detail_404(self):
        r = requests.get(f"{BASE_URL}/api/hairdressers/nope")
        assert r.status_code == 404


# ---------------- SEARCH ----------------
class TestSearch:
    def test_search_no_auth_gated(self):
        r = requests.get(f"{BASE_URL}/api/search")
        assert r.status_code == 200
        assert r.json()["gated"] is True
        assert len(r.json()["results"]) <= 3

    def test_search_with_category(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/search?category=Braids",
                         headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200
        assert isinstance(r.json()["results"], list)

    def test_search_min_rating(self):
        r = requests.get(f"{BASE_URL}/api/search?min_rating=4.7")
        assert r.status_code == 200
        for h in r.json()["results"]:
            assert h["rating_avg"] >= 4.7

    def test_search_query(self):
        r = requests.get(f"{BASE_URL}/api/search?q=harlem")
        assert r.status_code == 200


# ---------------- SLOTS ----------------
class TestSlots:
    def test_slots_returns_hours(self, customer_auth):
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.get(f"{BASE_URL}/api/hairstyles/{items[0]['id']}/hairdressers",
                         headers=auth_headers(customer_auth["token"]))
        hid = r.json()["results"][0]["id"]
        # pick a Monday (weekday 0) 2 weeks out
        d = datetime.now() + timedelta(days=14)
        while d.weekday() > 5:  # Mon-Sat only
            d += timedelta(days=1)
        date_str = d.strftime("%Y-%m-%d")
        r2 = requests.get(f"{BASE_URL}/api/hairdressers/{hid}/slots?date={date_str}")
        assert r2.status_code == 200
        slots = r2.json()["slots"]
        assert isinstance(slots, list)
        assert len(slots) >= 5  # 9-18 = 9 slots


# ---------------- BOOKING FLOW ----------------
class TestBookingFlow:
    def test_full_flow(self, customer_auth, pro_auth):
        cust_tok = customer_auth["token"]
        pro_tok = pro_auth["token"]
        pro_id = pro_auth["user"]["id"]

        # Get a style that pro specializes in
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}", headers=auth_headers(cust_tok))
        assert r.status_code == 200
        detail = r.json()
        assert len(detail["specialties"]) > 0
        style_id = detail["specialties"][0]["id"]

        # Get slots
        d = datetime.now() + timedelta(days=21)
        while d.weekday() > 5:
            d += timedelta(days=1)
        date_str = d.strftime("%Y-%m-%d")
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={date_str}").json()["slots"]
        assert len(slots) > 0
        slot = slots[0]

        # Create booking
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slot},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200, r.text
        booking = r.json()
        assert booking["status"] == "confirmed"
        bid = booking["id"]

        # Conflict test
        r_conflict = requests.post(f"{BASE_URL}/api/bookings",
                                   json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                         "appointment_datetime": slot},
                                   headers=auth_headers(cust_tok))
        assert r_conflict.status_code == 409

        # Pro cannot book
        r_pro_book = requests.post(f"{BASE_URL}/api/bookings",
                                   json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                         "appointment_datetime": (datetime.now() + timedelta(days=30)).isoformat()},
                                   headers=auth_headers(pro_tok))
        assert r_pro_book.status_code == 403

        # Notification created
        notifs = requests.get(f"{BASE_URL}/api/notifications/me", headers=auth_headers(cust_tok)).json()
        assert any(n.get("related_booking_id") == bid for n in notifs)

        # My bookings
        my = requests.get(f"{BASE_URL}/api/bookings/me", headers=auth_headers(cust_tok)).json()
        assert any(b["id"] == bid for b in my)

        # Get by id
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=auth_headers(cust_tok))
        assert r.status_code == 200
        assert r.json()["salon_name"]  # enriched

        # Cannot review before completion
        r = requests.post(f"{BASE_URL}/api/reviews",
                         json={"booking_id": bid, "rating": 5, "comment": "TEST review"},
                         headers=auth_headers(cust_tok))
        assert r.status_code == 400

        # Check-in (customer)
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/check-in", headers=auth_headers(cust_tok))
        assert r.status_code == 200

        # Cannot check-in again
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/check-in", headers=auth_headers(cust_tok))
        assert r.status_code == 400

        # Customer cannot complete
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete", headers=auth_headers(cust_tok))
        assert r.status_code == 403

        # Pro completes
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete", headers=auth_headers(pro_tok))
        assert r.status_code == 200

        # Now review works
        r = requests.post(f"{BASE_URL}/api/reviews",
                          json={"booking_id": bid, "rating": 5, "comment": "TEST great!"},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200

        # Duplicate review blocked
        r2 = requests.post(f"{BASE_URL}/api/reviews",
                           json={"booking_id": bid, "rating": 4, "comment": "TEST dup"},
                           headers=auth_headers(cust_tok))
        assert r2.status_code == 400

    def test_cancel(self, customer_auth, pro_auth):
        cust_tok = customer_auth["token"]
        pro_id = pro_auth["user"]["id"]

        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}", headers=auth_headers(cust_tok))
        style_id = r.json()["specialties"][0]["id"]

        d = datetime.now() + timedelta(days=25)
        while d.weekday() > 5:
            d += timedelta(days=1)
        date_str = d.strftime("%Y-%m-%d")
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={date_str}").json()["slots"]
        slot = slots[-1]  # different slot

        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slot},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200
        bid = r.json()["id"]

        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/cancel", headers=auth_headers(cust_tok))
        assert r.status_code == 200


# ---------------- FAVORITES ----------------
class TestFavorites:
    def test_favorites_flow(self, customer_auth, pro_auth):
        tok = customer_auth["token"]
        pro_id = pro_auth["user"]["id"]

        r = requests.post(f"{BASE_URL}/api/favorites", json={"hairdresser_id": pro_id},
                          headers=auth_headers(tok))
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/favorites/me", headers=auth_headers(tok))
        assert r.status_code == 200
        assert any(h["id"] == pro_id for h in r.json())

        # Idempotency
        r = requests.post(f"{BASE_URL}/api/favorites", json={"hairdresser_id": pro_id},
                          headers=auth_headers(tok))
        assert r.status_code == 200

        r = requests.delete(f"{BASE_URL}/api/favorites/{pro_id}", headers=auth_headers(tok))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/favorites/me", headers=auth_headers(tok))
        assert not any(h["id"] == pro_id for h in r.json())


# ---------------- PORTFOLIO ----------------
class TestPortfolio:
    def test_get_portfolio_me(self, pro_auth):
        r = requests.get(f"{BASE_URL}/api/portfolio/me", headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_add_and_delete(self, pro_auth):
        tok = pro_auth["token"]
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        r = requests.post(f"{BASE_URL}/api/portfolio",
                          json={"hairstyle_id": items[0]["id"],
                                "photo_url": "https://images.unsplash.com/test.jpg",
                                "caption": "TEST caption"},
                          headers=auth_headers(tok))
        assert r.status_code == 200
        item_id = r.json()["id"]
        # delete
        r = requests.delete(f"{BASE_URL}/api/portfolio/{item_id}", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_standard_plan_cap(self, pro_standard_auth):
        """Kenya is a Standard-tier braider — portfolio cap is 25.
        Attempt to add up to the cap, then verify the (cap+1)th fails with 402."""
        tok = pro_standard_auth["token"]
        items = requests.get(f"{BASE_URL}/api/hairstyles").json()
        current = requests.get(f"{BASE_URL}/api/portfolio/me", headers=auth_headers(tok)).json()
        added = []
        to_add = max(0, 25 - len(current))
        for _ in range(to_add):
            r = requests.post(f"{BASE_URL}/api/portfolio",
                              json={"hairstyle_id": items[0]["id"],
                                    "photo_url": "https://images.unsplash.com/TEST.jpg",
                                    "caption": "TEST cap"},
                              headers=auth_headers(tok))
            if r.status_code == 200:
                added.append(r.json()["id"])
        r = requests.post(f"{BASE_URL}/api/portfolio",
                          json={"hairstyle_id": items[0]["id"],
                                "photo_url": "https://images.unsplash.com/TEST.jpg",
                                "caption": "TEST over"},
                          headers=auth_headers(tok))
        assert r.status_code == 402
        # cleanup
        for iid in added:
            requests.delete(f"{BASE_URL}/api/portfolio/{iid}", headers=auth_headers(tok))


# ---------------- AVAILABILITY ----------------
class TestAvailability:
    def test_get_availability(self, pro_auth):
        r = requests.get(f"{BASE_URL}/api/availability/me", headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_put_availability(self, pro_auth):
        tok = pro_auth["token"]
        # get current
        original = requests.get(f"{BASE_URL}/api/availability/me", headers=auth_headers(tok)).json()
        # set new
        new = [{"day_of_week": 0, "start_time": "10:00", "end_time": "16:00"}]
        r = requests.put(f"{BASE_URL}/api/availability/me", json=new, headers=auth_headers(tok))
        assert r.status_code == 200
        got = requests.get(f"{BASE_URL}/api/availability/me", headers=auth_headers(tok)).json()
        assert len(got) == 1
        # restore
        restore = [{"day_of_week": a["day_of_week"], "start_time": a["start_time"], "end_time": a["end_time"]} for a in original]
        requests.put(f"{BASE_URL}/api/availability/me", json=restore, headers=auth_headers(tok))


# ---------------- NOTIFICATIONS ----------------
class TestNotifications:
    def test_get_notifications(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/notifications/me",
                         headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- SEED ----------------
class TestSeed:
    def test_seed_idempotent(self):
        r = requests.post(f"{BASE_URL}/api/seed")
        assert r.status_code == 200
        assert r.json()["status"] == "already_seeded"
