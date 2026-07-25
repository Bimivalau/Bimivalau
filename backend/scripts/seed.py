#!/usr/bin/env python3
"""
Seed (or re-seed) local demo data.

This is a thin wrapper around the backend's own POST /api/seed endpoint —
the same seeding logic the app runs automatically on startup against an
empty database (see the `_startup` hook and `seed()` in server.py). It
creates the demo hairstyles catalog, the demo customer/admin accounts, and
four demo braiders with portfolios, availability, and specialties.

Usage:
    python scripts/seed.py                 # seed only if the DB is empty (no-op otherwise)
    python scripts/seed.py --force         # wipe and re-seed all demo data
    python scripts/seed.py --url http://localhost:8001
"""
import argparse
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / "frontend" / ".env")

DEMO_ACCOUNTS = [
    ("sara@braids.demo", "customer"),
    ("admin@braids.demo", "admin"),
    ("amara@braids.demo", "braider"),
    ("zara@braids.demo", "braider"),
    ("kenya@braids.demo", "braider"),
    ("simone@braids.demo", "braider"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--url",
        default=os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001",
        help="Backend base URL (default: $EXPO_PUBLIC_BACKEND_URL or http://localhost:8001)",
    )
    parser.add_argument("--force", action="store_true", help="Wipe and re-seed all demo data, even if already seeded")
    args = parser.parse_args()

    endpoint = f"{args.url.rstrip('/')}/api/seed"
    try:
        resp = requests.post(endpoint, params={"force": str(args.force).lower()}, timeout=30)
    except requests.RequestException as exc:
        print(f"Could not reach backend at {endpoint}: {exc}", file=sys.stderr)
        print("Is the backend running? e.g. uvicorn server:app --host 0.0.0.0 --port 8001", file=sys.stderr)
        sys.exit(1)

    if resp.status_code != 200:
        print(f"Seed request failed: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)

    status = resp.json().get("status")
    print(f"Seed status: {status}")
    if status == "already_seeded" and not args.force:
        print("Demo data already present. Re-run with --force to wipe and reseed.")
    else:
        print("Seeded: hairstyles catalog, sara (customer), admin, and 4 braiders.")

    print("\nDemo accounts (password: demo1234):")
    for email, role in DEMO_ACCOUNTS:
        print(f"  {email:<24} {role}")


if __name__ == "__main__":
    main()
