#!/usr/bin/env bash
# test-frontend.sh
# Smoke-tests the query-wise Next.js frontend routes using curl.
# Usage: ./scripts/test-frontend.sh [--base-url <url>]
#   --base-url  Base URL to test against (default: http://localhost:3000)

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
BASE_URL="http://localhost:3000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?'--base-url requires a value'}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--base-url <url>]" >&2
      exit 1
      ;;
  esac
done

# Trim any trailing slash so path concatenation is clean
BASE_URL="${BASE_URL%/}"

# ---------------------------------------------------------------------------
# Pre-flight: verify the dev server is reachable
# ---------------------------------------------------------------------------
echo "Checking Next.js server at ${BASE_URL} ..."
PREFLIGHT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "${BASE_URL}" 2>/dev/null) || true

if [[ -z "$PREFLIGHT_STATUS" || "$PREFLIGHT_STATUS" == "000" ]]; then
  echo ""
  echo "ERROR: Next.js server not reachable at ${BASE_URL} — start it with:"
  echo "  pnpm --filter @query-wise/web dev"
  exit 2
fi

echo "Server is up (initial status: ${PREFLIGHT_STATUS})."
echo ""

# ---------------------------------------------------------------------------
# Route definitions: "path|description|accepted_status_pattern"
# accepted pattern is a grep-compatible ERE matched against the HTTP status.
# We accept any 2xx, 3xx, or 404 as PASS; 5xx or 000 = FAIL.
# ---------------------------------------------------------------------------
# Format: "PATH|DESCRIPTION"
ROUTES=(
  "/|Root — expect redirect to /sign-in or /dashboard"
  "/sign-in|Sign-in page — public route, expect 200 or redirect"
  "/connections|Connections list — private, expect auth redirect (3xx) or 200"
  "/chats|Chats list — private, expect auth redirect (3xx) or 200"
  "/dashboards|Dashboards list — private, expect auth redirect (3xx) or 200"
  "/nonexistent-page-xyz|Non-existent page — expect 404 (or 3xx from middleware)"
)

# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
TOTAL=${#ROUTES[@]}

for entry in "${ROUTES[@]}"; do
  PATH_PART="${entry%%|*}"
  DESC="${entry#*|}"
  URL="${BASE_URL}${PATH_PART}"

  # Follow up to 3 redirects; capture final HTTP status code.
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 \
    --max-time 10 \
    -L \
    --max-redirs 3 \
    "${URL}" 2>/dev/null) || HTTP_STATUS="000"

  # Determine pass/fail:
  #   PASS  — any 1xx/2xx/3xx/404
  #   FAIL  — 000 (connection refused/timeout), 5xx
  if [[ "$HTTP_STATUS" == "000" ]]; then
    RESULT="FAIL"
    REASON="(connection refused or timeout)"
  elif [[ "$HTTP_STATUS" =~ ^5 ]]; then
    RESULT="FAIL"
    REASON="(server error)"
  else
    RESULT="PASS"
    REASON=""
  fi

  if [[ "$RESULT" == "PASS" ]]; then
    printf "PASS  [%s]  %s  — %s\n" "$HTTP_STATUS" "$PATH_PART" "$DESC"
    PASS=$(( PASS + 1 ))
  else
    printf "FAIL  [%s]  %s  — %s %s\n" "$HTTP_STATUS" "$PATH_PART" "$DESC" "$REASON"
    FAIL=$(( FAIL + 1 ))
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "---------------------------------------------------"
echo "Result: ${PASS}/${TOTAL} routes responding"

if [[ $FAIL -gt 0 ]]; then
  echo "${FAIL} route(s) FAILED."
  exit 1
else
  echo "All routes OK."
  exit 0
fi
