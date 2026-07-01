#!/usr/bin/env bash
# test-api.sh — Smoke-test the query-wise API routes.
#
# Usage:
#   bash scripts/test-api.sh [--base-url <url>] [--auth-token <clerk-session-token>]
#
# Options:
#   --base-url    Base URL of the running app (default: http://localhost:3000)
#   --auth-token  Clerk session token for authenticated requests
#                 (pass as Authorization: Bearer <token>)
#
# Exit codes:
#   0  All executed tests passed
#   1  One or more tests failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
BASE_URL="http://localhost:3000"
AUTH_TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?'--base-url requires a value'}"
      shift 2
      ;;
    --auth-token)
      AUTH_TOKEN="${2:?'--auth-token requires a value'}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--base-url <url>] [--auth-token <token>]" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

# check <label> <actual_status> <expected_codes...>
#   Prints PASS or FAIL and increments the relevant counter.
#   expected_codes is a space-separated list of acceptable HTTP status codes.
check() {
  local label="$1"
  local actual="$2"
  shift 2
  local expected=("$@")

  local matched=0
  for code in "${expected[@]}"; do
    if [[ "$actual" == "$code" ]]; then
      matched=1
      break
    fi
  done

  if [[ $matched -eq 1 ]]; then
    echo "PASS  [${actual}]  ${label}"
    PASS=$(( PASS + 1 ))
  else
    local expected_str
    expected_str=$(printf '%s or ' "${expected[@]}")
    expected_str="${expected_str% or }"
    echo "FAIL  [${actual}]  ${label}  (expected ${expected_str})"
    FAIL=$(( FAIL + 1 ))
  fi
}

# get_status <url> [extra curl args...]
#   Returns the HTTP status code for a GET request, body is discarded.
get_status() {
  local url="$1"
  shift
  curl -s -o /dev/null -w "%{http_code}" "$@" -- "$url"
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo "========================================"
echo "  query-wise API smoke tests"
echo "  Base URL: ${BASE_URL}"
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
# Unauthenticated tests (no auth token needed)
# ---------------------------------------------------------------------------
echo "--- Unauthenticated tests ---"

# GET /api/auth
# The route only exposes POST; a GET request should return 405 (Method Not Allowed).
# Next.js automatically returns 405 when no GET handler is defined.
status=$(get_status "${BASE_URL}/api/auth")
check "GET /api/auth — route exists (405 Method Not Allowed)" "$status" "405"

# GET /api/public/shares/nonexistent-token
# getPublicDashboard will throw AppError("SHARE_REVOKED_OR_NOT_FOUND") → 404.
# If the route itself is unavailable for some reason, accept 500 as a secondary signal.
status=$(get_status "${BASE_URL}/api/public/shares/nonexistent-token-abc123")
check "GET /api/public/shares/nonexistent-token — route exists (404 not found)" "$status" "404"

echo ""

# ---------------------------------------------------------------------------
# Authenticated tests (skipped when --auth-token is not provided)
# ---------------------------------------------------------------------------
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "--- Authenticated tests: SKIPPED (no --auth-token provided) ---"
  echo "    Pass --auth-token <clerk-session-token> to run these tests."
else
  echo "--- Authenticated tests ---"

  AUTH_HEADER="Authorization: Bearer ${AUTH_TOKEN}"

  # GET /api/connections — list user's DB connections → 200
  status=$(get_status "${BASE_URL}/api/connections" -H "$AUTH_HEADER")
  check "GET /api/connections — list connections (200)" "$status" "200"

  # GET /api/connections/demo — get the demo connection → 200
  status=$(get_status "${BASE_URL}/api/connections/demo" -H "$AUTH_HEADER")
  check "GET /api/connections/demo — demo connection (200)" "$status" "200"

  # GET /api/conversations — list conversations → 200
  status=$(get_status "${BASE_URL}/api/conversations" -H "$AUTH_HEADER")
  check "GET /api/conversations — list conversations (200)" "$status" "200"

  # GET /api/dashboards — list dashboards → 200
  status=$(get_status "${BASE_URL}/api/dashboards" -H "$AUTH_HEADER")
  check "GET /api/dashboards — list dashboards (200)" "$status" "200"
fi

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$(( PASS + FAIL ))
echo "========================================"
echo "  ${PASS}/${TOTAL} tests passed"
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi

exit 0
