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
