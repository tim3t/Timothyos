# TimothyOS: working notes for Claude

Personal, LCARS-inspired life dashboard for Timothy, installed as a home-screen web app on his iPad. Single user. He works mostly from the iPad (Safari, a-Shell), not a computer.

Read `docs/DESIGN.md` (decisions D1 to D19, roadmap) and `CHANGELOG.md` before changing anything. `README.md` is Timothy's setup and daily-use guide: keep it accurate whenever behavior or setup changes.

## Architecture

```
iPad app (static, GitHub Pages: https://tim3t.github.io/Timothyos/)
  index.html · css/app.css · js/app.js (one IIFE, no build step) · sw.js (offline shell)
        │ HTTPS: GET ?key=…&action=… for reads, POST text/plain JSON {key, action, …} for writes
        ▼
Google Apps Script "bridge" (apps-script/Code.gs, runs as Timothy's personal Google account)
  ├─ CalendarApp: Work (read-only, shared to personal) + Personal (default calendar)
  └─ UrlFetchApp → Notion API (Notion-Version 2025-09-03)
       ├─ 🎯 Master Task List  db 6c4a440d571e49e0b4076c18d5712c1f  ds 2198e74a-792a-4301-b4a5-9b16249af496
       ├─ 🗓️ Key Dates         db 8184db37aacb4d96943b2067558b92ab  ds fd94b232-b63a-4e6a-bc8c-dad020821e32
       └─ 🧭 Weekly Reviews    db 459bcacdc38d4bad9f58b4579fa9f4fd  ds 02a65d24-fe78-4dda-bb27-69eededf9f95
     Both live under 🏠 Timothy's Life Hub (page 31893ad51450814c8a3be31c1f26aed8).
```

Current versions: **app 2.0.0**, **bridge 1.6.0**.

### Bridge actions

| Method | action | Does | Notes |
|---|---|---|---|
| GET | `ping` | version, capabilities, calendar + Notion status | |
| GET | `events` `from` `to` (epoch ms, ≤ 62 days) | Work + Personal events | declined personal events hidden; untitled = `Busy` |
| GET | `tasks` `day` (yyyy-mm-dd) | `focus` (Focus Date = day) + `open` tasks + Life Area options | |
| GET | `dates` | all key dates + Life Area and Type options | app computes yearly repeats and countdowns |
| GET | `week` `week` (Monday yyyy-mm-dd) `from` `to` (local midnights, ISO) | tasks finished (last edit in range), tasks picked (Focus Date in week), saved review | `reviewsError` set if Weekly Reviews isn't connected; the rest still returns |
| GET | `aispend` | this month's Ask spend `{month, usd, calls, budget, cap, cont}` and `log` (last 25 calls: time, mode, model, tokens, usd; never text) | |
| GET | `done` `days` (1 to 60) | Life Area + last-edit time of tasks marked Done | no titles; feeds the Bridge's Balance panel |
| POST | `create` `item{cid,area,title,allDay,start,end}` | new event on `personal`, or `farm` once linked | `WRITABLE` allow-list; Work can never be written |
| POST | `focus` `id` `day\|null` | sets Focus Date | page must belong to the Master Task List |
| POST | `status` `id` `status` | sets Status (allow-listed values) | same ownership check |
| POST | `addtask` `task{cid,title,area,priority,day}` | new To Do task | |
| POST | `adddate` `date{cid,title,start,end,area,type,yearly}` | new key date | |
| POST | `savereview` `review{week,title,wentWell,drained,nextFocus,bearing,summary,intents,byArea,hoursWork,hoursPersonal,hoursFarm,hoursHobbies,tasksDone,picked,pickedDone}` | create or update that week's page | upsert on Week Start; only fields sent are written |
| GET | `reviews` `limit` (1 to 104, default 60) | saved reviews, newest first (same shape as `week`'s `review`) | cached 5 min, cleared by `savereview`; error `notion_not_shared` if not connected |
| GET | `ledger` | `ynab{month, months[12], checking[], savings[], loans[] (balance, original), age[13]{month,days}, cats[]{id,name,group,m[12],now}, fundName, fund}` and `queue{items[], bought[]}` | YNAB read-only (GET only); `ynabError` / `queueError` reported separately |
| POST | `queueadd` `item{cid,title,cost,note,link}` | new Replicator Queue item at the bottom | cid cache 6 h |
| POST | `queueorder` `ids[]` | sets Priority 10, 20, 30… top to bottom | only ids in the queue; unchanged ones aren't written |
| POST | `queuebought` `id` `day\|null` | marks bought, or undoes it | only queue items |
| GET (or POST) | `logunlock` / `logdates` `pin` | every day with an entry (`dates[]`, no text) | all `log*` actions need `pin` = Script Property `LOG_PIN`; 5 misses → `log_locked` 15 min; `bad_pin` carries `left` |
| GET (or POST) | `logday` `pin` `date` | `entry{id,url,text,saved,other}` or null | text = paragraph blocks joined by blank lines; `other` = page holds blocks the LOG can't show |
| POST | `logsave` `pin` `date` `text` | create (Source Bridge) or update in place | unchanged paragraphs untouched; changed ones patched, extra ones deleted; `log_edit_in_notion` if `other` |
| POST | `logimport` `pin` `entries[≤10]{date,text}` | new pages (Source Diary import) | days that already have a page skipped, so resending is safe |
| POST | `ask` `{cid, mode: fast\|deep\|summary\|patterns, messages[{role,text}], context, ignore[]}` | Claude answers; returns `reply`, `proposals`, `model`, `cost`, `spend` | reads only; proposals are executed by the app after CONFIRM; cached by cid 10 min; stops at the monthly budget |
| POST | `aicontinue` | carry on past the reminder for the rest of this month (`AI_CONTINUE`) | |
| POST | `aispendset` `{usd}` | set this month's total to the Console's figure; logged as `matched` | |

Key refusals are distinct: `no_key` (request arrived without its details; a POST can become an empty GET on a Google redirect), `key_unreadable` (settings store answered empty), `unauthorized` (wrong key). The app's `transient()` retries the first two. Log reads go as GET via `logRead()` (falls back to POST on `unknown_action`). The written-days list is cached 6 h under `logdates` and updated in place by `logDatesAdd_()`; setup clears it.

Batched reads: `api()` holds batchable reads for 40 ms and sends them as GET `batch` (`calls` = JSON list, ≤ 8) when more than one is waiting; the bridge's `batch_()` runs each through `read_()` and returns `results[]`, each with its own ok/error. Falls back to single requests on `unknown_action`. `netPending` counts requests in flight (REFRESH NOW's spinner); `markRetried()` flags netlog entries for attempts `withRetry()` tried again.

Capabilities drive the UI: `read`, `create`, `tasks`, `dates`, `done`, `reviews`, `reviewlog` and `queue` (once `NOTION_TOKEN` is set), `log` (with `NOTION_TOKEN`), `logpin` (once `LOG_PIN` is set), `ledger` (once `YNAB_TOKEN` is set), `ask` (once `ANTHROPIC_API_KEY` is set). Every write is idempotent (cid cache for 6 h, or set-to-value), so retries are safe.

## Rules

- **Secrets never go in code, chat, or commits.** The access key and `NOTION_TOKEN` live only in the bridge's Script Properties (and the key in the iPad app). The repo is public.
- **Privacy:** the Life Hub holds private pages. Never open or read them without Timothy's explicit permission, and never put real personal data (task or date titles, Life Area names, people) in this public repo, including tests. The Notion integration is connected only to Master Task List, Key Dates, Weekly Reviews, Replicator Queue and Captain's Log; keep it that way. When reading the workspace to plan, read structure (schemas), not content.
- **Work calendar is read-only forever.** Don't add write paths for it.
- **Farm calendar** (bridge 1.8): area `farm`, ID only in Script Property `FARM_CALENDAR_ID` (never in code: its name is personal). `sources_()` leaves it out until set. The app's `setAreas()` moves `farm` from STANDBY_AREAS to LIVE when the bridge lists it, labels it with the calendar's name, and adds it to Capture's `WRITABLE`. Tests: `mock_v18.py` + `app_e2e19`.
- **Don't change Notion schemas or create databases** without asking first.
- UI copy and docs: **no em dashes**. **No emoji in the interface** (they clash with LCARS): show Notion labels through `bare()`, keep the raw value for writes. Flat marks (◆ ▲ ▼ ✕ ✓) are fine; ☀ ▶ ◀ ❄ are not (iPadOS draws them as emoji). `app_e2e13` checks this. Uppercase display labels use the Antonio font; keep the LCARS frame (elbow, chrome colors, area colors as tokens in `css/app.css`).
- Big touch targets (≥ 48 px), works offline, fits iPad landscape (1180×820 and 1133×744) and phone width (400 px, no horizontal scroll).

## The Bridge (overview screen)

`renderBridge()` in `js/app.js`. The app opens on it unless `tos.start.v1` is `"today"` (tests set that, so older tests still open on Today). It fetches events for today minus 6 to today plus 7 (`bridgeRange()`), so Horizon and Balance share one request.

- **Condition rules** live in `conditions()`: thresholds are constants at the top of the section (`HEAVY_HOURS`, `KD_WARN_DAYS`, `PICK_BY_HOUR`, `STALE_SYNC_MS`, `HIVE`). Keep README's rule table in step when they change. Items fixed on Systems carry `fix: tasks|sync|queue`; `fixTickets()` turns them into NEEDS YOU cards (`fixPanel()`, first on Systems) with steps from `fixSteps(code)` (error codes kept in `state.tasksErr.code` and `state.sync.code` via `errCode()`), a first-step button (`fixtasks`, `fixsync`, `fixqueue` through `fixRun()`) and a `data-jump` to `#sec-notion`, `#sec-conn` or `#sec-capture`. `#fixJump` is the right-edge tab, painted by `fixJumpPaint()` on render and scroll. A new Systems-bound Condition item needs a `fix` id and a ticket in `fixTickets()`. Test: `app_e2e25` (mock_v21 `tfail`).
- **Weather** is fetched from the iPad straight to Open-Meteo (`loadWeather()`), only when a location is set in Systems. Coordinates are rounded to 2 decimals.
- **Device-only data** (never sent to the bridge, never in the repo): `tos.place.v1`, `tos.bearings.v1`, `tos.log.v1` (the Bridge's one-line intent, not the journal). Bearings have no defaults on purpose: they are Timothy's own words and the repo is public.
- `render()` keeps focus and caret in a text field across re-renders (the Bridge re-renders every minute).
- **Visual rules:** use the type scale tokens in `css/app.css` (`--t-hero` 40, `--t-count` 28, `--t-title` 19, `--t-body` 17, `--t-sub` 15, `--t-label` 13, `--ls-label`). Each panel shows essentials; secondary readouts get class `ov-extra` and appear when its + (`moreBtn(key)`, state in `tos.bopen.v1`) is open. Don't add new font sizes.

## Weekly Review

`renderReview()` in `js/app.js`; anchor is the week's Monday, range is the week before through the week after. Due window `reviewDue()`: Sunday 14:00 to Tuesday night; the Bridge shows a yellow item until the week is saved (`savedWeeks`, `tos.rsaved.v1`, or a review returned by `week`). Unsaved writing is kept per week in `tos.rdraft.v1`. Hours: timed events only, overlaps within an area counted once, ignored events left out; current week counts up to now. `app_e2e16` covers it with `mock_v15`.

Review log: `state.rvLog` picks the landing page (`renderReviewLog()`) over one week; `go("review")` with no anchor opens the log, with an anchor opens that week. Saved reviews come from `reviews` (bridge 1.7) into `tos.rlog.v1`; `reviewMap()` overlays fresher ones from `state.weeks`. `logWeeks()` lists this week back to the first saved review. Trends use the numbers stored in each review; unsaved weeks are gaps. Charts are inline SVG sized to the content width so labels stay at label size; `.hit` rects show tooltips on tap or hover. PATTERNS sends the saved reflections with ask mode `patterns` (Sonnet, no tools); the answer is kept in `tos.rpatterns.v1`. The reflection's four questions are `REVIEW_FIELDS`. Tests: `mock_v17.py` + `app_e2e18`.

## Ledger

Bridge: `ynab_()` is the only YNAB call and only GETs; there is never a YNAB write path. `ynabLedger_()` caches 10 min, `ledgerMonth_()` caches each past month 6 h (reduced to age of money + spend per category). Spending leaves out deleted, hidden and internal categories and the Credit Card Payments group. The fund category is found by name (`LEDGER_FUND_CATEGORY`, default Discretionary). Replicator Queue: Notion DB `NOTION_QUEUE_DATABASE` (Name, Cost, Priority, Note, Link, Bought). App: `renderLedger()`, `avgSpend()` (skips months with no spending), `queueSend()`; finances reach Ask only through `ledgerBrief()` when `tos.aifin.v1` is set (off by default; Timothy's decision). Tests: `bridge_ledger.test.js`, `mock_v19.py` + `app_e2e20`.

## Captain's Log

Notion DB `NOTION_LOG_DATABASE` (Name = "Wednesday, October 7, 2026", Date, Source: Diary import / Bridge); the entry is the page body, one paragraph block per paragraph (blank lines separate them; `logParas_()` and the app's `logNorm()` must stay identical). The journal is Timothy's most private data: **never put entry text in the repo, tests, commits or chat summaries**, never cache it in the bridge, never store it on the iPad beyond `tos.ldraft.v1` (unsaved writing only, deleted once saved), and **never give Ask a path to it**. `bridge_log.test.js` asserts Ask's code doesn't call the log. App: `lg` state, `lockLog()` (called by `go()` entering or leaving LOG, `visibilitychange` hidden, `enterStandby()`, 10 min idle; flushes unsaved writing first), `renderLog()`, `logSave(pin)` (5 s debounce), `parseDiary()` for imports (headers like "Thursday, November 13, 2025"; same parser checked against the real export once, locally, never committed). `render()` skips redrawing LOG while its textarea has focus. The Bridge panel holding the daily intent is now titled INTENT + BEARING. Tests: `mock_v20.py` (PIN 135790) + `app_e2e22`.

## Time Loom

Screen `loom` (nav button under LOG, app 2.6). A canvas (`#lmCv` in `#lmStage`) draws a lemniscate with the focus day at the crossing: future on the upper-right strand, past lower-left (`lmPlace(d)`; Timothy chose this orientation from a sketch: keep it). **Swipe right = forward in time** (`lm.t = start + dx / pxDay`), wheel and keys match. State `lm` (`t` float days from today, `vel`, `target`, `drag`, `base`). Draws only while moving (`lmKick()` / `lmStep()`); `renderLoom()` builds the DOM once and on later renders only refreshes `lmData()` (events from `eventsFor(lmRange())` through `visible()`, key dates from `kdMarks()`) and the side panel (`lmPanel()`, header via `lmHead()`). `lmRange()` is 8 weeks around `lm.base`, which moves in 14-day steps on settle (`lmSettle()` → `refresh(false)`). Labels go through a collision pass; today's ring, beads and titles win. The pager arrows step a day (`page()`); `go("loom")` arrives with a short glide. Tests: `app_e2e23` (against `mock_v20`).

## Stations, Habits, Library

**Stations** (app 2.7): the bar is `#pins` (rendered by `renderNav()` from `pins()`: `tos.pins.v1` on the iPad, max 7, default TODAY WEEK LOOM REVIEW LOG HABITS LIBRARY) plus `#allBtn` (ALL STATIONS, where the empty `.fill` block was) and `#status`. `STATIONS` lists every screen with its group; `openLaunch()` shows `#launch` over `#content` (same grid cell); EDIT PINS (`state.pinEdit`) changes `tos.pins.v1`. Tests that click MONTH, DATES or LEDGER in the bar set the pre-2.7 pins with `addInitScript`. Never reuse the class `.standby` (it's the screensaver): launcher tiles use `.st-off`.

**Habits** (bridge 1.14, Notion `NOTION_HABITS_DATABASE`, one page per day: Meditated, Evening Walk checkboxes, `Water (L)` number in 0.5 steps, `Debit Card` select Did Not Swipe / Swiped). Actions: GET `habits` `from` `to` (≤ 400 days, cached 2 min, generation `hgen` bumped by writes), POST `habitset` `day{date,med,walk,water,card: kept|swiped|null}` (whole day, upsert on Date). App: `hb` state, `tos.habits.v1` (370 days), `tos.habitq.v1` (unsaved days; `setHabit()` → 700 ms → `flushHabits()`, retried on refresh, online and every 30 s after a failure), water goal `tos.habitcfg.v1`. `hWin()` decides a won day (water ≥ goal; card kept); a day with no page is "not recorded", never a miss. Review rollup (`habitsWeek()`, `habitsTrend()`) is computed from the Habits database, not stored in Weekly Reviews.

**Library** (Notion `NOTION_LIBRARY_DATABASE`: Title, Author, Status Want to Read / Reading / Read / Set Aside, Started, Finished, Rating 1 to 5, Notes, Cover url, Open Library url, Published). Actions: GET `library` (cached 5 min, `lgen`), POST `booksave` `book{cid | id, …}` (only fields sent are written; cover must be covers.openlibrary.org, link openlibrary.org; page must belong to the Library), POST `bookremove` `id` (to Notion's trash). App: `lb` state, `tos.library.v1`, optimistic changes put back on failure; Open Library search runs in the browser (`olSearch()`, 450 ms debounce). Tests: `bridge_habits.test.js`, `mock_v21.py` (:8102) + `app_e2e24`.

## Motion and standby

Motion is gated so background syncs never animate: `enterScreen()` adds `enter` + `grow-in` to `#content` only from `go()` and `page()`; other effects are classes added after a user-triggered render (`turn`, `opening`, `justdone`, `changed`) or `easeHeight()` / `slideFrom()`. Sheets open and close through `showSheet()` / `hideSheet()` (200 ms slide before `hidden`). The pointerdown `flash` gives every button the LCARS light-up. `prefers-reduced-motion` turns all of it off (CSS rule plus `calm()`).

Standby: `#standby` overlay over everything. `checkIdle()` every 15 s against `tos.standby.v1` (0, 5, 15 default, 30 minutes; skipped while typing). `STANDBY` in the top bar (`#idleBtn`) and Systems → STANDBY NOW enter it directly. The wake tap is handled on the overlay's click, so nothing underneath is pressed. Night look 22:00 to 06:00 dims the text, never the black layer. Drift of a few pixels each minute for OLED. Screen Wake Lock is requested while standby is on (re-requested on return and on the next tap). Tests: `app_e2e21` (uses `clock.install` for the timeout).

## Ask Claude

Bridge: `ask_()` in `Code.gs`, raw HTTP to the Messages API (Apps Script has no SDK). Models (`AI`): `claude-sonnet-5-5` for fast (effort `low`, `max_tokens` 6000) and summary (effort `medium`), `claude-opus-5-5` for deep (effort `medium`, `max_tokens` 12000); both get `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` and thinking blocks passed back unchanged. Script Property `AI_FAST_MODEL` may be `claude-haiku-5-5` or `claude-haiku-4-5` (no effort sent to 4.5, no fallbacks for either); `compareModels()` runs Sonnet, Opus and Haiku 5.5 side by side from the editor. Tools: `get_events`, `get_tasks`, `get_key_dates`, `get_week` (read) and `propose_*` (collected, never executed). Spend: `aiPrice_()` matches `AI_PRICES` by model-family prefix (dated names too; unknown models priced high and flagged `unknown`), kept in `AI_SPEND`, with one `AI_LOG` entry per question (no text). `AI_BUDGET_USD` (default 8) is the reminder: calls stop with `ai_budget` until `aicontinue` sets `AI_CONTINUE` to this month; `AI_CAP_USD` (default 10) is only shown, the real stop is the Console spend limit. App: `briefing()` builds the snapshot (ignored events already left out); `runProposal()` performs confirmed changes through the existing actions (addtask, focus, status, the capture queue for key dates and events, review drafts). Never add a web tool, a Work-calendar write, or any tool that writes without CONFIRM. Tests: `bridge_ask.test.js` (scripted API), `mock_v16.py` + `app_e2e17` (CONTINUE, MATCH, log).

## Life areas and colors

Chrome (2.8): `--chrome-a` orchid, `--chrome-b` tan, `--chrome-c` lavender, `--chrome-d` apricot (bar rhythm `BAR_COLORS`, RESOURCES group, a few section caps). `--hero` Command Gold is for the arm only (`.elbow` and `.topbar`, via `--arm`, `--arm-bar`, `--arm-glow`): keep the corner and the bar's left end the same color and never filter or shade one part alone, or a seam shows. Don't use gold or apricot for anything that means something (areas, status).

App areas: `work` (blue), `personal` (teal), `farm` (amber), `hobby` (coral). Notion Life Areas map via `taskArea()` in `js/app.js`: Work & Calling → work; SkyGarden Farm, Beekeeping → farm; Personal Growth → hobby; everything else → personal. The farm calendar is live once linked (bridge 1.8); the Hobbies calendar is still standby.

## Known quirks (already handled; don't "fix" them away)

- **No zoom, ever (2.7.2):** Safari zoomed the whole app on a quick double tap (a PIN with a repeated digit). `touch-action: manipulation` on html, body and controls turns double-tap zoom off without delaying taps; `gesturestart` and two-finger `touchmove` are cancelled; the viewport has `maximum-scale=1`. Don't add a "double-tap guard" that swallows the second touchend: it would drop the repeated digit. `app_e2e22` checks all of it.
- **Google's result page intermittently 404s** (about 1 in 8 requests) even though the script ran. `withRetry()` re-runs the request twice for `http_404`, `bad_json`, `http_5xx`. Re-fetching the same result URL does not help.
- **Dropped and background-cut requests:** iPadOS kills in-flight fetches when the app is backgrounded or the screen locks. `withRetry()` waits for `visibilitychange` and re-runs those, and retries `TypeError` drops (3 times). `slot()` caps bridge requests at 2 in parallel. A refresh failure over saved data shows `retrying`, not `offline`, until 3 in a row. `netlog` (Systems → Recent requests) records action, duration and outcome only, never data. `app_e2e14` covers this.
- **Lost replies:** a write can succeed while the reply is lost. `reconcileQueue()` clears queued items that already appear in loaded data, so they're never re-sent after the 6 h cid cache expires.
- iOS standalone apps don't reload on resume. `version.json` + the **UPDATE READY** banner handle updates; the service worker fetches the page with `cache: "no-cache"`.
- The app draws under the iPad status bar (`black-translucent`, `viewport-fit=cover`). Top clearance is `--safe-top` + `--top-gap` (fixed at 30 px since 2.7.3; the Systems setting was retired), with a solid `body::before` strip behind the bar. Overlays (`.scrim`) follow the visual viewport (`--vv-top`, `--vv-h` from `fitViewport()`) and pad by the same clearance, so ASK and CAPTURE stay below the status bar and above the keyboard. Don't switch the status-bar style meta: iOS reads it only at install, so Timothy would have to re-add the app and re-link.
- Plain GET and text/plain POST only, no custom headers: Apps Script can't answer CORS preflights.
- Calendar toggles (Work/Personal hidden) persist in localStorage and affect Day, Week, Month.
- **Ignored events** (`tos.ignore.v1`, title phrases, case-insensitive contains) are filtered inside `eventsFor()`, so every view and total skips them. Raw `state.ranges` stay unfiltered (reconcile needs them). The list is device-only: Timothy's real titles never go in the repo. `app_e2e15` covers it.

## Release checklist

1. Make the change. Keep `README.md`, `CHANGELOG.md` and (for decisions) `docs/DESIGN.md` in step.
2. `python3 tools/bump_version.py X.Y.Z` (updates app.js, sw.js, index.html, version.json). Without this the iPad keeps old files and no banner appears.
3. `tests/run.sh` must print `ALL PASSED`. Extend the matching test (and `tests/mock_v14.py`) when behavior changes. `app_e2e13` (the Bridge) uses strict asserts; follow that pattern.
4. Commit to `main` with the session attribution lines, push, then poll `https://tim3t.github.io/Timothyos/version.json` until it shows the new version (usually under a minute).
5. **Bridge changes** need Timothy: copy `https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs`, replace the code in script.google.com, run `setup` (check the log), then Deploy → Manage deployments → pencil → New version. Bump `VERSION` in `Code.gs` and say so clearly.
6. Tell Timothy: tap **UPDATE READY**, then (if needed) **SYSTEMS → REFRESH NOW**.

## Testing

`tests/run.sh` runs the bridge against simulated Google and Notion services (Node `vm`), then drives the real app in headless Chromium (Playwright) against simulated bridges `mock_v10` to `mock_v20`, in America/Chicago time with a fixed clock (deliberately not Timothy's Eastern time, so time-zone bugs show up). The app itself always uses the iPad's own time zone. Screenshots go to `tests/out/`. Real Google/Notion can't be tested here (no keys, by design); Timothy's first real run is the live check, so give him a concrete thing to verify.

Limit: the runner fails on crashes, page errors and timeouts, but most tests print their key values (event counts, toasts, saved items) instead of asserting them. Run `VERBOSE=1 tests/run.sh` and read the output after any change, and convert printed checks to `assert` calls when touching a test.

## Roadmap (standby modules)

- **Notes in Capture** (Notion).
- **Farm + Bees and Hobbies calendars**: separate Google calendars, add as toggles and Capture destinations.
- Later: Home Assistant; moving hosting to his NAS (or a Mac mini with a local model: only the bridge's `claude_()` call would change) after a hosting review.
