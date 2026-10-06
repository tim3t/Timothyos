# TimothyOS: working notes for Claude

Personal, LCARS-inspired life dashboard for Timothy, installed as a home-screen web app on his iPad. Single user. He works mostly from the iPad (Safari, a-Shell), not a computer.

Read `docs/DESIGN.md` (decisions D1 to D17, roadmap) and `CHANGELOG.md` before changing anything. `README.md` is Timothy's setup and daily-use guide: keep it accurate whenever behavior or setup changes.

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
       └─ 🗓️ Key Dates         db 8184db37aacb4d96943b2067558b92ab  ds fd94b232-b63a-4e6a-bc8c-dad020821e32
     Both live under 🏠 Timothy's Life Hub (page 31893ad51450814c8a3be31c1f26aed8).
```

Current versions: **app 1.7.0**, **bridge 1.4.0**.

### Bridge actions

| Method | action | Does | Notes |
|---|---|---|---|
| GET | `ping` | version, capabilities, calendar + Notion status | |
| GET | `events` `from` `to` (epoch ms, ≤ 62 days) | Work + Personal events | declined personal events hidden; untitled = `Busy` |
| GET | `tasks` `day` (yyyy-mm-dd) | `focus` (Focus Date = day) + `open` tasks + Life Area options | |
| GET | `dates` | all key dates + Life Area and Type options | app computes yearly repeats and countdowns |
| GET | `done` `days` (1 to 60) | Life Area + last-edit time of tasks marked Done | no titles; feeds the Bridge's Balance panel |
| POST | `create` `item{cid,area,title,allDay,start,end}` | new event, **Personal only** | `WRITABLE` allow-list; Work can never be written |
| POST | `focus` `id` `day\|null` | sets Focus Date | page must belong to the Master Task List |
| POST | `status` `id` `status` | sets Status (allow-listed values) | same ownership check |
| POST | `addtask` `task{cid,title,area,priority,day}` | new To Do task | |
| POST | `adddate` `date{cid,title,start,end,area,type,yearly}` | new key date | |

Capabilities drive the UI: `read`, `create`, `tasks`, `dates`, `done` (the last three appear once `NOTION_TOKEN` is set). Every write is idempotent (cid cache for 6 h, or set-to-value), so retries are safe.

## Rules

- **Secrets never go in code, chat, or commits.** The access key and `NOTION_TOKEN` live only in the bridge's Script Properties (and the key in the iPad app). The repo is public.
- **Privacy:** the Life Hub holds private pages. Never open or read them without Timothy's explicit permission, and never put real personal data (task or date titles, Life Area names, people) in this public repo, including tests. The Notion integration is connected only to the two databases above; keep it that way. When reading the workspace to plan, read structure (schemas), not content.
- **Work calendar is read-only forever.** Don't add write paths for it.
- **Don't change Notion schemas or create databases** without asking first.
- UI copy and docs: **no em dashes**. **No emoji in the interface** (they clash with LCARS): show Notion labels through `bare()`, keep the raw value for writes. Flat marks (◆ ▲ ▼ ✕ ✓) are fine; ☀ ▶ ◀ ❄ are not (iPadOS draws them as emoji). `app_e2e13` checks this. Uppercase display labels use the Antonio font; keep the LCARS frame (elbow, chrome colors, area colors as tokens in `css/app.css`).
- Big touch targets (≥ 48 px), works offline, fits iPad landscape (1180×820 and 1133×744) and phone width (400 px, no horizontal scroll).

## The Bridge (overview screen)

`renderBridge()` in `js/app.js`. The app opens on it unless `tos.start.v1` is `"today"` (tests set that, so older tests still open on Today). It fetches events for today minus 6 to today plus 7 (`bridgeRange()`), so Horizon and Balance share one request.

- **Condition rules** live in `conditions()`: thresholds are constants at the top of the section (`HEAVY_HOURS`, `KD_WARN_DAYS`, `PICK_BY_HOUR`, `STALE_SYNC_MS`, `HIVE`). Keep README's rule table in step when they change.
- **Weather** is fetched from the iPad straight to Open-Meteo (`loadWeather()`), only when a location is set in Systems. Coordinates are rounded to 2 decimals.
- **Device-only data** (never sent to the bridge, never in the repo): `tos.place.v1`, `tos.bearings.v1`, `tos.log.v1`. Bearings have no defaults on purpose: they are Timothy's own words and the repo is public.
- `render()` keeps focus and caret in a text field across re-renders (the Bridge re-renders every minute).

## Life areas and colors

App areas: `work` (blue), `personal` (teal), `farm` (amber), `hobby` (coral). Notion Life Areas map via `taskArea()` in `js/app.js`: Work & Calling → work; SkyGarden Farm, Beekeeping → farm; Personal Growth → hobby; everything else → personal. Farm + Bees and Hobbies calendars are still standby.

## Known quirks (already handled; don't "fix" them away)

- **Google's result page intermittently 404s** (about 1 in 8 requests) even though the script ran. `withRetry()` re-runs the request twice for `http_404`, `bad_json`, `http_5xx`. Re-fetching the same result URL does not help.
- **Dropped and background-cut requests:** iPadOS kills in-flight fetches when the app is backgrounded or the screen locks. `withRetry()` waits for `visibilitychange` and re-runs those, and retries `TypeError` drops (3 times). `slot()` caps bridge requests at 2 in parallel. A refresh failure over saved data shows `retrying`, not `offline`, until 3 in a row. `netlog` (Systems → Recent requests) records action, duration and outcome only, never data. `app_e2e14` covers this.
- **Lost replies:** a write can succeed while the reply is lost. `reconcileQueue()` clears queued items that already appear in loaded data, so they're never re-sent after the 6 h cid cache expires.
- iOS standalone apps don't reload on resume. `version.json` + the **UPDATE READY** banner handle updates; the service worker fetches the page with `cache: "no-cache"`.
- The app draws under the iPad status bar (`black-translucent`, `viewport-fit=cover`). Top clearance is `--safe-top` + `--top-gap` (user-adjustable in Systems), with a solid `body::before` strip behind the bar. Don't switch the status-bar style meta: iOS reads it only at install, so Timothy would have to re-add the app and re-link.
- Plain GET and text/plain POST only, no custom headers: Apps Script can't answer CORS preflights.
- Calendar toggles (Work/Personal hidden) persist in localStorage and affect Day, Week, Month.

## Release checklist

1. Make the change. Keep `README.md`, `CHANGELOG.md` and (for decisions) `docs/DESIGN.md` in step.
2. `python3 tools/bump_version.py X.Y.Z` (updates app.js, sw.js, index.html, version.json). Without this the iPad keeps old files and no banner appears.
3. `tests/run.sh` must print `ALL PASSED`. Extend the matching test (and `tests/mock_v14.py`) when behavior changes. `app_e2e13` (the Bridge) uses strict asserts; follow that pattern.
4. Commit to `main` with the session attribution lines, push, then poll `https://tim3t.github.io/Timothyos/version.json` until it shows the new version (usually under a minute).
5. **Bridge changes** need Timothy: copy `https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs`, replace the code in script.google.com, run `setup` (check the log), then Deploy → Manage deployments → pencil → New version. Bump `VERSION` in `Code.gs` and say so clearly.
6. Tell Timothy: tap **UPDATE READY**, then (if needed) **SYSTEMS → REFRESH NOW**.

## Testing

`tests/run.sh` runs the bridge against simulated Google and Notion services (Node `vm`), then drives the real app in headless Chromium (Playwright) against simulated bridges `mock_v10` to `mock_v14`, in America/Chicago time with a fixed clock. Screenshots go to `tests/out/`. Real Google/Notion can't be tested here (no keys, by design); Timothy's first real run is the live check, so give him a concrete thing to verify.

Limit: the runner fails on crashes, page errors and timeouts, but most tests print their key values (event counts, toasts, saved items) instead of asserting them. Run `VERBOSE=1 tests/run.sh` and read the output after any change, and convert printed checks to `assert` calls when touching a test.

## Roadmap (standby modules)

- **Notes in Capture** (Notion).
- **Ask Claude**: open decision between hand-off to the Claude app, hybrid, or a full panel. API usage is billed separately from his Claude subscription, and he expects heavy use.
- **Weekly Review**: hours by life area + three reflection fields.
- **Farm + Bees and Hobbies calendars**: separate Google calendars, add as toggles and Capture destinations.
- Later: Home Assistant; moving hosting to his NAS after a hosting review.
