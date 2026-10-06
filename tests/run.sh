#!/usr/bin/env bash
# TimothyOS test runner.
#   tests/run.sh            run everything
#   tests/run.sh bridge     only the Apps Script bridge tests (no browser needed)
#
# Needs: node, python3. Browser tests also need Playwright with Chromium
# (globally installed, or `npm i -D playwright` in the repo root).
# Screenshots land in tests/out/ (gitignored).
set -u
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
fail=0
pids=()

run() {  # run <file>: passes if node exits 0 and no page errors were printed
  local out
  out=$(timeout 180 node "$1" 2>&1); local code=$?
  if [ $code -ne 0 ] || echo "$out" | grep -qE "errors \[ *'|errors: \[ *'|AssertionError|TimeoutError"; then
    echo "FAIL  $1"; echo "$out" | sed 's/^/      /'; fail=1
  else
    echo "PASS  $1"; [ -n "${VERBOSE:-}" ] && echo "$out" | sed 's/^/      /'
  fi
}

echo "== Bridge (Apps Script, simulated Google + Notion)"
run bridge_calendar.test.js
run bridge_notion.test.js
[ "${1:-}" = "bridge" ] && exit $fail

echo "== App (browser, against simulated bridges)"
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT
(cd .. && exec python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1) & pids+=($!)
python3 mock_v10.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.0: calendars only      :8090
python3 mock_v11.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.1: + capture           :8092
python3 mock_v12.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.2: + Notion tasks      :8093
python3 mock_v13.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.3: + Key Dates         :8094
python3 mock_v14.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.4: + done (Balance)    :8095
sleep 1.5

run app_e2e.test.js       # linking, Day/Week/Month, detail, offline cache, phone width
run app_e2e6.test.js      # Capture: old bridge warning, save, validation, offline queue, failure
run app_e2e7.test.js      # Capture: tap a Week slot, phone layout
run app_e2e9.test.js      # Plan Day + Priorities against Notion tasks
run app_e2e10.test.js     # Google's transient 404s are retried
run app_e2e11.test.js     # Key Dates: panel, DATES screen, markers, capture, Plan Day line
run app_e2e12.test.js     # lost replies: already-saved items clear without duplicates
run app_e2e13.test.js     # Bridge overview: condition, panels, weather, balance, log, settings

echo
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME TESTS FAILED"
exit $fail
