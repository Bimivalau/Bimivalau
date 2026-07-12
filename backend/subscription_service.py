"""
Subscription service — single source of truth for plans, entitlements, trials,
Founding Pro, launch mode, and portfolio caps.

All feature gates in the app must call `has_entitlement(user, feature_key)`
rather than checking plan strings directly. This keeps the business rules
centralised, config-driven, and RevenueCat-ready.

Runtime configuration is stored in the `platform_config` MongoDB collection so
the platform owner can flip flags without a deploy.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


# ---------- Default configuration (mirrored to Mongo on first boot) ----------
DEFAULT_CONFIG: Dict[str, Any] = {
    # Launch mode — while true, all customer premium features are unlocked
    # even for FREE customers. Braider plans are unaffected.
    "launch_mode": True,
    # When any of these thresholds is reached, launch mode auto-suggests turning
    # off (still requires admin toggle). Purely advisory.
    "launch_mode_thresholds": {
        "customers_registered": 5000,
        "studios_active": 250,
        "bookings_completed": 1000,
    },
    # Trial policy — durations are configurable at runtime.
    "trials": {
        "customer_unlimited": 0,      # no trial during launch
        "braider_standard": 30,       # 30-day free trial
        "braider_unlimited": 30,      # 30-day free trial
    },
    # Founding Pro program.
    "founding_pro": {
        "slots": 100,                 # total spots
        "duration_days": 365,         # 1 year of Unlimited
        "requires_approval": True,    # admin approval queue
        "eligibility": {
            "requires_availability": True,
            "requires_portfolio_min": 3,
            "requires_studio_info": True,
        },
        "reminder_days": [30, 14, 7, 1],
    },
    # Portfolio caps per braider plan.
    "portfolio_caps": {
        "free": 10,
        "standard": 25,
        "unlimited": 40,
        "founding_pro": 40,
    },
    # Notification channels — activate/deactivate per channel.
    "notification_channels": {
        "in_app": True,       # always active
        "push":   False,      # activate when FCM/APNs credentials are added
        "email":  False,      # activate when SendGrid/Resend is wired
        "sms":    False,
        "whatsapp": False,
    },
    "pricing": {
        "customer_unlimited": {"monthly": 6.99,  "yearly": 59.99},
        "braider_standard":   {"monthly": 19.99, "yearly": 199.00},
        "braider_unlimited":  {"monthly": 49.99, "yearly": 499.00},
    },
}

# ---------- Entitlement matrix ----------
# feature_key -> set of plan slugs that unlock it.
# `customer.*` entitlements are ALSO unlocked when launch_mode is on.
ENTITLEMENTS: Dict[str, List[str]] = {
    # ---- Customer premium features (unlocked in launch mode) ----
    "customer.ai.style_match":       ["customer_unlimited"],
    "customer.ai.recreate_look":     ["customer_unlimited"],
    "customer.ai.recommendations":   ["customer_unlimited"],
    "customer.ai.price_alerts":      ["customer_unlimited"],
    "customer.ai.beauty_journal":    ["customer_unlimited"],
    "customer.ai.travel_planning":   ["customer_unlimited"],
    "customer.filters.premium":      ["customer_unlimited"],
    "customer.support.vip":          ["customer_unlimited"],
    # ---- Discovery — always free for everyone ----
    "customer.browse.all":           ["customer_free", "customer_unlimited"],
    "customer.save_favorites":       ["customer_free", "customer_unlimited"],
    "customer.book":                 ["customer_free", "customer_unlimited"],
    "customer.review":               ["customer_free", "customer_unlimited"],
    # ---- Braider core (all paid tiers + free include these) ----
    "braider.studio.profile":        ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.availability":          ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.calendar":              ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.bookings":              ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.reviews":               ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.business_success_score":["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    "braider.braider_dna":           ["braider_free", "braider_standard", "braider_unlimited", "founding_pro"],
    # ---- Braider Standard ----
    "braider.analytics.business":    ["braider_standard", "braider_unlimited", "founding_pro"],
    "braider.business_health":       ["braider_standard", "braider_unlimited", "founding_pro"],
    "braider.report.weekly":         ["braider_standard", "braider_unlimited", "founding_pro"],
    "braider.report.trending":       ["braider_standard", "braider_unlimited", "founding_pro"],
    "braider.ranking.priority":      ["braider_standard", "braider_unlimited", "founding_pro"],
    "braider.recommendations":       ["braider_standard", "braider_unlimited", "founding_pro"],
    # ---- Braider Unlimited ----
    "braider.featured_placement":    ["braider_unlimited", "founding_pro"],
    "braider.homepage_recommendations":["braider_unlimited", "founding_pro"],
    "braider.ai.business_coach":     ["braider_unlimited", "founding_pro"],
    "braider.marketing.assistant":   ["braider_unlimited", "founding_pro"],
    "braider.analytics.revenue":     ["braider_unlimited", "founding_pro"],
    "braider.analytics.retention":   ["braider_unlimited", "founding_pro"],
    "braider.campaigns.seasonal":    ["braider_unlimited", "founding_pro"],
    "braider.forecasting":           ["braider_unlimited", "founding_pro"],
    "braider.website_builder":       ["braider_unlimited", "founding_pro"],
    "braider.online_store":          ["braider_unlimited", "founding_pro"],
    "braider.inventory":             ["braider_unlimited", "founding_pro"],
    "braider.payroll":               ["braider_unlimited", "founding_pro"],
}


def resolve_plan_slug(user: dict) -> str:
    """Given a user document, return the plan slug used by ENTITLEMENTS.

    Examples: 'customer_free', 'customer_unlimited', 'braider_free',
    'braider_standard', 'braider_unlimited', 'founding_pro'.
    """
    role = (user.get("role") or "customer").lower()
    plan = (user.get("plan") or "free").lower()
    if user.get("founding_pro") and _founding_pro_active(user):
        return "founding_pro"
    if role == "hairdresser":
        return f"braider_{plan}" if plan in ("free", "standard", "unlimited") else "braider_free"
    return f"customer_{plan}" if plan in ("free", "unlimited") else "customer_free"


def _founding_pro_active(user: dict) -> bool:
    exp = user.get("founding_pro_expires_at")
    if not exp:
        return bool(user.get("founding_pro"))
    try:
        return datetime.fromisoformat(exp) > datetime.now(timezone.utc)
    except Exception:
        return False


def has_entitlement(user: dict, feature_key: str, config: Optional[dict] = None) -> bool:
    """Central gate — returns True iff the user's plan (or launch-mode override)
    unlocks this feature. Trials count as full paid entitlements while active."""
    cfg = config or {}
    slug = resolve_plan_slug(user)
    # Launch mode unlocks all `customer.*` features for everyone.
    if cfg.get("launch_mode") and feature_key.startswith("customer."):
        return True
    # Trial support — during an active trial we treat the user as if they were on that paid plan.
    trial_slug = _active_trial_slug(user)
    if trial_slug and feature_key in ENTITLEMENTS:
        if trial_slug in ENTITLEMENTS[feature_key]:
            return True
    allowed = ENTITLEMENTS.get(feature_key, [])
    return slug in allowed


def _active_trial_slug(user: dict) -> Optional[str]:
    """If the user is inside a trial window, return the paid plan slug they get."""
    tp = (user.get("trial_plan") or "").lower()
    te = user.get("trial_ends_at")
    if not tp or not te:
        return None
    try:
        if datetime.fromisoformat(te) < datetime.now(timezone.utc):
            return None
    except Exception:
        return None
    role = (user.get("role") or "customer").lower()
    if role == "hairdresser" and tp in ("standard", "unlimited"):
        return f"braider_{tp}"
    if role != "hairdresser" and tp == "unlimited":
        return "customer_unlimited"
    return None


def portfolio_cap(user: dict, config: Optional[dict] = None) -> int:
    cfg = (config or {}).get("portfolio_caps", DEFAULT_CONFIG["portfolio_caps"])
    if user.get("founding_pro") and _founding_pro_active(user):
        return int(cfg.get("founding_pro", 40))
    trial_slug = _active_trial_slug(user)
    if trial_slug and trial_slug.startswith("braider_"):
        return int(cfg.get(trial_slug.split("_", 1)[1], 10))
    plan = (user.get("plan") or "free").lower()
    return int(cfg.get(plan, cfg.get("free", 10)))


def days_remaining(iso_dt: Optional[str]) -> Optional[int]:
    if not iso_dt:
        return None
    try:
        dt = datetime.fromisoformat(iso_dt)
    except Exception:
        return None
    delta = dt - datetime.now(timezone.utc)
    return max(0, int(delta.total_seconds() // 86400))


def summarize_entitlements(user: dict, config: Optional[dict] = None) -> Dict[str, bool]:
    """Bulk resolve every feature key for the current user. Used by the frontend
    hook so a single API call returns everything the UI needs."""
    return {k: has_entitlement(user, k, config) for k in ENTITLEMENTS}


def upgrade_reason(feature_key: str) -> Dict[str, str]:
    """Human-friendly upgrade CTA for a locked feature. Used by PaywallSheet."""
    if feature_key.startswith("customer."):
        return {
            "target_plan": "customer_unlimited",
            "eyebrow": "YOUR PERSONAL BEAUTY ASSISTANT",
            "title": "Unlock BraidsCommunity Unlimited",
            "value": "AI Style Match, Recreate This Look, Beauty Journal, Travel Planning & more.",
        }
    if any(feature_key.startswith(p) for p in ("braider.featured_placement", "braider.homepage_recommendations",
                                               "braider.ai.", "braider.marketing.", "braider.analytics.revenue",
                                               "braider.analytics.retention", "braider.campaigns.", "braider.forecasting",
                                               "braider.website_builder", "braider.online_store", "braider.inventory",
                                               "braider.payroll")):
        return {
            "target_plan": "braider_unlimited",
            "eyebrow": "BRAIDER UNLIMITED",
            "title": "Build a premium beauty business powered by AI",
            "value": "Featured placement, AI Business Coach, marketing, revenue analytics, website & store.",
        }
    return {
        "target_plan": "braider_standard",
        "eyebrow": "BRAIDER STANDARD",
        "title": "Grow your visibility & attract more customers",
        "value": "Business analytics, growth recommendations, priority ranking, weekly reports.",
    }
