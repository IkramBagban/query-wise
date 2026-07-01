#!/usr/bin/env bash
# test-all.sh — Run all query-wise smoke tests.
#
# Usage:
#   bash scripts/test-all.sh [--base-url <url>] [--auth-token <clerk-session-token>] [--skip-worker]
#
# Options:
#   --base-url     Base URL of the running Next.js app (default: http://localhost:3000)
#   --auth-token   Clerk session token for authenticated API tests
#   --skip-worker  Skip the worker boot smoke test (useful when Redis/Postgres are not running)
#
# Exit codes:
#   0  All suites passed
#   1  One or more suites failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="http://localhost:3000"
AUTH_TOKEN=""
SKIP_WORKER=0

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
    --skip-worker)
      SKIP_WORKER=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--base-url <url>] [--auth-token <token>] [--skip-worker]" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
SUITE_PASS=0
SUITE_FAIL=0

run_suite() {
  local name="$1"
  local cmd=("${@:2}")

  echo ""
  echo "┌─────────────────────────────────────────────────────"
  echo "│  Suite: ${name}"
  echo "└─────────────────────────────────────────────────────"

  if "${cmd[@]}"; then
    echo ""
    echo "  → Suite PASSED: ${name}"
    SUITE_PASS=$(( SUITE_PASS + 1 ))
  else
    echo ""
    echo "  → Suite FAILED: ${name}"
    SUITE_FAIL=$(( SUITE_FAIL + 1 ))
  fi
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo "╔══════════════════════════════════════════════════════╗"
echo "║         query-wise — full smoke test run             ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Base URL  : ${BASE_URL}"
echo "║  Auth token: ${AUTH_TOKEN:+(provided)}"
echo "║  Auth token: ${AUTH_TOKEN:-(not provided — auth tests will be skipped)}"
echo "║  Worker    : $([ $SKIP_WORKER -eq 1 ] && echo 'SKIPPED (--skip-worker)' || echo 'enabled')"
echo "╚══════════════════════════════════════════════════════╝"

# ---------------------------------------------------------------------------
# 1. Frontend routes
# ---------------------------------------------------------------------------
FRONTEND_ARGS=("bash" "${SCRIPT_DIR}/test-frontend.sh" "--base-url" "${BASE_URL}")
run_suite "Frontend routes" "${FRONTEND_ARGS[@]}"

# ---------------------------------------------------------------------------
# 2. API routes
# ---------------------------------------------------------------------------
API_ARGS=("bash" "${SCRIPT_DIR}/test-api.sh" "--base-url" "${BASE_URL}")
if [[ -n "$AUTH_TOKEN" ]]; then
  API_ARGS+=("--auth-token" "${AUTH_TOKEN}")
fi
run_suite "API routes" "${API_ARGS[@]}"

# ---------------------------------------------------------------------------
# 3. Worker smoke test
# ---------------------------------------------------------------------------
if [[ $SKIP_WORKER -eq 1 ]]; then
  echo ""
  echo "  (worker smoke test skipped via --skip-worker)"
else
  run_suite "Worker boot + Redis + Postgres" node "${SCRIPT_DIR}/test-worker.mjs"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
SUITE_TOTAL=$(( SUITE_PASS + SUITE_FAIL ))

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  FINAL RESULT: ${SUITE_PASS}/${SUITE_TOTAL} suites passed"
if [[ $SKIP_WORKER -eq 1 ]]; then
  echo "║  (worker suite skipped)"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if [[ $SUITE_FAIL -gt 0 ]]; then
  exit 1
fi

exit 0
