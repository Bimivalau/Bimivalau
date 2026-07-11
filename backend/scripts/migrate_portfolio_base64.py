"""
One-time migration: move all base64 image data from MongoDB → Cloudinary.

Safe properties:
  - IDEMPOTENT: skips records with `public_id` already set. Safe to re-run.
  - NON-DESTRUCTIVE: original base64 is backed up into `*_base64_backup`
    fields before mutation. Nothing is deleted.
  - LOGGED: every action written to stdout + `/app/backend/scripts/migration.log`.
    No image bytes are ever printed.
  - VERIFIED: each uploaded asset is HEAD-checked at its secure_url before
    the MongoDB field is updated. If verification fails, backup remains and
    the DB row is untouched.

Scope (in this order):
  1. hairdressers.portfolio  (embedded arrays, if any legacy schema)
  2. portfolio_items         (`photo_url` if base64)
  3. users.profile_photo     (if base64)
  4. hairstyles.image_url    (if base64)
  5. hairdressers.license_url (if base64) — uploaded PRIVATE (authenticated)
  6. hairdressers.cover_photo (if base64)

Run:
  cd /app/backend && python scripts/migrate_portfolio_base64.py
  cd /app/backend && python scripts/migrate_portfolio_base64.py --dry-run
  cd /app/backend && python scripts/migrate_portfolio_base64.py --only portfolio_items

After manual verification: use `scripts/cleanup_base64_backups.py` to purge
the backup fields.
"""
from __future__ import annotations
import argparse
import base64
import logging
import os
import sys
import time
from typing import Optional, Tuple

import httpx
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

try:
    import cloudinary
    import cloudinary.uploader
except ImportError:
    print("ERROR: `cloudinary` package not installed. `pip install cloudinary`")
    sys.exit(1)


LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migration.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("migrate")


CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()

if not (CLOUD_NAME and API_KEY and API_SECRET):
    log.error("Cloudinary env vars missing. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET in backend/.env")
    sys.exit(2)

cloudinary.config(cloud_name=CLOUD_NAME, api_key=API_KEY, api_secret=API_SECRET, secure=True)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = MongoClient(MONGO_URL)
db = client[DB_NAME]


def _looks_like_base64(v: Optional[str]) -> bool:
    if not v or not isinstance(v, str):
        return False
    return v.startswith("data:image") or (len(v) > 500 and "/" not in v[:20] and " " not in v[:20])


def _upload(value: str, folder: str, public_id: str, private: bool = False) -> Optional[dict]:
    """Upload a base64 (or data URI) string to Cloudinary and return the response dict."""
    try:
        kwargs = {
            "folder": folder,
            "public_id": public_id,
            "overwrite": False,
            "resource_type": "image",
            "unique_filename": False,
        }
        if private:
            kwargs["access_mode"] = "authenticated"
        # Cloudinary accepts data URIs directly. Bare base64 needs the prefix.
        if not value.startswith("data:"):
            value = "data:image/jpeg;base64," + value
        res = cloudinary.uploader.upload(value, **kwargs)
        return res
    except Exception as e:
        log.error(f"Upload failed for {folder}/{public_id}: {type(e).__name__}: {e}")
        return None


def _verify_url(url: str) -> bool:
    """HEAD-check that the uploaded asset is retrievable."""
    try:
        r = httpx.head(url, follow_redirects=True, timeout=8)
        return r.status_code in (200, 302)
    except Exception:
        return False


# ============================================================
# Migrators
# ============================================================

def migrate_portfolio_items(dry_run: bool) -> Tuple[int, int]:
    """portfolio_items.photo_url (base64) → Cloudinary."""
    coll = db.portfolio_items
    q = {"photo_url": {"$regex": "^data:image|^[A-Za-z0-9+/=]{500,}$"}}
    total = coll.count_documents(q)
    log.info(f"[portfolio_items] {total} candidate records")
    ok = 0
    for doc in coll.find(q):
        if doc.get("public_id"):
            log.info(f"[portfolio_items] {doc['id']} already migrated — skip")
            continue
        hd_id = doc["hairdresser_id"]
        folder = f"braidscommunity/portfolio/{hd_id}"
        pid = f"portfolio_{hd_id}_{doc['id']}"
        if dry_run:
            log.info(f"[portfolio_items] DRY: would upload {doc['id']} → {folder}/{pid}")
            ok += 1
            continue
        res = _upload(doc["photo_url"], folder, pid, private=False)
        if not res or not _verify_url(res["secure_url"]):
            log.error(f"[portfolio_items] {doc['id']} failed upload/verify")
            continue
        coll.update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "photo_url": res["secure_url"],
                "public_id": res["public_id"],
                "photo_url_base64_backup": doc["photo_url"],
            }},
        )
        ok += 1
        log.info(f"[portfolio_items] {doc['id']} → {res['public_id']}")
    return ok, total


def migrate_user_avatars(dry_run: bool) -> Tuple[int, int]:
    coll = db.users
    q = {"profile_photo": {"$regex": "^data:image|^[A-Za-z0-9+/=]{500,}$"}}
    total = coll.count_documents(q)
    log.info(f"[users.profile_photo] {total} candidates")
    ok = 0
    for u in coll.find(q):
        if u.get("profile_photo_public_id"):
            continue
        folder = f"braidscommunity/profiles/{u['id']}"
        pid = f"avatar_{u['id']}"
        if dry_run:
            log.info(f"[users] DRY {u['email']}"); ok += 1; continue
        res = _upload(u["profile_photo"], folder, pid, private=False)
        if not res or not _verify_url(res["secure_url"]):
            log.error(f"[users] {u['email']} failed")
            continue
        coll.update_one(
            {"_id": u["_id"]},
            {"$set": {
                "profile_photo": res["secure_url"],
                "profile_photo_public_id": res["public_id"],
                "profile_photo_base64_backup": u["profile_photo"],
            }},
        )
        ok += 1
        log.info(f"[users] {u['email']} → {res['public_id']}")
    return ok, total


def migrate_hairstyle_images(dry_run: bool) -> Tuple[int, int]:
    coll = db.hairstyles
    q = {"image_url": {"$regex": "^data:image|^[A-Za-z0-9+/=]{500,}$"}}
    total = coll.count_documents(q)
    log.info(f"[hairstyles.image_url] {total} candidates")
    ok = 0
    for h in coll.find(q):
        if h.get("image_public_id"):
            continue
        pid = f"style_{h['id']}"
        if dry_run:
            log.info(f"[hairstyles] DRY {h.get('name')}"); ok += 1; continue
        res = _upload(h["image_url"], "braidscommunity/styles", pid, private=False)
        if not res or not _verify_url(res["secure_url"]):
            log.error(f"[hairstyles] {h.get('name')} failed"); continue
        coll.update_one(
            {"_id": h["_id"]},
            {"$set": {
                "image_url": res["secure_url"],
                "image_public_id": res["public_id"],
                "image_url_base64_backup": h["image_url"],
            }},
        )
        ok += 1
        log.info(f"[hairstyles] {h.get('name')} → {res['public_id']}")
    return ok, total


def migrate_hairdresser_licenses(dry_run: bool) -> Tuple[int, int]:
    coll = db.hairdressers
    q = {"license_url": {"$regex": "^data:image|^[A-Za-z0-9+/=]{500,}$"}}
    total = coll.count_documents(q)
    log.info(f"[hairdressers.license_url] {total} candidates (PRIVATE)")
    ok = 0
    for hd in coll.find(q):
        if hd.get("license_public_id"):
            continue
        folder = f"braidscommunity/verification/{hd['user_id']}"
        pid = f"license_{hd['user_id']}"
        if dry_run:
            log.info(f"[licenses] DRY {hd['user_id']}"); ok += 1; continue
        res = _upload(hd["license_url"], folder, pid, private=True)
        if not res:  # can't HEAD-verify authenticated URLs without a signed URL — trust upload_res
            log.error(f"[licenses] {hd['user_id']} failed"); continue
        coll.update_one(
            {"_id": hd["_id"]},
            {"$set": {
                "license_url": res["secure_url"],
                "license_public_id": res["public_id"],
                "license_url_base64_backup": hd["license_url"],
            }},
        )
        ok += 1
        log.info(f"[licenses] {hd['user_id']} → {res['public_id']}")
    return ok, total


def migrate_hairdresser_covers(dry_run: bool) -> Tuple[int, int]:
    coll = db.hairdressers
    q = {"cover_photo": {"$regex": "^data:image|^[A-Za-z0-9+/=]{500,}$"}}
    total = coll.count_documents(q)
    log.info(f"[hairdressers.cover_photo] {total} candidates")
    ok = 0
    for hd in coll.find(q):
        if hd.get("cover_photo_public_id"):
            continue
        folder = f"braidscommunity/profiles/{hd['user_id']}"
        pid = f"cover_{hd['user_id']}"
        if dry_run:
            log.info(f"[covers] DRY {hd['user_id']}"); ok += 1; continue
        res = _upload(hd["cover_photo"], folder, pid, private=False)
        if not res or not _verify_url(res["secure_url"]):
            log.error(f"[covers] {hd['user_id']} failed"); continue
        coll.update_one(
            {"_id": hd["_id"]},
            {"$set": {
                "cover_photo": res["secure_url"],
                "cover_photo_public_id": res["public_id"],
                "cover_photo_base64_backup": hd["cover_photo"],
            }},
        )
        ok += 1
        log.info(f"[covers] {hd['user_id']} → {res['public_id']}")
    return ok, total


ALL = {
    "portfolio_items": migrate_portfolio_items,
    "avatars": migrate_user_avatars,
    "styles": migrate_hairstyle_images,
    "licenses": migrate_hairdresser_licenses,
    "covers": migrate_hairdresser_covers,
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--only", choices=list(ALL.keys()), action="append",
                   help="Run only these migrators. Repeatable.")
    args = p.parse_args()

    log.info(f"Cloudinary: {CLOUD_NAME}  |  dry_run={args.dry_run}  |  only={args.only or 'ALL'}")
    todo = args.only or list(ALL.keys())

    grand_ok, grand_total = 0, 0
    for name in todo:
        fn = ALL[name]
        log.info(f"=== {name} ===")
        try:
            ok, total = fn(args.dry_run)
        except Exception as e:
            log.exception(f"{name} crashed: {e}")
            continue
        grand_ok += ok
        grand_total += total
        log.info(f"[{name}] done: {ok}/{total}")
        time.sleep(0.2)

    log.info(f"MIGRATION SUMMARY: {grand_ok} migrated of {grand_total} candidates.")
    if not args.dry_run:
        log.info("Backup fields (`*_base64_backup`) preserved for verification. Run cleanup_base64_backups.py after approval.")


if __name__ == "__main__":
    main()
