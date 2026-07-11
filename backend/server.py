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
import os, uuid, logging, bcrypt, secrets, string, httpx
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
    email_verified: bool = False

class ProfessionalServiceIn(BaseModel):
    hairstyle_id: str
    custom_name: Optional[str] = None
    price: float = Field(ge=0)
    currency: str = "USD"
    duration_minutes: int = Field(ge=15)
    hair_included: bool = False
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
    plan_type: Literal["standard", "unlimited"]
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
                   plan=u.get("plan", "standard"),
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


# ---------- Pricing (mocked; no real payment processor yet) ----------
FOUNDING_PRO_SLOTS = 10
YEARLY_DISCOUNT = 0.20  # 20% off vs 12x monthly
PRICING = {
    "customer": {"monthly": 8.0, "yearly": round(8.0 * 12 * (1 - YEARLY_DISCOUNT), 2)},   # $96/yr
    "professional": {"monthly": 19.0, "yearly": round(19.0 * 12 * (1 - YEARLY_DISCOUNT), 2)},  # $228/yr
}

async def get_active_subscription(user_id: str) -> Optional[dict]:
    """Return the most-recent active subscription for a user, honoring promo_expires_at."""
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": "active"}, {"_id": 0}, sort=[("start_date", -1)])
    if not sub:
        return None
    # Auto-downgrade expired founding-pro promo to standard
    if sub.get("is_founding_pro") and sub.get("promo_expires_at"):
        if datetime.fromisoformat(sub["promo_expires_at"]) < datetime.now(timezone.utc):
            await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
            await db.users.update_one({"id": user_id}, {"$set": {"plan": "standard"}})
            return None
    return sub

async def sync_user_plan_from_sub(user_id: str) -> str:
    """Reconciles the user.plan field with their subscription record. Returns the effective plan."""
    sub = await get_active_subscription(user_id)
    plan = sub["plan_type"] if sub else "standard"
    await db.users.update_one({"id": user_id}, {"$set": {"plan": plan}})
    return plan


# ---------- Auth ----------
@api.post("/auth/register", response_model=TokenOut)
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": uid, "email": body.email, "name": body.name, "role": body.role,
        "phone": body.phone, "plan": "standard",
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
            "role": "customer", "plan": "standard",
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
    """Returns the active subscription (or None) + pricing options tailored to the user's role."""
    sub = await get_active_subscription(user.id)
    await sync_user_plan_from_sub(user.id)
    account_type = "professional" if user.role == "hairdresser" else "customer"
    prices = PRICING[account_type]
    days_left_promo = None
    if sub and sub.get("is_founding_pro") and sub.get("promo_expires_at"):
        delta = datetime.fromisoformat(sub["promo_expires_at"]) - datetime.now(timezone.utc)
        days_left_promo = max(0, delta.days)
    return {
        "subscription": sub,
        "account_type": account_type,
        "pricing": {
            "monthly": prices["monthly"],
            "yearly": prices["yearly"],
            "yearly_savings_pct": int(YEARLY_DISCOUNT * 100),
        },
        "founding_pro_days_left": days_left_promo,
    }

@api.post("/subscriptions/subscribe")
async def subscribe(body: SubscribeIn, user: UserOut = Depends(get_user)):
    """Mocked subscribe — creates a real subscription record; no payment processor is called."""
    account_type = "professional" if user.role == "hairdresser" else "customer"
    now = datetime.now(timezone.utc)

    # Standard = cancel any active paid subscription
    if body.plan_type == "standard":
        await db.subscriptions.update_many({"user_id": user.id, "status": "active"}, {"$set": {"status": "cancelled"}})
        await db.users.update_one({"id": user.id}, {"$set": {"plan": "standard"}})
        return {"ok": True, "plan": "standard"}

    if not body.billing_interval:
        raise HTTPException(400, "billing_interval required for Unlimited")

    # Preserve founding-pro promo if it's still valid — don't overwrite with a paid sub
    current = await get_active_subscription(user.id)
    if current and current.get("is_founding_pro") and current.get("promo_expires_at") \
            and datetime.fromisoformat(current["promo_expires_at"]) > now:
        return {"ok": True, "plan": "unlimited", "note": "You're on the Founding Pro promo — no charge until it expires."}

    price = PRICING[account_type][body.billing_interval]
    renewal = now + timedelta(days=30 if body.billing_interval == "monthly" else 365)
    # Cancel prior subs and insert new
    await db.subscriptions.update_many({"user_id": user.id, "status": "active"}, {"$set": {"status": "cancelled"}})
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "account_type": account_type,
        "plan_type": "unlimited",
        "billing_interval": body.billing_interval,
        "price": price,
        "status": "active",
        "start_date": now.isoformat(),
        "renewal_date": renewal.isoformat(),
        "is_founding_pro": False,
        "promo_expires_at": None,
    }
    await db.subscriptions.insert_one(sub)
    await db.users.update_one({"id": user.id}, {"$set": {"plan": "unlimited"}})
    return {"ok": True, "plan": "unlimited", "subscription": {k: v for k, v in sub.items() if k != "_id"}}


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
    # Verification is optional — all hairdressers are searchable. Approved pros just get the Verified Pro badge.
    hds = await db.hairdressers.find({"specialty_ids": hid}, {"_id": 0}).to_list(200)
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
    if user.plan == "standard" and count >= 5:
        raise HTTPException(402, "Free plan is capped at 5 portfolio photos. Upgrade to Unlimited for more.")
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
        if user.plan == "standard" and count >= 5:
            raise HTTPException(402, "Free plan is capped at 5 portfolio photos. Upgrade to unlock more.")
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
        if user.plan == "standard" and count >= 5:
            raise HTTPException(402, "Free plan is capped at 5 portfolio photos.")
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
    await db.hairdressers.update_one({"user_id": user.id}, {"$set": {"onboarding_completed": True}})
    return {"ok": True}

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
    await db.professional_services.update_one(
        {"id": sid, "hairdresser_id": user.id}, {"$set": {"active": False}}
    )
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
            "location_blurred": not is_unlimited,
        }
        # Location privacy
        if not is_unlimited:
            card["service_area"] = (card["service_area"] or "").split(",")[0] + " · area"
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

    # Free gating: preview 3 cards + total count
    preview = cards if is_unlimited else cards[:3]
    return {
        "hairstyle": {"id": hairstyle["id"], "name": hairstyle["name"], "category": hairstyle["category"], "cover_photo": hairstyle.get("cover_photo")},
        "total_matches": total_matches,
        "shown": len(preview),
        "gated": not is_unlimited,
        "results": preview,
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


# ---------- Featured Stylist of the Week ----------
def _iso_week_range(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return monday, monday + timedelta(days=7)

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
    if not force and await db.hairstyles.count_documents({}) > 0:
        return {"status": "already_seeded"}
    await db.hairstyles.delete_many({})
    await db.hairdressers.delete_many({})
    await db.portfolio_items.delete_many({})
    await db.availability.delete_many({})
    await db.reviews.delete_many({})
    await db.subscriptions.delete_many({})
    await db.customer_ratings.delete_many({})
    await db.reports.delete_many({})
    await db.featured_stylists.delete_many({})
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
            "flag_count": 0, "booking_restricted": False,
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
        "flag_count": 0, "booking_restricted": False,
        "password_hash": hash_pw("demo1234"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # demo admin
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": "admin@braids.demo", "name": "BC Admin",
        "role": "admin", "plan": "unlimited", "phone": None, "profile_photo": None,
        "flag_count": 0, "booking_restricted": False,
        "password_hash": hash_pw("demo1234"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Clear any prior featured-stylist picks so weighted rotation runs fresh
    await db.featured_stylists.delete_many({})
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
