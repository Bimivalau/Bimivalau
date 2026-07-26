# BraidsCommunity

Mobile marketplace connecting customers with braid hairdressers ("braiders"/"pros"). Customers browse styles, compare braiders, and book — payment happens at the counter (no in-app payment processing yet). Braiders manage a "Studio": availability, services/pricing, portfolio, and optional license verification.

See `memory/PRD.md` for the full, versioned product spec (currently "v14") — read it before any nontrivial feature work.

## Tech Stack

- **Backend**: FastAPI + MongoDB (Motor, reference-based schema — no embedded documents), JWT auth (bcrypt password hashing), APScheduler for background jobs (auto-cancel unconfirmed bookings every minute; subscription maintenance every 6 hours).
- **Frontend**: Expo Router + React Native (Expo 54, React Native 0.81, React 19), file-based routing under `frontend/app/`.
- **Media**: Cloudinary signed direct-upload (backend never proxies image bytes; optional — features degrade gracefully if unconfigured).
- **Payments**: mocked (`subscription_service.py`); architected to swap in RevenueCat without a rework — see PRD "Store-submission checklist".
- **Subscription tiers**: disabled for year one by business decision — `platform_config.launch_mode` (default `true`) makes every customer and braider entitlement resolve to fully unlocked, and the handful of legacy `user.plan`-based 402 checks in `server.py` (portfolio caps, analytics/report access, Featured Stylist eligibility) are all short-circuited while it's on. The `subscriptions` collection, `plan` field, and `ENTITLEMENTS` matrix are untouched — flipping `launch_mode` to `false` via `PUT /api/subscription/admin/config` reactivates tiered gating with no code changes.
- **Auth**: email/password is fully self-contained; Google Sign-In is routed through Emergent's hosted OAuth broker (`auth.emergentagent.com`) — an external dependency, not something you can run offline.

## Repository Layout

```
backend/
  server.py                  # FastAPI app — ~3,500 lines, 100+ routes (monolith, not modularized)
  subscription_service.py    # Entitlements matrix, plan resolution, portfolio caps, trials
  notification_engine.py     # Channel-agnostic notifications (in-app live; push/email/sms stubbed)
  media.py                   # Cloudinary signed-upload helper
  requirements.txt
  scripts/
    seed.py                  # Seed/reseed local demo data (wraps POST /api/seed)
    migrate_portfolio_base64.py
    cleanup_base64_backups.py
  tests/                     # pytest suite, runs against a *live* backend (not mocked)
frontend/
  app/                       # Expo Router file-based routes
  src/
    api.ts                   # fetch wrapper; reads EXPO_PUBLIC_BACKEND_URL
    session.tsx              # auth/session context
    google-auth.ts           # Emergent-hosted Google OAuth flow
    ui/                      # shared responsive UI kit (Card, Badge, PageContainer, etc.)
memory/PRD.md                 # living product spec
test_result.md, test_reports/ # QA iteration history
```

## Data Model (Mongo collections, reference-based)

`users`, `hairdressers` (bio, service_area, verification_status, onboarding_completed, specialty_ids), `hairstyles`, `portfolio_items`, `availability`, `bookings` (6-char check-in code), `reviews`, `customer_ratings`, `subscriptions`, `featured_stylists`, `reports`, `notifications`, `interest_signups` (customer opt-in when a hairstyle has zero braiders — "Notify me when one joins"), `platform_config` (singleton, admin-editable runtime config).

## Running Locally

Assumes nothing is installed yet. Three moving pieces: MongoDB, the FastAPI backend, and the Expo frontend on your phone.

### 0. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for MongoDB)
- Python 3.11+ and `pip`
- Node.js 20+ and `yarn` (the project pins `yarn@1.22.22` via `packageManager` in `package.json`)
- [Expo Go](https://expo.dev/go) installed on your phone (App Store / Play Store)
- Your phone and computer on the **same Wi-Fi network**

### 1. Start MongoDB

```bash
docker run -d --name braids-mongo -p 27017:27017 mongo:7
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

> **Note:** `requirements.txt` includes `emergentintegrations`, a package published to Emergent's private index and not imported anywhere in `server.py` — it's unused dead weight from the platform template. If `pip install` fails resolving it, delete that one line (or `pip install -r requirements.txt` line-by-line skipping it) and continue; nothing in the app depends on it.

Create `backend/.env`:

```bash
MONGO_URL=mongodb://localhost:27017
DB_NAME=braidscommunity
JWT_SECRET_KEY=local-dev-secret-change-me
```

Optional (features no-op cleanly without them):
```bash
# Image uploads (portfolio/avatar/license) — without these, /api/media/sign returns 503
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email verification sending — without this, verification emails just aren't sent
RESEND_API_KEY=
SENDER_EMAIL=noreply@braidscommunity.app
```

Run the server, bound to `0.0.0.0` so your phone can reach it over LAN:

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The backend **auto-seeds demo data on first boot** if `hairstyles` is empty (see `_startup` in `server.py`), so this step alone gets you a fully populated database. To manually (re)seed at any point:

```bash
python scripts/seed.py            # no-op if already seeded
python scripts/seed.py --force    # wipe and reseed all demo data
```

This creates the hairstyles catalog and these accounts (password **`demo1234`** for all):

| Email | Role |
|---|---|
| `sara@braids.demo` | customer |
| `admin@braids.demo` | admin |
| `amara@braids.demo` | braider |
| `zara@braids.demo` | braider |
| `kenya@braids.demo` | braider |
| `simone@braids.demo` | braider |

### 3. Find your computer's LAN IP

- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`
- Windows: `ipconfig` (look for IPv4 Address)

### 4. Frontend

```bash
cd frontend
yarn install
```

Create `frontend/.env`:

```bash
EXPO_PUBLIC_BACKEND_URL=http://<your-lan-ip>:8001
```

Use your machine's actual LAN IP here, **not** `localhost` — your phone resolves this independently over Expo Go.

```bash
npx expo start
```

Scan the QR code with the Expo Go app on your phone (iOS: Camera app; Android: Expo Go's built-in scanner). The app should load and you can log in with any demo account above.

### 5. Run the backend test suite (optional)

```bash
cd backend
pytest tests/
```

`tests/conftest.py` reads `EXPO_PUBLIC_BACKEND_URL` from `frontend/.env` and logs in as the seeded demo users, so the backend must be running and seeded first. Most tests (fixtures, onboarding, studio, subscription snapshots) pass cleanly against a freshly seeded DB. A few of the older `test_iterationN_*.py` files are narrative/stateful integration tests written against specific historical mutations from when they were authored — they may not all be green on a brand-new database, which is a pre-existing characteristic of that suite, not something the seed script can paper over.

## Known local-only caveats

- **Google Sign-In** depends on `https://auth.emergentagent.com`, a hosted service outside this repo — it should still work from a phone (it's a real reachable endpoint), but it's not something you're running locally. Email/password auth is unaffected.
- **CORS** is wide open (`allow_origins=["*"]`) — fine for local dev, worth tightening before any public deploy.
- **`POST /api/seed`** has no auth guard and, when called with `force=true`, wipes *all* bookings/reviews/subscriptions, not just demo ones — be careful running `--force` against a database with real data in it.
