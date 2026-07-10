"""Iteration 3 additions: extended pro registration, founding-pro promo, subscriptions,
onboarding, customer ratings & flagging, admin flag queue, reports, featured-stylist cache."""
import requests
import uuid
from datetime import datetime, timedelta, timezone

from conftest import BASE_URL, auth_headers, _login


def _admin_auth():
    d = _login("admin@braids.demo", "demo1234")
    return {"token": d["access_token"], "user": d["user"]}


def _register(email=None, role="hairdresser", **extra):
    email = email or f"test_{role}_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "password": "test1234", "name": "Test User", "role": role}
    payload.update(extra)
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    return r


# ---------- Extended pro registration ----------
class TestExtendedProRegistration:
    def test_register_pro_with_extended_fields_and_appears_in_search(self):
        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        spec_id = styles[0]["id"]
        email = f"test_pro_ext_{uuid.uuid4().hex[:6]}@example.com"
        r = _register(
            email=email, role="hairdresser",
            phone="+15550001111",
            bio="TEST bio for extended pro",
            service_area="Brooklyn",
            salon_name="TEST Salon",
            city="Brooklyn",
            specialty_ids=[spec_id],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        pro_id = data["user"]["id"]
        tok = data["access_token"]
        # Confirm hairdresser doc has the fields
        r2 = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}", headers=auth_headers(tok))
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["bio"] == "TEST bio for extended pro"
        assert d["salon_name"] == "TEST Salon"
        assert d["service_area"] == "Brooklyn"
        assert d["verification_status"] == "unverified"

        # Fresh unverified pros should appear in search (per spec)
        # Search excludes only pending (verification submitted) pros; unverified is allowed.
        sara_tok = _login("sara@braids.demo", "demo1234")["access_token"]
        # bump to unlimited to see all results
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "unlimited"}, headers=auth_headers(sara_tok))
        srch = requests.get(f"{BASE_URL}/api/search?q=TEST+Salon", headers=auth_headers(sara_tok))
        # restore
        requests.post(f"{BASE_URL}/api/auth/plan", json={"plan": "standard"}, headers=auth_headers(sara_tok))
        assert srch.status_code == 200
        ids = [h["id"] for h in srch.json()["results"]]
        assert pro_id in ids, "Newly registered unverified pro should appear in search"


# ---------- Founding Pro promo ----------
class TestFoundingProPromo:
    def test_seeded_founding_pro_amara_slot1(self):
        tok = _login("amara@braids.demo", "demo1234")["access_token"]
        r = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        sub = d["subscription"]
        assert sub is not None
        assert sub["is_founding_pro"] is True
        assert sub["plan_type"] == "unlimited"
        assert sub["price"] == 0.0
        assert sub.get("founding_pro_slot") in (1, 2)
        assert d["founding_pro_days_left"] is not None and d["founding_pro_days_left"] > 300

    def test_new_pro_beyond_slot10_no_founding_promo(self):
        # Fill up remaining founding slots first if not already. Seed puts 2 founding pros
        # and existing pros count toward the 10-slot cap (pro_count includes newly inserted).
        # We register pros until pro_count > 10, then verify the 11th+ has no promo.
        # Existing pros = 4 (seeded) + any prior test pros. Register enough new pros to exceed 10.
        # To be safe, count current hairdressers and register up to slot 11.
        # Simpler: register one more pro and check its subscription. If we're already past 10,
        # it should have NO founding promo.
        # Register a fresh pro
        email = f"test_founding_check_{uuid.uuid4().hex[:6]}@example.com"
        r = _register(email=email, role="hairdresser")
        assert r.status_code == 200
        tok = r.json()["access_token"]
        s = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok)).json()
        sub = s["subscription"]
        # We can't guarantee whether this specific one is inside slot cap or not without
        # counting pros. So instead: create pros until we pass slot 10, then verify.
        # We register several pros and check that at some point promo stops.
        seen_no_promo = False
        for _ in range(12):
            e = f"test_flood_{uuid.uuid4().hex[:6]}@example.com"
            rr = _register(email=e, role="hairdresser")
            if rr.status_code != 200:
                continue
            t = rr.json()["access_token"]
            sm = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(t)).json()
            sb = sm["subscription"]
            if sb is None or not sb.get("is_founding_pro"):
                seen_no_promo = True
                # For that pro, plan should be standard
                u = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(t)).json()
                assert u["plan"] == "standard"
                break
        assert seen_no_promo, "Expected a non-founding pro after slot 10"


# ---------- Subscriptions endpoint ----------
class TestSubscriptions:
    def test_get_subscriptions_me_pricing_shape_customer(self):
        tok = _login("sara@braids.demo", "demo1234")["access_token"]
        r = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["account_type"] == "customer"
        assert d["pricing"]["monthly"] == 8.0
        assert d["pricing"]["yearly"] == 76.8
        assert d["pricing"]["yearly_savings_pct"] == 20

    def test_get_subscriptions_me_pricing_pro(self):
        # use kenya (standard plan pro, not founding)
        tok = _login("kenya@braids.demo", "demo1234")["access_token"]
        r = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["account_type"] == "professional"
        assert d["pricing"]["monthly"] == 19.0
        assert d["pricing"]["yearly"] == 182.4
        assert d["pricing"]["yearly_savings_pct"] == 20

    def test_subscribe_yearly_customer(self):
        # register fresh customer to avoid disturbing sara
        email = f"test_subcust_{uuid.uuid4().hex[:6]}@example.com"
        r = _register(email=email, role="customer")
        tok = r.json()["access_token"]
        r2 = requests.post(f"{BASE_URL}/api/subscriptions/subscribe",
                           json={"plan_type": "unlimited", "billing_interval": "yearly"},
                           headers=auth_headers(tok))
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["plan"] == "unlimited"
        sub = d["subscription"]
        assert sub["price"] == 76.8
        assert sub["billing_interval"] == "yearly"
        # GET reconciles
        me = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok)).json()
        assert me["subscription"]["price"] == 76.8

    def test_subscribe_unlimited_without_interval_400(self):
        email = f"test_nointerval_{uuid.uuid4().hex[:6]}@example.com"
        tok = _register(email=email, role="customer").json()["access_token"]
        r = requests.post(f"{BASE_URL}/api/subscriptions/subscribe",
                          json={"plan_type": "unlimited"},
                          headers=auth_headers(tok))
        assert r.status_code == 400, r.text

    def test_founding_pro_subscribe_returns_note(self):
        # Amara is founding pro; subscribing again should return the note and not overwrite
        tok = _login("amara@braids.demo", "demo1234")["access_token"]
        r = requests.post(f"{BASE_URL}/api/subscriptions/subscribe",
                          json={"plan_type": "unlimited", "billing_interval": "monthly"},
                          headers=auth_headers(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "note" in d and "Founding Pro" in d["note"]
        # ensure founding sub still intact
        s = requests.get(f"{BASE_URL}/api/subscriptions/me", headers=auth_headers(tok)).json()
        assert s["subscription"]["is_founding_pro"] is True
        assert s["subscription"]["price"] == 0.0

    def test_subscribe_pro_yearly_price(self):
        # fresh pro after slot cap (may or may not be founding — force standard first)
        email = f"test_proyearly_{uuid.uuid4().hex[:6]}@example.com"
        tok = _register(email=email, role="hairdresser").json()["access_token"]
        # downgrade in case they got founding
        requests.post(f"{BASE_URL}/api/subscriptions/subscribe",
                      json={"plan_type": "standard"}, headers=auth_headers(tok))
        r = requests.post(f"{BASE_URL}/api/subscriptions/subscribe",
                          json={"plan_type": "unlimited", "billing_interval": "yearly"},
                          headers=auth_headers(tok))
        assert r.status_code == 200, r.text
        assert r.json()["subscription"]["price"] == 182.4


# ---------- Onboarding ----------
class TestOnboarding:
    def test_onboarding_status_and_gating(self):
        # register fresh pro (no specialty, no availability)
        email = f"test_ob_{uuid.uuid4().hex[:6]}@example.com"
        tok = _register(email=email, role="hairdresser").json()["access_token"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status", headers=auth_headers(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["completed"] is False
        assert d["has_specialty"] is False
        assert d["has_availability"] is False
        # try complete -> 400
        r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete", headers=auth_headers(tok))
        assert r.status_code == 400
        # add specialty
        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        rsp = requests.put(f"{BASE_URL}/api/specialties/me",
                     json={"hairstyle_ids": [styles[0]["id"]]},
                     headers=auth_headers(tok))
        assert rsp.status_code == 200, rsp.text
        # still missing availability
        r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete", headers=auth_headers(tok))
        assert r.status_code == 400
        # add availability
        rsp = requests.put(f"{BASE_URL}/api/availability/me",
                     json=[{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}],
                     headers=auth_headers(tok))
        assert rsp.status_code == 200, rsp.text
        r = requests.post(f"{BASE_URL}/api/hairdressers/me/onboarding-complete", headers=auth_headers(tok))
        assert r.status_code == 200, r.text
        # confirm
        d = requests.get(f"{BASE_URL}/api/hairdressers/me/onboarding-status", headers=auth_headers(tok)).json()
        assert d["completed"] is True and d["has_specialty"] and d["has_availability"]


# ---------- Two-way rating & flagging ----------
class TestCustomerRatings:
    def _create_completed_booking(self, customer_tok, pro_tok):
        pro_uid = _login("amara@braids.demo", "demo1234")["user"]["id"]
        # get slot — pick a random far-future date
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_uid}", headers=auth_headers(customer_tok))
        style_id = r.json()["specialties"][0]["id"]
        b = None
        for delta in range(100, 250, 2):
            d = datetime.now() + timedelta(days=delta)
            while d.weekday() > 5:
                d += timedelta(days=1)
            slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_uid}/slots?date={d.strftime('%Y-%m-%d')}").json().get("slots", [])
            for slot in slots:
                rb = requests.post(f"{BASE_URL}/api/bookings",
                                   json={"hairdresser_id": pro_uid, "hairstyle_id": style_id,
                                         "appointment_datetime": slot},
                                   headers=auth_headers(customer_tok))
                if rb.status_code == 200:
                    b = rb.json()
                    break
            if b:
                break
        assert b is not None, "Couldn't create booking"
        # check-in and complete
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/check-in", headers=auth_headers(customer_tok))
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/complete", headers=auth_headers(pro_tok))
        return b

    def test_only_hairdresser_can_rate(self, customer_auth, pro_auth):
        b = self._create_completed_booking(customer_auth["token"], pro_auth["token"])
        # customer trying to POST customer-rating -> 403
        r = requests.post(f"{BASE_URL}/api/customer-ratings",
                          json={"booking_id": b["id"], "rating": 4},
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 403

    def test_pro_can_rate_and_duplicate_rejected(self, customer_auth, pro_auth):
        b = self._create_completed_booking(customer_auth["token"], pro_auth["token"])
        r = requests.post(f"{BASE_URL}/api/customer-ratings",
                          json={"booking_id": b["id"], "rating": 5},
                          headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 200, r.text
        r2 = requests.post(f"{BASE_URL}/api/customer-ratings",
                           json={"booking_id": b["id"], "rating": 3},
                           headers=auth_headers(pro_auth["token"]))
        assert r2.status_code == 400

    def test_rate_before_completed_400(self, customer_auth, pro_auth):
        # create booking but don't complete
        pro_uid = pro_auth["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/hairdressers/{pro_uid}", headers=auth_headers(customer_auth["token"]))
        style_id = r.json()["specialties"][0]["id"]
        d = datetime.now() + timedelta(days=80)
        while d.weekday() > 5:
            d += timedelta(days=1)
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_uid}/slots?date={d.strftime('%Y-%m-%d')}").json()["slots"]
        for slot in slots:
            rb = requests.post(f"{BASE_URL}/api/bookings",
                               json={"hairdresser_id": pro_uid, "hairstyle_id": style_id,
                                     "appointment_datetime": slot},
                               headers=auth_headers(customer_auth["token"]))
            if rb.status_code == 200:
                b = rb.json()
                break
        r = requests.post(f"{BASE_URL}/api/customer-ratings",
                         json={"booking_id": b["id"], "rating": 4},
                         headers=auth_headers(pro_auth["token"]))
        assert r.status_code == 400
        # cleanup
        requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel", headers=auth_headers(customer_auth["token"]))

    def test_flag_threshold_restricts_customer(self):
        # register fresh customer + fresh pro (approved), create 3 completed bookings, flag each
        cust_email = f"test_flag_cust_{uuid.uuid4().hex[:6]}@example.com"
        cust_tok = _register(email=cust_email, role="customer").json()["access_token"]

        # use seeded amara as pro (approved) since flagging is by pro on booking
        pro_login = _login("amara@braids.demo", "demo1234")
        pro_tok = pro_login["access_token"]
        pro_id = pro_login["user"]["id"]

        styles = requests.get(f"{BASE_URL}/api/hairstyles").json()
        style_id = styles[0]["id"]
        # create 3 bookings on different days
        booked = []
        day_offset = 90
        while len(booked) < 3 and day_offset < 150:
            d = datetime.now() + timedelta(days=day_offset)
            while d.weekday() > 5:
                d += timedelta(days=1)
            slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={d.strftime('%Y-%m-%d')}").json()["slots"]
            for slot in slots:
                rb = requests.post(f"{BASE_URL}/api/bookings",
                                   json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                         "appointment_datetime": slot},
                                   headers=auth_headers(cust_tok))
                if rb.status_code == 200:
                    booked.append(rb.json())
                    break
            day_offset += 3

        assert len(booked) == 3
        # complete each and flag
        for b in booked:
            requests.post(f"{BASE_URL}/api/bookings/{b['id']}/check-in", headers=auth_headers(cust_tok))
            requests.post(f"{BASE_URL}/api/bookings/{b['id']}/complete", headers=auth_headers(pro_tok))
            r = requests.post(f"{BASE_URL}/api/customer-ratings",
                              json={"booking_id": b["id"], "rating": 1,
                                    "flagged_for_removal": True, "flag_reason": "TEST no-show behavior"},
                              headers=auth_headers(pro_tok))
            assert r.status_code == 200, r.text

        # Attempt new booking -> should be 403
        d = datetime.now() + timedelta(days=180)
        while d.weekday() > 5:
            d += timedelta(days=1)
        slots = requests.get(f"{BASE_URL}/api/hairdressers/{pro_id}/slots?date={d.strftime('%Y-%m-%d')}").json()["slots"]
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slots[0]},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 403
        assert "temporarily restricted" in r.text

        # Admin sees this in flag queue
        admin_tok = _admin_auth()["token"]
        q = requests.get(f"{BASE_URL}/api/admin/customer-flags", headers=auth_headers(admin_tok))
        assert q.status_code == 200
        cust_id = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(cust_tok)).json()["id"]
        entry = next((x for x in q.json() if x["id"] == cust_id), None)
        assert entry is not None
        assert entry.get("booking_restricted") is True
        assert isinstance(entry.get("recent_flags"), list)
        assert len(entry["recent_flags"]) >= 1
        assert len(entry["recent_flags"]) <= 5

        # Admin lifts
        r = requests.post(f"{BASE_URL}/api/admin/customer-flags/{cust_id}/decide",
                          json={"action": "lift"},
                          headers=auth_headers(admin_tok))
        assert r.status_code == 200
        me_after = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(cust_tok)).json()
        # After lift, user can book again — verify booking works
        r = requests.post(f"{BASE_URL}/api/bookings",
                          json={"hairdresser_id": pro_id, "hairstyle_id": style_id,
                                "appointment_datetime": slots[0]},
                          headers=auth_headers(cust_tok))
        assert r.status_code == 200, f"After lift, booking should succeed: {r.text}"
        # notification created
        notifs = requests.get(f"{BASE_URL}/api/notifications/me", headers=auth_headers(cust_tok)).json()
        assert any(n["type"] == "restriction_lifted" for n in notifs)


# ---------- Admin auth ----------
class TestAdminCustomerFlagsAuth:
    def test_non_admin_gets_403(self, customer_auth):
        r = requests.get(f"{BASE_URL}/api/admin/customer-flags",
                         headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 403


# ---------- Reports ----------
class TestReports:
    def test_report_success_and_self_report_rejected(self, customer_auth):
        pro_id = _login("amara@braids.demo", "demo1234")["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/reports",
                          json={"reported_user_id": pro_id, "reason": "TEST unprofessional"},
                          headers=auth_headers(customer_auth["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # self report -> 400
        me_id = customer_auth["user"]["id"]
        r2 = requests.post(f"{BASE_URL}/api/reports",
                          json={"reported_user_id": me_id, "reason": "self"},
                          headers=auth_headers(customer_auth["token"]))
        assert r2.status_code == 400


# ---------- Featured stylist cache ----------
class TestFeaturedStylistCache:
    def test_cached_same_pro_same_week(self):
        r1 = requests.get(f"{BASE_URL}/api/featured-stylist").json()
        r2 = requests.get(f"{BASE_URL}/api/featured-stylist").json()
        assert r1["id"] == r2["id"]
