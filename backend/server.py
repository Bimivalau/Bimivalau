from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from pathlib import Path
from datetime import datetime, timedelta, timezone
import os, uuid, logging, bcrypt, secrets, string
from jose import jwt, JWTError

def gen_code(n: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    # drop confusable chars 0/O/1/I
    alphabet = "".join(c for c in alphabet if c not in "0O1I")
    return "".join(secrets.choice(alphabet) for _ in range(n))

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "braids-community-dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_EXP_MIN = 60 * 24 * 7  # 7 days

app = FastAPI()
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)
scheduler = AsyncIOScheduler()
log = logging.getLogger("braids")

Role = Literal["customer", "hairdresser", "admin"]
Plan = Literal["standard", "unlimited"]
BookingStatus = Literal["confirmed", "checked_in", "completed", "cancelled", "no_show"]


# ---------- Models ----------
class UserOut(BaseModel):
    """Public user shape. `phone` is intentionally NEVER exposed except to the user themselves via /auth/me."""
    id: str
    email: EmailStr
    name: str
    role: Role
    plan: Plan = "standard"
    profile_photo: Optional[str] = None
    phone: Optional[str] = None  # only populated on /auth/me self endpoint

class VerificationSubmitIn(BaseModel):
    license_url: str  # base64 or URL of ID/license image

class VerificationDecisionIn(BaseModel):
    status: Literal["approved", "rejected"]
    reason: Optional[str] = None

class CheckInByCodeIn(BaseModel):
    code: str

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["customer", "hairdresser"] = "customer"
    phone: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class HairstyleIn(BaseModel):
    name: str
    category: str
    description: str
    avg_price: float
    avg_duration_min: int
    cover_photo: str

class Hairstyle(HairstyleIn):
    id: str

class HairdresserProfileIn(BaseModel):
    bio: str
    salon_name: str
    address: str
    city: str
    latitude: float
    longitude: float
    cover_photo: str

class BookingIn(BaseModel):
    hairdresser_id: str
    hairstyle_id: str
    appointment_datetime: datetime

class ReviewIn(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    comment: str

class PortfolioItemIn(BaseModel):
    hairstyle_id: str
    photo_url: str
    caption: Optional[str] = ""

class AvailabilityIn(BaseModel):
    day_of_week: int  # 0=Mon..6=Sun
    start_time: str  # "09:00"
    end_time: str    # "18:00"

class SpecialtyIn(BaseModel):
    hairstyle_ids: List[str]

class FavoriteIn(BaseModel):
    hairdresser_id: str

class PlanUpdate(BaseModel):
    plan: Plan


# ---------- Utils ----------
def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_token(uid: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": uid, "role": role, "iat": now, "exp": now + timedelta(minutes=JWT_EXP_MIN)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc

async def user_from_doc(u: dict, include_phone: bool = False) -> UserOut:
    return UserOut(id=u["id"], email=u["email"], name=u["name"], role=u["role"],
                   plan=u.get("plan", "standard"),
                   phone=u.get("phone") if include_phone else None,
                   profile_photo=u.get("profile_photo"))

async def get_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> UserOut:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(401, "User not found")
    return await user_from_doc(u)

async def maybe_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[UserOut]:
    if not cred:
        return None
    try:
        return await get_user(cred)
    except HTTPException:
        return None


# ---------- Auth ----------
@api.post("/auth/register", response_model=TokenOut)
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": body.email, "name": body.name, "role": body.role,
        "phone": body.phone, "plan": "standard",
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "profile_photo": None,
    }
    await db.users.insert_one(doc)
    if body.role == "hairdresser":
        await db.hairdressers.insert_one({
            "id": uid, "user_id": uid, "bio": "", "salon_name": "",
            "address": "", "city": "", "latitude": 0.0, "longitude": 0.0,
            "cover_photo": "", "verification_status": "pending",
            "verification_submitted_at": None, "verification_license_url": None,
            "verification_decided_at": None, "verification_reason": None,
            "rating_avg": 0.0, "reviews_count": 0, "specialty_ids": [],
        })
    user = await user_from_doc(doc)
    return TokenOut(access_token=make_token(uid, body.role), user=user)

@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email})
    if not u or not verify_pw(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return TokenOut(access_token=make_token(u["id"], u["role"]), user=await user_from_doc(u))

@api.get("/auth/me", response_model=UserOut)
async def me(user: UserOut = Depends(get_user)):
    # include user's own phone in self endpoint only
    u = await db.users.find_one({"id": user.id}, {"_id": 0, "password_hash": 0})
    return await user_from_doc(u, include_phone=True)

@api.post("/auth/plan", response_model=UserOut)
async def update_plan(body: PlanUpdate, user: UserOut = Depends(get_user)):
    await db.users.update_one({"id": user.id}, {"$set": {"plan": body.plan}})
    u = await db.users.find_one({"id": user.id}, {"_id": 0, "password_hash": 0})
    return await user_from_doc(u)


# ---------- Hairstyles ----------
@api.get("/hairstyles", response_model=List[Hairstyle])
async def list_hairstyles(category: Optional[str] = None):
    q = {"category": category} if category else {}
    items = await db.hairstyles.find(q, {"_id": 0}).to_list(200)
    return items

@api.get("/hairstyles/categories")
async def hairstyle_categories():
    cats = await db.hairstyles.distinct("category")
    return {"categories": cats}

@api.get("/hairstyles/{hid}", response_model=Hairstyle)
async def get_hairstyle(hid: str):
    h = await db.hairstyles.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Not found")
    return h

@api.get("/hairstyles/{hid}/hairdressers")
async def hairdressers_for_style(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    # only approved pros are searchable
    hds = await db.hairdressers.find({"specialty_ids": hid, "verification_status": "approved"}, {"_id": 0}).to_list(200)
    for h in hds:
        u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0, "password_hash": 0})
        h["name"] = u["name"] if u else "Stylist"
        h["profile_photo"] = u.get("profile_photo") if u else None
    # subscription gating: Standard tier — top 3 + blur location
    is_unlimited = user and user.plan == "unlimited"
    if not is_unlimited:
        hds = hds[:3]
        for h in hds:
            h["address"] = h.get("city", "") + " • area only"
            h["latitude"] = round(h.get("latitude", 0.0), 1)
            h["longitude"] = round(h.get("longitude", 0.0), 1)
            h["location_blurred"] = True
    return {"results": hds, "gated": not is_unlimited}


# ---------- Hairdressers ----------
@api.get("/hairdressers/{hid}")
async def hairdresser_detail(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    h = await db.hairdressers.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Not found")
    u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0, "password_hash": 0})
    h["name"] = u["name"] if u else "Stylist"
    h["profile_photo"] = u.get("profile_photo") if u else None
    portfolio = await db.portfolio_items.find({"hairdresser_id": hid}, {"_id": 0}).to_list(200)
    reviews = await db.reviews.find({"hairdresser_id": hid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in reviews:
        cu = await db.users.find_one({"id": r["customer_id"]}, {"_id": 0})
        r["customer_name"] = cu["name"] if cu else "Anon"
    availability = await db.availability.find({"hairdresser_id": hid}, {"_id": 0}).to_list(20)
    specialties = await db.hairstyles.find({"id": {"$in": h.get("specialty_ids", [])}}, {"_id": 0}).to_list(50)
    # Standard tier blurs exact address unless user has confirmed booking
    is_unlimited = user and user.plan == "unlimited"
    has_booking = False
    if user:
        has_booking = bool(await db.bookings.find_one({"hairdresser_id": hid, "customer_id": user.id}))
    if not is_unlimited and not has_booking:
        h["address"] = h.get("city", "") + " • Unlock full address with Unlimited"
        h["location_blurred"] = True
    h["portfolio"] = portfolio
    h["reviews"] = reviews
    h["availability"] = availability
    h["specialties"] = specialties
    # badges
    badges = []
    if h.get("verification_status") == "approved":
        badges.append("Verified Pro")
    if h.get("rating_avg", 0) >= 4.5 and h.get("reviews_count", 0) >= 5:
        badges.append("Top Rated")
    if h.get("reviews_count", 0) < 5 and h.get("rating_avg", 0) >= 4.0:
        badges.append("Rising Talent")
    h["badges"] = badges
    return h

@api.put("/hairdressers/me")
async def update_my_pro_profile(body: HairdresserProfileIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    await db.hairdressers.update_one({"user_id": user.id}, {"$set": body.dict()})
    return {"ok": True}

@api.get("/hairdressers/me/dashboard")
async def my_dashboard(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    upcoming = await db.bookings.find({
        "hairdresser_id": user.id,
        "status": {"$in": ["confirmed", "checked_in"]},
    }, {"_id": 0}).sort("appointment_datetime", 1).to_list(50)
    for b in upcoming:
        cu = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
        hs = await db.hairstyles.find_one({"id": b["hairstyle_id"]}, {"_id": 0})
        b["customer_name"] = cu["name"] if cu else ""
        b["hairstyle_name"] = hs["name"] if hs else ""
    profile = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0})
    return {"upcoming": upcoming, "profile": profile}


# ---------- Search ----------
@api.get("/search")
async def search(
    q: Optional[str] = None,
    category: Optional[str] = None,
    min_rating: float = 0.0,
    user: Optional[UserOut] = Depends(maybe_user),
):
    query = {"verification_status": "approved"}
    if category:
        style_ids = [s["id"] for s in await db.hairstyles.find({"category": category}, {"id": 1, "_id": 0}).to_list(100)]
        query["specialty_ids"] = {"$in": style_ids}
    if min_rating > 0:
        query["rating_avg"] = {"$gte": min_rating}
    hds = await db.hairdressers.find(query, {"_id": 0}).to_list(200)
    if q:
        ql = q.lower()
        hds = [h for h in hds if ql in h.get("salon_name", "").lower() or ql in h.get("city", "").lower() or ql in h.get("bio", "").lower()]
    for h in hds:
        u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0})
        h["name"] = u["name"] if u else "Stylist"
    is_unlimited = user and user.plan == "unlimited"
    if not is_unlimited:
        hds = hds[:3]
        for h in hds:
            h["address"] = h.get("city", "") + " • area only"
            h["location_blurred"] = True
    return {"results": hds, "gated": not is_unlimited}


# ---------- Portfolio ----------
@api.get("/portfolio/me")
async def my_portfolio(user: UserOut = Depends(get_user)):
    items = await db.portfolio_items.find({"hairdresser_id": user.id}, {"_id": 0}).to_list(200)
    return items

@api.post("/portfolio")
async def add_portfolio(body: PortfolioItemIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    count = await db.portfolio_items.count_documents({"hairdresser_id": user.id})
    if user.plan == "standard" and count >= 10:
        raise HTTPException(402, "Standard plan is capped at 10 portfolio items. Upgrade to Unlimited.")
    item = {"id": str(uuid.uuid4()), "hairdresser_id": user.id, **body.dict()}
    await db.portfolio_items.insert_one(item)
    return clean(item)

@api.delete("/portfolio/{item_id}")
async def delete_portfolio(item_id: str, user: UserOut = Depends(get_user)):
    await db.portfolio_items.delete_one({"id": item_id, "hairdresser_id": user.id})
    return {"ok": True}


# ---------- Specialties ----------
@api.put("/specialties/me")
async def update_specialties(body: SpecialtyIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    await db.hairdressers.update_one({"user_id": user.id}, {"$set": {"specialty_ids": body.hairstyle_ids}})
    return {"ok": True}


# ---------- Availability ----------
@api.get("/availability/me")
async def my_availability(user: UserOut = Depends(get_user)):
    items = await db.availability.find({"hairdresser_id": user.id}, {"_id": 0}).to_list(20)
    return items

@api.put("/availability/me")
async def set_availability(items: List[AvailabilityIn], user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    await db.availability.delete_many({"hairdresser_id": user.id})
    docs = [{"id": str(uuid.uuid4()), "hairdresser_id": user.id, **i.dict()} for i in items]
    if docs:
        await db.availability.insert_many(docs)
    for d in docs:
        d.pop("_id", None)
    return docs

@api.get("/hairdressers/{hid}/slots")
async def get_slots(hid: str, date: str):
    """Return open 1-hour slots for hairdresser on YYYY-MM-DD."""
    d = datetime.strptime(date, "%Y-%m-%d")
    dow = d.weekday()
    avails = await db.availability.find({"hairdresser_id": hid, "day_of_week": dow}, {"_id": 0}).to_list(10)
    slots = []
    for a in avails:
        sh, sm = map(int, a["start_time"].split(":"))
        eh, em = map(int, a["end_time"].split(":"))
        start = d.replace(hour=sh, minute=sm)
        end = d.replace(hour=eh, minute=em)
        cur = start
        while cur + timedelta(hours=1) <= end:
            slots.append(cur.isoformat())
            cur += timedelta(hours=1)
    # remove existing bookings
    day_start = d.replace(hour=0, minute=0)
    day_end = d + timedelta(days=1)
    booked = await db.bookings.find({
        "hairdresser_id": hid,
        "appointment_datetime": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()},
        "status": {"$in": ["confirmed", "checked_in", "completed"]},
    }, {"_id": 0}).to_list(100)
    booked_times = {b["appointment_datetime"] for b in booked}
    slots = [s for s in slots if s not in booked_times]
    return {"slots": slots}


# ---------- Bookings ----------
@api.post("/bookings")
async def create_booking(body: BookingIn, user: UserOut = Depends(get_user)):
    if user.role != "customer":
        raise HTTPException(403, "Only customers can book")
    dt_iso = body.appointment_datetime.isoformat()
    conflict = await db.bookings.find_one({
        "hairdresser_id": body.hairdresser_id,
        "appointment_datetime": dt_iso,
        "status": {"$in": ["confirmed", "checked_in", "completed"]},
    })
    if conflict:
        raise HTTPException(409, "Slot already taken")
    hs = await db.hairstyles.find_one({"id": body.hairstyle_id}, {"_id": 0})
    hd = await db.hairdressers.find_one({"id": body.hairdresser_id}, {"_id": 0})
    if not hs or not hd:
        raise HTTPException(404, "Hairstyle or hairdresser not found")
    if hd.get("verification_status") != "approved":
        raise HTTPException(400, "Stylist not approved yet")
    # unique 6-char booking code (retry a couple of times on collision)
    for _ in range(5):
        code = gen_code(6)
        if not await db.bookings.find_one({"code": code}):
            break
    booking = {
        "id": str(uuid.uuid4()),
        "code": code,
        "customer_id": user.id,
        "hairdresser_id": body.hairdresser_id,
        "hairstyle_id": body.hairstyle_id,
        "appointment_datetime": dt_iso,
        "status": "confirmed",
        "checked_in_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "price": hs["avg_price"],
        "duration_min": hs["avg_duration_min"],
    }
    await db.bookings.insert_one(booking)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user.id, "type": "booking_confirmed",
        "message": f"Your booking for {hs['name']} is confirmed. Check-in code: {code}. Pay at the counter.",
        "related_booking_id": booking["id"], "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return clean(dict(booking))

async def _enrich_booking(b: dict) -> dict:
    hd = await db.hairdressers.find_one({"id": b["hairdresser_id"]}, {"_id": 0})
    hs = await db.hairstyles.find_one({"id": b["hairstyle_id"]}, {"_id": 0})
    cu = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
    pu = await db.users.find_one({"id": b["hairdresser_id"]}, {"_id": 0}) if hd else None
    b["salon_name"] = hd["salon_name"] if hd else ""
    b["hairdresser_name"] = pu["name"] if pu else "Stylist"
    b["hairstyle_name"] = hs["name"] if hs else ""
    b["hairstyle_photo"] = hs["cover_photo"] if hs else ""
    b["customer_name"] = cu["name"] if cu else ""
    return b

@api.get("/bookings/me")
async def my_bookings(user: UserOut = Depends(get_user)):
    q = {"customer_id": user.id} if user.role == "customer" else {"hairdresser_id": user.id}
    items = await db.bookings.find(q, {"_id": 0}).sort("appointment_datetime", -1).to_list(200)
    for b in items:
        await _enrich_booking(b)
    return items

@api.get("/bookings/{bid}")
async def get_booking(bid: str, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or (b["customer_id"] != user.id and b["hairdresser_id"] != user.id):
        raise HTTPException(404, "Not found")
    return await _enrich_booking(b)

@api.post("/bookings/{bid}/check-in")
async def check_in(bid: str, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or (b["customer_id"] != user.id and b["hairdresser_id"] != user.id):
        raise HTTPException(404, "Not found")
    if b["status"] != "confirmed":
        raise HTTPException(400, f"Cannot check in from {b['status']}")
    await db.bookings.update_one({"id": bid}, {"$set": {
        "status": "checked_in",
        "checked_in_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True}

@api.post("/bookings/check-in-by-code")
async def check_in_by_code(body: CheckInByCodeIn, user: UserOut = Depends(get_user)):
    code = body.code.strip().upper()
    b = await db.bookings.find_one({"code": code}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Invalid code")
    if b["customer_id"] != user.id and b["hairdresser_id"] != user.id:
        raise HTTPException(403, "This code isn't yours")
    if b["status"] != "confirmed":
        raise HTTPException(400, f"Cannot check in from {b['status']}")
    await db.bookings.update_one({"id": b["id"]}, {"$set": {
        "status": "checked_in",
        "checked_in_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True, "booking_id": b["id"]}

@api.post("/bookings/{bid}/complete")
async def complete_booking(bid: str, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or b["hairdresser_id"] != user.id:
        raise HTTPException(403, "Only the hairdresser can complete")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "completed"}})
    return {"ok": True}

@api.post("/bookings/{bid}/no-show")
async def no_show(bid: str, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or b["hairdresser_id"] != user.id:
        raise HTTPException(403, "Only the hairdresser")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "no_show"}})
    return {"ok": True}

@api.post("/bookings/{bid}/cancel")
async def cancel_booking(bid: str, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or (b["customer_id"] != user.id and b["hairdresser_id"] != user.id):
        raise HTTPException(404, "Not found")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# ---------- Reviews ----------
@api.post("/reviews")
async def add_review(body: ReviewIn, user: UserOut = Depends(get_user)):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["customer_id"] != user.id:
        raise HTTPException(403, "Not your booking")
    if b["status"] != "completed":
        raise HTTPException(400, "Booking must be completed before reviewing")
    if await db.reviews.find_one({"booking_id": body.booking_id}):
        raise HTTPException(400, "Already reviewed")
    review = {
        "id": str(uuid.uuid4()),
        "booking_id": body.booking_id,
        "hairdresser_id": b["hairdresser_id"],
        "hairstyle_id": b["hairstyle_id"],
        "customer_id": user.id,
        "rating": body.rating,
        "comment": body.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(review)
    # update aggregate rating
    reviews = await db.reviews.find({"hairdresser_id": b["hairdresser_id"]}, {"_id": 0}).to_list(1000)
    avg = sum(r["rating"] for r in reviews) / len(reviews)
    await db.hairdressers.update_one({"id": b["hairdresser_id"]}, {
        "$set": {"rating_avg": round(avg, 2), "reviews_count": len(reviews)}
    })
    return clean(dict(review))


# ---------- Favorites ----------
@api.get("/favorites/me")
async def my_favorites(user: UserOut = Depends(get_user)):
    favs = await db.favorites.find({"customer_id": user.id}, {"_id": 0}).to_list(200)
    result = []
    for f in favs:
        h = await db.hairdressers.find_one({"id": f["hairdresser_id"]}, {"_id": 0})
        if h:
            u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0})
            h["name"] = u["name"] if u else ""
            result.append(h)
    return result

@api.post("/favorites")
async def add_fav(body: FavoriteIn, user: UserOut = Depends(get_user)):
    await db.favorites.update_one(
        {"customer_id": user.id, "hairdresser_id": body.hairdresser_id},
        {"$set": {"customer_id": user.id, "hairdresser_id": body.hairdresser_id}},
        upsert=True,
    )
    return {"ok": True}

@api.delete("/favorites/{hid}")
async def rm_fav(hid: str, user: UserOut = Depends(get_user)):
    await db.favorites.delete_one({"customer_id": user.id, "hairdresser_id": hid})
    return {"ok": True}


# ---------- Notifications ----------
@api.get("/notifications/me")
async def my_notifications(user: UserOut = Depends(get_user)):
    items = await db.notifications.find({"user_id": user.id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


# ---------- Verification (Pro) ----------
@api.post("/hairdressers/me/submit-verification")
async def submit_verification(body: VerificationSubmitIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    await db.hairdressers.update_one({"user_id": user.id}, {"$set": {
        "verification_status": "pending",
        "verification_license_url": body.license_url,
        "verification_submitted_at": datetime.now(timezone.utc).isoformat(),
        "verification_decided_at": None,
        "verification_reason": None,
    }})
    return {"ok": True}

@api.get("/hairdressers/me/verification")
async def my_verification(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    status_ = hd.get("verification_status", "pending")
    submitted = hd.get("verification_submitted_at")
    overdue = False
    days_left = None
    if status_ == "pending" and submitted:
        elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(submitted)
        overdue = elapsed.total_seconds() > 3 * 86400
        days_left = max(0, 3 - int(elapsed.total_seconds() // 86400))
    return {
        "status": status_,
        "submitted_at": submitted,
        "license_url": hd.get("verification_license_url"),
        "decided_at": hd.get("verification_decided_at"),
        "reason": hd.get("verification_reason"),
        "overdue": overdue,
        "days_left_sla": days_left,
    }


# ---------- Admin ----------
def _require_admin(user: UserOut):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

@api.get("/admin/verifications")
async def admin_list_verifications(status_: Optional[str] = Query(None, alias="status"), user: UserOut = Depends(get_user)):
    _require_admin(user)
    q = {"verification_status": status_} if status_ else {"verification_status": {"$in": ["pending", "approved", "rejected"]}}
    hds = await db.hairdressers.find(q, {"_id": 0}).sort("verification_submitted_at", 1).to_list(500)
    now = datetime.now(timezone.utc)
    for h in hds:
        u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0, "password_hash": 0})
        h["name"] = u["name"] if u else ""
        h["email"] = u["email"] if u else ""
        sub = h.get("verification_submitted_at")
        h["overdue"] = bool(sub and h["verification_status"] == "pending" and
                            (now - datetime.fromisoformat(sub)).total_seconds() > 3 * 86400)
    return hds

@api.post("/admin/verifications/{hid}/decide")
async def admin_decide(hid: str, body: VerificationDecisionIn, user: UserOut = Depends(get_user)):
    _require_admin(user)
    await db.hairdressers.update_one({"id": hid}, {"$set": {
        "verification_status": body.status,
        "verification_decided_at": datetime.now(timezone.utc).isoformat(),
        "verification_reason": body.reason,
    }})
    # notify pro
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": hid, "type": f"verification_{body.status}",
        "message": ("Your profile has been approved and is now live." if body.status == "approved"
                    else f"Your verification was rejected. {body.reason or ''}"),
        "related_booking_id": None, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# ---------- Featured Stylist of the Week ----------
@api.get("/featured-stylist")
async def featured_stylist():
    # Pick from Unlimited + approved pros; rotate by ISO week number for deterministic freshness.
    pros_users = await db.users.find({"role": "hairdresser", "plan": "unlimited"}, {"_id": 0, "password_hash": 0}).to_list(500)
    ids = [u["id"] for u in pros_users]
    if not ids:
        return None
    hds = await db.hairdressers.find({"id": {"$in": ids}, "verification_status": "approved"}, {"_id": 0}).to_list(500)
    if not hds:
        return None
    hds.sort(key=lambda h: h["id"])  # deterministic order
    week = datetime.now(timezone.utc).isocalendar()[1]
    h = hds[week % len(hds)]
    u = next((x for x in pros_users if x["id"] == h["id"]), None)
    h["name"] = u["name"] if u else "Stylist"
    return h



# ---------- Auto-cancel job ----------
async def auto_cancel_late():
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=15)).isoformat()
    late = await db.bookings.find({
        "status": "confirmed",
        "appointment_datetime": {"$lt": cutoff},
    }, {"_id": 0}).to_list(500)
    for b in late:
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled"}})
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": b["customer_id"], "type": "auto_cancel",
            "message": "Your booking was auto-cancelled (no check-in within 15 minutes).",
            "related_booking_id": b["id"], "read": False,
            "created_at": now.isoformat(),
        })


# ---------- Seed ----------
@api.post("/seed")
async def seed(force: bool = False):
    if not force and await db.hairstyles.count_documents({}) > 0:
        return {"status": "already_seeded"}
    await db.hairstyles.delete_many({})
    await db.hairdressers.delete_many({})
    await db.portfolio_items.delete_many({})
    await db.availability.delete_many({})
    await db.reviews.delete_many({})
    await db.users.delete_many({"email": {"$regex": "@braids.demo$"}})
    await db.bookings.delete_many({})

    styles = [
        ("Box Braids", "Braids", "Classic long box braids with sleek partings.", 180, 300,
         "https://images.unsplash.com/photo-1709672262859-68cb9b39ae4f?w=800&q=85"),
        ("Knotless Braids", "Braids", "Gentle knotless technique — feather-light finish.", 220, 360,
         "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=800&q=85"),
        ("Cornrows", "Braids", "Sleek straight-back cornrows.", 90, 120,
         "https://images.unsplash.com/photo-1762810548877-63512759805e?w=800&q=85"),
        ("Fulani Braids", "Braids", "Signature Fulani-style with beads.", 200, 300,
         "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=800&q=85"),
        ("Locs", "Locs", "Traditional locs — retwist & style.", 140, 240,
         "https://images.unsplash.com/photo-1620331311520-246422fd82f9?w=800&q=85"),
        ("Twists", "Twists", "Two-strand twists with defined ends.", 130, 210,
         "https://images.unsplash.com/photo-1595475207225-428b62bda831?w=800&q=85"),
    ]
    style_ids = []
    for name, cat, desc, price, dur, cover in styles:
        sid = str(uuid.uuid4())
        style_ids.append(sid)
        await db.hairstyles.insert_one({
            "id": sid, "name": name, "category": cat, "description": desc,
            "avg_price": price, "avg_duration_min": dur, "cover_photo": cover,
        })

    # demo hairdressers
    pros = [
        ("Amara Johnson", "amara@braids.demo", "Nia's Studio", "Brooklyn", "234 Franklin Ave", 40.68, -73.95,
         "10+ years of braiding — box braids and knotless specialist.",
         "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=800&q=85", 4.8, 24),
        ("Zara Okonkwo", "zara@braids.demo", "Zara Braid Lounge", "Harlem", "512 Malcolm X Blvd", 40.81, -73.94,
         "Fulani + cornrow artist. Beads, cuffs, art on your scalp.",
         "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=800&q=85", 4.9, 41),
        ("Kenya Williams", "kenya@braids.demo", "Rooted Salon", "Bronx", "88 Grand Concourse", 40.83, -73.92,
         "Loctician & natural hair expert. Retwists, styling, & consults.",
         "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800&q=85", 4.6, 12),
        ("Simone Adeyemi", "simone@braids.demo", "Coco Coils", "Queens", "77 Jamaica Ave", 40.71, -73.79,
         "Rising talent — knotless & feed-in braids.",
         "https://images.unsplash.com/photo-1595475207225-428b62bda831?w=800&q=85", 4.4, 3),
    ]
    portfolio_photos = [
        "https://images.unsplash.com/photo-1709672262859-68cb9b39ae4f?w=800&q=85",
        "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=800&q=85",
        "https://images.unsplash.com/photo-1762810548877-63512759805e?w=800&q=85",
        "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=800&q=85",
        "https://images.unsplash.com/photo-1620331311520-246422fd82f9?w=800&q=85",
        "https://images.unsplash.com/photo-1595475207225-428b62bda831?w=800&q=85",
    ]
    for i, (name, email, salon, city, addr, lat, lng, bio, cover, rating, revs) in enumerate(pros):
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid, "email": email, "name": name, "role": "hairdresser",
            "plan": "unlimited" if i < 2 else "standard",
            "phone": None, "profile_photo": cover,
            "password_hash": hash_pw("demo1234"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # each pro specializes in 3 random styles (deterministic)
        specs = style_ids[i:i+3] if len(style_ids[i:i+3]) == 3 else style_ids[:3]
        # 3 of 4 approved, last one pending (submitted 4 days ago -> overdue) so admin has data
        if i < 3:
            vstatus = "approved"
            submitted = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            decided = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        else:
            vstatus = "pending"
            submitted = (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()  # overdue
            decided = None
        await db.hairdressers.insert_one({
            "id": uid, "user_id": uid, "bio": bio, "salon_name": salon,
            "address": addr, "city": city, "latitude": lat, "longitude": lng,
            "cover_photo": cover, "verification_status": vstatus,
            "verification_submitted_at": submitted, "verification_decided_at": decided,
            "verification_license_url": "https://placeholder.example/license.jpg" if submitted else None,
            "verification_reason": None,
            "rating_avg": rating, "reviews_count": revs, "specialty_ids": specs,
        })
        # portfolio
        for j, ph in enumerate(portfolio_photos[:6]):
            await db.portfolio_items.insert_one({
                "id": str(uuid.uuid4()), "hairdresser_id": uid,
                "hairstyle_id": specs[j % len(specs)],
                "photo_url": ph, "caption": "",
            })
        # availability Mon-Sat 9-18
        for dow in range(6):
            await db.availability.insert_one({
                "id": str(uuid.uuid4()), "hairdresser_id": uid,
                "day_of_week": dow, "start_time": "09:00", "end_time": "18:00",
            })

    # demo customer
    cust_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": cust_id, "email": "sara@braids.demo", "name": "Sara Bello",
        "role": "customer", "plan": "standard", "phone": None, "profile_photo": None,
        "password_hash": hash_pw("demo1234"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # demo admin
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": "admin@braids.demo", "name": "BC Admin",
        "role": "admin", "plan": "unlimited", "phone": None, "profile_photo": None,
        "password_hash": hash_pw("demo1234"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "seeded"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def _startup():
    if not scheduler.running:
        scheduler.add_job(auto_cancel_late, "interval", minutes=1, id="autocancel", replace_existing=True)
        scheduler.start()
    if await db.hairstyles.count_documents({}) == 0:
        await seed()

@app.on_event("shutdown")
async def _shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)
    client.close()
