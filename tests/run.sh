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
run bridge_ask.test.js
run bridge_ledger.test.js
run bridge_log.test.js
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
python3 mock_v15.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.5: + Weekly Review     :8096
python3 mock_v16.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.6: + Ask (scripted)    :8097
python3 mock_v17.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.7: + review log        :8098
python3 mock_v18.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.8: + farm calendar     :8099
python3 mock_v19.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.9: + ledger + queue    :8100
python3 mock_v20.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.10: + Captain's Log    :8101
sleep 1.5

run app_e2e.test.js       # linking, Day/Week/Month, detail, offline cache, phone width
run app_e2e6.test.js      # Capture: old bridge warning, save, validation, offline queue, failure
run app_e2e7.test.js      # Capture: tap a Week slot, phone layout
run app_e2e9.test.js      # Plan Day + Priorities against Notion tasks
run app_e2e10.test.js     # Google's transient 404s are retried
run app_e2e11.test.js     # Key Dates: panel, DATES screen, markers, capture, Plan Day line
run app_e2e12.test.js     # lost replies: already-saved items clear without duplicates
run app_e2e13.test.js     # Bridge overview: condition, panels, weather, balance, log, settings
run app_e2e14.test.js     # sync: dropped and background-cut requests retried, quiet outages, pacing
run app_e2e15.test.js     # ignored events: weekend blocks left out of views and totals
run app_e2e16.test.js     # Weekly Review: Sunday reminder, screen, drafts, save/update in Notion
run app_e2e18.test.js     # Review log: landing page, trends, list by month, patterns, four questions
run app_e2e19.test.js     # farm calendar: standby until linked, then live everywhere, captures, review hours
run app_e2e20.test.js     # Ledger: YNAB figures, average spend, Replicator Queue, finances kept out of Ask
run app_e2e22.test.js     # Captain's Log: PIN, calendar, write/autosave, edit, locks, import, kept out of Ask
run app_e2e21.test.js     # Motion + standby: press, rise-in, sheets, + details, Reduce Motion, idle, night, wake
run app_e2e17.test.js     # Ask: snapshot, THINK HARDER, confirm-to-change cards, budget, hand-off, summary

echo
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME TESTS FAILED"
exit $fail
