from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Dict, Any
from pathlib import Path
from datetime import datetime, timedelta, timezone
import os, uuid, logging, bcrypt, secrets, string, httpx, hashlib
from jose import jwt, JWTError

from subscription_service import (
    DEFAULT_CONFIG,
    ENTITLEMENTS,
    has_entitlement,
    portfolio_cap as sub_portfolio_cap,
    resolve_plan_slug,
    summarize_entitlements,
    upgrade_reason,
    days_remaining as sub_days_remaining,
)
import notification_engine as notif

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
Plan = Literal["free", "standard", "unlimited"]
BookingStatus = Literal["confirmed", "checked_in", "completed", "cancelled", "no_show"]


# ---------- Models ----------
class UserOut(BaseModel):
    """Public user shape. `phone` is intentionally NEVER exposed except to the user themselves via /auth/me."""
    id: str
    email: EmailStr
    name: str
    role: Role
    plan: Plan = "free"
    profile_photo: Optional[str] = None
    phone: Optional[str] = None  # only populated on /auth/me self endpoint
    email_verified: bool = False

class ProfessionalServiceIn(BaseModel):
    """A Studio's own service offering. Each Studio defines its own catalog on
    top of the shared hairstyle taxonomy — with its own starting price,
    optional range, duration, hair-included flag, hair brands/lengths, and
    difficulty. Prices shown to customers as \"Starting at $X\".
    """
    hairstyle_id: str
    custom_name: Optional[str] = None
    price: float = Field(ge=0)
    price_max: Optional[float] = Field(default=None, ge=0)
    currency: str = "USD"
    duration_minutes: int = Field(ge=15)
    hair_included: bool = False
    hair_brands: List[str] = []
    hair_lengths: List[str] = []  # e.g. ["Short","Mid-length","Long","Extra Long"]
    difficulty: Optional[Literal["Easy", "Medium", "Advanced", "Expert"]] = None
    consultation_required: bool = False
    description: Optional[str] = None
    inventory_required: bool = False
    active: bool = True

class InventoryItemIn(BaseModel):
    product_name: str
    brand: Optional[str] = None
    hair_type: Optional[str] = None
    color_code: Optional[str] = None
    length: Optional[str] = None
    quantity_available: int = 0
    selling_price: Optional[float] = None
    currency: str = "USD"
    available: bool = True

class VerificationSubmitIn(BaseModel):
    # Either a URL or a base64 data-URI string (e.g. "data:image/jpeg;base64,....")
    license_url: str

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
    accept_terms: bool = False
    # Pro extended fields — now OPTIONAL at register time (collected during onboarding)
    bio: Optional[str] = None
    service_area: Optional[str] = None
    salon_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    specialty_ids: Optional[List[str]] = None

class SendVerificationIn(BaseModel):
    pass  # uses caller's identity

class VerifyEmailIn(BaseModel):
    code: str

class ChangeEmailIn(BaseModel):
    new_email: EmailStr

class CustomerProfileIn(BaseModel):
    country: str
    city: str
    profile_photo: Optional[str] = None  # base64 or URL

class ProBasicsIn(BaseModel):
    display_name: Optional[str] = None
    country: str
    service_area: str
    salon_name: Optional[str] = None
    bio: Optional[str] = None

class CustomerRatingIn(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    flagged_for_removal: bool = False
    flag_reason: Optional[str] = None

class ReportIn(BaseModel):
    reported_user_id: str
    reason: str

class SubscribeIn(BaseModel):
    plan_type: Literal["free", "standard", "unlimited"]
    billing_interval: Optional[Literal["monthly", "yearly"]] = None  # required for paid

class OnboardingCompleteIn(BaseModel):
    onboarding_completed: bool = True

class FlagDecisionIn(BaseModel):
    action: Literal["lift", "keep", "remove"]
    reason: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionIn(BaseModel):
    session_id: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    is_new_user: Optional[bool] = None
    needs_pro_completion: Optional[bool] = None

class HairstyleIn(BaseModel):
    name: str
    category: str
    description: str
    avg_price: float
    avg_duration_min: int
    cover_photo: str
    # New Sprint 2 fields (all optional so existing records remain valid)
    difficulty: Optional[Literal["Easy", "Medium", "Advanced", "Expert"]] = "Medium"
    hair_length: Optional[Literal["Short", "Mid-length", "Long", "Extra Long"]] = "Long"
    maintenance: Optional[Literal["Low", "Medium", "High"]] = "Low"
    lasts_weeks: Optional[int] = 6
    tags: Optional[List[str]] = []           # ["trending","new","bridal","vacation","kids","office","event","most_loved","protective","luxury","natural","celebrity","color","quick"]
    country_tags: Optional[List[str]] = []   # ISO-alpha-2 codes: US, FR, NG, GB, GH, SN, KE, ZA, BR, JM, CM, CI, CG
    style_score: Optional[float] = 0.0       # 0..100 aggregated popularity
    saves_count: Optional[int] = 0
    recommended_for: Optional[List[str]] = []  # ["Children","Adults","Natural Hair","Relaxed Hair","Vacation","Wedding","Office"]

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
    public_id: Optional[str] = None  # Cloudinary public_id (populated for new uploads)

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
                   plan=u.get("plan", "free"),
                   phone=u.get("phone") if include_phone else None,
                   profile_photo=u.get("profile_photo"),
                   email_verified=bool(u.get("email_verified", False)))

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


# ---------- Pricing & Plans catalog ----------
FOUNDING_PRO_SLOTS = 10
YEARLY_DISCOUNT = 0.20  # 20% off vs 12x monthly
PRICING = {
    # Customer Unlimited — $4.99/mo, $47.88/yr (aggressive launch pricing)
    "customer": {"monthly": 4.99, "yearly": 47.88},
    # Braider tiers — Standard $9.99/mo, Unlimited $15.99/mo (upsell-friendly)
    "professional": {
        "standard": {"monthly": 9.99, "yearly": 95.88},
        "unlimited": {"monthly": 15.99, "yearly": 143.88},
    },
}

# Portfolio caps per braider plan
PORTFOLIO_CAPS = {"free": 10, "standard": 25, "unlimited": 40}

# Customer search radius (miles). Unlimited = worldwide (represented as None).
CUSTOMER_RADIUS_MI = {"free": 10, "unlimited": None, "standard": None}

# Public feature catalog — surfaced to frontend to drive the subscription screen.
PLANS_CATALOG = {
    "customer": {
        "free": {
            "name": "Free",
            "price_monthly": 0, "price_yearly": 0,
            "tagline": "Discover every braid, everywhere. Forever free.",
            "features": [
                "Browse every hairstyle & Studio",
                "Compare unlimited professionals",
                "Read every review, view every portfolio",
                "Save styles & build inspiration boards",
                "Book any professional worldwide",
            ],
            "limits": [],  # Discovery is NEVER gated — Free unlocks everything
        },
        "unlimited": {
            "name": "Unlimited",
            "price_monthly": PRICING["customer"]["monthly"],
            "price_yearly": PRICING["customer"]["yearly"],
            "tagline": "AI intelligence & convenience — make every braid feel effortless.",
            "features": [
                "AI Style Match — upload a selfie, get personalized recs",
                "Recreate This Look — from any Instagram or Pinterest photo",
                "AI Recommendations tuned to your style history",
                "Price Alerts — get notified when your dream style drops",
                "Beauty Journal — track appointments, growth & touch-ups",
                "Travel Planning — braiders in every city you visit",
                "Premium filters (traveling pros, luxury, verified-only)",
                "VIP support",
            ],
            "limits": [],
        },
    },
    "professional": {
        "free": {
            "name": "Free",
            "price_monthly": 0, "price_yearly": 0,
            "tagline": "Start showing up. No credit card.",
            "features": [
                "Professional profile",
                "Receive bookings",
                "Calendar & availability",
                "Reviews & pricing",
                f"{PORTFOLIO_CAPS['free']} portfolio photos",
                "Basic business dashboard",
            ],
        },
        "standard": {
            "name": "Standard",
            "price_monthly": PRICING["professional"]["standard"]["monthly"],
            "price_yearly": PRICING["professional"]["standard"]["yearly"],
            "tagline": "Invest in visibility. Understand your customers.",
            "features": [
                f"{PORTFOLIO_CAPS['standard']} portfolio photos",
                "Profile analytics",
                "Customer insights",
                "Trending hairstyle report",
                "Priority search ranking",
                "Weekly business reports",
                "Growth recommendations",
            ],
        },
        "unlimited": {
            "name": "Unlimited",
            "price_monthly": PRICING["professional"]["unlimited"]["monthly"],
            "price_yearly": PRICING["professional"]["unlimited"]["yearly"],
            "tagline": "The AI business partner for elite braiders.",
            "features": [
                f"{PORTFOLIO_CAPS['unlimited']} portfolio photos",
                "Featured placement",
                "Homepage recommendations",
                "AI Business Assistant (coming soon)",
                "Marketing tools & seasonal campaigns",
                "Revenue analytics",
                "Customer retention analytics",
                "Automatic reminders (coming soon)",
                "Website · online store · inventory (coming soon)",
                "Appointment forecasting (coming soon)",
            ],
        },
    },
    "founding_pro": {
        "slots": FOUNDING_PRO_SLOTS,
        "duration_days": 365,
        "tagline": "Founding Pros — Unlimited free for 1 year. Limited spots.",
    },
}


async def get_active_subscription(user_id: str) -> Optional[dict]:
    """Return the most-recent active subscription for a user, honoring promo_expires_at."""
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": "active"}, {"_id": 0}, sort=[("start_date", -1)])
    if not sub:
        return None
    # Auto-downgrade expired founding-pro promo to free
    if sub.get("is_founding_pro") and sub.get("promo_expires_at"):
        if datetime.fromisoformat(sub["promo_expires_at"]) < datetime.now(timezone.utc):
            await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
            await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})
            return None
    return sub

async def sync_user_plan_from_sub(user_id: str) -> str:
    """Reconciles the user.plan field with their subscription record. Returns the effective plan."""
    sub = await get_active_subscription(user_id)
    plan = sub["plan_type"] if sub else "free"
    await db.users.update_one({"id": user_id}, {"$set": {"plan": plan}})
    return plan


@api.get("/plans/catalog")
async def plans_catalog():
    return PLANS_CATALOG


# ---------- Auth ----------
@api.post("/auth/register", response_model=TokenOut)
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": uid, "email": body.email, "name": body.name, "role": body.role,
        "phone": body.phone, "plan": "free",
        "password_hash": hash_pw(body.password),
        "created_at": now.isoformat(),
        "profile_photo": None,
        "flag_count": 0, "booking_restricted": False,
        "email_verified": False,
        "terms_accepted_at": now.isoformat() if body.accept_terms else None,
    }
    await db.users.insert_one(doc)

    if body.role == "hairdresser":
        # Pro extended fields (bio/service_area/specialties power search matching + trust)
        pro_doc = {
            "id": uid, "user_id": uid,
            "bio": body.bio or "", "salon_name": body.salon_name or "",
            "address": body.address or "", "city": body.city or "",
            "service_area": body.service_area or body.city or "",
            "latitude": 0.0, "longitude": 0.0,
            "cover_photo": "", "verification_status": "unverified",
            "verification_submitted_at": None, "verification_license_url": None,
            "verification_decided_at": None, "verification_reason": None,
            "rating_avg": 0.0, "reviews_count": 0,
            "specialty_ids": body.specialty_ids or [],
            "onboarding_completed": False,
        }
        await db.hairdressers.insert_one(pro_doc)

        # Founding-Pro promo: first N pros get Unlimited free for 1 year
        pro_count = await db.hairdressers.count_documents({})  # includes the one just inserted
        if pro_count <= FOUNDING_PRO_SLOTS:
            promo_expires = now + timedelta(days=365)
            sub = {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "account_type": "professional",
                "plan_type": "unlimited",
                "billing_interval": "yearly",
                "price": 0.0,
                "status": "active",
                "start_date": now.isoformat(),
                "renewal_date": promo_expires.isoformat(),
                "is_founding_pro": True,
                "promo_expires_at": promo_expires.isoformat(),
                "founding_pro_slot": pro_count,
            }
            await db.subscriptions.insert_one(sub)
            await db.users.update_one({"id": uid}, {"$set": {"plan": "unlimited"}})
            doc["plan"] = "unlimited"

    user = await user_from_doc(doc, include_phone=True)
    return TokenOut(access_token=make_token(uid, body.role), user=user)

@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email})
    if not u or not u.get("password_hash") or not verify_pw(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return TokenOut(access_token=make_token(u["id"], u["role"]), user=await user_from_doc(u))

# ---------- Email verification ----------
EMAIL_CODE_TTL_MIN = 10
RESEND_COOLDOWN_SEC = 45
MAX_FAILED_ATTEMPTS = 5
MAX_RESENDS_PER_HOUR = 5
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "noreply@braidscommunity.app").strip()
SENDER_NAME = "BraidsCommunity"

def _hash_code(code: str) -> str:
    """SHA-256 hash. Codes are random 6-digit — full 20-char hex slice keeps DB small."""
    import hashlib
    return hashlib.sha256(code.encode()).hexdigest()

def _codes_match(code: str, stored_hash: str) -> bool:
    import hmac
    return hmac.compare_digest(_hash_code(code), stored_hash)

async def _send_verification_email(to: str, code: str) -> bool:
    if not RESEND_API_KEY:
        log.warning(f"[MOCKED EMAIL] Verification code for {to}: (masked, dev fallback active)")
        return False
    body = (f"Welcome to BraidsCommunity.\n\n"
            f"Your verification code is:\n{code}\n\n"
            f"This code expires in 10 minutes.\n\n"
            f"If you did not create a BraidsCommunity account, you can ignore this email.\n\n"
            f"BraidsCommunity\nWhere braids are art.")
    html = (f"<p>Welcome to BraidsCommunity.</p>"
            f"<p>Your verification code is:</p>"
            f"<p style='font-size:32px;letter-spacing:8px;font-weight:700'>{code}</p>"
            f"<p>This code expires in 10 minutes.</p>"
            f"<p>If you did not create a BraidsCommunity account, you can ignore this email.</p>"
            f"<p style='color:#8a8378;font-family:serif;font-style:italic'>BraidsCommunity — Where braids are art.</p>")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": f"{SENDER_NAME} <{SENDER_EMAIL}>",
                    "to": [to],
                    "subject": "Verify your BraidsCommunity email",
                    "text": body,
                    "html": html,
                },
            )
        if r.status_code >= 400:
            log.error(f"Resend delivery failed: status={r.status_code}")
            return False
        return True
    except Exception as e:
        log.error(f"Resend delivery exception: {type(e).__name__}")
        return False


@api.post("/auth/send-verification")
async def send_verification(user: UserOut = Depends(get_user)):
    u = await db.users.find_one({"id": user.id}, {"_id": 0})
    if u.get("email_verified"):
        return {"already_verified": True}
    now = datetime.now(timezone.utc)

    # Anti-abuse: max resends per hour
    hour_ago = (now - timedelta(hours=1)).isoformat()
    recent = await db.email_verification_codes.count_documents({
        "user_id": user.id, "created_at": {"$gte": hour_ago}
    })
    if recent >= MAX_RESENDS_PER_HOUR:
        raise HTTPException(429, "Too many code requests. Try again in an hour.")

    last = await db.email_verification_codes.find_one({"user_id": user.id}, sort=[("created_at", -1)])
    if last:
        elapsed = (now - datetime.fromisoformat(last["created_at"])).total_seconds()
        if elapsed < RESEND_COOLDOWN_SEC:
            raise HTTPException(429, f"Please wait {int(RESEND_COOLDOWN_SEC - elapsed)}s before requesting another code.")

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    # Invalidate all older codes for this user
    await db.email_verification_codes.update_many(
        {"user_id": user.id, "consumed": False},
        {"$set": {"consumed": True, "invalidated_reason": "superseded"}},
    )
    await db.email_verification_codes.insert_one({
        "id": str(uuid.uuid4()), "user_id": user.id, "email": u["email"],
        "code_hash": _hash_code(code), "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=EMAIL_CODE_TTL_MIN)).isoformat(),
        "consumed": False,
    })
    delivered = await _send_verification_email(u["email"], code)
    resp: dict = {"sent": True, "email": u["email"], "expires_in_sec": EMAIL_CODE_TTL_MIN * 60,
                  "resend_after_sec": RESEND_COOLDOWN_SEC, "delivered_via_email": delivered}
    if not delivered and not RESEND_API_KEY:
        # Only expose dev_code when no key is configured at all (never in real prod).
        resp["dev_code"] = code
        resp["dev_notice"] = "RESEND_API_KEY not set — code shown for local dev only."
    elif not delivered:
        # Key is set but delivery failed — do NOT leak the code. Surface generic error.
        raise HTTPException(502, "Could not send verification email. Please try again in a moment.")
    return resp


@api.post("/auth/verify-email")
async def verify_email(body: VerifyEmailIn, user: UserOut = Depends(get_user)):
    code = body.code.strip()
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(400, "Enter the 6-digit code from your email.")
    entry = await db.email_verification_codes.find_one(
        {"user_id": user.id, "consumed": False}, sort=[("created_at", -1)]
    )
    if not entry:
        raise HTTPException(400, "No active verification code. Tap Resend to get a new one.")
    if datetime.fromisoformat(entry["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "That code has expired. Tap Resend to get a fresh code.")
    if entry.get("attempts", 0) >= MAX_FAILED_ATTEMPTS:
        await db.email_verification_codes.update_one({"id": entry["id"]}, {"$set": {"consumed": True, "invalidated_reason": "too_many_attempts"}})
        raise HTTPException(429, "Too many incorrect attempts. Tap Resend to get a new code.")
    if not _codes_match(code, entry.get("code_hash", "")):
        await db.email_verification_codes.update_one({"id": entry["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code — please double-check and try again.")
    await db.email_verification_codes.update_one({"id": entry["id"]}, {"$set": {"consumed": True, "invalidated_reason": "used"}})
    await db.users.update_one({"id": user.id}, {"$set": {"email_verified": True}})
    return {"ok": True, "email_verified": True}


@api.post("/auth/change-email")
async def change_email(body: ChangeEmailIn, user: UserOut = Depends(get_user)):
    new_email = body.new_email.lower().strip()
    existing = await db.users.find_one({"email": new_email})
    if existing and existing["id"] != user.id:
        raise HTTPException(400, "That email is already in use.")
    await db.users.update_one({"id": user.id}, {"$set": {"email": new_email, "email_verified": False}})
    await db.email_verification_codes.update_many({"user_id": user.id, "consumed": False}, {"$set": {"consumed": True, "invalidated_reason": "email_changed"}})
    return {"ok": True, "email": new_email}


# ---------- Post-verify profile completion ----------
@api.post("/customers/me/profile")
async def complete_customer_profile(body: CustomerProfileIn, user: UserOut = Depends(get_user)):
    if user.role != "customer":
        raise HTTPException(403, "Customers only")
    await db.users.update_one({"id": user.id}, {"$set": {
        "country": body.country, "city": body.city,
        "profile_photo": body.profile_photo or None,
        "profile_completed": True,
    }})
    return {"ok": True}


@api.post("/hairdressers/me/basics")
async def save_pro_basics(body: ProBasicsIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Hairdressers only")
    updates = {"country": body.country, "service_area": body.service_area, "city": body.service_area}
    if body.salon_name is not None: updates["salon_name"] = body.salon_name
    if body.bio is not None: updates["bio"] = body.bio
    if body.display_name:
        await db.users.update_one({"id": user.id}, {"$set": {"name": body.display_name}})
    await db.hairdressers.update_one({"user_id": user.id}, {"$set": updates})
    return {"ok": True}




@api.post("/auth/google", response_model=TokenOut)
async def google_signin(body: GoogleSessionIn):
    """Exchange an Emergent OAuth session_id for our JWT.
    - Looks up email via Emergent's session-data endpoint.
    - Upserts user (matched by email — links to existing password accounts).
    - New users default to role=customer.
    - Returns needs_pro_completion=true if the user is a hairdresser whose extended profile is incomplete."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
        except httpx.HTTPError:
            raise HTTPException(502, "Could not reach Google auth provider")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired Google session")
    data = r.json()
    email = data.get("email")
    if not email:
        raise HTTPException(400, "Google session missing email")

    existing = await db.users.find_one({"email": email})
    is_new = False
    if existing:
        uid = existing["id"]
        # Cache Google id + picture for repeat logins
        updates: dict = {"google_id": data.get("id")}
        if data.get("picture") and not existing.get("profile_photo"):
            updates["profile_photo"] = data["picture"]
        await db.users.update_one({"id": uid}, {"$set": updates})
        user_doc = {**existing, **updates}
    else:
        uid = str(uuid.uuid4())
        user_doc = {
            "id": uid, "email": email, "name": data.get("name") or email.split("@")[0],
            "role": "customer", "plan": "free",
            "profile_photo": data.get("picture"),
            "phone": None, "flag_count": 0, "booking_restricted": False,
            "password_hash": None, "google_id": data.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        is_new = True

    # Pro-completion check: if this Google account is a hairdresser and hasn't finished pro setup
    needs_pro_completion = False
    if user_doc["role"] == "hairdresser":
        hd = await db.hairdressers.find_one({"user_id": uid}, {"_id": 0})
        needs_pro_completion = not (hd and hd.get("onboarding_completed"))

    user = await user_from_doc(user_doc, include_phone=True)
    return TokenOut(
        access_token=make_token(uid, user_doc["role"]),
        user=user,
        is_new_user=is_new,
        needs_pro_completion=needs_pro_completion,
    )

@api.get("/auth/me", response_model=UserOut)
async def me(user: UserOut = Depends(get_user)):
    # include user's own phone in self endpoint only
    u = await db.users.find_one({"id": user.id}, {"_id": 0, "password_hash": 0})
    return await user_from_doc(u, include_phone=True)


@api.delete("/auth/me")
async def delete_account(user: UserOut = Depends(get_user)):
    """Permanent, in-app account deletion — required by App Store guidelines.
    Cascades to remove personal data (favorites, saves, notifications, inspiration,
    hairdresser record). Bookings are anonymised (user_id kept as `deleted_user_<hash>`)
    so the other party's booking history remains intact.
    """
    uid = user.id
    stub = f"deleted_user_{hashlib.sha1(uid.encode()).hexdigest()[:8]}"
    # Personal collections — hard delete.
    await db.style_saves.delete_many({"user_id": uid})
    await db.collections.delete_many({"user_id": uid})
    await db.favorites.delete_many({"user_id": uid})
    await db.inspiration.delete_many({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})
    await db.notification_preferences.delete_many({"user_id": uid})
    await db.recent_views.delete_many({"user_id": uid})
    await db.founding_pro_applications.delete_many({"user_id": uid})
    # If braider: remove Studio-owned data.
    if user.role == "hairdresser":
        await db.hairdressers.delete_many({"user_id": uid})
        await db.availability.delete_many({"hairdresser_id": uid})
        await db.portfolio_items.delete_many({"hairdresser_id": uid})
        await db.professional_services.delete_many({"hairdresser_id": uid})
        # Anonymise past bookings so customer history stays intact.
        await db.bookings.update_many({"hairdresser_id": uid}, {"$set": {"hairdresser_id": stub, "hairdresser_deleted": True}})
    else:
        await db.bookings.update_many({"customer_id": uid}, {"$set": {"customer_id": stub, "customer_deleted": True}})
    # Anonymise reviews and flags (kept for community trust).
    await db.reviews.update_many({"customer_id": uid}, {"$set": {"customer_id": stub, "customer_deleted": True}})
    await db.reviews.update_many({"hairdresser_id": uid}, {"$set": {"hairdresser_id": stub, "hairdresser_deleted": True}})
    # Finally, the user record itself.
    await db.users.delete_one({"id": uid})
    return {"ok": True}


@api.post("/auth/block/{other_user_id}")
async def block_user(other_user_id: str, user: UserOut = Depends(get_user)):
    """Block another user. They will not appear in search or be able to interact.
    A one-way block; each side maintains their own blocklist."""
    if other_user_id == user.id:
        raise HTTPException(400, "You cannot block yourself.")
    await db.blocks.update_one(
        {"blocker_id": user.id, "blocked_id": other_user_id},
        {"$set": {"blocker_id": user.id, "blocked_id": other_user_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/auth/block/{other_user_id}")
async def unblock_user(other_user_id: str, user: UserOut = Depends(get_user)):
    await db.blocks.delete_one({"blocker_id": user.id, "blocked_id": other_user_id})
    return {"ok": True}


class ReportUserIn(BaseModel):
    target_user_id: str
    reason: Literal["harassment", "spam", "safety", "impersonation", "other"] = "other"
    details: Optional[str] = None


@api.post("/auth/report")
async def report_user(body: ReportUserIn, user: UserOut = Depends(get_user)):
    """File a report against another user. Admins triage from the queue collection."""
    if body.target_user_id == user.id:
        raise HTTPException(400, "You cannot report yourself.")
    await db.user_reports.insert_one({
        "id": str(uuid.uuid4()),
        "reporter_id": user.id,
        "target_user_id": body.target_user_id,
        "reason": body.reason,
        "details": (body.details or "").strip()[:1000],
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api.post("/auth/plan", response_model=UserOut)
async def update_plan(body: PlanUpdate, user: UserOut = Depends(get_user)):
    """Legacy mock toggle — retained for backward compat. New callers should use /subscriptions/subscribe."""
    await db.users.update_one({"id": user.id}, {"$set": {"plan": body.plan}})
    if body.plan == "standard":
        await db.subscriptions.update_many({"user_id": user.id, "status": "active"}, {"$set": {"status": "cancelled"}})
    u = await db.users.find_one({"id": user.id}, {"_id": 0, "password_hash": 0})
    return await user_from_doc(u, include_phone=True)


# ---------- Subscriptions ----------
@api.get("/subscriptions/me")
async def get_my_subscription(user: UserOut = Depends(get_user)):
    """Returns the active subscription (or None) + full plans catalog scoped to the user's role."""
    sub = await get_active_subscription(user.id)
    await sync_user_plan_from_sub(user.id)
    account_type = "professional" if user.role == "hairdresser" else "customer"
    catalog = PLANS_CATALOG[account_type]
    days_left_promo = None
    if sub and sub.get("is_founding_pro") and sub.get("promo_expires_at"):
        delta = datetime.fromisoformat(sub["promo_expires_at"]) - datetime.now(timezone.utc)
        days_left_promo = max(0, delta.days)
    return {
        "subscription": sub,
        "account_type": account_type,
        "catalog": catalog,
        "yearly_savings_pct": int(YEARLY_DISCOUNT * 100),
        "founding_pro_days_left": days_left_promo,
    }

@api.post("/subscriptions/subscribe")
async def subscribe(body: SubscribeIn, user: UserOut = Depends(get_user)):
    """Mocked subscribe — creates a real subscription record; no payment processor is called."""
    account_type = "professional" if user.role == "hairdresser" else "customer"
    now = datetime.now(timezone.utc)

    # Downgrade to Free
    if body.plan_type == "free":
        await db.subscriptions.update_many({"user_id": user.id, "status": "active"}, {"$set": {"status": "cancelled"}})
        await db.users.update_one({"id": user.id}, {"$set": {"plan": "free"}})
        return {"ok": True, "plan": "free"}

    # Customers only have free/unlimited
    if account_type == "customer" and body.plan_type not in ("free", "unlimited"):
        raise HTTPException(400, "Customers can subscribe to Free or Unlimited only.")
    if body.plan_type not in ("standard", "unlimited"):
        raise HTTPException(400, "Invalid plan_type")

    if not body.billing_interval:
        raise HTTPException(400, "billing_interval required")

    # Preserve founding-pro promo if it's still valid — don't overwrite with a paid sub
    current = await get_active_subscription(user.id)
    if current and current.get("is_founding_pro") and current.get("promo_expires_at") \
            and datetime.fromisoformat(current["promo_expires_at"]) > now:
        return {"ok": True, "plan": "unlimited", "note": "You're on the Founding Pro promo — no charge until it expires."}

    # Resolve price
    if account_type == "customer":
        price = PRICING["customer"][body.billing_interval]
    else:
        price = PRICING["professional"][body.plan_type][body.billing_interval]

    renewal = now + timedelta(days=30 if body.billing_interval == "monthly" else 365)
    await db.subscriptions.update_many({"user_id": user.id, "status": "active"}, {"$set": {"status": "cancelled"}})
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "account_type": account_type,
        "plan_type": body.plan_type,
        "billing_interval": body.billing_interval,
        "price": price,
        "status": "active",
        "start_date": now.isoformat(),
        "renewal_date": renewal.isoformat(),
        "is_founding_pro": False,
        "promo_expires_at": None,
    }
    await db.subscriptions.insert_one(sub)
    await db.users.update_one({"id": user.id}, {"$set": {"plan": body.plan_type}})
    return {"ok": True, "plan": body.plan_type, "subscription": {k: v for k, v in sub.items() if k != "_id"}}


# ---------- Hairstyles ----------
@api.get("/hairstyles")
async def list_hairstyles(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    section: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = 200,
    user: Optional[UserOut] = Depends(maybe_user),
):
    """
    List hairstyles with optional filters:
      - category:  exact category name
      - tag:       any tag in `tags[]` (trending, new, bridal, kids, vacation, office, event, most_loved, ...)
      - section:   canonical section name — mapped to a tag or sort
      - country:   ISO-alpha-2 code (US/FR/NG/GB/GH/SN/KE/ZA/BR/JM/CM/CI/CG) or "WW" for worldwide (all)
    Adds computed fields per row: nearby_pros_count, is_saved (if user).
    """
    q: dict = {}
    if category:
        q["category"] = category
    if tag:
        q["tags"] = tag
    if country and country.upper() not in ("WW", "WORLDWIDE", ""):
        q["country_tags"] = country.upper()
    # Section aliases → tag or sort strategy
    sort = [("style_score", -1)]
    if section:
        alias = {
            "trending": "trending",
            "new": "new",
            "most_loved": "most_loved",
            "vacation": "vacation",
            "bridal": "bridal",
            "kids": "kids",
            "office": "office",
            "event": "event",
            "protective": "protective",
            "luxury": "luxury",
            "celebrity": "celebrity",
            "natural": "natural",
            "color": "color",
            "quick": "quick",
        }
        if section in alias:
            q["tags"] = alias[section]
        if section == "new":
            sort = [("created_at", -1)]
        if section == "most_loved":
            sort = [("saves_count", -1)]

    items = await db.hairstyles.find(q, {"_id": 0}).sort(sort).to_list(limit)
    # Per-style nearby pros count (approximate — count of pros whose specialties include this style id)
    for it in items:
        it["nearby_pros_count"] = await db.hairdressers.count_documents({"specialty_ids": it["id"]})
    # Saved flag for the caller
    if user:
        ids = [i["id"] for i in items]
        saved_ids = {
            r["hairstyle_id"]
            async for r in db.style_saves.find(
                {"user_id": user.id, "hairstyle_id": {"$in": ids}}, {"_id": 0}
            )
        }
        for it in items:
            it["is_saved"] = it["id"] in saved_ids
    return items

@api.get("/hairstyles/categories")
async def hairstyle_categories():
    cats = await db.hairstyles.distinct("category")
    return {"categories": cats}


# ---------- Trending Countries ----------
# ISO-alpha-2 codes + flag emoji + display name. The client renders these as chips
# in the "Trending Worldwide" section. Ordering is the display order on the strip.
TRENDING_COUNTRIES = [
    {"code": "WW", "flag": "🌍", "name": "Worldwide"},
    {"code": "US", "flag": "🇺🇸", "name": "United States"},
    {"code": "FR", "flag": "🇫🇷", "name": "France"},
    {"code": "GB", "flag": "🇬🇧", "name": "United Kingdom"},
    {"code": "NG", "flag": "🇳🇬", "name": "Nigeria"},
    {"code": "GH", "flag": "🇬🇭", "name": "Ghana"},
    {"code": "SN", "flag": "🇸🇳", "name": "Senegal"},
    {"code": "CI", "flag": "🇨🇮", "name": "Côte d'Ivoire"},
    {"code": "CM", "flag": "🇨🇲", "name": "Cameroon"},
    {"code": "CG", "flag": "🇨🇬", "name": "Congo"},
    {"code": "KE", "flag": "🇰🇪", "name": "Kenya"},
    {"code": "ZA", "flag": "🇿🇦", "name": "South Africa"},
    {"code": "BR", "flag": "🇧🇷", "name": "Brazil"},
    {"code": "JM", "flag": "🇯🇲", "name": "Jamaica"},
]


@api.get("/trending/countries")
async def trending_countries():
    return TRENDING_COUNTRIES


@api.get("/trending/{code}")
async def trending_for_country(code: str, limit: int = 12, user: Optional[UserOut] = Depends(maybe_user)):
    """
    Returns the top trending hairstyles for a country (or "WW" worldwide).
    Ranking today uses style_score; when real telemetry (views/saves/bookings/
    ratings/searches) is available, replace this query with an aggregation on
    the `style_views`, `style_saves`, `bookings` and `reviews` collections
    without changing the response shape.
    """
    q: dict = {}
    code_up = code.upper()
    if code_up not in ("WW", "WORLDWIDE"):
        q["country_tags"] = code_up
    items = await db.hairstyles.find(q, {"_id": 0}).sort([("style_score", -1)]).to_list(limit)
    for it in items:
        it["nearby_pros_count"] = await db.hairdressers.count_documents({"specialty_ids": it["id"]})
    if user and items:
        ids = [i["id"] for i in items]
        saved_ids = {
            r["hairstyle_id"]
            async for r in db.style_saves.find({"user_id": user.id, "hairstyle_id": {"$in": ids}}, {"_id": 0})
        }
        for it in items:
            it["is_saved"] = it["id"] in saved_ids
    return items


# ---------- View tracking (feeds "Continue Dreaming") ----------
@api.post("/hairstyles/{hid}/view")
async def track_view(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    """Best-effort view tracker. Silent on failure so page loads never break."""
    if not user:
        return {"ok": True, "anonymous": True}
    try:
        exists = await db.hairstyles.count_documents({"id": hid}) > 0
        if not exists:
            return {"ok": False}
        # Upsert one row per (user, style) — timestamp becomes recency signal.
        await db.style_views.update_one(
            {"user_id": user.id, "hairstyle_id": hid},
            {"$set": {"viewed_at": datetime.now(timezone.utc).isoformat()},
             "$inc": {"view_count": 1},
             "$setOnInsert": {"id": str(uuid.uuid4())}},
            upsert=True,
        )
        # Global counter fuels future analytics-driven ranking.
        await db.hairstyles.update_one({"id": hid}, {"$inc": {"view_count": 1}})
    except Exception:
        pass
    return {"ok": True}


# ---------- Continue Dreaming / Start Your Journey ----------
@api.get("/continue-dreaming/me")
async def continue_dreaming(user: UserOut = Depends(get_user)):
    """
    Personalized shelf:
      - Saved styles first (most recent first)
      - Then recently-viewed styles not already in saved
      - Section is empty ONLY if user has no saves AND no views — in that case
        the client renders "Start Your Journey" using /trending/WW.

    Cap 10 items, each annotated with `personal_reason`: "Saved" or "Last viewed".
    """
    limit = 10
    saved = await db.style_saves.find({"user_id": user.id}, {"_id": 0}).sort([("created_at", -1)]).to_list(limit)
    saved_ids = [s["hairstyle_id"] for s in saved]

    views_q = {"user_id": user.id}
    if saved_ids:
        views_q["hairstyle_id"] = {"$nin": saved_ids}
    viewed = await db.style_views.find(views_q, {"_id": 0}).sort([("viewed_at", -1)]).to_list(limit)

    ordered_ids = saved_ids + [v["hairstyle_id"] for v in viewed]
    ordered_ids = ordered_ids[:limit]
    if not ordered_ids:
        return {"mode": "new_user", "items": []}

    styles = await db.hairstyles.find({"id": {"$in": ordered_ids}}, {"_id": 0}).to_list(limit)
    by_id = {s["id"]: s for s in styles}
    saved_set = set(saved_ids)
    out: List[dict] = []
    for sid in ordered_ids:
        st = by_id.get(sid)
        if not st:
            continue
        st = dict(st)
        st["personal_reason"] = "Saved" if sid in saved_set else "Last viewed"
        st["nearby_pros_count"] = await db.hairdressers.count_documents({"specialty_ids": sid})
        st["is_saved"] = sid in saved_set
        out.append(st)
    return {"mode": "returning_user", "items": out}


@api.get("/hairstyles/{hid}")
async def get_hairstyle(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    h = await db.hairstyles.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Not found")
    h["nearby_pros_count"] = await db.hairdressers.count_documents({"specialty_ids": hid})
    if user:
        h["is_saved"] = await db.style_saves.count_documents({"user_id": user.id, "hairstyle_id": hid}) > 0
    # Similar styles = same category, excluding self, top by score, 6 max
    sim_cursor = db.hairstyles.find(
        {"category": h.get("category"), "id": {"$ne": hid}}, {"_id": 0}
    ).sort([("style_score", -1)]).limit(6)
    h["similar"] = await sim_cursor.to_list(6)
    return h

@api.get("/hairstyles/{hid}/hairdressers")
async def hairdressers_for_style(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    # Discovery is universal — Free customers browse every Studio, every price, every portfolio.
    # Premium unlocks AI intelligence + convenience, never discovery itself.
    hds = await db.hairdressers.find({"specialty_ids": hid}, {"_id": 0}).to_list(200)
    for h in hds:
        u = await db.users.find_one({"id": h["user_id"]}, {"_id": 0, "password_hash": 0})
        h["name"] = u["name"] if u else "Stylist"
        h["profile_photo"] = u.get("profile_photo") if u else None
    return {"results": hds, "gated": False}


# ---------- Hairdressers ----------
@api.get("/hairdressers/me")
async def get_my_pro_profile(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    return hd

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
    # Discovery is universal — no location blur. Full Studio details are always visible.
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
    # Verification is optional — search returns all hairdressers regardless of verification status.
    query = {}
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
    return {"results": hds, "gated": False}


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
    cap = PORTFOLIO_CAPS.get(user.plan, 10)
    if count >= cap:
        raise HTTPException(402, f"Your {user.plan.title()} plan is capped at {cap} portfolio photos. Upgrade to unlock more.")
    item = {"id": str(uuid.uuid4()), "hairdresser_id": user.id, **body.dict()}
    await db.portfolio_items.insert_one(item)
    return clean(item)

@api.delete("/portfolio/{item_id}")
async def delete_portfolio(item_id: str, user: UserOut = Depends(get_user)):
    await db.portfolio_items.delete_one({"id": item_id, "hairdresser_id": user.id})
    return {"ok": True}


# ---------- Cloudinary Signed Media ----------
from media import SignRequest as _MediaSignRequest, build_sign_response as _build_sign, is_configured as _cloudinary_ok, signed_delivery_url as _signed_delivery_url  # noqa: E402


class _MediaCompleteIn(BaseModel):
    context: Literal["portfolio", "style_catalog", "avatar", "license", "booking"]
    secure_url: str
    public_id: str
    # per-context extras
    hairstyle_id: Optional[str] = None
    caption: Optional[str] = ""
    booking_id: Optional[str] = None
    hairdresser_id: Optional[str] = None
    bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


@api.get("/media/config")
async def media_config():
    """Public read of what's configured (no secrets)."""
    return {"cloudinary_configured": _cloudinary_ok()}


@api.post("/media/sign")
async def media_sign(body: _MediaSignRequest, user: UserOut = Depends(get_user)):
    """
    Return signed upload params so the mobile client can POST the image
    directly to Cloudinary. Backend never sees the bytes.

    Free-tier portfolio cap enforced here (5 photos).
    """
    if not _cloudinary_ok():
        raise HTTPException(503, "Image upload is not configured yet. Ask admin to add Cloudinary keys.")

    # Enforce ownership + tier limits based on context
    if body.context == "portfolio":
        if user.role != "hairdresser":
            raise HTTPException(403, "Only hairdressers can upload portfolio photos.")
        body.hairdresser_id = user.id
        count = await db.portfolio_items.count_documents({"hairdresser_id": user.id})
        if user.plan != "unlimited" and count >= PORTFOLIO_CAPS.get(user.plan, 10):
            raise HTTPException(402, f"Your {user.plan.title()} plan is capped at {PORTFOLIO_CAPS.get(user.plan, 10)} portfolio photos. Upgrade to unlock more.")
    elif body.context == "license":
        if user.role != "hairdresser":
            raise HTTPException(403, "Only hairdressers can upload verification documents.")
        body.hairdresser_id = user.id
    elif body.context == "avatar":
        body.user_id = user.id
    elif body.context == "style_catalog":
        if user.role != "admin":
            raise HTTPException(403, "Only admins can upload catalog style photos.")
    elif body.context == "booking":
        if not body.booking_id:
            raise HTTPException(400, "booking_id required for booking uploads.")
        b = await db.bookings.find_one({"id": body.booking_id})
        if not b:
            raise HTTPException(404, "Booking not found")
        if user.id not in (b.get("customer_id"), b.get("hairdresser_id")):
            raise HTTPException(403, "Not your booking.")
    return _build_sign(body).dict()


@api.post("/media/complete")
async def media_complete(body: _MediaCompleteIn, user: UserOut = Depends(get_user)):
    """
    Persist the Cloudinary asset metadata after a successful upload.
    Called by the client with the JSON that Cloudinary returned.
    """
    # Basic validation: the returned public_id must live in the expected folder
    expected_prefixes = {
        "portfolio": f"braidscommunity/portfolio/{user.id}/",
        "avatar": f"braidscommunity/profiles/{user.id}/",
        "license": f"braidscommunity/verification/{user.id}/",
        "style_catalog": "braidscommunity/styles/",
        "booking": "braidscommunity/bookings/",
    }
    prefix = expected_prefixes.get(body.context, "")
    if prefix and not body.public_id.startswith(prefix):
        raise HTTPException(400, f"public_id must live under {prefix}")

    if body.context == "portfolio":
        if user.role != "hairdresser":
            raise HTTPException(403, "Only hairdressers can save portfolio photos.")
        if not body.hairstyle_id:
            raise HTTPException(400, "hairstyle_id required for portfolio photos.")
        count = await db.portfolio_items.count_documents({"hairdresser_id": user.id})
        cap = PORTFOLIO_CAPS.get(user.plan, 10)
        if count >= cap:
            raise HTTPException(402, f"Your {user.plan.title()} plan is capped at {cap} portfolio photos.")
        item = {
            "id": str(uuid.uuid4()),
            "hairdresser_id": user.id,
            "hairstyle_id": body.hairstyle_id,
            "photo_url": body.secure_url,
            "public_id": body.public_id,
            "caption": body.caption or "",
        }
        await db.portfolio_items.insert_one(item)
        return clean(item)

    if body.context == "avatar":
        await db.users.update_one(
            {"id": user.id},
            {"$set": {"profile_photo": body.secure_url, "profile_photo_public_id": body.public_id}},
        )
        return {"ok": True, "profile_photo": body.secure_url}

    if body.context == "license":
        if user.role != "hairdresser":
            raise HTTPException(403, "Only hairdressers.")
        # License URL is NOT returned publicly — stored as private; admin gets a signed delivery URL.
        await db.hairdressers.update_one(
            {"user_id": user.id},
            {"$set": {
                "license_url": body.secure_url,  # authenticated — needs signed URL to view
                "license_public_id": body.public_id,
                "verification_status": "pending",
            }},
        )
        return {"ok": True, "verification_status": "pending"}

    if body.context == "booking":
        if not body.booking_id:
            raise HTTPException(400, "booking_id required.")
        await db.booking_photos.insert_one({
            "id": str(uuid.uuid4()),
            "booking_id": body.booking_id,
            "uploaded_by": user.id,
            "photo_url": body.secure_url,
            "public_id": body.public_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    if body.context == "style_catalog":
        if user.role != "admin":
            raise HTTPException(403, "Admins only.")
        # Style catalog photos are attached to a hairstyle by admin flow (out of scope here — return meta).
        return {"ok": True, "secure_url": body.secure_url, "public_id": body.public_id}

    raise HTTPException(400, f"Unknown context: {body.context}")


@api.get("/admin/license-url/{hairdresser_user_id}")
async def admin_license_url(hairdresser_user_id: str, user: UserOut = Depends(get_user)):
    """
    Return a short-lived SIGNED delivery URL for viewing a hairdresser's uploaded license.
    Admin-only. Never proxies the image bytes.
    """
    _require_admin(user)
    hd = await db.hairdressers.find_one({"user_id": hairdresser_user_id}, {"_id": 0})
    if not hd or not hd.get("license_public_id"):
        raise HTTPException(404, "No license on file.")
    try:
        url = _signed_delivery_url(hd["license_public_id"], expires_in=1800)  # 30 min
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"url": url, "expires_in": 1800}


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
    # Two-way trust: repeatedly-flagged customers can't book anyone until admin reviews
    fresh = await db.users.find_one({"id": user.id}, {"_id": 0})
    if fresh and fresh.get("booking_restricted"):
        raise HTTPException(
            403,
            "Your account is temporarily restricted from booking after receiving repeated flags from braiders. "
            "An admin will review your account — you'll be notified with the decision.",
        )
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


# ---------- Style Saves & Collections ----------
# A "collection" is an inspiration board owned by a customer. Every user gets
# a set of default boards on first read. Saves are (user_id, hairstyle_id) with
# an optional collection_id.

DEFAULT_COLLECTIONS = ["Favorites", "Vacation", "Wedding", "Birthday", "Kids", "Next Appointment", "Summer"]

async def _ensure_default_collections(user_id: str):
    existing = await db.style_collections.count_documents({"user_id": user_id})
    if existing:
        return
    now = datetime.now(timezone.utc).isoformat()
    for name in DEFAULT_COLLECTIONS:
        await db.style_collections.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": name,
            "created_at": now,
            "is_default": True,
        })


class CollectionCreate(BaseModel):
    name: str


@api.get("/collections/me")
async def list_my_collections(user: UserOut = Depends(get_user)):
    await _ensure_default_collections(user.id)
    cols = await db.style_collections.find({"user_id": user.id}, {"_id": 0}).sort([("is_default", -1), ("created_at", 1)]).to_list(100)
    # attach count + preview cover
    for c in cols:
        saves = await db.style_saves.find({"user_id": user.id, "collection_ids": c["id"]}, {"_id": 0}).to_list(5)
        c["saves_count"] = await db.style_saves.count_documents({"user_id": user.id, "collection_ids": c["id"]})
        cover = None
        if saves:
            st = await db.hairstyles.find_one({"id": saves[0]["hairstyle_id"]}, {"_id": 0, "cover_photo": 1})
            if st:
                cover = st.get("cover_photo")
        c["cover"] = cover
    return cols


@api.post("/collections/me")
async def create_collection(body: CollectionCreate, user: UserOut = Depends(get_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Name required")
    doc = {"id": str(uuid.uuid4()), "user_id": user.id, "name": name, "created_at": datetime.now(timezone.utc).isoformat(), "is_default": False}
    await db.style_collections.insert_one(doc)
    return clean(doc)


@api.delete("/collections/me/{cid}")
async def delete_collection(cid: str, user: UserOut = Depends(get_user)):
    col = await db.style_collections.find_one({"id": cid, "user_id": user.id})
    if not col:
        raise HTTPException(404, "Not found")
    if col.get("is_default"):
        raise HTTPException(400, "Default boards cannot be deleted")
    await db.style_collections.delete_one({"id": cid})
    await db.style_saves.update_many({"user_id": user.id}, {"$pull": {"collection_ids": cid}})
    return {"ok": True}


class SaveIn(BaseModel):
    hairstyle_id: str
    collection_ids: Optional[List[str]] = None  # empty = save to Favorites default


@api.post("/style-saves")
async def toggle_save(body: SaveIn, user: UserOut = Depends(get_user)):
    """Save (or add to more boards) a hairstyle. Idempotent."""
    st = await db.hairstyles.find_one({"id": body.hairstyle_id}, {"_id": 0, "id": 1})
    if not st:
        raise HTTPException(404, "Hairstyle not found")
    await _ensure_default_collections(user.id)
    # Resolve collections
    cols = body.collection_ids or []
    if not cols:
        fav = await db.style_collections.find_one({"user_id": user.id, "name": "Favorites"}, {"_id": 0})
        if fav:
            cols = [fav["id"]]
    existing = await db.style_saves.find_one({"user_id": user.id, "hairstyle_id": body.hairstyle_id})
    if existing:
        merged = list({*(existing.get("collection_ids") or []), *cols})
        await db.style_saves.update_one({"_id": existing["_id"]}, {"$set": {"collection_ids": merged}})
    else:
        await db.style_saves.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user.id,
            "hairstyle_id": body.hairstyle_id,
            "collection_ids": cols,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.hairstyles.update_one({"id": body.hairstyle_id}, {"$inc": {"saves_count": 1}})
    return {"ok": True, "saved": True}


@api.delete("/style-saves/{hairstyle_id}")
async def unsave(hairstyle_id: str, user: UserOut = Depends(get_user)):
    r = await db.style_saves.delete_one({"user_id": user.id, "hairstyle_id": hairstyle_id})
    if r.deleted_count:
        await db.hairstyles.update_one({"id": hairstyle_id}, {"$inc": {"saves_count": -1}})
    return {"ok": True, "saved": False}


@api.get("/style-saves/me")
async def my_saves(collection_id: Optional[str] = None, user: UserOut = Depends(get_user)):
    q: dict = {"user_id": user.id}
    if collection_id:
        q["collection_ids"] = collection_id
    saves = await db.style_saves.find(q, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    if not saves:
        return []
    ids = [s["hairstyle_id"] for s in saves]
    styles = await db.hairstyles.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    by_id = {s["id"]: s for s in styles}
    out = []
    for s in saves:
        st = by_id.get(s["hairstyle_id"])
        if st:
            st = {**st, "collection_ids": s.get("collection_ids") or [], "saved_at": s.get("created_at")}
            out.append(st)
    return out


# ---------- Inspiration Photos (My Inspiration board) ----------
class InspirationIn(BaseModel):
    photo_url: str
    public_id: Optional[str] = None
    note: Optional[str] = ""


@api.get("/inspiration/me")
async def list_inspiration(user: UserOut = Depends(get_user)):
    items = await db.inspiration_photos.find({"user_id": user.id}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    return items


@api.post("/inspiration")
async def add_inspiration(body: InspirationIn, user: UserOut = Depends(get_user)):
    if not body.photo_url:
        raise HTTPException(400, "photo_url required")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "photo_url": body.photo_url,
        "public_id": body.public_id,
        "note": body.note or "",
        "ai_match_pending": True,  # future AI hook
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspiration_photos.insert_one(doc)
    return clean(doc)


@api.delete("/inspiration/{ins_id}")
async def delete_inspiration(ins_id: str, user: UserOut = Depends(get_user)):
    r = await db.inspiration_photos.delete_one({"id": ins_id, "user_id": user.id})
    if not r.deleted_count:
        raise HTTPException(404, "Not found")
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


# ---------- Customer Ratings (braider rates the customer) ----------
FLAG_THRESHOLD = 3

@api.post("/customer-ratings")
async def rate_customer(body: CustomerRatingIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders can rate customers")
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["hairdresser_id"] != user.id:
        raise HTTPException(403, "Not your booking")
    if b["status"] not in ("completed", "no_show"):
        raise HTTPException(400, "Booking must be completed or no-show before rating")
    if await db.customer_ratings.find_one({"booking_id": body.booking_id}):
        raise HTTPException(400, "Already rated for this booking")
    rating = {
        "id": str(uuid.uuid4()),
        "booking_id": body.booking_id,
        "hairdresser_id": user.id,
        "customer_id": b["customer_id"],
        "rating": body.rating,
        "flagged_for_removal": body.flagged_for_removal,
        "flag_reason": body.flag_reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customer_ratings.insert_one(rating)

    # If flagged, increment the customer's flag_count and enforce booking_restricted at threshold
    if body.flagged_for_removal:
        cu = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
        new_count = (cu.get("flag_count") or 0) + 1
        updates = {"flag_count": new_count}
        just_restricted = False
        if new_count >= FLAG_THRESHOLD and not cu.get("booking_restricted"):
            updates["booking_restricted"] = True
            just_restricted = True
        await db.users.update_one({"id": b["customer_id"]}, {"$set": updates})
        if just_restricted:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "user_id": b["customer_id"], "type": "account_restricted",
                "message": ("Your account has been temporarily restricted from booking after multiple flags from braiders. "
                           "An admin will review shortly."),
                "related_booking_id": b["id"], "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    return {"ok": True, "rating": {k: v for k, v in rating.items() if k != "_id"}}


# ---------- Reports (any user reports another) ----------
@api.post("/reports")
async def create_report(body: ReportIn, user: UserOut = Depends(get_user)):
    if body.reported_user_id == user.id:
        raise HTTPException(400, "You can't report yourself")
    doc = {
        "id": str(uuid.uuid4()),
        "reporter_id": user.id,
        "reported_user_id": body.reported_user_id,
        "reason": body.reason,
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


# ---------- Pro Onboarding ----------
@api.post("/hairdressers/me/onboarding-complete")
async def mark_onboarding_complete(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    # Only weekly availability is required to activate bookings.
    # Portfolio, verification, bio, salon name, license — all optional (never block onboarding).
    has_avail = await db.availability.count_documents({"hairdresser_id": user.id}) > 0
    if not has_avail:
        raise HTTPException(400, "Set your weekly hours to start receiving bookings.")
    # Safety net: upsert the flag in case the hairdresser record is missing (defensive).
    now = datetime.now(timezone.utc).isoformat()
    await db.hairdressers.update_one(
        {"user_id": user.id},
        {
            "$set": {"onboarding_completed": True, "onboarding_completed_at": now},
            "$setOnInsert": {
                "id": user.id,
                "user_id": user.id,
                "bio": "", "salon_name": "", "address": "", "city": "",
                "service_area": "", "latitude": 0.0, "longitude": 0.0,
                "cover_photo": "", "verification_status": "unverified",
                "rating_avg": 0.0, "reviews_count": 0, "specialty_ids": [],
            },
        },
        upsert=True,
    )
    return {"ok": True, "completed": True}

@api.get("/hairdressers/me/onboarding-status")
async def onboarding_status(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    has_specialty = bool(hd.get("specialty_ids"))
    has_avail = await db.availability.count_documents({"hairdresser_id": user.id}) > 0
    has_portfolio = await db.portfolio_items.count_documents({"hairdresser_id": user.id}) > 0
    return {
        "completed": bool(hd.get("onboarding_completed")),
        "has_specialty": has_specialty,
        "has_availability": has_avail,
        "has_portfolio": has_portfolio,
    }


@api.get("/hairdressers/me/studio-status")
async def studio_status(user: UserOut = Depends(get_user)):
    """Per-section completion status for the My Studio hub. Drives the
    "focus first incomplete" behaviour and the progress card at the top of
    the Studio screen. Every section returns { complete, label, sub, key }
    so the frontend can render without a schema."""
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    has_avail = await db.availability.count_documents({"hairdresser_id": user.id}) > 0
    has_portfolio_count = await db.portfolio_items.count_documents({"hairdresser_id": user.id})
    has_services_count = await db.professional_services.count_documents({"hairdresser_id": user.id, "active": True})
    verification_status = hd.get("verification_status") or "unverified"
    has_bio = bool((hd.get("bio") or "").strip())
    has_salon_name = bool((hd.get("salon_name") or "").strip())
    has_city = bool((hd.get("city") or "").strip())
    info_complete = has_bio and has_salon_name and has_city

    sections = [
        {
            "key": "availability",
            "label": "Weekly Availability",
            "sub": "Set the days and hours you accept bookings.",
            "complete": has_avail,
            "required": True,
        },
        {
            "key": "services",
            "label": "Services & Pricing",
            "sub": "Add the styles you offer with your own prices and durations.",
            "complete": has_services_count > 0,
            "required": False,
            "count": has_services_count,
        },
        {
            "key": "portfolio",
            "label": "Portfolio",
            "sub": "Showcase your best work. Aim for at least 5 photos.",
            "complete": has_portfolio_count >= 3,
            "required": False,
            "count": has_portfolio_count,
        },
        {
            "key": "info",
            "label": "Studio Information",
            "sub": "Bio, salon name, city — helps customers trust you.",
            "complete": info_complete,
            "required": False,
        },
        {
            "key": "verification",
            "label": "Verification",
            "sub": {
                "approved": "You're a Verified Pro.",
                "pending": "Under review — you'll be notified.",
                "rejected": "Application needs your attention.",
                "unverified": "Optional — earns you a Verified badge.",
            }.get(verification_status, "Optional — earns you a Verified badge."),
            "complete": verification_status == "approved",
            "required": False,
            "state": verification_status,
        },
    ]
    first_incomplete = next((s["key"] for s in sections if not s["complete"]), None)
    total = len(sections)
    done = sum(1 for s in sections if s["complete"])
    return {
        "onboarding_completed": bool(hd.get("onboarding_completed")),
        "sections": sections,
        "first_incomplete": first_incomplete,
        "progress": {"done": done, "total": total, "percent": int(round((done / total) * 100))},
    }


# ---------- Services (Braider-owned catalog) ----------
# NOTE: Legacy CRUD lives further below under `/hairdressers/me/services`.
# We add a `/hairdressers/{hid}/services` public-read alias here so customers
# can view a Studio's own pricing without touching the private me/ endpoints.
async def _service_to_out(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    st = await db.hairstyles.find_one({"id": doc.get("hairstyle_id")}, {"_id": 0, "name": 1, "cover_photo": 1, "category": 1})
    if st:
        doc["hairstyle_name"] = st.get("name")
        doc["hairstyle_category"] = st.get("category")
        doc["hairstyle_cover"] = st.get("cover_photo")
    return doc


@api.get("/studios/{hid}/services")
async def public_hairdresser_services(hid: str, active_only: bool = True):
    """Public — anyone can view a Studio's services (Starting at prices)."""
    q: dict = {"hairdresser_id": hid}
    if active_only:
        q["active"] = True
    docs = await db.professional_services.find(q, {"_id": 0}).to_list(200)
    return [await _service_to_out(d) for d in docs]


@api.post("/services/{sid}/toggle")
async def toggle_service_active(sid: str, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    doc = await db.professional_services.find_one({"id": sid, "hairdresser_id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Service not found")
    new_active = not bool(doc.get("active", True))
    await db.professional_services.update_one(
        {"id": sid, "hairdresser_id": user.id},
        {"$set": {"active": new_active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc["active"] = new_active
    return await _service_to_out(doc)


# ---------- Admin: Customer Flag Queue ----------
@api.get("/admin/customer-flags")
async def admin_list_flags(user: UserOut = Depends(get_user)):
    _require_admin(user)
    users = await db.users.find({"booking_restricted": True}, {"_id": 0, "password_hash": 0}).to_list(500)
    for u in users:
        # attach up to 5 recent flag entries for context
        flags = await db.customer_ratings.find(
            {"customer_id": u["id"], "flagged_for_removal": True}, {"_id": 0}
        ).sort("created_at", -1).to_list(5)
        u["recent_flags"] = flags
        u["phone"] = None  # never expose to admin either
    return users

@api.post("/admin/customer-flags/{uid}/decide")
async def admin_decide_flag(uid: str, body: FlagDecisionIn, user: UserOut = Depends(get_user)):
    _require_admin(user)
    if body.action == "lift":
        await db.users.update_one({"id": uid}, {"$set": {"booking_restricted": False, "flag_count": 0}})
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": uid, "type": "restriction_lifted",
            "message": "Your booking restriction has been lifted after admin review. You can book again.",
            "related_booking_id": None, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif body.action == "keep":
        # Restriction stands; just record admin note (log via notification for transparency)
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": uid, "type": "restriction_kept",
            "message": f"Admin reviewed your account and the restriction remains in place.{(' Reason: ' + body.reason) if body.reason else ''}",
            "related_booking_id": None, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif body.action == "remove":
        await db.users.update_one({"id": uid}, {"$set": {"booking_restricted": True, "removed_at": datetime.now(timezone.utc).isoformat(), "removed_reason": body.reason}})
    return {"ok": True}


# ---------- Professional Services + Style Comparison ----------
@api.get("/hairdressers/me/services")
async def list_my_services(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Hairdressers only")
    items = await db.professional_services.find({"hairdresser_id": user.id}, {"_id": 0}).to_list(200)
    for it in items:
        hs = await db.hairstyles.find_one({"id": it["hairstyle_id"]}, {"_id": 0, "name": 1, "category": 1})
        if hs:
            it["hairstyle_name"] = hs["name"]
            it["hairstyle_category"] = hs["category"]
    return items

@api.post("/hairdressers/me/services")
async def upsert_service(body: ProfessionalServiceIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Hairdressers only")
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.professional_services.find_one(
        {"hairdresser_id": user.id, "hairstyle_id": body.hairstyle_id, "active": True},
        {"_id": 0},
    )
    if existing:
        await db.professional_services.update_one(
            {"id": existing["id"]},
            {"$set": {**body.dict(), "updated_at": now}},
        )
        # Also register the specialty on the hairdresser (feeds legacy search)
        await db.hairdressers.update_one(
            {"user_id": user.id},
            {"$addToSet": {"specialty_ids": body.hairstyle_id}},
        )
        return {"ok": True, "id": existing["id"]}
    sid = str(uuid.uuid4())
    doc = {"id": sid, "hairdresser_id": user.id, **body.dict(), "created_at": now, "updated_at": now}
    await db.professional_services.insert_one(doc)
    await db.hairdressers.update_one(
        {"user_id": user.id},
        {"$addToSet": {"specialty_ids": body.hairstyle_id}},
    )
    return {"ok": True, "id": sid}

@api.delete("/hairdressers/me/services/{sid}")
async def delete_service(sid: str, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only hairdressers")
    res = await db.professional_services.delete_one(
        {"id": sid, "hairdresser_id": user.id}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Service not found")
    return {"ok": True}


@api.get("/hairstyles/{hid}/compare")
async def compare_braiders_for_style(
    hid: str,
    sort: Optional[str] = Query("earliest"),
    max_price: Optional[float] = None,
    min_rating: float = 0.0,
    hair_included: Optional[bool] = None,
    verified_only: bool = False,
    available_today: bool = False,
    user: Optional[UserOut] = Depends(maybe_user),
):
    """Comparison feed for a hairstyle. Uses real professional_services when defined,
    otherwise falls back to hairdresser.specialty_ids so legacy pros still surface."""
    services = await db.professional_services.find(
        {"hairstyle_id": hid, "active": True},
        {"_id": 0},
    ).to_list(500)
    service_by_hd = {s["hairdresser_id"]: s for s in services}
    hd_ids_with_service = list(service_by_hd.keys())
    legacy_pros = await db.hairdressers.find(
        {"specialty_ids": hid, "id": {"$nin": hd_ids_with_service}}, {"_id": 0}
    ).to_list(500)
    hd_ids = hd_ids_with_service + [h["id"] for h in legacy_pros]
    hairstyle = await db.hairstyles.find_one({"id": hid}, {"_id": 0})
    if not hairstyle:
        raise HTTPException(404, "Hairstyle not found")

    total_matches = len(hd_ids)
    is_unlimited = user and user.plan == "unlimited"
    cards = []
    for hid_ in hd_ids:
        hd = await db.hairdressers.find_one({"id": hid_}, {"_id": 0})
        if not hd: continue
        u = await db.users.find_one({"id": hd["user_id"]}, {"_id": 0, "password_hash": 0})
        svc = service_by_hd.get(hid_)
        # Use pro's own service data when present; fall back to hairstyle averages
        price = svc["price"] if svc else hairstyle.get("avg_price", 0)
        currency = svc["currency"] if svc else "USD"
        duration = svc["duration_minutes"] if svc else hairstyle.get("avg_duration_min", 0)
        hair_inc = svc["hair_included"] if svc else False
        # Earliest available slot lookup
        slots_today = 0
        upcoming_slot = None
        for delta in range(0, 14):
            d = (datetime.now(timezone.utc) + timedelta(days=delta)).replace(hour=0, minute=0, second=0, microsecond=0)
            avails = await db.availability.find({"hairdresser_id": hid_, "day_of_week": d.weekday()}, {"_id": 0}).to_list(5)
            if not avails: continue
            slot_str = f"{d.date().isoformat()} · {avails[0]['start_time']}"
            if upcoming_slot is None:
                upcoming_slot = slot_str
            if delta == 0:
                slots_today = 1
        # Portfolio photo tagged with this style
        portfolio = await db.portfolio_items.find_one({"hairdresser_id": hid_, "hairstyle_id": hid}, {"_id": 0})
        card = {
            "hairdresser_id": hid_,
            "name": u["name"] if u else "Stylist",
            "salon_name": hd.get("salon_name") or "",
            "service_area": hd.get("service_area") or hd.get("city") or "",
            "verified": hd.get("verification_status") == "approved",
            "rating_avg": hd.get("rating_avg", 0.0),
            "reviews_count": hd.get("reviews_count", 0),
            "price": price, "currency": currency,
            "duration_minutes": duration,
            "hair_included": hair_inc,
            "earliest_available": upcoming_slot,
            "available_today": slots_today > 0,
            "portfolio_photo": (portfolio or {}).get("photo_url") or hd.get("cover_photo"),
            "location_blurred": False,
        }
        cards.append(card)

    # Filters
    if max_price is not None:
        cards = [c for c in cards if c["price"] <= max_price]
    if min_rating > 0:
        cards = [c for c in cards if c["rating_avg"] >= min_rating]
    if hair_included is not None:
        cards = [c for c in cards if c["hair_included"] == hair_included]
    if verified_only:
        cards = [c for c in cards if c["verified"]]
    if available_today:
        cards = [c for c in cards if c["available_today"]]

    # Sorting
    keys = {
        "lowest_price": lambda c: c["price"],
        "shortest": lambda c: c["duration_minutes"],
        "highest_rated": lambda c: -c["rating_avg"],
        "most_reviewed": lambda c: -c["reviews_count"],
        "earliest": lambda c: c["earliest_available"] or "9999",
    }
    if sort in keys:
        cards.sort(key=keys[sort])

    # Discovery is universal — return every match. Premium unlocks intelligence, not results.
    return {
        "hairstyle": {"id": hairstyle["id"], "name": hairstyle["name"], "category": hairstyle["category"], "cover_photo": hairstyle.get("cover_photo")},
        "total_matches": total_matches,
        "shown": len(cards),
        "gated": False,
        "results": cards,
    }


# ---------- Inventory ----------
@api.get("/hairdressers/me/inventory")
async def list_my_inventory(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Hairdressers only")
    return await db.inventory.find({"hairdresser_id": user.id}, {"_id": 0}).to_list(200)

@api.post("/hairdressers/me/inventory")
async def add_inventory(body: InventoryItemIn, user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Hairdressers only")
    doc = {
        "id": str(uuid.uuid4()), "hairdresser_id": user.id,
        **body.dict(), "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    await db.inventory.insert_one(doc)
    return {"ok": True, "id": doc["id"]}

@api.delete("/hairdressers/me/inventory/{iid}")
async def delete_inventory(iid: str, user: UserOut = Depends(get_user)):
    await db.inventory.delete_one({"id": iid, "hairdresser_id": user.id})
    return {"ok": True}


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
    # Only pros who submitted docs surface in the admin queue — 'unverified' means they never applied.
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


# ---------- Braider Business Growth (Analytics + Success Score) ----------
def _iso_week_range(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return monday, monday + timedelta(days=7)


async def compute_business_success_score(hairdresser_user_id: str) -> dict:
    """
    Business Success Score (0-100) — a proprietary, mission-critical signal used
    for search ranking AND surfaced to braiders so they know exactly how to grow.

    Formula (each contributes up to the given cap):
      Profile completeness   (25)  — bio, salon name, avatar, ≥1 specialty, ≥1 availability slot, verified
      Portfolio strength     (20)  — number of portfolio items (2 pts each up to 10)
      Customer signals       (25)  — rating_avg × 5   +   reviews_count × 0.25 (capped)
      Booking activity       (15)  — completed bookings in the last 90 days × 1.5 (capped)
      Recent engagement      (15)  — profile views in the last 30 days × 0.5 (capped)

    Returned payload includes per-signal contributions so the UI can show
    "How to improve your score" recommendations.
    """
    hd = await db.hairdressers.find_one({"user_id": hairdresser_user_id}, {"_id": 0}) or {}
    u = await db.users.find_one({"id": hairdresser_user_id}, {"_id": 0}) or {}
    completeness = 0
    if hd.get("bio"): completeness += 4
    if hd.get("salon_name"): completeness += 4
    if u.get("profile_photo"): completeness += 4
    if hd.get("specialty_ids"): completeness += 4
    if hd.get("verification_status") == "approved": completeness += 5
    has_avail = await db.availability.count_documents({"hairdresser_id": hairdresser_user_id}) > 0
    if has_avail: completeness += 4

    portfolio_count = await db.portfolio_items.count_documents({"hairdresser_id": hairdresser_user_id})
    portfolio = min(20, portfolio_count * 2)

    rating = float(hd.get("rating_avg") or 0.0)
    reviews = int(hd.get("reviews_count") or 0)
    customer = min(25, rating * 5 + reviews * 0.25)

    since_90d = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    completed = await db.bookings.count_documents({
        "hairdresser_id": hairdresser_user_id, "status": "completed",
        "appointment_datetime": {"$gte": since_90d},
    })
    booking = min(15, completed * 1.5)

    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    views = await db.profile_views.count_documents({
        "hairdresser_id": hairdresser_user_id,
        "viewed_at": {"$gte": since_30d},
    })
    engagement = min(15, views * 0.5)

    total = round(completeness + portfolio + customer + booking + engagement)

    if total >= 90: tier = "Elite"
    elif total >= 70: tier = "Excellent"
    elif total >= 40: tier = "Growing"
    else: tier = "Building"

    # Personalized recommendations to lift the score
    recs = []
    if completeness < 25:
        if not hd.get("bio"): recs.append("Write a warm bio — customers book pros they connect with.")
        if not u.get("profile_photo"): recs.append("Add a profile photo.")
        if hd.get("verification_status") != "approved":
            recs.append("Apply for Verified Pro — verified badges earn 2× the trust.")
        if not has_avail:
            recs.append("Set your weekly availability so customers can book you.")
    if portfolio_count < 10:
        recs.append(f"Upload more portfolio photos — you have {portfolio_count}, aim for 10+.")
    if reviews < 10:
        recs.append("Ask happy clients to leave a review — reviews boost your score fast.")
    if completed == 0:
        recs.append("Complete your first booking to start earning booking points.")

    return {
        "score": total, "tier": tier,
        "breakdown": {
            "profile_completeness": {"score": completeness, "max": 25},
            "portfolio_strength": {"score": portfolio, "max": 20},
            "customer_signals": {"score": round(customer, 1), "max": 25},
            "booking_activity": {"score": round(booking, 1), "max": 15},
            "recent_engagement": {"score": round(engagement, 1), "max": 15},
        },
        "recommendations": recs[:5],
    }


@api.get("/braiders/me/business-score")
async def my_business_score(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    return await compute_business_success_score(user.id)


@api.get("/braiders/{hid}/business-score")
async def public_business_score(hid: str):
    """Public read of a braider's score — used on customer-facing profiles."""
    hd = await db.hairdressers.find_one({"id": hid}, {"_id": 0, "user_id": 1})
    if not hd:
        raise HTTPException(404, "Not found")
    result = await compute_business_success_score(hd["user_id"])
    # Only expose score + tier publicly (breakdown stays private to the pro)
    return {"score": result["score"], "tier": result["tier"]}


# ---------- Business Health ----------
# 7 human-readable health metrics (0-100 each) with a tip per metric so pros
# know exactly how to improve. These complement the aggregate Success Score.
async def compute_business_health(uid: str) -> dict:
    hd = await db.hairdressers.find_one({"user_id": uid}, {"_id": 0}) or {}
    u = await db.users.find_one({"id": uid}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc)
    since_30d = (now - timedelta(days=30)).isoformat()
    since_90d = (now - timedelta(days=90)).isoformat()

    portfolio_count = await db.portfolio_items.count_documents({"hairdresser_id": uid})
    views_30d = await db.profile_views.count_documents({"hairdresser_id": uid, "viewed_at": {"$gte": since_30d}})
    bookings_90d = await db.bookings.count_documents({"hairdresser_id": uid, "status": "completed", "appointment_datetime": {"$gte": since_90d}})
    total_bookings = await db.bookings.count_documents({"hairdresser_id": uid, "status": "completed"})
    has_avail = await db.availability.count_documents({"hairdresser_id": uid}) > 0

    # Repeat customers: distinct customer_ids with >1 completed booking
    pipeline = [
        {"$match": {"hairdresser_id": uid, "status": "completed"}},
        {"$group": {"_id": "$customer_id", "n": {"$sum": 1}}},
    ]
    grouped = [doc async for doc in db.bookings.aggregate(pipeline)]
    unique_customers = len(grouped)
    repeat_customers = sum(1 for g in grouped if g["n"] > 1)
    repeat_rate = int(round((repeat_customers / unique_customers) * 100)) if unique_customers else 0

    rating = float(hd.get("rating_avg") or 0.0)
    reviews = int(hd.get("reviews_count") or 0)

    metrics = {
        "customer_trust": {
            "score": min(100, int(rating * 20) + min(20, reviews * 2)),
            "label": "Customer Trust",
            "tip": "Ask happy clients to leave a 5-star review after every booking.",
        },
        "visibility": {
            "score": min(100, views_30d * 3),
            "label": "Visibility",
            "tip": "Add trending styles to your specialties and post fresh portfolio work weekly.",
        },
        "portfolio_strength": {
            "score": min(100, portfolio_count * 8),
            "label": "Portfolio Strength",
            "tip": f"Upload at least 15 portfolio photos ({portfolio_count} today).",
        },
        "response_rate": {
            # Placeholder until messaging is live — anchored to booking:cancel ratio
            "score": 90 if total_bookings == 0 else max(30, 100 - int(await db.bookings.count_documents({"hairdresser_id": uid, "status": "cancelled"}) * 100 / max(1, total_bookings))),
            "label": "Response Rate",
            "tip": "Reply to inquiries within 4 hours — fast replies convert bookings.",
        },
        "repeat_customers": {
            "score": min(100, repeat_rate * 2),
            "label": "Repeat Customers",
            "tip": "Offer returning-client discounts and remember their favorite styles.",
        },
        "availability": {
            "score": 100 if has_avail else 0,
            "label": "Availability",
            "tip": "Keep your weekly hours updated so customers can book with confidence.",
        },
    }
    return {"metrics": metrics, "unique_customers": unique_customers, "repeat_customers": repeat_customers}


@api.get("/braiders/me/business-health")
async def my_business_health(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    return await compute_business_health(user.id)


# ---------- Braider DNA ----------
# Each pro develops per-category expertise scores that surface as "Knotless Expert",
# "Fulani Expert", etc. Formula blends portfolio depth, ratings and bookings in
# that category. Later this replaces flat category tags in ranking.
async def compute_braider_dna(uid: str) -> List[dict]:
    portfolio = await db.portfolio_items.find({"hairdresser_id": uid}, {"_id": 0}).to_list(500)
    if not portfolio:
        return []
    style_ids = list({p["hairstyle_id"] for p in portfolio})
    styles = await db.hairstyles.find({"id": {"$in": style_ids}}, {"_id": 0}).to_list(500)
    by_cat: dict = {}
    for st in styles:
        cat = st["category"]
        by_cat.setdefault(cat, {"portfolio_count": 0, "avg_style_score": 0.0, "style_ids": []})
        by_cat[cat]["portfolio_count"] += sum(1 for p in portfolio if p["hairstyle_id"] == st["id"])
        by_cat[cat]["avg_style_score"] += float(st.get("style_score") or 0)
        by_cat[cat]["style_ids"].append(st["id"])

    hd = await db.hairdressers.find_one({"user_id": uid}, {"_id": 0}) or {}
    rating = float(hd.get("rating_avg") or 0)
    reviews = int(hd.get("reviews_count") or 0)

    dna: List[dict] = []
    for cat, data in by_cat.items():
        depth = min(50, data["portfolio_count"] * 8)
        quality = min(30, (data["avg_style_score"] / max(1, len(data["style_ids"]))) * 0.3)
        signals = min(20, rating * 3 + reviews * 0.3)
        score = round(depth + quality + signals)
        if score >= 85: label = f"{cat} Master"
        elif score >= 65: label = f"{cat} Expert"
        elif score >= 40: label = f"{cat} Specialist"
        else: label = f"{cat} Emerging"
        dna.append({"category": cat, "score": score, "label": label, "portfolio_count": data["portfolio_count"]})

    dna.sort(key=lambda d: -d["score"])
    return dna[:8]  # cap for UI


@api.get("/braiders/me/dna")
async def my_dna(user: UserOut = Depends(get_user)):
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    return await compute_braider_dna(user.id)


@api.get("/braiders/{hid}/dna")
async def public_dna(hid: str):
    hd = await db.hairdressers.find_one({"id": hid}, {"_id": 0, "user_id": 1})
    if not hd:
        raise HTTPException(404, "Not found")
    return await compute_braider_dna(hd["user_id"])


# ---------- AI Feature Waitlist ----------
_AI_MODULES = {"style_match", "recreate_look", "recommendations", "coach", "price_alerts", "beauty_journal", "travel_planning"}


class AIWaitlistIn(BaseModel):
    module: str
    note: Optional[str] = ""


@api.post("/ai/waitlist")
async def ai_waitlist(body: AIWaitlistIn, user: UserOut = Depends(get_user)):
    if body.module not in _AI_MODULES:
        raise HTTPException(400, f"Unknown module. Try one of: {sorted(_AI_MODULES)}")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "role": user.role,
        "module": body.module,
        "note": (body.note or "")[:280],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Idempotent — one row per (user, module)
    await db.ai_waitlist.update_one(
        {"user_id": user.id, "module": body.module},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "joined": True}


@api.get("/ai/waitlist/me")
async def my_ai_waitlist(user: UserOut = Depends(get_user)):
    rows = await db.ai_waitlist.find({"user_id": user.id}, {"_id": 0}).to_list(50)
    return {"modules": [r["module"] for r in rows]}



@api.get("/braiders/me/analytics")
async def my_analytics(user: UserOut = Depends(get_user)):
    """
    Profile analytics gated behind Standard+ plans.
    Returns view counts, save counts, portfolio clicks, booking pipeline.
    """
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    if user.plan == "free":
        raise HTTPException(402, "Upgrade to Standard to unlock analytics.")
    now = datetime.now(timezone.utc)
    since_30d = (now - timedelta(days=30)).isoformat()
    since_7d = (now - timedelta(days=7)).isoformat()

    views_30d = await db.profile_views.count_documents({"hairdresser_id": user.id, "viewed_at": {"$gte": since_30d}})
    views_7d = await db.profile_views.count_documents({"hairdresser_id": user.id, "viewed_at": {"$gte": since_7d}})
    portfolio_saves = 0  # placeholder — extend when portfolio-save telemetry lands
    # Bookings pipeline
    booking_q = {"hairdresser_id": user.id}
    total_bookings = await db.bookings.count_documents(booking_q)
    completed_30d = await db.bookings.count_documents({**booking_q, "status": "completed", "appointment_datetime": {"$gte": since_30d}})
    cancelled_30d = await db.bookings.count_documents({**booking_q, "status": "cancelled", "appointment_datetime": {"$gte": since_30d}})

    return {
        "views_30d": views_30d,
        "views_7d": views_7d,
        "portfolio_saves": portfolio_saves,
        "total_bookings": total_bookings,
        "completed_30d": completed_30d,
        "cancelled_30d": cancelled_30d,
    }


@api.get("/braiders/me/trending-report")
async def my_trending_report(user: UserOut = Depends(get_user)):
    """Top trending styles inside the braider's specialty categories."""
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    if user.plan == "free":
        raise HTTPException(402, "Upgrade to Standard to unlock the trending report.")
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    specialty_ids = hd.get("specialty_ids") or []
    # Pull categories from those specialties
    if specialty_ids:
        mine = await db.hairstyles.find({"id": {"$in": specialty_ids}}, {"_id": 0}).to_list(50)
        categories = list({s["category"] for s in mine})
        q = {"category": {"$in": categories}}
    else:
        q = {}
    top = await db.hairstyles.find(q, {"_id": 0}).sort([("style_score", -1)]).to_list(5)
    return {"categories": categories if specialty_ids else [], "top": top}


@api.get("/braiders/me/weekly-report")
async def my_weekly_report(user: UserOut = Depends(get_user)):
    """Weekly business report — one screen the braider can share with themselves each Monday."""
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders")
    if user.plan == "free":
        raise HTTPException(402, "Upgrade to Standard for weekly reports.")
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = week_start - timedelta(days=7)
    q = {"hairdresser_id": user.id}
    completed_this = await db.bookings.count_documents({**q, "status": "completed",
                                                        "appointment_datetime": {"$gte": week_start.isoformat()}})
    completed_prev = await db.bookings.count_documents({**q, "status": "completed",
                                                        "appointment_datetime": {"$gte": prev_week_start.isoformat(),
                                                                                 "$lt": week_start.isoformat()}})
    views_this = await db.profile_views.count_documents({"hairdresser_id": user.id, "viewed_at": {"$gte": week_start.isoformat()}})
    views_prev = await db.profile_views.count_documents({"hairdresser_id": user.id,
                                                          "viewed_at": {"$gte": prev_week_start.isoformat(),
                                                                        "$lt": week_start.isoformat()}})

    def _growth(cur, prev):
        if prev == 0: return None if cur == 0 else 100
        return round(((cur - prev) / prev) * 100)

    return {
        "week_start": week_start.isoformat(),
        "bookings_this_week": completed_this,
        "bookings_growth_pct": _growth(completed_this, completed_prev),
        "profile_views_this_week": views_this,
        "views_growth_pct": _growth(views_this, views_prev),
    }


# Track profile view (called when a customer opens a braider profile)
@api.post("/braiders/{hid}/view")
async def track_profile_view(hid: str, user: Optional[UserOut] = Depends(maybe_user)):
    hd = await db.hairdressers.find_one({"id": hid}, {"_id": 0, "user_id": 1})
    if not hd:
        return {"ok": False}
    await db.profile_views.insert_one({
        "id": str(uuid.uuid4()),
        "hairdresser_id": hd["user_id"],
        "viewer_user_id": user.id if user else None,
        "viewed_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@api.get("/featured-stylist")
async def featured_stylist():
    """Cached weekly pick from unlimited+approved pros, weighted by rating & inverse-recency of last feature.
    Result is memoized into `featured_stylists` collection so the same pro shows all week."""
    week_start, week_end = _iso_week_range()
    existing = await db.featured_stylists.find_one({"week_start": week_start.isoformat()}, {"_id": 0})
    if existing:
        hd = await db.hairdressers.find_one({"id": existing["hairdresser_id"]}, {"_id": 0})
        if hd:
            u = await db.users.find_one({"id": hd["user_id"]}, {"_id": 0})
            hd["name"] = u["name"] if u else "Stylist"
            hd["selection_reason"] = existing.get("selection_reason")
            return hd

    # Build eligibility pool: approved pros with active Unlimited subscription
    pros_users = await db.users.find({"role": "hairdresser", "plan": "unlimited"}, {"_id": 0, "password_hash": 0}).to_list(500)
    if not pros_users:
        return None
    ids = [u["id"] for u in pros_users]
    hds = await db.hairdressers.find({"id": {"$in": ids}, "verification_status": "approved"}, {"_id": 0}).to_list(500)
    if not hds:
        return None

    # Weight = (rating_avg + 1) / (weeks_since_last_feature + 1). Never featured -> huge weight.
    now = datetime.now(timezone.utc)
    scored = []
    for h in hds:
        last = await db.featured_stylists.find_one({"hairdresser_id": h["id"]}, sort=[("week_start", -1)])
        if last:
            weeks_since = max(0, (now - datetime.fromisoformat(last["week_start"])).days // 7)
        else:
            weeks_since = 52  # very high recency weight for never-featured
        weight = (h.get("rating_avg", 0.0) + 1.0) * (weeks_since + 1)
        scored.append((h, weight))

    total = sum(w for _, w in scored)
    r = secrets.randbelow(int(total * 1000)) / 1000.0
    acc = 0.0
    pick = scored[-1][0]
    for h, w in scored:
        acc += w
        if r <= acc:
            pick = h
            break

    doc = {
        "id": str(uuid.uuid4()),
        "hairdresser_id": pick["id"],
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "selection_reason": f"rating={pick.get('rating_avg', 0):.2f}, weighted rotation among {len(scored)} eligible Unlimited pros",
    }
    await db.featured_stylists.insert_one(doc)
    u = next((x for x in pros_users if x["id"] == pick["id"]), None)
    pick["name"] = u["name"] if u else "Stylist"
    pick["selection_reason"] = doc["selection_reason"]
    return pick



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
    # ---- One-time plan migration for existing users (idempotent) ----
    # Any user with legacy plan="standard" whose role is customer, or who has no
    # paid subscription, becomes "free" under the new tier scheme. Braiders on
    # legacy "standard" without a Standard subscription also downgrade to "free".
    # Founding Pros with an active promo keep their Unlimited access.
    async for u in db.users.find({"plan": "standard"}):
        sub = await db.subscriptions.find_one({"user_id": u["id"], "status": "active"})
        if sub and sub.get("plan_type") in ("standard", "unlimited"):
            continue  # keep whatever the paid subscription says
        await db.users.update_one({"id": u["id"]}, {"$set": {"plan": "free"}})

    if not force and await db.hairstyles.count_documents({}) > 0:
        return {"status": "already_seeded", "migrated": True}
    await db.hairstyles.delete_many({})
    await db.hairdressers.delete_many({})
    await db.portfolio_items.delete_many({})
    await db.availability.delete_many({})
    await db.reviews.delete_many({})
    await db.subscriptions.delete_many({})
    await db.customer_ratings.delete_many({})
    await db.reports.delete_many({})
    await db.featured_stylists.delete_many({})
    await db.profile_views.delete_many({})
    await db.users.delete_many({"email": {"$regex": "@braids.demo$"}})
    await db.bookings.delete_many({})

    styles = [
        # (name, category, description, price, duration_min, cover, difficulty, hair_length, maintenance, lasts_weeks, tags, style_score, saves, recommended_for, country_tags)
        ("Box Braids", "Box Braids", "Classic long box braids with sleek partings. A protective staple.",
         180, 300,
         "https://images.unsplash.com/photo-1594254773847-9fce26e950bc?w=800&q=85",
         "Medium", "Long", "Low", 8,
         ["trending", "most_loved", "protective"], 92.4, 3120,
         ["Adults", "Natural Hair", "Relaxed Hair", "Vacation"], ["US", "NG", "GH", "JM", "GB"]),

        ("Knotless Braids", "Knotless Braids", "Gentle knotless technique — feather-light finish, no tension at the root.",
         240, 420,
         "https://images.unsplash.com/photo-1572955304332-bf714bd49add?w=800&q=85",
         "Advanced", "Extra Long", "Low", 8,
         ["trending", "most_loved", "luxury", "protective", "office"], 96.8, 4890,
         ["Adults", "Natural Hair", "Relaxed Hair", "Office", "Wedding"], ["US", "FR", "NG", "GB", "CI"]),

        ("Cornrows", "Cornrows", "Sleek straight-back cornrows — quick, timeless and workout-friendly.",
         90, 120,
         "https://images.unsplash.com/photo-1481385694031-f2b14f8621d5?w=800&q=85",
         "Easy", "Short", "Low", 3,
         ["quick", "office", "protective", "new"], 78.2, 1420,
         ["Children", "Adults", "Office"], ["US", "KE", "ZA", "GH"]),

        ("Feed-in Braids", "Cornrows", "Perfectly parted feed-in cornrows with natural gradient hair addition.",
         120, 180,
         "https://images.unsplash.com/photo-1673470907547-1c0c6a996095?w=800&q=85",
         "Medium", "Mid-length", "Low", 4,
         ["office", "trending", "protective"], 84.5, 2010,
         ["Adults", "Office", "Vacation"], ["NG", "GH", "US", "CI", "CM"]),

        ("Fulani Braids", "Fulani Braids", "Signature Fulani-style parts, side braid, beads and gold cuffs.",
         200, 300,
         "https://images.unsplash.com/photo-1623038455007-891466ff6016?w=800&q=85",
         "Advanced", "Long", "Medium", 6,
         ["trending", "luxury", "celebrity", "event"], 91.0, 2790,
         ["Adults", "Vacation", "Wedding", "Event"], ["SN", "NG", "CI", "GH", "CM"]),

        ("Goddess Boho Braids", "Goddess Braids", "Bohemian curls flowing through soft knotless braids.",
         260, 480,
         "https://images.unsplash.com/photo-1663851071150-b6617bbee927?w=800&q=85",
         "Expert", "Extra Long", "Medium", 6,
         ["luxury", "bridal", "vacation", "trending"], 94.1, 3610,
         ["Adults", "Vacation", "Wedding"], ["US", "BR", "FR", "GB"]),

        ("Passion Twists", "Twists", "Boho passion twists — soft, wavy, and endlessly photogenic.",
         210, 360,
         "https://images.unsplash.com/photo-1653263169788-9332cdbf07f5?w=800&q=85",
         "Medium", "Long", "Low", 6,
         ["vacation", "new", "most_loved", "protective"], 88.6, 2340,
         ["Adults", "Natural Hair", "Vacation"], ["US", "JM", "BR", "GB"]),

        ("Bantu Knots", "Bantu Knots", "Sculptural Bantu knots — cultural, striking, editorial.",
         100, 150,
         "https://images.unsplash.com/photo-1781274054513-6dad85ab6f20?w=800&q=85",
         "Easy", "Short", "Low", 2,
         ["quick", "new", "event", "natural"], 72.4, 840,
         ["Adults", "Natural Hair", "Event"], ["ZA", "KE", "US", "CG"]),

        ("Sculpted Bantu Set", "Bantu Knots", "Editorial Bantu set — perfect for photoshoots and events.",
         140, 180,
         "https://images.unsplash.com/photo-1584897149326-536f40649b38?w=800&q=85",
         "Medium", "Short", "Low", 2,
         ["event", "luxury", "celebrity"], 81.3, 1120,
         ["Adults", "Event", "Wedding"], ["ZA", "CI", "CM", "US"]),

        ("Kids Box Braids", "Kids Braids", "Gentle, size-appropriate box braids designed for kids' scalps.",
         120, 180,
         "https://images.unsplash.com/photo-1535043883-2548fb805573?w=800&q=85",
         "Medium", "Mid-length", "Low", 6,
         ["kids", "protective", "new"], 79.7, 1560,
         ["Children"], ["US", "NG", "GB", "FR"]),

        ("Colorful Vacation Braids", "Box Braids", "Ocean-ready ombre color braids — bold, playful and sun-safe.",
         260, 420,
         "https://images.unsplash.com/photo-1774773131630-a89d57efa2dc?w=800&q=85",
         "Advanced", "Long", "Medium", 6,
         ["vacation", "color", "luxury", "trending"], 87.9, 2140,
         ["Adults", "Vacation"], ["BR", "JM", "US", "FR"]),

        ("Pastel Braids Set", "Box Braids", "Soft pastel color-melt braids for a dreamy, editorial finish.",
         280, 480,
         "https://images.unsplash.com/photo-1774773133706-5b79160e90a7?w=800&q=85",
         "Expert", "Extra Long", "Medium", 5,
         ["color", "luxury", "celebrity"], 89.4, 1890,
         ["Adults", "Vacation", "Event"], ["US", "GB", "FR"]),

        ("Micro Tribal Braids", "Micro Braids", "Ultra-fine micro braids — meticulous, delicate craftsmanship.",
         320, 600,
         "https://images.unsplash.com/photo-1709342548703-a675702f19ef?w=800&q=85",
         "Expert", "Extra Long", "Medium", 10,
         ["luxury", "celebrity", "trending"], 90.2, 1650,
         ["Adults", "Wedding", "Event"], ["US", "NG", "GH", "CM", "SN"]),

        ("Faux Locs", "Locs", "Beautiful faux locs — protective, lightweight, versatile.",
         220, 360,
         "https://images.unsplash.com/photo-1535146981003-d37e3e2428c3?w=800&q=85",
         "Advanced", "Long", "Low", 8,
         ["protective", "natural", "new"], 85.6, 1980,
         ["Adults", "Natural Hair", "Vacation"], ["US", "JM", "BR", "ZA"]),

        ("Braided Ponytail", "Cornrows", "Sleek cornrowed base blending into a luxurious high ponytail.",
         160, 240,
         "https://images.unsplash.com/photo-1547547700-b3954043b1b8?w=800&q=85",
         "Medium", "Long", "Low", 4,
         ["office", "quick", "event"], 82.8, 1310,
         ["Adults", "Office", "Event"], ["US", "KE", "GB", "NG"]),

        ("Butterfly Locs", "Locs", "Fluttery butterfly locs — the softest, most romantic protective style.",
         240, 420,
         "https://images.unsplash.com/photo-1619981871676-ea8e24a8ff46?w=800&q=85",
         "Advanced", "Long", "Low", 8,
         ["trending", "vacation", "protective", "new"], 93.5, 3410,
         ["Adults", "Vacation", "Wedding"], ["US", "JM", "FR", "BR"]),

        ("Boho Bridal Braids", "Goddess Braids", "Loose curls and soft braids woven into a dreamy bridal updo.",
         320, 540,
         "https://images.unsplash.com/photo-1614173968962-0e61c5ed196f?w=800&q=85",
         "Expert", "Long", "Low", 2,
         ["bridal", "luxury", "event"], 88.0, 1420,
         ["Adults", "Wedding", "Event"], ["US", "FR", "BR", "GB"]),

        ("Sleek Bun Cornrows", "Cornrows", "Refined cornrow bun — polished for the office or an evening out.",
         100, 150,
         "https://images.unsplash.com/photo-1616166183781-0fdd2ef83374?w=800&q=85",
         "Easy", "Short", "Low", 3,
         ["office", "quick", "new"], 76.4, 970,
         ["Adults", "Office"], ["GB", "US", "FR", "KE"]),
    ]
    style_ids = []
    for row in styles:
        name, cat, desc, price, dur, cover, diff, hlen, maint, lasts, tags, score, saves, rec, countries = row
        sid = str(uuid.uuid4())
        style_ids.append(sid)
        await db.hairstyles.insert_one({
            "id": sid, "name": name, "category": cat, "description": desc,
            "avg_price": price, "avg_duration_min": dur, "cover_photo": cover,
            "difficulty": diff, "hair_length": hlen, "maintenance": maint,
            "lasts_weeks": lasts, "tags": tags, "style_score": score, "saves_count": saves,
            "recommended_for": rec, "country_tags": countries,
            "created_at": datetime.now(timezone.utc).isoformat(),
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
            "plan": "unlimited" if i < 2 else ("standard" if i == 2 else "free"),
            "phone": None, "profile_photo": cover,
            "flag_count": 0, "booking_restricted": False,
            "password_hash": hash_pw("demo1234"),
            "email_verified": True,
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
            "address": addr, "city": city, "service_area": city,
            "latitude": lat, "longitude": lng,
            "cover_photo": cover, "verification_status": vstatus,
            "verification_submitted_at": submitted, "verification_decided_at": decided,
            "verification_license_url": "https://placeholder.example/license.jpg" if submitted else None,
            "verification_reason": None,
            "rating_avg": rating, "reviews_count": revs, "specialty_ids": specs,
            "onboarding_completed": True,
        })
        # Founding-Pro promo for first 2 seeded pros (i < 2 == unlimited plan)
        if i < 2:
            promo_expires = datetime.now(timezone.utc) + timedelta(days=365)
            await db.subscriptions.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid,
                "account_type": "professional", "plan_type": "unlimited",
                "billing_interval": "yearly", "price": 0.0, "status": "active",
                "start_date": datetime.now(timezone.utc).isoformat(),
                "renewal_date": promo_expires.isoformat(),
                "is_founding_pro": True, "promo_expires_at": promo_expires.isoformat(),
                "founding_pro_slot": i + 1,
            })
        elif i == 2:
            # Pro #3 = paid Standard tier — demonstrates the middle tier
            await db.subscriptions.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid,
                "account_type": "professional", "plan_type": "standard",
                "billing_interval": "monthly",
                "price": PRICING["professional"]["standard"]["monthly"],
                "status": "active",
                "start_date": datetime.now(timezone.utc).isoformat(),
                "renewal_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "is_founding_pro": False,
            })
        # Seed some profile views so analytics dashboards have real numbers
        for k in range(20 - i * 4):
            days_ago = (k % 21)
            await db.profile_views.insert_one({
                "id": str(uuid.uuid4()),
                "hairdresser_id": uid,
                "viewer_user_id": None,
                "viewed_at": (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=k)).isoformat(),
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
        "role": "customer", "plan": "free", "phone": None, "profile_photo": None,
        "flag_count": 0, "booking_restricted": False,
        "password_hash": hash_pw("demo1234"),
        "email_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # demo admin
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": "admin@braids.demo", "name": "BC Admin",
        "role": "admin", "plan": "unlimited", "phone": None, "profile_photo": None,
        "flag_count": 0, "booking_restricted": False,
        "password_hash": hash_pw("demo1234"),
        "email_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Clear any prior featured-stylist picks so weighted rotation runs fresh
    await db.featured_stylists.delete_many({})
    return {"status": "seeded"}


# ----------------------------------------------------------------------
# Subscription v2 — production architecture (v14)
# ----------------------------------------------------------------------
async def _get_config() -> dict:
    doc = await db.platform_config.find_one({"_id": "singleton"}, {"_id": 0}) or {}
    return {**DEFAULT_CONFIG, **doc}


async def _user_doc(user_id: str) -> dict:
    return await db.users.find_one({"id": user_id}, {"_id": 0}) or {}


class SubscriptionMockPurchaseIn(BaseModel):
    plan: Literal["customer_unlimited", "braider_standard", "braider_unlimited"]
    cycle: Literal["monthly", "yearly"] = "monthly"
    start_trial: bool = False


class NotificationPrefsIn(BaseModel):
    prefs: dict  # notif_type -> channel -> bool


@api.get("/subscription/config")
async def public_subscription_config():
    """Public runtime config: launch mode, pricing, trial durations, founding
    pro state. Consumed by the frontend to render plan cards and paywalls
    without a redeploy."""
    cfg = await _get_config()
    fp = cfg.get("founding_pro", {})
    approved_count = await db.users.count_documents({"founding_pro": True})
    return {
        "launch_mode": bool(cfg.get("launch_mode", True)),
        "pricing": cfg.get("pricing", DEFAULT_CONFIG["pricing"]),
        "trials": cfg.get("trials", DEFAULT_CONFIG["trials"]),
        "portfolio_caps": cfg.get("portfolio_caps", DEFAULT_CONFIG["portfolio_caps"]),
        "founding_pro": {
            "slots": int(fp.get("slots", 100)),
            "duration_days": int(fp.get("duration_days", 365)),
            "spots_taken": approved_count,
            "spots_remaining": max(0, int(fp.get("slots", 100)) - approved_count),
        },
        "notification_channels": cfg.get("notification_channels", DEFAULT_CONFIG["notification_channels"]),
    }


@api.get("/subscription/me")
async def my_subscription(user: UserOut = Depends(get_user)):
    """Complete subscription snapshot for the current user, plus entitlements
    map — one call, no waterfalls."""
    cfg = await _get_config()
    u = await _user_doc(user.id)
    slug = resolve_plan_slug(u)
    entitlements = summarize_entitlements(u, cfg)
    # Launch-mode override for customer entitlements is reported honestly.
    launch = bool(cfg.get("launch_mode")) and slug.startswith("customer_")
    return {
        "plan_slug": slug,
        "plan": u.get("plan", "free"),
        "role": u.get("role", "customer"),
        "plan_source": u.get("plan_source"),
        "plan_status": u.get("plan_status", "active"),
        "plan_cycle": u.get("plan_cycle"),
        "plan_renewal_at": u.get("plan_renewal_at"),
        "plan_cancel_at_period_end": bool(u.get("plan_cancel_at_period_end", False)),
        "trial_plan": u.get("trial_plan"),
        "trial_ends_at": u.get("trial_ends_at"),
        "trial_days_left": sub_days_remaining(u.get("trial_ends_at")),
        "founding_pro": bool(u.get("founding_pro")),
        "founding_pro_expires_at": u.get("founding_pro_expires_at"),
        "founding_pro_days_left": sub_days_remaining(u.get("founding_pro_expires_at")),
        "launch_mode": launch,
        "portfolio_cap": sub_portfolio_cap(u, cfg),
        "entitlements": entitlements,
    }


@api.get("/entitlements/{feature_key}")
async def check_entitlement(feature_key: str, user: UserOut = Depends(get_user)):
    """Explicit gate for a single feature — used by frontend `<Gated>`."""
    cfg = await _get_config()
    u = await _user_doc(user.id)
    return {"feature_key": feature_key, "allowed": has_entitlement(u, feature_key, cfg), "reason": upgrade_reason(feature_key)}


@api.post("/subscription/mock-purchase")
async def mock_purchase(body: SubscriptionMockPurchaseIn, user: UserOut = Depends(get_user)):
    """Development-time purchase. Replaced by RevenueCat when EXPO_PUBLIC_REVENUECAT_* keys
    are activated. Sets plan immediately and stamps plan_source='mock'."""
    cfg = await _get_config()
    u = await _user_doc(user.id)
    role = u.get("role", "customer")
    target = body.plan
    if role != "hairdresser" and target != "customer_unlimited":
        raise HTTPException(400, "This plan is not available for your account.")
    if role == "hairdresser" and target == "customer_unlimited":
        raise HTTPException(400, "Braiders subscribe to a Braider plan.")
    plan_name = target.split("_", 1)[1] if target.startswith("customer_") else target.split("_", 1)[1]
    now = datetime.now(timezone.utc)
    updates: Dict[str, Any] = {
        "plan": plan_name,
        "plan_source": "mock",
        "plan_status": "active",
        "plan_cycle": body.cycle,
        "plan_started_at": now.isoformat(),
        "plan_renewal_at": (now + timedelta(days=365 if body.cycle == "yearly" else 30)).isoformat(),
        "plan_cancel_at_period_end": False,
        # Default: clear any lingering trial so a full purchase supersedes it.
        "trial_plan": None,
        "trial_ends_at": None,
        "trial_reminded_days": [],
    }
    if body.start_trial and role == "hairdresser":
        trial_days = int(cfg["trials"].get(target, 0))
        if trial_days > 0:
            updates.update({
                "trial_plan": plan_name,
                "trial_ends_at": (now + timedelta(days=trial_days)).isoformat(),
                "plan_status": "trialing",
            })
    await db.users.update_one({"id": user.id}, {"$set": updates})
    await notif.emit_subscription_transition(db, user_id=user.id, from_plan=u.get("plan", "free"), to_plan=plan_name)
    return {"ok": True, **updates}


@api.post("/subscription/mock-cancel")
async def mock_cancel(user: UserOut = Depends(get_user)):
    """Cancel at the end of the current billing period. Keeps entitlements
    until then. Never deletes user data."""
    u = await _user_doc(user.id)
    if (u.get("plan") or "free") == "free":
        return {"ok": True, "message": "You're already on Free."}
    await db.users.update_one({"id": user.id}, {"$set": {"plan_cancel_at_period_end": True}})
    return {"ok": True, "cancel_at": u.get("plan_renewal_at")}


@api.post("/subscription/mock-restore")
async def mock_restore(user: UserOut = Depends(get_user)):
    """Reserved for the RevenueCat restore-purchases flow. Mock impl is a no-op
    but returns the current entitlements so the client can refresh."""
    return await my_subscription(user=user)


@api.put("/subscription/admin/config")
async def admin_update_config(body: dict, user: UserOut = Depends(get_user)):
    """Admin-only. Merge-patch platform config (launch mode, trials, caps,
    channels, founding_pro settings)."""
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    allowed_keys = {"launch_mode", "launch_mode_thresholds", "trials", "founding_pro",
                    "portfolio_caps", "notification_channels", "pricing"}
    patch = {k: v for k, v in body.items() if k in allowed_keys}
    if patch:
        await db.platform_config.update_one({"_id": "singleton"}, {"$set": patch}, upsert=True)
    return await _get_config()


# ---- Founding Pro program (v14) ----
class FoundingProApplyIn(BaseModel):
    intro: Optional[str] = None


@api.get("/founding-pro/status")
async def founding_pro_status(user: UserOut = Depends(get_user)):
    """Public-ish (needs auth). Shows spots remaining and this user's application state."""
    cfg = await _get_config()
    fp = cfg.get("founding_pro", DEFAULT_CONFIG["founding_pro"])
    approved = await db.users.count_documents({"founding_pro": True})
    u = await _user_doc(user.id)
    app_doc = await db.founding_pro_applications.find_one({"user_id": user.id}, {"_id": 0})
    return {
        "slots": int(fp.get("slots", 100)),
        "spots_taken": approved,
        "spots_remaining": max(0, int(fp.get("slots", 100)) - approved),
        "duration_days": int(fp.get("duration_days", 365)),
        "is_founding_pro": bool(u.get("founding_pro")),
        "founding_pro_expires_at": u.get("founding_pro_expires_at"),
        "founding_pro_days_left": sub_days_remaining(u.get("founding_pro_expires_at")),
        "application": app_doc,
        "eligibility": fp.get("eligibility", {}),
    }


@api.post("/founding-pro/apply")
async def founding_pro_apply(body: FoundingProApplyIn, user: UserOut = Depends(get_user)):
    """Braider submits their application. Enters the admin approval queue."""
    if user.role != "hairdresser":
        raise HTTPException(403, "Only braiders can apply")
    cfg = await _get_config()
    fp = cfg.get("founding_pro", DEFAULT_CONFIG["founding_pro"])
    approved = await db.users.count_documents({"founding_pro": True})
    if approved >= int(fp.get("slots", 100)):
        raise HTTPException(400, "All Founding Pro spots are currently taken.")
    # Eligibility checks
    elig = fp.get("eligibility", {})
    hd = await db.hairdressers.find_one({"user_id": user.id}, {"_id": 0}) or {}
    if elig.get("requires_availability"):
        if not await db.availability.count_documents({"hairdresser_id": user.id}):
            raise HTTPException(400, "Set your Weekly Availability first.")
    if elig.get("requires_portfolio_min", 0):
        n = await db.portfolio_items.count_documents({"hairdresser_id": user.id})
        if n < int(elig["requires_portfolio_min"]):
            raise HTTPException(400, f"Add at least {elig['requires_portfolio_min']} portfolio photos.")
    if elig.get("requires_studio_info"):
        if not (hd.get("bio") and hd.get("salon_name") and hd.get("city")):
            raise HTTPException(400, "Complete your Studio Information first.")

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.founding_pro_applications.find_one({"user_id": user.id})
    doc = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "user_id": user.id,
        "intro": (body.intro or "").strip()[:500],
        "status": "pending",
        "submitted_at": now,
        "decided_at": None,
        "decided_by": None,
        "reason": None,
    }
    if existing:
        await db.founding_pro_applications.update_one({"user_id": user.id}, {"$set": doc})
    else:
        await db.founding_pro_applications.insert_one(doc)
    return {"ok": True, "status": "pending"}


@api.get("/admin/founding-pro/queue")
async def admin_founding_pro_queue(user: UserOut = Depends(get_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    apps = await db.founding_pro_applications.find({"status": "pending"}, {"_id": 0}).sort("submitted_at", 1).to_list(500)
    for a in apps:
        u = await db.users.find_one({"id": a["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        hd = await db.hairdressers.find_one({"user_id": a["user_id"]}, {"_id": 0, "salon_name": 1, "city": 1})
        a["user"] = u or {}
        a["studio"] = hd or {}
    return apps


class FoundingProDecideIn(BaseModel):
    approve: bool
    reason: Optional[str] = None


@api.post("/admin/founding-pro/{app_id}/decide")
async def admin_founding_pro_decide(app_id: str, body: FoundingProDecideIn, user: UserOut = Depends(get_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    app_doc = await db.founding_pro_applications.find_one({"id": app_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    cfg = await _get_config()
    fp = cfg.get("founding_pro", DEFAULT_CONFIG["founding_pro"])
    approved = await db.users.count_documents({"founding_pro": True})
    if body.approve and approved >= int(fp.get("slots", 100)):
        raise HTTPException(400, "All spots are taken.")
    now = datetime.now(timezone.utc)
    if body.approve:
        expires = now + timedelta(days=int(fp.get("duration_days", 365)))
        await db.users.update_one({"id": app_doc["user_id"]}, {"$set": {
            "founding_pro": True,
            "founding_pro_expires_at": expires.isoformat(),
            "founding_pro_notified_days": [],
            "plan": "unlimited",
            "plan_source": "founding_pro",
            "plan_status": "active",
        }})
        await notif.emit(
            db,
            user_id=app_doc["user_id"],
            notif_type="founding_pro.approved",
            title="Welcome, Founding Pro ✨",
            message=f"You have 1 year of Unlimited free. Enjoy every AI tool and premium feature.",
            action_url="/pro/founding",
        )
    await db.founding_pro_applications.update_one({"id": app_id}, {"$set": {
        "status": "approved" if body.approve else "rejected",
        "decided_at": now.isoformat(),
        "decided_by": user.id,
        "reason": body.reason,
    }})
    return {"ok": True}


# ---- Notification preferences (channel-agnostic) ----
@api.get("/notifications/preferences")
async def get_notification_prefs(user: UserOut = Depends(get_user)):
    doc = await db.notification_preferences.find_one({"user_id": user.id}, {"_id": 0}) or {}
    return {"prefs": doc.get("prefs") or notif.DEFAULT_USER_PREFERENCES}


@api.put("/notifications/preferences")
async def put_notification_prefs(body: NotificationPrefsIn, user: UserOut = Depends(get_user)):
    await db.notification_preferences.update_one(
        {"user_id": user.id},
        {"$set": {"user_id": user.id, "prefs": body.prefs, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: UserOut = Depends(get_user)):
    res = await db.notifications.update_one(
        {"id": nid, "user_id": user.id, "opened_at": None},
        {"$set": {"opened_at": datetime.now(timezone.utc).isoformat(), "status": "opened"}},
    )
    return {"ok": True, "modified": res.modified_count}


# ---- Daily maintenance job ----
async def daily_subscription_maintenance():
    """Runs every 6 hours. Handles:
    1. Founding Pro reminders (30/14/7/1 days).
    2. Founding Pro expiration transitions -> free.
    3. Trial-ending reminders + trial expiry.
    4. Plan_cancel_at_period_end -> downgrade at renewal.
    """
    cfg = await _get_config()
    reminder_days = list(cfg.get("founding_pro", {}).get("reminder_days", [30, 14, 7, 1]))
    now = datetime.now(timezone.utc)

    # Founding Pro reminders + expiration
    async for u in db.users.find({"founding_pro": True}, {"_id": 0}):
        exp = u.get("founding_pro_expires_at")
        if not exp:
            continue
        try:
            dt = datetime.fromisoformat(exp)
        except Exception:
            continue
        if dt <= now:
            # Expire — transition to free (never charge automatically).
            await db.users.update_one({"id": u["id"]}, {"$set": {
                "founding_pro": False,
                "plan": "free",
                "plan_source": None,
                "plan_status": "expired",
            }})
            await notif.emit_subscription_transition(db, user_id=u["id"], from_plan="founding_pro", to_plan="free")
            continue
        days_left = max(0, int((dt - now).total_seconds() // 86400))
        sent = set(u.get("founding_pro_notified_days") or [])
        for d in reminder_days:
            if days_left == d and d not in sent:
                await notif.emit_founding_pro_reminder(db, user_id=u["id"], days_left=d)
                sent.add(d)
        if set(u.get("founding_pro_notified_days") or []) != sent:
            await db.users.update_one({"id": u["id"]}, {"$set": {"founding_pro_notified_days": list(sent)}})

    # Trial expiration + reminders
    async for u in db.users.find({"trial_ends_at": {"$ne": None}}, {"_id": 0}):
        te = u.get("trial_ends_at")
        try:
            dt = datetime.fromisoformat(te)
        except Exception:
            continue
        if dt <= now:
            # Trial ended → keep the plan they chose if they've paid, else downgrade.
            if u.get("plan_source") == "mock":
                # Mock purchases stay active (they already "paid").
                pass
            await db.users.update_one({"id": u["id"]}, {"$set": {"trial_plan": None, "trial_ends_at": None,
                                                                   "plan_status": "active"}})
        else:
            days_left = max(0, int((dt - now).total_seconds() // 86400))
            if days_left in (7, 3, 1):
                # Only send if we haven't for that milestone.
                sent = set(u.get("trial_reminded_days") or [])
                if days_left not in sent:
                    await notif.emit_trial_ending(db, user_id=u["id"], plan=(u.get("trial_plan") or "unlimited"), days_left=days_left)
                    sent.add(days_left)
                    await db.users.update_one({"id": u["id"]}, {"$set": {"trial_reminded_days": list(sent)}})

    # Cancel-at-period-end -> downgrade to free at renewal
    async for u in db.users.find({"plan_cancel_at_period_end": True}, {"_id": 0}):
        renew = u.get("plan_renewal_at")
        if not renew:
            continue
        try:
            if datetime.fromisoformat(renew) <= now:
                await db.users.update_one({"id": u["id"]}, {"$set": {
                    "plan": "free", "plan_source": None, "plan_status": "expired",
                    "plan_cancel_at_period_end": False, "plan_cycle": None,
                    "plan_renewal_at": None,
                }})
                await notif.emit_subscription_transition(db, user_id=u["id"], from_plan=u.get("plan", ""), to_plan="free")
        except Exception:
            continue



app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def _startup():
    # Bootstrap platform config (singleton doc). Adds any newly-introduced keys
    # without clobbering values the admin has already changed.
    await notif.bootstrap_platform_config(db, DEFAULT_CONFIG)
    if not scheduler.running:
        scheduler.add_job(auto_cancel_late, "interval", minutes=1, id="autocancel", replace_existing=True)
        scheduler.add_job(daily_subscription_maintenance, "interval", hours=6, id="submaint", replace_existing=True)
        scheduler.start()
    if await db.hairstyles.count_documents({}) == 0:
        await seed()

@app.on_event("shutdown")
async def _shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)
    client.close()
