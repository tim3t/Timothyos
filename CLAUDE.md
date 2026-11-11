# TimothyOS: working notes for Claude

Personal, LCARS-inspired life dashboard for Timothy, installed as a home-screen web app on his iPad. Since 2.34 the app is named **Bridge** (home-screen name, `<title>`, manifest); **TimothyOS** is the system it runs and stays in the top bar, the repo, storage keys (`tos.*`), the Notion integration name and backup file names. Single user. He works mostly from the iPad (Safari, a-Shell), not a computer.

**This file is the short version** (kept under 30 KB; a test fails if it grows past that). It holds what applies to every change: the architecture, the rules, code conventions, the release checklist and testing. Everything about one station or subsystem lives in its own file under `docs/notes/`: **before changing a station, read its notes file** (the index below), and `docs/notes/quirks.md` before "fixing" anything that looks odd. When a change teaches something worth keeping, write it in that station's notes file, not here.

`docs/DESIGN.md` holds the decisions (D1 to D75; its sections 1 to 13 are the original plan, kept as history) and `CHANGELOG.md` every release. Both are long: search them (`grep "D57" docs/DESIGN.md`, `grep -n "^## 2.59" CHANGELOG.md`) instead of reading them whole. `README.md` is Timothy's setup and daily-use guide: keep it accurate whenever behavior or setup changes.

**`docs/BACKLOG.md` is where parked work lives**: what is waiting on Timothy, what is agreed and not started, what was put off, and the roadmap. Whenever something is postponed, offered or promised in conversation, add it there in the same change; take it out when it is done. A conversation is summarized when it grows long, and anything kept only in chat is lost then.

## Notes index

| Area | File | Covers |
|---|---|---|
| Bridge actions | `docs/notes/bridge-actions.md` | Every bridge action: method, name, what it does, limits |
| App core | `docs/notes/app-core.md` | Redraws that keep the page still, the error log, requests and the page's security rules, the service worker, storage (a full store), motion and standby, life areas and colours |
| SYSTEMS | `docs/notes/systems.md` | Bridge version and Notion column checks, backup and restore, PROFILE SYNC, Upkeep in Notion, the weekly Notion export |
| The Bridge, briefing, COMPUTER | `docs/notes/bridge-screen.md` | The overview screen (Time Ribbon, Condition rules, weather, balance, holidays, breaks), the Morning Briefing, the Family calendar and WEEK strip, COMPUTER |
| REVIEW, LEDGER, TIME LOOM | `docs/notes/review-ledger-loom.md` | Weekly Review, Ledger (YNAB, read-only), Time Loom |
| LOG | `docs/notes/log.md` | Captain's Log (authorization, search, Log Ask, bulleted lists, Easter eggs) and SESSIONS |
| Stations, HABITS, LIBRARY, TAROT, APIARY | `docs/notes/stations-habits-library.md` | The station list and pins, Habits, growing text boxes, Tarot and its books, Apiary, Library |
| ENGINEERING | `docs/notes/engineering.md` | Home Assistant devices, controls, layout, Scenes (tos_ automations only) |
| ASK | `docs/notes/ask.md` | Ask Claude: tools, proposal cards, models, spending |
| INBOX | `docs/notes/inbox.md` | Notes captured to sort later |
| ASTROMETRICS | `docs/notes/astrometrics.md` | The Ship's Year |
| SCIENCE | `docs/notes/science.md` | Public feeds, sky traffic, ISS passes, the Science Log |
| HOLODECK | `docs/notes/holodeck.md` | Channels, the guide, commercial breaks, unreadable and undecodable videos, the relay, tools/ia_fetch.py |
| AUDIO | `docs/notes/audio.md` | The NAS relay, playback, lengths and tags |
| RESSIKAN | `docs/notes/ressikan.md` | The music station |
| MEALS | `docs/notes/meals.md` | Plan, groceries, log and rotation, recipes and COOK, the MEAL LIBRARY and photos |
| SICKBAY | `docs/notes/sickbay.md` | Health days from the Bridge Health shortcut, HEALTH_KEY, readiness, records |
| ARBORETUM | `docs/notes/arboretum.md` | The garden map, zones, Quick Glance |
| Known quirks | `docs/notes/quirks.md` | Things that look wrong and are deliberate: read before "fixing" odd behaviour |

## Architecture

```
iPad app (static, GitHub Pages: https://tim3t.github.io/Timothyos/)
  index.html · css/app.css · js/app.js (one IIFE, built from js/src/ by tools/build_app.py since 2.73.1) · sw.js (offline shell)
  │ HTTPS: POST text/plain JSON {key, action, …} for reads and writes (2.58, bridge 1.38; the key never in a URL)
  ▼
Google Apps Script "bridge" (apps-script/Code.gs, runs as Timothy's personal Google account)
  ├─ CalendarApp: Work (read-only forever, shared to personal), Personal (default calendar),
  │    farm (FARM_CALENDAR_ID) and Growth (GROWTH_CALENDAR_ID) once linked, US holidays (read-only)
  ├─ UrlFetchApp → Notion API (Notion-Version 2025-09-03), databases in CONFIG:
  │    🎯 Master Task List
  │    🗓️ Key Dates
  │    🧭 Weekly Reviews
  │    Replicator Queue, Captain's Log, Habits, Library, 🔮 Tarot, 📖 Tarot Books, 🐝 Apiary,
  │    📥 Inbox, 🔭 Science Log, 🛋️ Session Notes, 🛠 Upkeep, 🍽 Meals, 🍽 Dinners, 🩺 Sickbay
  │    (ids in CONFIG; data source ids looked up once and kept in Script Properties)
  ├─ UrlFetchApp → YNAB API (GET only, YNAB_TOKEN)
  ├─ UrlFetchApp → Claude Messages API (ANTHROPIC_API_KEY): ASK, Log Ask, briefing, summaries, sorting, tarot, Ship's Year
  ├─ UrlFetchApp → OpenAI speech (OPENAI_API_KEY): the briefing's AI voice
  └─ UrlFetchApp → SCIENCE feeds that need a server (adsb.lol, CelesTrak, eBird)
     All Notion databases live under one private hub page in Timothy's workspace (its id is not kept here).

iPad app, directly (no bridge): Open-Meteo (weather), Open Library (book search), and the NAS relay
  (Caddy + Tailscale on the NAS, read-only files for HOLODECK; /ha proxies Home Assistant for ENGINEERING),
  plus SCIENCE's public feeds (NOAA, USGS, NWS, NASA, iNaturalist, Overpass).

On the NAS, run by hand: tools/ia_fetch.py (public access TV from archive.org into a HOLODECK folder).
```

Current versions: **app 2.78.0**, **bridge 1.45.0** (release checklist step 2 keeps this line current).

## Rules

- **Secrets never go in code, chat, commits or notes:** `ACCESS_KEY`, `NOTION_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `YNAB_TOKEN`, `LOG_PIN`, `HEALTH_KEY`. **Health values** (anything from 🩺 Sickbay) never go in the repo, tests, mocks or commits either; tests use invented numbers. They live only in the bridge's Script Properties (and the access key in the iPad app). The NAS relay token, the Home Assistant token and the Tailscale auth key live only on the iPad (and in backups) or the NAS; the tailnet name and real NAS paths stay out of the repo. The repo is public.
- **Tarot books are copyrighted.** Passages from Timothy's two tarot books (Dean, Crispin) live only in his private 📖 Tarot Books database. Never put book text in this repo, tests, mocks, commits, published pages or artifacts; use placeholder text. The app keeps passages in memory only (never localStorage).
- **Privacy:** the Life Hub holds private pages. Never open or read them without Timothy's explicit permission, and never put real personal data (task or date titles, Life Area names, people) in this public repo, including tests. The Notion integration is connected only to Master Task List, Key Dates, Weekly Reviews, Replicator Queue, Captain's Log, Habits, Library, 🔮 Tarot, 📖 Tarot Books, 🐝 Apiary, 📥 Inbox and the later ones listed above, 🩺 Sickbay (health data) included (Timothy connects each one himself); keep it that way. When reading the workspace to plan, read structure (schemas), not content.
- **Work and Family calendars are read-only forever.** Don't add write paths for either (Family: bridge 1.42, `FAMILY_CALENDAR_ID`, area `family`, never in `WRITABLE`).
- **Google Drive (bridge 1.41, Timothy's choice):** only through the REST API with `drive.file` (the manifest's `oauthScopes`); never `DriveApp` (it needs the full Drive scope). The export only creates its own folders and files and trashes its own dated folders past `EXPORT.KEEP`. Never widen this scope.
- **Farm calendar** (bridge 1.8): area `farm`, ID only in Script Property `FARM_CALENDAR_ID` (never in code: its name is personal). `sources_()` leaves it out until set. The app's `setAreas()` moves `farm` from STANDBY_AREAS to LIVE when the bridge lists it, labels it with the calendar's name, and adds it to Capture's `WRITABLE`. Tests: `mock_v18.py` + `app_e2e19`.
- **Don't change Notion schemas or create databases** without asking first.
- UI copy and docs: **no em dashes**. **No emoji in the interface** (they clash with LCARS): show Notion labels through `bare()`, keep the raw value for writes. Flat marks (◆ ▲ ▼ ✕ ✓) are fine; ☀ ▶ ◀ ❄ are not (iPadOS draws them as emoji). `app_e2e13` checks this. Uppercase display labels use the Antonio font; keep the LCARS frame (elbow, chrome colors, area colors as tokens in `css/app.css`).
- **Mockups:** when Timothy asks for a mockup, publish it straight away as a private Artifact link he can open in Safari (his standing instruction, 2026-10-23; no need to ask first). Invented data only, as in tests.
- Big touch targets (≥ 48 px), works offline, fits iPad landscape (1180×820 and 1133×744) and phone width (400 px, no horizontal scroll).

## Code conventions

- **Edit `js/src/`, never `js/app.js`** (2.73.1, D69). The iPad still loads one file with one function and one shared scope; only the source is split. `tools/build_app.py` joins `js/src/*.js` in file-name order under a one-line BUILT FILE notice: `00-head.js` opens the function, `99-foot.js` closes it, and the parts between are its body at the usual two-space indent, so any part can call any other as before. After editing a part, run `python3 tools/build_app.py`; `tests/app_build.test.js` (first in the unit tests) fails until `js/app.js` is its exact build, which also catches a hand edit of `js/app.js`. Find code with `grep -n name js/src/*.js`. Parts: 01 core (constants, storage, dates, helpers, state), 02 bridge API and ERROR LOG, 03 calendar data (ranges, breaks, ignored events, visibility, sync), 04 the frame (header, nav, status) and DAY/WEEK/MONTH, 05 SYSTEMS (PROFILE SYNC, NEEDS YOU, version and schema checks, the export; `BRIDGE_WANT` and `BRIDGE_FEATURES` live here), 06 first-run link, detail sheet, CAPTURE, 07 key dates and Plan Day, 08 the Bridge screen, 09 briefing and voice, 10 REVIEW, 11 ASK, 12 LEDGER, 13 motion and Standby, 14 LOG and SESSIONS, 15 LOOM, list boxes, easter eggs, 16 stations and COMPUTER, 17 HABITS and LIBRARY, 18 AUDIO (the NAS player), 19 ENGINEERING and UPKEEP, 20 SCENES, 21 TAROT, 22 APIARY, 23 SCIENCE, 24 HOLODECK, 25 RESSIKAN, 26 INBOX, 27 MEALS, 28 ARBORETUM, 29 ASTROMETRICS, 30 backup and restore, 90 the app shell (growing text boxes, `render()`, `go()`, the click handlers, the update notice, the clock and start-up; always last before the foot, because its start-up code runs as the file loads and every part's `var`s must be set by then). New stations take the free numbers from 32 up (32 SICKBAY). A new station gets its own part, numbered between its neighbours (`27b-` is not allowed: use the next free number and renumber in a commit of its own, since order is the file order). Move code between parts only in a commit that changes nothing else, and check it with the build's line count.
- **One name, one thing.** `js/app.js` is one function; two top-level `var`s or functions with the same name silently merge (2.43.0's landmarks `lm` took over the Loom's `lm`; fixed in 2.44.0 as `slm`). `tests/app_names.test.js` fails on any repeat; new modules use a prefix or an inner function (as `rs` does).
- **CSS classes are global too.** A new class needs a prefix nobody uses (`hd-`, `rs-`, `sci-`, `nas-`…); grep `css/app.css` before naming one. Collisions so far: the guide's NOW row took the calendar's absolutely positioned `.now` (2.46, now `hd-now`); the arch cards took the guide's `.hd-prog` progress bar and drew 6 px tall (2.47, now `hd-pg`); scope taps took `.hit`, the charts' tooltip class (2.43, now `tap`).
- **Never attach a redraw to a request from inside a redraw.** Each redraw starts more requests and each answer redraws again: the HOLODECK picker froze on 18 folders (2.47.1). Gather the requests (one `Promise.all`), redraw once, and start reads from the click, not from the drawing code.
- **Every list kept for the session needs a refresh path.** Timothy adds relay folders and Notion rows while Bridge is open: the picker (2.48.1) and AUDIO's shares (2.48.3) each kept a stale list until reload. Reread on entry, on a timer, or on the user's step.
- **Text fields need a stable id** so `render()` can keep focus, caret and typed text (`docs/notes/quirks.md`).
- **The service worker never calls `skipWaiting()` on install** (`docs/notes/app-core.md`: Service worker).
- **In-app hints name README sections by their exact heading** ("Steps are in the README under <b>Connect Notion</b>"); rename a README heading and grep `js/app.js` for it.
- **Setup text describes a fresh install of the current version.** Don't add "needs bridge 1.N" to README setup steps; version needs belong in `BRIDGE_FEATURES` (the app names them) and the CHANGELOG.
- **Test servers:** `tests/run.sh` starts and stops its own. To stop a stray one, use a separate command of its own: `pgrep -f "[h]ttp.server 8080|[m]ock_" | xargs -r kill`. Never put `pkill` in a compound command (it matches the shell running it, which exits with 144).

## Release checklist

1. Make the change in `js/src/` and run `python3 tools/build_app.py`. Keep `README.md` (setup text describes a fresh install; Code conventions), `CHANGELOG.md`, the station's file in `docs/notes/`, `docs/BACKLOG.md` (anything put off or finished) and (for decisions) `docs/DESIGN.md` in step.
2. `python3 tools/bump_version.py X.Y.Z` (updates `js/src/01-core.js` and rebuilds `js/app.js`, then sw.js, index.html, version.json), and update **Current versions** at the top of this file. Without the bump the iPad keeps old files and no banner appears.
3. `tests/run.sh` must print `ALL PASSED` (stop stray test servers first, in a command of their own: Code conventions). Extend the matching test and its simulated bridge or relay when behavior changes; new checks are `assert` calls.
4. Commit to `main` with the session attribution lines, push. **CI (D72, `.github/workflows/ci.yml`) then runs the whole suite on GitHub and publishes only if it passes**: `tools/build_site.py`'s folder (the app's own files; notes, tests, tools, `js/src` and the bridge's code are not on the site). Allow about 15 minutes, then poll `https://tim3t.github.io/Timothyos/version.json` until it shows the new version. A red run publishes nothing (the iPads keep the last good version): read the run (GitHub MCP `actions_list` / `get_job_logs` for `tim3t/Timothyos`, or its screenshots artifact), fix, push again. Never skip or weaken a test to get a release out. Actions are pinned to full commits; `package-lock.json` pins Playwright (keep it at the version the local machine has). A new top-level folder the app loads from goes in `build_site.py`'s `PARTS` (its check fails until it does). ffmpeg reaches the runner from a copy kept in GitHub's cache (key `ffmpeg-debs-ubuntu-24.04-v1`), so an outage of Ubuntu's package server doesn't stop a release; if a new runner image makes the copy fail to install, the run installs from Ubuntu and the copy is stale: bump the key to `-v2`.
5. **Bridge changes** need Timothy: copy `https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs`, replace the code in script.google.com, run `setup` (check the log), then Deploy → Manage deployments → pencil → New version. Bump `VERSION` in `Code.gs`, set `BRIDGE_WANT` in `js/src/05-systems.js` to the same (then build) and add a line at the top of `BRIDGE_FEATURES` naming what it adds (`version_sync.test.js` fails otherwise), and say so clearly. Simulated bridges report `Code.gs`'s VERSION themselves (`BV`).
6. **`tools/ia_fetch.py`, `tools/split_ads.py` or `tools/fix_videos.py` changes:** after the push, put that commit's full hash in the README compose's raw address (a second, docs-only commit), and tell Timothy to change the address in his `ia-fetch` project on the NAS.
7. Tell Timothy: tap **UPDATE READY**, then (if needed) **SYSTEMS → REFRESH NOW**.

## Testing

**Prerequisites:** Node, Python 3, ffmpeg (the simulated relays make their sample audio and WebM video with it), and Playwright with Chromium (`require('playwright')` must resolve; `run.sh` sets `NODE_PATH` to the global npm root). Ports 8080, 8090 to 8112 and 8125 must be free. `tests/run.sh bridge` runs only the unit tests (bridge, app logic lifted out with `vm`, `ia_fetch.py --selftest`), no browser.

`tests/run.sh` runs the bridge against simulated Google, Notion, YNAB and Claude services (Node `vm`), then drives the real app in headless Chromium (Playwright) against simulated bridges `mock_v10` to `mock_v24` and the relay `mock_relay.py`, in America/Chicago time (deliberately not Timothy's Eastern time, so time-zone bugs show up). Most browser tests fix the clock (`page.clock.setFixedTime`, mostly 6 Oct 2026); about a dozen newer ones (e2e27, 32 to 35, 38 to 45) and some bridge tests run on the real date, so give any new date-dependent test a fixed clock, or it can pass one day and fail the next. The app itself always uses the iPad's own time zone. Screenshots go to `tests/out/`. Real Google/Notion can't be tested here (no keys, by design); Timothy's first real run is the live check, so give him a concrete thing to verify.

**Lanes (2026-10-22):** the browser tests run in `LANES` (in `run.sh`), up to `JOBS` (default 3) side by side, longest first; about 5 minutes instead of 12. The simulated bridges keep state between tests (saves, counters, switched modes), so every test that touches a given mock port runs in the same lane, in the original order; lanes share nothing but the static page server. The relay is the one mock several lanes need, so each such lane gets its own (`mock_relay.py <port>`, `RELAY_PORT` 8110 / 8111 / 8112; tests read `process.env.RELAY_PORT`, default 8110). `app_e2e21` samples the standby fade frame by frame and runs alone after the lanes. A new browser test goes into the lane of the mock it uses (or a new lane if its mock is unused); never let two lanes use one mock port. `JOBS=1` runs lanes one at a time (also automatic on bash before 4.3). Each result line shows its seconds. Never end the lane wait with a bare `wait`: the servers are children too and never exit (it hung once).

What fails a test: a non-zero exit, an uncaught `AssertionError` or `TimeoutError`, or a printed `errors [...]` line that isn't empty (page errors). Since 2.50 the bridge and most browser tests assert their key values; a few older ones still print some (event counts, toasts) as well. Run `VERBOSE=1 tests/run.sh` to read that output, and convert printed checks to `assert` calls when touching a test.

Writing tests: arrays from `vm.runInNewContext` belong to another realm, so `deepStrictEqual` against a local array fails; compare JSON or items. The simulated bridges and relays keep state across tests in a lane (and across runs, if left running): use relative counts, or `mock_relay`'s `/__reset`. Test Chromium has no H.264, so test video is WebM. Each simulated bridge `mock_v10` to `mock_v24` is still the base of its own lane; folding them into one is a deferred cleanup.
