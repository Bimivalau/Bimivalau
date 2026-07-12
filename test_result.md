#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  P0 bug: Professional Onboarding Navigation Trap. Braiders were being trapped on
  /pro/onboarding after completing Weekly Availability. Fix must satisfy:
  - Onboarding can only be completed once; state permanently stored in backend
  - Back arrow always works; Android hardware Back also works
  - Returning users never get trapped on the onboarding screen
  - Users are redirected to /pro/dashboard after completing onboarding
  - Onboarding remains accessible only from Settings, Improve My Studio, or Edit Availability
  - Verify after app restart, logout/login, and fresh install

backend:
  - task: "POST /api/hairdressers/me/onboarding-complete idempotency + upsert safety"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Reworked endpoint: adds onboarding_completed_at timestamp, uses upsert with
          $setOnInsert as a defensive safety net if hairdresser record is missing.
          Response now returns {ok: true, completed: true}. Guard still rejects
          completion when no weekly availability is set (400).
  - task: "GET /api/hairdressers/me/onboarding-status persistence across sessions"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          No signature change. Must confirm that completed=true persists across
          logins for the same hairdresser after complete-onboarding is called once.

frontend:
  - task: "Professional Onboarding no longer traps braiders (/pro/onboarding)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/onboarding.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Full rewrite of onboarding screen:
          - useFocusEffect reloads status and auto-redirects to /pro/dashboard if
            backend reports completed=true (self-heal for returning users).
          - Android BackHandler now routes hardwareBackPress to /pro/dashboard.
          - Back arrow always goes to /pro/dashboard (never a dead-end).
          - "Start Receiving Bookings" replaces stack with /pro/dashboard on success.
          - Added a persistent "Skip for now — go to Dashboard" escape hatch.
          - Robust load() error state with retry + "Go to Dashboard" fallback.
  - task: "Pro Dashboard shows Complete Setup banner instead of redirecting"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/dashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Removed the forced router.replace('/pro/onboarding') useEffect that
          caused the trap. Incomplete pros now see a "Complete your Studio setup"
          banner at the top of the dashboard that navigates to /pro/onboarding.
          Also added "Improve My Studio" entry row under the action grid so
          onboarding is reachable explicitly.
  - task: "Root routing / on cold start never traps braiders on onboarding"
    implemented: true
    working: "NA"
    file: "frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          On onboarding-status fetch failure the app now falls back to
          /pro/dashboard (safer) instead of /pro/onboarding.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 11
  run_ui: true

test_plan:
  current_focus:
    - "Professional Onboarding no longer traps braiders (/pro/onboarding)"
    - "Pro Dashboard shows Complete Setup banner instead of redirecting"
    - "POST /api/hairdressers/me/onboarding-complete idempotency + upsert safety"
    - "GET /api/hairdressers/me/onboarding-status persistence across sessions"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      P0 Onboarding Navigation Trap fix ready for testing.

      BACKEND CHANGES (server.py):
      - onboarding-complete now upserts and stamps onboarding_completed_at.
      - Response contract: {ok: true, completed: true}.

      FRONTEND CHANGES:
      - app/pro/onboarding.tsx rewritten (self-heal, BackHandler, escape hatch,
        error retry, "Skip for now").
      - app/pro/dashboard.tsx: removed forced redirect; added "Complete your
        Studio setup" banner and "Improve My Studio" row.
      - app/index.tsx: onboarding-status failure now falls back to dashboard.

      TESTS TO RUN:
      Backend:
      1. Register a new hairdresser → GET onboarding-status → expect
         completed=false, has_availability=false.
      2. POST onboarding-complete without availability → expect 400.
      3. PUT /availability/me with at least one day → GET onboarding-status →
         expect has_availability=true.
      4. POST onboarding-complete → expect 200 {ok:true, completed:true}.
      5. GET onboarding-status → expect completed=true.
      6. Re-POST onboarding-complete → should still return 200 (idempotent).
      7. Login again with the same credentials → GET onboarding-status must
         still return completed=true (persistence).

      Frontend:
      1. New hairdresser register → lands on /pro/onboarding (checklist).
      2. Tap "Set Weekly Availability" → set Mon 09:00-18:00 → Save →
         back arrow → returns to /pro/onboarding with green check on the
         Required item and "Start Receiving Bookings" enabled.
      3. Tap "Start Receiving Bookings" → lands on /pro/dashboard,
         NO redirect back to onboarding.
      4. From dashboard, tap the "Improve My Studio" row →
         /pro/onboarding opens → since completed=true, it auto-redirects
         back to /pro/dashboard (self-heal).
      5. Tap "Skip for now — go to Dashboard" from onboarding while
         incomplete (fresh account) → lands on /pro/dashboard, sees
         "Complete your Studio setup" banner.
      6. Verify the back arrow on onboarding always navigates to
         /pro/dashboard.
      7. On Android emulator, verify hardware Back on onboarding also
         goes to /pro/dashboard.

      TEST CREDENTIALS: /app/memory/test_credentials.md.
      Existing seeded pros (amara/zara/kenya/simone @braids.demo) already
      have onboarding_completed=true — good for regression check that
      they never see /pro/onboarding at cold start.

## Iteration 12 — Architecture Refinement + Responsive Foundation

user_problem_statement: |
  Big architectural pass:
  - Onboarding must be strictly ONE-TIME. After completion, never route back.
  - Introduce permanent Professional bottom tab bar: Dashboard · Bookings · Growth · My Studio.
  - Create My Studio as the single source of truth for portfolio, availability,
    pricing/services, verification, studio info, business health, Braider DNA.
  - "Improve My Studio" always goes to My Studio (never onboarding), auto-
    focusing the first incomplete section.
  - Add real Services model (each Studio owns its own catalog with starting
    price, price_max, duration, hair_included, hair brands, hair lengths).
  - Global responsive UI primitives (PageContainer, SafeScrollView,
    ResponsiveHeading, Card, Badge, SectionTitle, BottomCTA, EmptyState,
    ErrorState, LoadingState, useResponsive).
  - Test at 320 / 360 / 390 / 412 / 430 widths for the 12 priority screens.

backend:
  - task: "ProfessionalServiceIn extended with price_max, hair_brands, hair_lengths, difficulty"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Existing model extended. Existing endpoints (/hairdressers/me/services GET/POST/DELETE) accept the new fields with sensible defaults."
  - task: "GET /api/hairdressers/me — returns own hairdresser profile"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New endpoint. Auth required, role must be hairdresser."
  - task: "GET /api/hairdressers/me/studio-status — per-section completion"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Returns {onboarding_completed, sections[], first_incomplete, progress}.
          Sections: availability(required), services, portfolio(>=3), info(bio+salon+city), verification.
  - task: "GET /api/studios/{hid}/services — public read-only Studio catalog"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Public endpoint; supports active_only=true|false query. Enriches each row with hairstyle_name + cover."
  - task: "POST /api/services/{sid}/toggle — flip active flag"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Only owner can toggle. Returns updated ServiceOut."

frontend:
  - task: "Professional bottom tab bar (Dashboard·Bookings·Growth·My Studio)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/_layout.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New Tabs layout under /pro/. Default tab is dashboard. Non-tab pages
          (onboarding, availability, portfolio, verification, services, studio-info)
          are hidden via href:null. Onboarding also hides the tab bar entirely.
  - task: "My Studio hub (permanent business home)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/studio.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Reads /hairdressers/me/studio-status; renders progress card and section
          rows (Availability, Services & Pricing, Portfolio, Studio Info,
          Verification). Auto-scrolls + highlights the section from ?focus= param
          or the backend's first_incomplete. Includes Business Insights deep-links
          to Growth. Subscription + Sign out live here (Studio replaces Profile
          permanently for pros).
  - task: "Bookings tab (calendar-style list)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/bookings.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Renders Today + Upcoming with responsive Card rows. Availability shortcut. Requests tile marked Coming soon."
  - task: "Services & Pricing CRUD (/pro/services)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/services.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New screen. Modal editor for hairstyle + custom name + starting price +
          optional max + duration + hair lengths + hair-included switch + notes.
          Live active/inactive toggle. Delete with confirmation. Uses new UI kit.
  - task: "Studio Info screen (/pro/studio-info)"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/studio-info.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Bio, salon name, city, address form. Uses PUT /api/hairdressers/me."
  - task: "Pro Dashboard rebuilt as command center"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/dashboard.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Complete rewrite. Removes old action grid + "Improve My Studio" row.
          Uses SafeScrollView, ResponsiveHeading, Card, Badge, SectionTitle.
          Shows: Complete Studio banner (routes to /pro/studio?focus=<key>),
          Verification banner (only pending/rejected), Today at a glance stats,
          Today's schedule + Upcoming lists. Sign out moved to My Studio.
  - task: "Global responsive UI primitives under src/ui/"
    implemented: true
    working: "NA"
    file: "frontend/src/ui/"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New library: useResponsive, PageContainer, SafeScrollView,
          ResponsiveHeading, Card, Badge, SectionTitle, BottomCTA, EmptyState,
          ErrorState, LoadingState. Central handling of safe-area, font scaling,
          narrow-phone padding, and content max-width. Used by all new pro screens.

metadata:
  test_sequence: 12
  run_ui: true

test_plan:
  current_focus:
    - "Professional bottom tab bar (Dashboard·Bookings·Growth·My Studio)"
    - "My Studio hub (permanent business home)"
    - "Services & Pricing CRUD (/pro/services)"
    - "Pro Dashboard rebuilt as command center"
    - "GET /api/hairdressers/me/studio-status — per-section completion"
    - "ProfessionalServiceIn extended with price_max, hair_brands, hair_lengths, difficulty"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 12 delivers the architectural refinement + responsive foundation.

      KEY CHANGES:
      1. New Tabs layout at /app/pro/_layout.tsx (Dashboard·Bookings·Growth·My Studio).
      2. My Studio (/pro/studio) is the permanent hub. Onboarding is one-time only.
      3. Dashboard rewritten; no more "Improve My Studio" row (removed to prevent
         duplicates with the My Studio tab).
      4. Services & Pricing (/pro/services) is a full CRUD screen.
      5. Studio Info (/pro/studio-info) form.
      6. Bookings tab shows today + upcoming appointments.
      7. Backend: ProfessionalServiceIn extended (price_max, hair_brands,
         hair_lengths, difficulty). New endpoints: GET /hairdressers/me,
         GET /hairdressers/me/studio-status, GET /studios/{hid}/services,
         POST /services/{sid}/toggle.
      8. New global UI primitives at /app/frontend/src/ui/ used by all new
         screens (SafeScrollView, PageContainer, Card, Badge, ResponsiveHeading,
         SectionTitle, BottomCTA, Loading/Empty/ErrorState, useResponsive).

      BACKEND TESTS:
      - GET /api/hairdressers/me/studio-status as amara — expect completed=true,
        5 sections, first_incomplete=services, percent=80.
      - POST /api/hairdressers/me/services with new payload including price_max,
        hair_brands, hair_lengths, difficulty → expect ok:true.
      - GET /api/hairdressers/me/services → expect the new fields to persist.
      - GET /api/studios/{hid}/services?active_only=false → public read.
      - POST /api/services/{sid}/toggle → flips active.
      - Regression: onboarding-complete + onboarding-status still work as
        before. All other endpoints unchanged.

      FRONTEND TESTS (Expo web at localhost:3000):
      1. Sign in as amara@braids.demo. Lands on /pro/dashboard (with tab bar).
      2. Verify tab bar has 4 tabs: Dashboard, Bookings, Growth, My Studio.
      3. Dashboard shows setup banner ("Complete your Studio setup — Services &
         Pricing"). Tap banner → /pro/studio, "Services & Pricing" row is
         highlighted momentarily.
      4. In My Studio, tap Services & Pricing → /pro/services opens. Add a
         service (Box Braids, $180, 240 min, Long) → save → visible in list.
      5. Toggle it off/on → active flag flips.
      6. Delete it → row disappears.
      7. Tap Growth tab → business score + charts render.
      8. Tap Bookings tab → Today + Upcoming lists render.
      9. Tap My Studio → Studio Information row → studio-info screen shows
         bio/salon/city; save.
      10. Register a NEW hairdresser → lands on /pro/onboarding (no tab bar).
          Set availability → Start Receiving Bookings → /pro/dashboard.
          Tab bar reappears. Dashboard shows Complete Setup banner (progress
          less than 100%).
      11. On the dashboard, tap the Complete Setup banner → /pro/studio with
          services focused (or whichever is first_incomplete).
      12. Sign out from My Studio → back to /welcome.
      13. Sign in as seeded amara → land on Dashboard (never on onboarding).
      14. Narrow width test at 320 × 680: dashboard, my studio, services list
          all render without overflow or clipped badges.

      TEST CREDENTIALS: /app/memory/test_credentials.md (amara/zara/kenya/simone
      @braids.demo password demo1234).

## Iteration 13 — Production Quality Audit Sprint

user_problem_statement: |
  Complete end-to-end audit of the entire application before Iterations 14–16.
  - No dead ends, no navigation loops, no broken routes
  - Retrofit priority screens to /src/ui/ primitives
  - Safe-area top+bottom on every screen
  - KeyboardAvoidingView on every form (login, register, availability, portfolio,
    verification, booking detail, hairdresser detail report, AI note)
  - Hide unfinished operational features (Requests tile, forgot password, language picker,
    hairstyle share button); keep aspirational AI as elegant Coming Soon
  - Verify at 320/360/390/412/430 widths on iOS + Android
  - Global ErrorBoundary + StatusBar

frontend:
  - task: "Global root layout — ErrorBoundary + StatusBar + Stack animation"
    implemented: true
    working: "NA"
    file: "frontend/app/_layout.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New RootErrorBoundary catches uncaught render errors with a friendly Try Again screen. StatusBar dark-content translucent."
  - task: "Welcome — removed dead-end language picker, added a11y labels"
    implemented: true
    working: "NA"
    file: "frontend/app/welcome.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Login — removed dead-end 'Forgot password' link"
    implemented: true
    working: "NA"
    file: "frontend/app/login.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Register — safer back button + hit slop"
    implemented: true
    working: "NA"
    file: "frontend/app/register.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Hairstyle detail — removed dead-end share icon, safer back"
    implemented: true
    working: "NA"
    file: "frontend/app/hairstyle/[id].tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Pro Bookings — removed dead 'Requests' tile, added 'Services' quick tile"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/bookings.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Pro Availability — retrofitted to responsive kit, KeyboardAvoidingView, safer back, min touch targets"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/availability.tsx"
    priority: "high"
    needs_retesting: true
  - task: "Pro Portfolio — KeyboardAvoidingView + safer back + hit slop"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/portfolio.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Pro Verification — KeyboardAvoidingView + safer back"
    implemented: true
    working: "NA"
    file: "frontend/app/pro/verification.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Booking detail — KeyboardAvoidingView + safer back"
    implemented: true
    working: "NA"
    file: "frontend/app/booking/[id].tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Customer Profile tab — retrofit to responsive kit with Badges"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/profile.tsx"
    priority: "high"
    needs_retesting: true
  - task: "Notifications — retrofit to responsive kit, EmptyState, ErrorState, LoadingState"
    implemented: true
    working: "NA"
    file: "frontend/app/notifications.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "Favorites — retrofit to responsive kit + placeholder image fallback + safer back"
    implemented: true
    working: "NA"
    file: "frontend/app/favorites.tsx"
    priority: "medium"
    needs_retesting: true
  - task: "AIComingSoon component — retrofit to responsive kit + KeyboardAvoidingView"
    implemented: true
    working: "NA"
    file: "frontend/src/components/AIComingSoon.tsx"
    priority: "high"
    needs_retesting: true

test_plan:
  current_focus:
    - "Global root layout — ErrorBoundary + StatusBar + Stack animation"
    - "Pro Availability — retrofitted to responsive kit, KeyboardAvoidingView, safer back, min touch targets"
    - "Customer Profile tab — retrofit to responsive kit with Badges"
    - "Notifications — retrofit to responsive kit"
    - "Favorites — retrofit to responsive kit"
    - "AIComingSoon component — retrofit to responsive kit + KeyboardAvoidingView"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 13 = Production Quality Audit sprint. No new features.

      SUMMARY OF CHANGES:
      1. New global `RootErrorBoundary` — catches uncaught render errors.
      2. `_layout.tsx` — StatusBar dark-content translucent; slide_from_right stack anim.
      3. Retrofitted with /src/ui/ primitives (Card, Badge, SafeScrollView,
         ResponsiveHeading, LoadingState, EmptyState, ErrorState, BottomCTA):
         - (tabs)/profile.tsx (customer)
         - notifications.tsx
         - favorites.tsx
         - pro/availability.tsx (also fixed time input overflow at 320px)
         - AIComingSoon component (Style Match/Coach/Beauty Journal/Recommendations/Recreate Look/Price Alerts/Travel Planning)
      4. Added KeyboardAvoidingView to forms:
         - pro/availability.tsx, pro/portfolio.tsx, pro/verification.tsx
         - booking/[id].tsx
      5. Hardened all back buttons — router.canGoBack() ? router.back() : safe fallback.
      6. Added accessibility labels + hitSlop 12 + min touch target 44 on icon buttons.
      7. Hidden dead-end operational features:
         - welcome.tsx: dead language picker
         - login.tsx: "Forgot password" (backend not built)
         - hairstyle/[id].tsx: share button
         - pro/bookings.tsx: Requests tile (now shows Services shortcut instead)
      8. Escaped all unescaped apostrophes across the codebase (lint clean, no
         eslint errors — only warnings for unused vars).

      TEST BATTERY:

      Regression (BACKEND, must remain 189/189):
      - All existing pytest suites (iteration11 onboarding, iteration12 studio,
        iteration12_delete_fix, all previous 170 regression).

      FRONTEND FLOWS (Expo web at localhost:3000):
      Customer flow:
      1. Register a NEW customer at /welcome → email verification screen → skip.
      2. Sign in as sara@braids.demo → land on /home (tabs visible).
      3. Tab through Home → Discover → Bookings → Profile.
      4. Profile shows updated card with CUSTOMER + FREE badges. Menu rows have icons in circles. Tap Notifications → renders EmptyState or list.
      5. Tap Favorites → renders empty state with "Browse studios" CTA.
      6. Tap My Saved Styles → collections.
      7. Sign out → returns to /welcome.
      8. /welcome — verify NO language picker; only English chip static.
      9. Hairstyle detail — verify NO share button; only back + save.
      10. Login — verify NO "Forgot password" link.

      Pro flow:
      1. Sign in as amara@braids.demo → /pro/dashboard with tab bar.
      2. Tap Bookings → verify NO "Requests" tile; there IS a "Services" tile that opens /pro/services.
      3. Tap Growth → renders (no back arrow, it's a tab).
      4. Tap My Studio → tap Availability row → /pro/availability at 390px shows day toggles + time inputs; at 320px times still fit (was clipped, now fixed).
      5. Save availability → success message.
      6. Tap My Studio → Portfolio → renders; upload button visible.
      7. Tap My Studio → Verification → renders "Live Studio, Verified adds..." pitch.
      8. Tap /ai/style-match (deep link) — hero renders, waitlist form is not clipped by keyboard, "Notify me" button minHeight ≥48.
      9. Regression: onboarding one-time flow still self-heals; Services CRUD still works; My Studio focus scroll still fires; Studio Info save still works.

      Responsive matrix (320/360/390/412/430):
      Please verify on 320×680 and 430×860 that:
      - No horizontal overflow anywhere
      - No clipped badges on My Studio rows
      - Bottom CTAs never hidden behind Android nav bar
      - Time inputs in Availability show fully
      - Setup banner "Complete your Studio setup" wraps properly
      - Profile menu rows fit with icon+label+badge+chevron

      Report:
      - Any dead-end button or route
      - Any content trapped below safe area
      - Any keyboard-overlap on forms
      - Any layout defect at 320px

      Credentials: /app/memory/test_credentials.md. Amara has full setup. Sara is a customer.
