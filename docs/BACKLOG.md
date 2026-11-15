# Backlog

Where parked work lives, so it survives a long conversation. Claude adds an item in the same change that postpones, offers or promises it, and removes it (noting the version) when it is done; Timothy can edit it too. No secrets and no private data here: this repository is public.

Last reviewed: 2026-11-15 (app 2.83.0, bridge 1.49.0), with a full diagnostic of the app and the bridge. Nothing in the diagnostic or Roadmap sections is approved: each needs Timothy's go, and anything visible gets a mockup first.

## Waiting on Timothy

| Item | Where | Notes |
|---|---|---|
| Deploy bridge 1.49.0, then rename a Notion column | Apps Script; Notion: Habits → the **Evening Walk** column → rename to **Exercise** | Either order works; past days keep their ticks (app 2.83). 1.49 also carries 1.48.1 (ON THIS DAY's tasks and tarot) |
| ON THIS DAY: confirm it reads cleanly | SYSTEMS → DIAGNOSTICS → COPY DIAGNOSTICS, about 30 minutes after the 1.49 deploy | The ON THIS DAY line should end "no problems". With 1.48.0 it read "tasks: notion_error; tarot: notion_error" |
| RESSIKAN: SOLO tweak notes | After playing over a loop (2.82) | SOLO was built without a mockup, by his choice: "we can tweak after you've built it" |
| SICKBAY trial verdict | After a few mornings with the Sleep Focus run (README → SICKBAY, 2.81.2). 13 Nov: three runs in a row didn't arrive (HUB likely locked) | Pass marks: each run sends by itself, sleep shows each morning, HUB stays responsive. Otherwise: keep RECORDS only, or remove the station. Review the paired iPhone's trial settings at the same time |
| HOLODECK: delete the converts folder | The NAS | Cleared to go once MOBILE looked clean (2.72) |
| Link the Family calendar | Apps Script: `FAMILY_CALENDAR_ID` | Optional; read-only (bridge 1.42) |
| First weekly export: report how it went | Google Drive, Sunday about 03:00 | Bridge 1.41 |

## Agreed, not started

Nothing: everything Timothy has agreed is built and live. An item moves here from the sections below when he says go.

## From the diagnostic (2026-11-15), not yet agreed

What the sweep found healthy: every station opens with no page error, no request blocked by the page's rules and no sideways overflow at iPad landscape, iPad portrait and phone width; no live CSS class collision on any station; lint clean; the keys that must never sync are all on the bridge's refuse list; every GitHub Action is pinned to a commit. Three full local runs of the suite passed in a row after the 15 Nov test fixes.

**Data that could go wrong quietly (most worth doing)**

- **A1. A write repeated after six hours can land twice.** New events, tasks, key dates, queue items, inbox notes, sessions, books and APIARY records are protected from a repeat only by a note the bridge keeps for 6 hours. A write whose reply is lost when the iPad sleeps, and is sent again the next morning, would be made a second time. The Health and MEALS writes are safe (they look the record up by its App ID). Fix: when the 6-hour note is gone, look for the capture's id on the calendar event (already tagged `tosCid`) or in a Notion column before creating. A Notion column is a schema change: ask first.
- **A2. "When a task was finished" is Notion's last-edited time.** Fixing a typo on a finished task, changing its Life Area, or a bulk change in Notion moves it to today. BALANCE, REVIEW, the Ship's Year and ON THIS DAY all read it. Fix: a **Completed** date the bridge sets when a task goes to Done, read with last-edited as the fallback (the same either-name pattern as Exercise). Schema change: ask first.
- **A3. A read that stops at its row limit says nothing.** `queryAll_` reads up to a set number of pages (300 to 2,000 rows by caller) and returns what it has. The limits are generous today, but when one is reached the app will simply show less, with no sign. Fix: a `capped` flag on the reply, shown in COPY DIAGNOSTICS and as a muted note on the station. SICKBAY's read (every item ever, plus 100 days) and the Ship's Year are the first to watch.
- **A4. The 5 MB store: photos live in it.** HUB was at 58% on 13 Nov. MEALS keeps each meal's photo copy (up to 15,000 characters) inside the same store as settings and unsent changes, so the meal library is its fastest-growing part. Fix: move photo copies and the largest saved copies to IndexedDB (the voice audio already lives there), leaving the 5 MB store for settings and queues.

**Tests that would have caught this week's bugs**

- **B1. One strict simulated Notion for the bridge tests.** 20 of the 23 bridge tests each carry their own hand-written Notion; only 4 refuse a property that doesn't exist, none hand results back in pages (so `queryAll_`'s paging is untested), and until 13 Nov none refused a filter nested too deep, which is how 1.48.0 shipped two failing reads. One shared, strict simulator (filter depth, unknown properties, wrong types, pages of 100, the 2,000-character text limit, a 429) would replace them. This absorbs the earlier "contract test" and "one shared simulated bridge" items.
- **B4. Fixed waits in the frozen-clock tests** (carried: about a minute of the suite's time; e13, e16 to e25, e28 to e31, e37).
- **B5. Tests named for what they cover** (carried: `app_e2e55` says nothing; the index in run.sh is the only map).
- **B6. Tooling refresh** (carried): Playwright 1.63 → 1.65, ESLint 10.13 → 10.15 (a moderate advisory in a sub-dependency, test-only). Each quarter.

**Sharper on the iPad**

- **C1. SYSTEMS is eleven screens long** (8,900 px in landscape, 14 sections). A row of section chips at the top, or sections that fold. Mockup first.
- **C5. Fields with only grey hint text** in place of a label: ten in SYSTEMS (the NAS and Home Assistant addresses and tokens among them) and APIARY's list field. The hint vanishes once you type, and VoiceOver has nothing to read.
- **C6. Small targets** (carried, with numbers): HABITS' year grid (17 px cells), ASTROMETRICS' grid (12 × 22 px), RESSIKAN's beat steps in portrait (34 px wide), WEEK's blocks (34 px tall). Only where he mis-taps.
- **C7. TAROT stalls for a quarter of a second on opening** (two long tasks, 190 to 260 ms): the only station with any.
- **C8. Eight old Bridge styles look unused** (`ov-grid`, `ov-load`, `ov-wk`, `ov-day`, `ov-legend`, `ov-heavy` and two more, from before the Time Ribbon). Remove after a check.

**Safety and upkeep (carried from 11 and 13 Nov, still open)**

- **D1. Image rules:** any https image may load; only book covers (Open Library) and SCIENCE's aircraft photos need it. Give aircraft photos the recipe treatment, then allow only Open Library and his own hosts.
- **D2. Count refused requests** (a wrong access or health key) and show them in SYSTEMS and COPY DIAGNOSTICS.
- **D3. HEALTH_KEY out of view:** a tiny second shortcut that only returns the key, so the main one shows none in screenshots (Timothy's, no code).
- **D4. NAS relay's access log:** check it's off or strips `?k=` (the token rides in media addresses, inside Tailscale).
- **D5. Silent error handlers:** 129 `.catch` and 78 `try`, 23 that write to the error log; log the ones that matter.
- **D6. Still proposed from the first hardening list:** an optional PIN that encrypts the stored keys; separate read and write keys; a key per iPad with ROTATE KEY in SYSTEMS; a lock inside the app for an iPad left unlocked; a backup reminder when the last backup is over 30 days old.
- **D7. Deploying the bridge by hand.** 58 of 185 releases needed it; five in the week of 9 Nov. Choices: keep it by hand but group bridge changes into fewer versions; or publish from GitHub with Google's `clasp`, which means keeping a Google credential that can edit his scripts as a GitHub secret. A real trade: decide with him.
- **D8. A "trial first" rule** for anything on a platform we don't control (Shortcuts, Health, Home Assistant, YouTube): SICKBAY's missed runs are the case for it.

## Roadmap (ideas, none approved)

### Stations proposed

| Station | What it would be | Builds on |
|---|---|---|
| **ATMOSPHERICS** | Farm weather with memory: rain totals, frost nights, soil temperature, growing degree days, bee flying hours | The weather feed already connected; APIARY and ARBORETUM decide from the season so far, the Bridge shows only today |
| **OBSERVATION LOUNGE** | Goals longer than a week: quarter and year objectives, fed by reviews, habits and finished tasks | REVIEW looks ahead a week, ASTROMETRICS back a year; nothing holds the direction between. One Notion database |
| **READY ROOM** (new) | One task, one timer: a focus session that ends with a line for the Log and adds its minutes to the task's Life Area. Could bring back DRIFT's ambient sound as its room tone | BALANCE counts Work in calendar hours only; RESSIKAN's DRIFT was retired in 2.82 |
| **MEMORY ALPHA** (new) | The household's reference: manuals, serial numbers, warranty dates, paint colours, filter and part sizes, where things are kept. Searchable, kept in Notion | UPKEEP knows when a job is due but not which part it needs; pairs with QUARTERMASTER |
| **QUARTERMASTER** | One stock list for bee, farm and household supplies; running low moves an item to the Replicator Queue | LEDGER's queue, APIARY, MEALS' pantry |
| **TACTICAL** | The system's own upkeep: age of each key, last backup, last export, bridge deployment, refused requests, rotation reminders | Could be a SYSTEMS section rather than a station (see C1, D2, D6) |
| **TEN FORWARD** | People and hospitality: birthdays and anniversaries from Key Dates, gift ideas sent to the Replicator Queue, hosting menus from MEALS. Names stay in Notion, never in the repo | Key Dates, the Family calendar, MEALS |
| **ACADEMY** | Practice and learning: RESSIKAN practice minutes, courses, Growth calendar hours against a target | RESSIKAN keeps no record of practice |
| **TRANSPORTER ROOM** | Trips: itineraries, packing lists that learn from the last trip, a countdown | Calendars, Key Dates |
| **LISTENING POST** | When his shortwave antenna is up: bands, logs, what's audible now | SCIENCE's space weather already has band conditions. Other sensors he might add: a weather station, a BirdNET-Pi, an ADS-B receiver, a lightning detector |
| **STATION BOARD / ON DECK** | A Bridge panel of unpinned stations with a live line each; or one slot under the pins for the station with a reason to open now | Shelved after COMPUTER (D43) |

### Ideas for the stations he has

- **HABITS:** habits he can name, add and retire himself (the Exercise rename needed a release: the two tick-boxes are fixed in code). Each day's water goal kept in Notion (schema change: ask). **EXERCISE offered a tick** when Health reports enough exercise minutes for the day (offered, never written silently; needs SICKBAY to pass its trial).
- **RESSIKAN:** record a SOLO phrase into the loop; two fingers, two notes; a wider range; a count-in and a click for CAPTURE; tap tempo; A and B sections chained into a song; a loop rendered straight to an audio file (no real-time RECORD); a knob for how widely chords are spread. Held from before, raise as he refines: POCKET GRID (punch-in effects), TILT (gyroscope filter), VOICE GRAINS (mic, stays on the iPad), SKY SONATA (SCIENCE's aircraft as sound), "compose from a mood" by Claude (about 1¢), sound that carries on outside the station. Paid AI music generators only if he asks where it can go. Safari has no Web MIDI.
- **LOG:** "a year ago today you wrote…" shown inside LOG once it's unlocked (the private half of ON THIS DAY, where it's allowed to be). Log italics: paused by him.
- **ON THIS DAY:** "this week in past years" as a section of the weekly REVIEW; a way to keep one memory (pin it to the Log or Key Dates).
- **SICKBAY** (after the verdict): the remaining measure is Sleeping Wrist Temperature (optional); weight stays a RECORDS reading by his choice.
- **MEALS:** the shopping list handed to Reminders through a shortcut; "what we ate this week last year" while planning; leftovers as a dinner.
- **LEDGER** (YNAB stays read-only): scheduled transactions due this week on the Bridge; where the month will end at this pace.
- **APIARY:** mite counts and honey as a chart per hive across years; flying hours from ATMOSPHERICS; a hive nudge after 10 days when the weather is GO.
- **ARBORETUM:** garden jobs in the Morning Briefing or a Bridge panel; frost nights from the weather; a photo per bed; a harvest log.
- **LIBRARY:** a reading goal for the year with its pace; "finish by" for the book in hand.
- **TAROT:** which cards came up most this year (the Ship's Year has the count, not the cards).
- **ENGINEERING:** doors; AUTO thermostat with two setpoints; scenes triggered by motion or presence (2.64 keeps to time, sunrise, sunset and a tap).
- **HOLODECK:** what's on now and next as a Bridge line; favourite channels first in the guide.
- **REVIEW and the ship's computer on schedules:** a Sunday draft review written from the week's data. A spoken, two-way ship's computer (OpenAI's live voice, about $0.05 a minute): asked about 2026-10-23, not planned.
- **COMPUTER:** recent commands first; a question it can't place handed to ASK.
- **Voice capture through Shortcuts** (from the 2026-10-21 brainstorm).

## Put off, to return to

- **yt-fetch: fetch only what's new.** Timothy asked (2026-11-10) whether re-enabling a channel's line downloads only new videos. It depends on whether yt-fetch keeps a download archive (`--download-archive`, with `--break-on-existing` to stop at the first video it has). Needs its compose file (keys blanked) to confirm and to write the one-time step that records what is already downloaded. Until then, a single video's own link is the safe way to fetch one.
- **Weekly export:** include the synced settings (no keys). Offered, not started.
- **fix-videos:** show progress while it scans. Offered, not started.
- **Download a YouTube channel by its `/videos` link** (Timothy, on the NAS): the walkthrough was given 2026-11-09.
- **Moving hosting** to his NAS (or a Mac mini with a local model: only the bridge's `claude_()` call would change), after a hosting review.
- **A type check on the bridge alone** (option B from the lint decision, D79): kept for later.

## Decided against

- **Requiring the CI check before anything lands on `main`** (a pull request per release): too clunky for one person working from an iPad (Timothy, 2026-11-11). The deploy gate (D72) already keeps an untested version off the iPads, and `main` is protected against force-pushes and deletion.
- **A Scriptable home-screen widget:** set aside by Timothy (2026-10-21); don't raise it again unless he does.
- **Work events in ON THIS DAY** (Timothy, 2026-11-13).
- **The theremin and DRIFT in RESSIKAN:** retired in 2.82 at his word ("retire the theremin for now"; SOLO in DRIFT's place). DRIFT's sound could return only as part of another idea (READY ROOM, above).
- **Separate browser modules for the app's source** (option B of the split, D69): the source is split into parts and built into one file instead.

## Done since the last review (2026-11-11), for the record

2.78 COPY DIAGNOSTICS and the Health shortcut's check mode · 2.79 recipe photos kept small, and the security tidy-ups · 2.80 SICKBAY's DAYS, activity rings and LEDGER's REMOVE · 2.80.2 the lint check on every run, and tests safe from the calendar · the weekly CI run 60 days ahead · 2.81 ON THIS DAY, then OPEN THIS DAY IN LOG · 2.81.2 SICKBAY's honest ARRIVED, NO SEND SINCE, and a quieter wake · 2.81.3 ON THIS DAY's tasks and tarot (bridge 1.48.1) · 2.82 RESSIKAN as CHORDS and SOLO · 2.82.2 the playing bar, and HOLODECK's instant tap · 2.83 Evening Walk became Exercise (bridge 1.49) · the HOLODECK and sync tests traced and steadied · the `lint-option-a` branch deleted by Timothy · 2.84 RECOVERED in the error log, "slowest" without frozen requests, RESSIKAN's clock only while playing (C2 to C4) · 2.84.1 the class guard on every station, which found WEEK's lost date label (B2), and timeouts that say what they saw (B3). Earlier work is in CHANGELOG.md and docs/DESIGN.md (D1 to D82).
