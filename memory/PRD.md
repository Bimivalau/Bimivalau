# BraidsCommunity — PRD (v1)

## Overview
Mobile marketplace connecting customers with braid hairdressers. Pay at counter. Monetization via Standard vs Unlimited subscriptions.

## Stack
- **Backend**: FastAPI + MongoDB (reference-based), JWT auth, APScheduler (1-min auto-cancel), bcrypt.
- **Frontend**: Expo Router + React Native, expo-secure-store fallback, expo-image, LinearGradient.
- **Payments**: MOCKED subscription toggle. Real Stripe/RevenueCat = v2.
- **Push notifications**: skipped v1 (in-app notifications only).

## Roles
- **Customer**: browse, book, check-in via code, review
- **Hairdresser**: register with extended profile → onboarding wizard → dashboard with today's schedule → portfolio/availability/(optional) verification
- **Admin**: Verification queue + Customer flag queue (booking-restricted appeals)

## Core Screens
- **Welcome/Splash** (`/welcome`) — role choice: "I'm a Customer" or "I'm a Braider"
- **Login / Register** (`/login`, `/register`) — customer flow is minimal; pro flow requires name, email, phone (private), bio, service area, specialties
- **Pro Onboarding** (`/pro/onboarding`) — checklist: Availability (required) + Portfolio + Optional Verification. Sets `onboarding_completed=true`.
- **Home** — Featured Stylist of the Week (weighted rotation) + trending hairstyles + categories
- **Search** — filters + subscription gating
- **Hairstyle detail → Hairdresser list** (gated for Standard)
- **Hairdresser profile** — Portfolio/Reviews/About + Report user + sticky Book Now
- **Portfolio Viewer** — full-screen swipeable, Standard capped
- **Booking flow** — date/slot picker + pay-at-counter notice; generates 6-char code
- **Booking detail** — code display + check-in-by-code (either party) + review (customer) + rate customer / flag (pro)
- **My Bookings**, **Favorites**, **Notifications**
- **Subscription** — monthly/yearly toggle, founding-pro badge, real pricing
- **Admin** — Verifications queue + Customer flag queue

## Data Model
Collections (reference IDs, not embedded):
- `users` — flag_count, booking_restricted, plan (cached from subscriptions)
- `hairdressers` — bio, service_area, verification_status (unverified/pending/approved/rejected), onboarding_completed, specialty_ids
- `hairstyles`, `portfolio_items`, `availability`
- `bookings` — booking_code (6-char, no 0/O/1/I), status lifecycle
- `reviews` (customer → pro, tied to completed booking)
- `customer_ratings` (pro → customer, tied to booking, with optional flag)
- `subscriptions` — plan_type, billing_interval, is_founding_pro, promo_expires_at
- `featured_stylists` — weekly picks (weighted by rating + inverse-recency)
- `reports`, `notifications`

## Subscription Logic
- **Founding Pro promo**: First 10 pros (by `hairdressers.count_documents()` at register time) get `is_founding_pro=true`, `plan=unlimited`, `price=0`, `promo_expires_at = now + 365d`. `/api/subscriptions/subscribe` returns "already on promo" if invoked during window.
- **Regular Unlimited**: monthly $19 (pro) / $8 (customer). Yearly = **20% off** monthly × 12 → $182.40 (pro) / $76.80 (customer). Yearly discount % returned from API for display.
- **Auto-downgrade**: on any read, expired founding-pro subs are set to `status=expired` and `users.plan=standard`.
- Legacy `/api/auth/plan` retained for backward compat with earlier iterations.

## Two-Way Trust
- Pro rates customer after `completed` or `no_show`. Optional flag with reason.
- Each flag increments `users.flag_count`. Threshold = **3 flags** → `booking_restricted=true` → all future `POST /bookings` return 403 with a clear message.
- Restricted accounts surface in **Admin Customer Flag Queue** with recent flag details. Admin can lift, keep, or remove. Never silent, never auto-permanent.

## Verification
- Optional and self-serve. New pros default to `unverified` and are **immediately live in search**.
- Submit → status=pending, `submitted_at`. Admin has 3-day SLA. `overdue=true` after 3d.
- License field accepts URL or base64 data-URI (stored as string).
- Rejection includes reason; rejected → resubmit flow with pre-filled URL.

## Platform & Publishing
- **v1 targets**: Android + iOS only, via Emergent's Publish to Stores.
- Requires: Apple Developer ($99/y) + Google Play Console ($25 one-time), paid directly to platform.
- Store timelines: Google Play same-day; Apple 1–3 business days on first submission.
- Windows/desktop deferred — web preview covers desktop for v1.
- Expo Go is dev-preview only; actual store submissions use signed prod builds.

## MVP Scope Delivered (v1)
- ✅ Welcome/role-choice splash
- ✅ Customer + Pro auth with extended pro fields
- ✅ Pro onboarding wizard with completion gating
- ✅ Search & subscription-gated hairdresser lists
- ✅ Portfolio viewer with Standard cap
- ✅ Booking + 6-char code + check-in-by-code + APScheduler 15-min auto-cancel
- ✅ Reviews on completed bookings + Pro rates Customer with flag → auto-restrict at 3
- ✅ Founding Pro promo (10 slots) + monthly/yearly billing intervals with 20% yearly discount
- ✅ Featured Stylist of the Week (weighted, cached weekly)
- ✅ Optional license verification with 3-day SLA
- ✅ Admin: verification queue + customer flag queue
- ✅ Reports (customer → user)

## Deferred to v2
- Real payment processor (Stripe / RevenueCat)
- Push notifications
- In-app messaging, referrals/loyalty, multi-location salons, salon kiosk
- Windows/desktop native app

---

## v12 Update — Studio Architecture Refinement

### Professional bottom tab bar (permanent)
`/pro/_layout.tsx` — 4 tabs, always visible: **Dashboard**, **Bookings**, **Growth**, **My Studio**.
Default tab on login = Dashboard. Onboarding hides the tab bar (first-run only).

### My Studio (`/pro/studio`)
Permanent business hub — replaces "Profile" for pros. Sections:
- Weekly Availability (required)
- Services & Pricing (new — braider-owned catalog)
- Portfolio
- Studio Information (bio, salon name, city)
- Verification
- Business Insights deep-links (Business Success Score, Braider DNA → Growth)
- Subscription, Sign out

Auto-focuses `?focus=<section>` param or the backend's `first_incomplete`.

### Onboarding
Strictly ONE-TIME. Self-heals to /pro/dashboard when `onboarding_completed=true`.
"Improve My Studio" and any post-onboarding flow routes to /pro/studio (never /pro/onboarding).

### Services model (backend)
Each Studio owns its own catalog on top of the shared hairstyle taxonomy.
Fields: hairstyle_id, custom_name, price (starting), price_max, duration_minutes,
hair_included, hair_brands[], hair_lengths[] (Short/Mid-length/Long/Extra Long),
difficulty, description, active.

Customer view: "Starting at $X" with note that final varies by hair length/size/density.

### New endpoints
- `GET /api/hairdressers/me` — own profile
- `GET /api/hairdressers/me/studio-status` — per-section completion + first_incomplete
- `GET /api/studios/{hid}/services` — public read-only Studio catalog
- `POST /api/services/{sid}/toggle` — flip active flag

### Responsive UI kit (`/app/frontend/src/ui/`)
`useResponsive`, `PageContainer`, `SafeScrollView`, `ResponsiveHeading`, `Card`,
`Badge`, `SectionTitle`, `BottomCTA`, `LoadingState`, `EmptyState`, `ErrorState`.
Handles safe-area, narrow-phone padding (16 / 18 / 20 / 24), clamped font
scaling (0.9–1.3x), and content max-width 640.

## Permanent Development Rule — Quality Gate
Every iteration ends with:
1. Functionality (screens, endpoints, navigation, both platforms, no traps)
2. Regression (auth, onboarding, subs, uploads, dashboards, discover, growth)
3. Production polish (spacing, states, animations, error handling)
4. Performance (API, rendering, images)
5. Security (authz on new endpoints, isolation of user resources)
6. Release readiness score

---

## v14 Update — Subscription Architecture (Mock now, RevenueCat-ready)

### Backend
- `subscription_service.py`: entitlements matrix, launch mode override, trial-aware plan resolution, portfolio caps (max(base, trial)), Founding Pro state, upgrade CTAs.
- `notification_engine.py`: channel-agnostic emit (in-app active, push/email/sms/whatsapp stubbed). Per-user preferences. Every notification records status + timestamp per channel.
- `platform_config` singleton doc holds: `launch_mode`, `trials`, `founding_pro`, `portfolio_caps`, `notification_channels`, `pricing`. Admin-editable via `PUT /api/subscription/admin/config`.
- Daily maintenance (6-hourly): Founding Pro reminders 30/14/7/1 day, expiration → free, trial-ending reminders, cancel-at-period-end downgrade.

### Frontend
- `EntitlementsProvider` + `useEntitlements()` — one call, full snapshot.
- `PaywallSheet` — elegant modal, monthly/yearly, trial CTA, restore purchases, legal.
- `Gated` — inline lock card that opens the paywall.
- `PurchaseProvider` interface — MockProvider active, RevenueCatProvider stubbed and gated by env keys.
- `/subscription` rewritten with launch-mode banner, Founding Studio CTA, per-role plans, savings badges.
- `/pro/founding` — spots counter, benefits, apply flow with eligibility gate.

### Business rules
- Launch mode ON: `customer.ai.*` unlocked for FREE customers. Braider plans unaffected.
- Trials: 30 days for Braider Standard/Unlimited, 0 for Customer Unlimited (all config-driven).
- Founding Pro: first 100 braiders w/ admin approval, 1 year Unlimited, auto-downgrade to Free after (never charged).
- Portfolio caps: 10 / 25 / 40 for Free / Standard / Unlimited. Excess photos hidden but never deleted on downgrade.

### Store-submission checklist
When ready to activate real purchases:
1. `yarn expo install react-native-purchases`
2. Uncomment RevenueCat provider (`src/purchase/revenuecatProvider.ts`).
3. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
4. Admin: `PUT /api/subscription/admin/config {"launch_mode": false}` to activate paid customer plans.
