# BraidsCommunity — PRD

## Overview
A mobile marketplace app connecting customers with trusted braid hairdressers/salons through searchable style-tagged portfolios, verified reviews, and in-app booking. Payments happen at the counter. App monetizes through Standard vs Unlimited subscriptions (MOCKED toggle).

## Stack
- **Backend:** FastAPI + Motor (MongoDB), JWT auth (bcrypt + python-jose), APScheduler for 15-min auto-cancel job
- **Frontend:** Expo Router + React Native, expo-secure-store, expo-image, LinearGradient
- **Design:** Editorial Mobile Light — Playfair-like serif headlines, terracotta brand (#B65942), warm neutrals

## Roles (v1)
- Customer, Hairdresser (Admin deferred to v2)

## Key Features Implemented
- JWT email/password auth (register/login/me), role selection at signup
- Home discovery feed with categories + hero style
- Search with query, category, min-rating filters
- Hairstyle detail → matching hairdressers list (subscription-gated: top 3 + blurred address for Standard tier)
- Hairdresser profile: cover, badges (Verified Pro / Top Rated / Rising Talent), portfolio grid, reviews, availability, sticky "Book Now" bar
- Booking flow: pick style → date (14-day picker) → open slot → confirm with pay-at-counter policy
- My Bookings (upcoming/past tabs), check-in, cancel, complete (pro), no-show (pro)
- Reviews: only allowed on completed bookings, auto-updates hairdresser rating
- Favorites, Notifications, Subscription mock toggle (Standard/Unlimited)
- Pro Dashboard, Portfolio Manager (Standard cap = 10), Availability Manager (weekly hours)
- Auto-cancel job: APScheduler runs every 1 minute; cancels bookings where appointment_datetime + 15min < now and status still 'confirmed'
- Seed data: 6 hairstyles, 4 pros with portfolios, availability

## Deferred to v2
- Admin approval, reports moderation
- Real payments, RevenueCat
- Push notifications (in-app only for now)
- In-app messaging, referrals, multi-location salons
