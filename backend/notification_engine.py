"""
Notification engine — provider-agnostic. Emits an event to whichever channels
are activated in `platform_config.notification_channels`. Today only the
`in_app` channel actually persists; the other providers (Push/Email/SMS/
WhatsApp) are stubbed and store the intent so we can wire real transport
without a business-logic change.

Every notification is stored in `notifications` with:
    id, user_id, type, channel, status (pending|sent|delivered|opened|failed),
    payload (arbitrary), title, message, action_url,
    created_at, delivered_at, opened_at.

Analytics can then group by type/channel/status for engagement reporting.
"""
from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


class NotificationProvider:
    """Base class — subclass and implement `.send()`."""
    channel: str = "in_app"

    async def send(self, db: AsyncIOMotorDatabase, doc: dict) -> None:
        # Default: mark as delivered (in-app) — no external transport.
        doc["status"] = "delivered"
        doc["delivered_at"] = datetime.now(timezone.utc).isoformat()


class InAppProvider(NotificationProvider):
    channel = "in_app"


class PushProvider(NotificationProvider):
    """FCM/APNs stub. Real transport is wired when EMERGENT_PUSH_KEY is set
    and google-services.json is provided by the platform owner."""
    channel = "push"

    async def send(self, db, doc):
        # No credentials yet → mark pending. Same doc will be resent when
        # the transport is activated.
        doc["status"] = "pending"


class EmailProvider(NotificationProvider):
    """SendGrid/Resend stub. Real transport is wired when EMAIL provider is chosen."""
    channel = "email"

    async def send(self, db, doc):
        doc["status"] = "pending"


class SmsProvider(NotificationProvider):
    channel = "sms"

    async def send(self, db, doc):
        doc["status"] = "pending"


class WhatsAppProvider(NotificationProvider):
    channel = "whatsapp"

    async def send(self, db, doc):
        doc["status"] = "pending"


_PROVIDERS: Dict[str, NotificationProvider] = {
    "in_app": InAppProvider(),
    "push": PushProvider(),
    "email": EmailProvider(),
    "sms": SmsProvider(),
    "whatsapp": WhatsAppProvider(),
}


DEFAULT_USER_PREFERENCES: Dict[str, Dict[str, bool]] = {
    # notification_type -> channel -> allow?
    # `*` means "default preference for all types not overridden".
    "*": {"in_app": True, "push": True, "email": False, "sms": False, "whatsapp": False},
}


async def emit(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    channels_hint: Optional[List[str]] = None,
) -> List[str]:
    """Dispatch a notification event across all enabled channels for the user.

    Returns the list of notification ids created (one per channel).
    """
    now = datetime.now(timezone.utc).isoformat()

    # Determine which channels are active platform-wide.
    cfg = await db.platform_config.find_one({"_id": "singleton"}, {"_id": 0}) or {}
    channels_cfg = (cfg.get("notification_channels") or {"in_app": True})

    # Determine user preferences (fallback to defaults).
    pref_doc = await db.notification_preferences.find_one({"user_id": user_id}, {"_id": 0}) or {}
    user_prefs = pref_doc.get("prefs") or DEFAULT_USER_PREFERENCES
    prefs = {**DEFAULT_USER_PREFERENCES["*"], **user_prefs.get("*", {}), **user_prefs.get(notif_type, {})}

    if channels_hint is not None:
        allowed_channels = [c for c in channels_hint if channels_cfg.get(c) and prefs.get(c, False)]
    else:
        allowed_channels = [c for c, on in channels_cfg.items() if on and prefs.get(c, False)]
    # Ensure in-app always fires so the user has a record — this is our
    # analytics ground-truth.
    if "in_app" not in allowed_channels and channels_cfg.get("in_app", True):
        allowed_channels.insert(0, "in_app")

    ids: List[str] = []
    for channel in allowed_channels:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": notif_type,
            "channel": channel,
            "status": "pending",
            "title": title,
            "message": message,
            "action_url": action_url,
            "payload": payload or {},
            "created_at": now,
            "delivered_at": None,
            "opened_at": None,
        }
        provider = _PROVIDERS.get(channel, InAppProvider())
        try:
            await provider.send(db, doc)
        except Exception:
            doc["status"] = "failed"
        await db.notifications.insert_one(doc)
        ids.append(doc["id"])
    return ids


async def bootstrap_platform_config(db: AsyncIOMotorDatabase, defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure a singleton `platform_config` doc exists. On first boot, seed with
    `defaults`. Never overrides values the admin may have changed later."""
    doc = await db.platform_config.find_one({"_id": "singleton"})
    if not doc:
        cfg = {**defaults, "_id": "singleton"}
        await db.platform_config.insert_one(cfg)
        return cfg
    # Merge any newly-added default keys without clobbering existing values.
    updates = {k: v for k, v in defaults.items() if k not in doc}
    if updates:
        await db.platform_config.update_one({"_id": "singleton"}, {"$set": updates})
        doc.update(updates)
    return doc


# ------------------------------------------------------------------
# Convenience emitters — keep the shape of notification `type` stable
# so future analytics dashboards can group by them.
# ------------------------------------------------------------------
async def emit_founding_pro_reminder(db, *, user_id: str, days_left: int):
    return await emit(
        db,
        user_id=user_id,
        notif_type="founding_pro.reminder",
        title=f"Your Founding Pro benefits end in {days_left} day{'s' if days_left != 1 else ''}",
        message="Keep your Unlimited features by choosing a plan — or continue on Free with everything you built saved.",
        action_url="/subscription",
        payload={"days_left": days_left},
    )


async def emit_subscription_transition(db, *, user_id: str, from_plan: str, to_plan: str):
    return await emit(
        db,
        user_id=user_id,
        notif_type="subscription.transition",
        title="Your plan changed",
        message=f"You're now on {to_plan.replace('_', ' ').title()}. Your Studio, portfolio, and bookings are all safe.",
        action_url="/subscription",
        payload={"from": from_plan, "to": to_plan},
    )


async def emit_trial_ending(db, *, user_id: str, plan: str, days_left: int):
    return await emit(
        db,
        user_id=user_id,
        notif_type="trial.ending",
        title=f"Your free trial ends in {days_left} day{'s' if days_left != 1 else ''}",
        message=f"Continue on {plan.replace('_', ' ').title()} or return to Free with everything you built saved.",
        action_url="/subscription",
        payload={"plan": plan, "days_left": days_left},
    )
