"""
Post-verification cleanup: removes all `*_base64_backup` fields written by
migrate_portfolio_base64.py. **DO NOT RUN** until you have manually verified
that the migrated images render correctly in the app.

Usage:
  cd /app/backend && python scripts/cleanup_base64_backups.py --confirm

Without --confirm this only reports counts.
"""
from __future__ import annotations
import argparse
import os
import sys
import logging

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("cleanup")

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# (collection, backup_field)
TARGETS = [
    ("portfolio_items", "photo_url_base64_backup"),
    ("users",           "profile_photo_base64_backup"),
    ("hairstyles",      "image_url_base64_backup"),
    ("hairdressers",    "license_url_base64_backup"),
    ("hairdressers",    "cover_photo_base64_backup"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm", action="store_true", help="Actually remove the backup fields.")
    args = ap.parse_args()

    total = 0
    for coll_name, field in TARGETS:
        coll = db[coll_name]
        c = coll.count_documents({field: {"$exists": True}})
        log.info(f"{coll_name}.{field}: {c} records")
        total += c
        if args.confirm and c:
            r = coll.update_many({field: {"$exists": True}}, {"$unset": {field: ""}})
            log.info(f"  → removed {r.modified_count}")

    if not args.confirm:
        log.warning(f"DRY MODE — {total} backup fields would be removed. Re-run with --confirm to purge.")
    else:
        log.info(f"Cleanup complete. {total} backup fields removed.")


if __name__ == "__main__":
    main()
