"""Cloudinary signed-upload helper for BraidsCommunity.

Backend never proxies image bytes — it only:
1) Generates short-lived signed upload params for the client (POST /api/media/sign)
2) Persists the resulting {secure_url, public_id} in Mongo (POST /api/media/complete)
3) Generates signed delivery URLs for PRIVATE license images (admins only)
"""
from __future__ import annotations

import hashlib
import os
import time
import uuid
from typing import Optional, Literal

from pydantic import BaseModel, Field

# The Cloudinary Python SDK is used only for signed delivery URLs (licenses).
# Signature generation for uploads is implemented manually to keep it auditable.
try:
    import cloudinary
    import cloudinary.utils
    _sdk_ok = True
except Exception:
    _sdk_ok = False


CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_UPLOAD_PRESET = os.environ.get("CLOUDINARY_UPLOAD_PRESET", "braidscommunity_signed").strip()


def is_configured() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


if _sdk_ok and is_configured():
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


MediaContext = Literal["portfolio", "style_catalog", "avatar", "license", "booking"]

# Folders per Cloudinary taxonomy (aligned with product spec)
_FOLDER_MAP = {
    "portfolio": "braidscommunity/portfolio",
    "style_catalog": "braidscommunity/styles",
    "avatar": "braidscommunity/profiles",
    "license": "braidscommunity/verification",  # private
    "booking": "braidscommunity/bookings",
}

# Contexts that MUST be uploaded with access_mode=authenticated (private).
_PRIVATE_CONTEXTS = {"license"}


class SignRequest(BaseModel):
    context: MediaContext
    hairdresser_id: Optional[str] = None
    user_id: Optional[str] = None
    booking_id: Optional[str] = None


class SignResponse(BaseModel):
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    public_id: str
    upload_preset: Optional[str] = None
    access_mode: Optional[str] = None
    upload_url: str


def _folder_for(req: SignRequest) -> str:
    base = _FOLDER_MAP[req.context]
    if req.context == "portfolio" and req.hairdresser_id:
        return f"{base}/{req.hairdresser_id}"
    if req.context == "avatar" and req.user_id:
        return f"{base}/{req.user_id}"
    if req.context == "license" and req.hairdresser_id:
        return f"{base}/{req.hairdresser_id}"
    if req.context == "booking" and req.booking_id:
        return f"{base}/{req.booking_id}"
    return base


def _public_id_for(req: SignRequest) -> str:
    """Deterministic prefix + random suffix to guarantee uniqueness and avoid collisions."""
    prefix_map = {
        "portfolio": f"portfolio_{req.hairdresser_id or 'anon'}",
        "style_catalog": "style",
        "avatar": f"avatar_{req.user_id or 'anon'}",
        "license": f"license_{req.hairdresser_id or 'anon'}",
        "booking": f"booking_{req.booking_id or 'anon'}",
    }
    return f"{prefix_map[req.context]}_{uuid.uuid4().hex[:12]}"


def _sign_params(params: dict) -> str:
    """
    Cloudinary signature algorithm:
    - drop file/cloud_name/resource_type/api_key/signature (never signed)
    - sort remaining params alphabetically by key
    - concatenate as k=v&k=v...
    - append API secret
    - SHA-1 hex digest
    """
    exclude = {"file", "cloud_name", "resource_type", "api_key", "signature"}
    filtered = {k: v for k, v in params.items() if k not in exclude and v is not None and v != ""}
    to_sign = "&".join(f"{k}={filtered[k]}" for k in sorted(filtered.keys()))
    return hashlib.sha1(f"{to_sign}{CLOUDINARY_API_SECRET}".encode("utf-8")).hexdigest()


def build_sign_response(req: SignRequest) -> SignResponse:
    if not is_configured():
        raise RuntimeError("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET in backend/.env.")

    folder = _folder_for(req)
    public_id = _public_id_for(req)
    timestamp = int(time.time())
    access_mode = "authenticated" if req.context in _PRIVATE_CONTEXTS else None

    params: dict = {
        "timestamp": timestamp,
        "folder": folder,
        "public_id": public_id,
        # Bind to upload preset so client can't override transformations/access
        "upload_preset": CLOUDINARY_UPLOAD_PRESET,
    }
    if access_mode:
        params["access_mode"] = access_mode

    signature = _sign_params(params)

    return SignResponse(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
        public_id=public_id,
        upload_preset=CLOUDINARY_UPLOAD_PRESET,
        access_mode=access_mode,
        upload_url=f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload",
    )


def signed_delivery_url(public_id: str, transformation: Optional[dict] = None, expires_in: int = 3600) -> str:
    """
    Signed URL for authenticated (private) images. Requires the SDK.
    Used by admins to view uploaded license documents.
    """
    if not is_configured():
        raise RuntimeError("Cloudinary is not configured.")
    if not _sdk_ok:
        raise RuntimeError("cloudinary SDK is not installed.")
    opts = {"sign_url": True, "type": "authenticated", "secure": True}
    if transformation:
        opts["transformation"] = transformation
    # expires_at gives Cloudinary a hard TTL on the signed URL
    opts["expires_at"] = int(time.time()) + int(expires_in)
    url, _ = cloudinary.utils.cloudinary_url(public_id, **opts)
    return url
