#!/usr/bin/env bash
# TimothyOS test runner.
#   tests/run.sh            run everything
#   tests/run.sh bridge     only the Apps Script bridge tests (no browser needed)
#   JOBS=1 tests/run.sh     browser lanes one at a time (default 3 side by side)
#
# Needs: node, python3. Browser tests also need Playwright with Chromium
# (globally installed, or `npm i -D playwright` in the repo root).
# Screenshots land in tests/out/ (gitignored).
set -u
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
fail=0
pids=()

run() {  # run <file>: passes if node exits 0 and no page errors were printed; returns 1 on a failure
  local out t0=$SECONDS
  out=$(timeout 180 node "$1" 2>&1); local code=$?
  if [ $code -ne 0 ] || echo "$out" | grep -qE "errors \[ *'|errors: \[ *'|AssertionError|TimeoutError"; then
    echo "FAIL  $1  ($((SECONDS - t0))s)"; echo "$out" | sed 's/^/      /'; fail=1; return 1
  else
    echo "PASS  $1  ($((SECONDS - t0))s)"; [ -n "${VERBOSE:-}" ] && echo "$out" | sed 's/^/      /'
  fi
  return 0
}

echo "== Bridge (Apps Script, simulated Google + Notion)"
run bridge_calendar.test.js
run bridge_notion.test.js
run bridge_ask.test.js
run bridge_voice.test.js
run bridge_schema.test.js
run bridge_year.test.js
run bridge_inbox.test.js
run bridge_science.test.js
run version_sync.test.js
run speak_text.test.js
run sci_sky.test.js
run app_names.test.js
run bridge_ledger.test.js
run bridge_log.test.js
run bridge_habits.test.js
run bridge_tarot.test.js
run bridge_tarotbooks.test.js
run bridge_apiary.test.js
run bridge_logsearch.test.js
run bridge_logask.test.js
[ "${1:-}" = "bridge" ] && exit $fail

echo "== App (browser, against simulated bridges)"
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "${lanes_dir:-}"; }
trap cleanup EXIT
python3 ../tools/ia_fetch.py --selftest || exit 1   # the Internet Archive fetcher: picking, naming, the query (offline)
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
python3 mock_v21.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.14: + Habits, Library  :8102
python3 mock_v22.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.16: + Log search      :8103
python3 mock_v23.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.23: + Growth, holidays :8104
python3 mock_v24.py >/dev/null 2>&1 & pids+=($!)   # bridge 1.24/1.25: + Tarot, books :8105
python3 mock_relay.py 8110 >/dev/null 2>&1 & pids+=($!)   # Storage relay (NAS), one per lane that uses it: 8110
python3 mock_relay.py 8111 >/dev/null 2>&1 & pids+=($!)   #                                                8111
python3 mock_relay.py 8112 >/dev/null 2>&1 & pids+=($!)   #                                                8112
# Wait until every server answers (the relays make their sample audio with ffmpeg first).
python3 - <<'PY' || { echo "FAIL  a simulated server never started"; exit 1; }
import socket, time, sys
ports = [8080, 8090, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8110, 8111, 8112]
end = time.time() + 60
for p in ports:
    while True:
        try: socket.create_connection(("127.0.0.1", p), 0.5).close(); break
        except OSError:
            if time.time() > end: sys.exit(1)
            time.sleep(0.2)
PY

# LANES. The simulated bridges keep state between requests (saves, counters, switched modes), so every test that
# uses a given bridge or relay runs in one lane, in the order below, exactly as it always has; separate lanes share
# nothing (each relay lane has its own relay, RELAY_PORT) and run side by side, up to $JOBS at once, longest first.
# A lane is: name|environment|tests…   Comments name what each test covers.
LANES=(
  "tarot-apiary|RELAY_PORT=8112|app_e2e38.test.js app_e2e39.test.js app_e2e40.test.js app_e2e41.test.js app_e2e42.test.js app_e2e43.test.js app_e2e44.test.js app_e2e46.test.js app_e2e47.test.js app_e2e48.test.js app_e2e49.test.js app_e2e50.test.js app_e2e51.test.js app_e2e52.test.js app_e2e53.test.js app_e2e55.test.js"
  "log-storage|RELAY_PORT=8110|app_e2e26.test.js app_e2e27.test.js app_e2e28.test.js app_e2e29.test.js app_e2e30.test.js app_e2e31.test.js app_e2e32.test.js app_e2e33.test.js"
  "calendars|-|app_e2e.test.js app_e2e6.test.js app_e2e7.test.js app_e2e9.test.js app_e2e10.test.js app_e2e11.test.js app_e2e12.test.js"
  "growth-engineering|RELAY_PORT=8111|app_e2e34.test.js app_e2e35.test.js app_e2e36.test.js app_e2e37.test.js app_e2e56.test.js"
  "bridge-sync|-|app_e2e13.test.js app_e2e14.test.js app_e2e15.test.js"
  "log-loom|-|app_e2e22.test.js app_e2e23.test.js"
  "stations|-|app_e2e24.test.js app_e2e25.test.js"
  "review|-|app_e2e16.test.js"
  "ask|-|app_e2e17.test.js"
  "review-log|-|app_e2e18.test.js app_e2e45.test.js"
  "farm|-|app_e2e19.test.js"
  "ledger|-|app_e2e20.test.js"
  "updates|-|app_e2e54.test.js"
)
#   app_e2e        linking, Day/Week/Month, detail, offline cache, phone width
#   app_e2e6       Capture: old bridge warning, save, validation, offline queue, failure
#   app_e2e7       Capture: tap a Week slot, phone layout
#   app_e2e9       Plan Day + Priorities against Notion tasks
#   app_e2e10      Google's transient 404s are retried
#   app_e2e11      Key Dates: panel, DATES screen, markers, capture, Plan Day line
#   app_e2e12      lost replies: already-saved items clear without duplicates
#   app_e2e13      Bridge overview: condition, panels, weather, balance, log, settings
#   app_e2e14      sync: dropped and background-cut requests retried, quiet outages, pacing
#   app_e2e15      ignored events: weekend blocks left out of views and totals
#   app_e2e16      Weekly Review: Sunday reminder, screen, drafts, save/update in Notion
#   app_e2e17      Ask: snapshot, THINK HARDER, confirm-to-change cards, budget, hand-off, summary
#   app_e2e18      Review log: landing page, trends, list by month, patterns, four questions
#   app_e2e19      farm calendar: standby until linked, then live everywhere, captures, review hours
#   app_e2e20      Ledger: YNAB figures, average spend, Replicator Queue, finances kept out of Ask
#   app_e2e21      Motion + standby: press, rise-in, sheets, + details, Reduce Motion, idle, night, wake (alone, last)
#   app_e2e22      Captain's Log: PIN, calendar, write/autosave, edit, locks, import, kept out of Ask
#   app_e2e23      Time Loom: swipe direction, taps, fetching ahead, layout
#   app_e2e24      Stations (pins + ALL STATIONS), Habits, Library
#   app_e2e25      NEEDS YOU on Systems: steps per error, jump tab, back to green
#   app_e2e26      LOG search: index progress, exact word, results, NEWER/OLDER, lock forgets
#   app_e2e27      LOG authorization: code word + four digits, keyboard, timed lockout (after e2e26: same mock)
#   app_e2e28      Faster task list: split batches, a new day shows the last list at once (UPDATING)
#   app_e2e29      Easter eggs (see CLAUDE.md)
#   app_e2e30      Bulleted lists in LOG and REVIEW (after e2e27: code-word PIN on the same mock)
#   app_e2e31      Log Ask: scopes, preview, send, follow-up, save, insights; REVIEW summary behind the code
#   app_e2e32      LEDGER: fresh from YNAB on opening, pull to refresh, REFRESH
#   app_e2e33      HOLODECK → AUDIO (was STORAGE; entered through the arch): relay setup, folders, player, resume on this iPad, pill, filters, read-ahead hand-off
#   app_e2e55      RESSIKAN: sound on, beat ring, synth, hold, drift, record to Files, quiet on leaving, settings kept
#   app_e2e56      HOLODECK: channels from /Video (flat; a series in seasons), in order, skipped files, lengths, guide, tune in mid-stream, next video, CH ▲▼/dial/guide switching, rename, remove, 2.45 migration, leave = off, 2.47 arch (VISUAL/AUDIO, ◇ ARCH), one at a time, radio band, 2.48 NETWORK style (show folders, UP NEXT)
#   app_e2e54      UPDATE READY: real service worker, two versions published to a copy on :8125, each comes up whole
#   app_e2e34      GROWTH: renamed area, Growth calendar linked: Today, Horizon, Balance, Capture, Review
#   app_e2e35      HOLIDAYS: beside Key Dates, never counted, filter, hide, Systems row
#   app_e2e36      BREAKS: whole-title breaks shown despite ignored Out of office, never counted as work
#   app_e2e37      ENGINEERING: Home Assistant through the relay, toggles, sensors, UPKEEP, CONDITION
#   app_e2e38      TAROT: Bridge card, readings, Celtic Cross, meanings, spreads, Review, Ask option
#   app_e2e39      TAROT BOOKS: IMPORT in steps, BOOKS drawer, SUGGEST, ADD/DISMISS, history, never stored (after e2e38)
#   app_e2e40      TYPING SURVIVES SAVING: cursor and text kept while saves land, every field has an id
#   app_e2e41      LENGTHS + GOALS: track lengths from MP3/M4A/FLAC/WAV headers, water goal history
#   app_e2e42      TRACK # for every tag layout, retagged files, READ TAGS AGAIN
#   app_e2e43      OPEN IN CLAUDE: question first, sections left out to fit, marker + note, clipboard
#   app_e2e44      APIARY: yard, hive, checks, new check, TRUE UP STACK, add a hive, yard list, RETRY, phone width
#   app_e2e45      BACKUP AND RESTORE: pending saves wait, locked file, exactly the iPad-only settings, restore on a fresh install, allow-list

lanes_dir=$(mktemp -d)
run_lane() {  # run_lane <index>: the lane's tests in order; its report goes to a file, a marker file if any failed
  local spec="${LANES[$1]}" name env tests t0=$SECONDS
  name="${spec%%|*}"; env="${spec#*|}"; tests="${env#*|}"; env="${env%%|*}"
  (
    [ "$env" != "-" ] && export "$env"
    echo "-- lane $name"
    for t in $tests; do run "$t" || touch "$lanes_dir/$1.failed"; done
  ) > "$lanes_dir/$1.log" 2>&1
  echo "   lane $name done in $((SECONDS - t0))s"
}
export VERBOSE="${VERBOSE:-}"
JOBS="${JOBS:-3}"
help wait 2>/dev/null | grep -q -- "-n" || JOBS=1   # bash before 4.3: one lane at a time
started=$SECONDS; lane_pids=()
for i in "${!LANES[@]}"; do
  if [ "$JOBS" -le 1 ]; then run_lane "$i"; continue; fi
  while [ "$(jobs -rp | grep -cxFf <(printf '%s\n' "${lane_pids[@]:-0}"))" -ge "$JOBS" ]; do wait -n; done   # the servers never finish, so count only lanes
  run_lane "$i" & lane_pids+=($!)
done
[ ${#lane_pids[@]} -gt 0 ] && wait "${lane_pids[@]}"   # not a bare wait: that would wait on the servers too
for i in "${!LANES[@]}"; do cat "$lanes_dir/$i.log"; [ -e "$lanes_dir/$i.failed" ] && fail=1; done
# Timing-sensitive (samples the standby fade frame by frame), so it runs alone once the lanes are done.
echo "-- alone"
run app_e2e21.test.js || true
echo "   browser tests took $((SECONDS - started))s"

echo
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME TESTS FAILED"
exit $fail
