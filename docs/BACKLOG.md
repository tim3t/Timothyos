# Backlog

Where parked work lives, so it survives a long conversation. Claude adds an item in the same change that postpones, offers or promises it, and removes it (noting the version) when it is done; Timothy can edit it too. No secrets and no private data here: this repository is public.

Last reviewed: 2026-11-11 (app 2.77.0, bridge 1.44.1).

## Waiting on Timothy

| Item | Where | Notes |
|---|---|---|
| Deploy bridge 1.47.1 | Apps Script: paste `Code.gs`, run setup, new deployment version | Includes 1.46 (recipe photos kept small, the data rule in every prompt), 1.47 (SICKBAY arrival stamps, LEDGER REMOVE) and 1.47.1 (the STAND ring from hourly Stand Minutes; the shortcut's block is already set to Group By: Hour). Then rotate HEALTH_KEY (seen in a screenshot) and open MEALS once. Days sent before 1.47 say they arrived before arrival times were kept |
| Rotate `HEALTH_KEY` | Apps Script: delete the property, run setup, paste the new key into the Bridge Health shortcut | Routine rotation, agreed 2026-11-11 |
| SICKBAY trial verdict | After a few days of the four daily automations | Pass marks: each run sends by itself, sleep shows each morning, HUB stays responsive. Otherwise: keep RECORDS only, or remove the station. Review the paired iPhone's trial settings at the same time |
| HOLODECK: delete the converts folder | The NAS | Cleared to go once MOBILE looked clean (2.72) |
| Link the Family calendar | Apps Script: `FAMILY_CALENDAR_ID` | Optional; read-only (bridge 1.42) |
| First weekly export: report how it went | Google Drive, Sunday about 03:00 | Bridge 1.41 |

## Agreed, not started (from the 2026-11-11 review)

Nothing agreed is waiting: items 1 to 7 are done (item 7, the security tidy-ups, in 2.79 and bridge 1.46). What's left of item 5 is below.

**Steadier tests, what's left (item 5, done in part 2026-11-11, D76):** the frozen-clock tests (most of the heavy ones: e13, e16 to e25, e28 to e31, e37) still use fixed waits, about 450 s of the suite's 1,460 test-seconds; the next step is to start their page clocks at the chosen time and let them run (as e62 now does) so `settled()` can work there, test by test. Also: check the real-clock tests at several times of day (late evening, just after midnight) for time-of-day failures. Two such failures were found and fixed on 12 Nov: HOLIDAYS (e35) broke when the real date neared a fixed key date in mock_v23 (now set from today), and the HOLODECK guide test (e62) expected a name on the block playing a break. The other simulated bridges (mock_v13 to v22, v24) still hold fixed dates in November and December 2026; set them from today when a test next trips on one.

Also raised in the review, not yet agreed: a lint or type check; one shared simulated bridge in place of the 18 hand-written ones (the app is never tested against the real `Code.gs`); tests named for what they cover; a "trial first" rule for anything on a platform we don't control (Shortcuts, Health, Home Assistant, YouTube); narrowing the page's connection rules; separate read and write keys; a lock inside the app for an iPad left unlocked.

## Put off, to return to

- **yt-fetch: fetch only what's new.** Timothy asked (2026-11-10) whether re-enabling a channel's line downloads only new videos. It depends on whether yt-fetch keeps a download archive (`--download-archive`, with `--break-on-existing` to stop at the first video it has). Needs its compose file (keys blanked) to confirm and to write the one-time step that records what is already downloaded. Until then, a single video's own link is the safe way to fetch one.
- **Bridge Health shortcut: the remaining measures.** Built so far: steps, resting heart rate, heart rate variability, sleep. Added 2026-11-12: Active Energy, Exercise Minutes, Stand Minutes (grouped by Hour), Respiratory Rate, Cardio Fitness. Optional: Sleeping Wrist Temperature. Weight is not wanted (a RECORDS reading).
- **Weekly export:** include the synced settings (no keys). Offered, not started.
- **fix-videos:** show progress while it scans. Offered, not started.
- **Download a YouTube channel by its `/videos` link** (Timothy, on the NAS): the walkthrough was given 2026-11-09.

- **Lint check (review item, option A; Timothy chose it 2026-11-12, then paused it for station work).** Built and parked on branch `lint-option-a`: ESLint 10.13.0 pinned as a test tool, `eslint.config.js` (bug rules only), `tools/lint.js` (checks js/app.js as built and names the js/src part), `docs/lint-first-pass.txt`. First pass: 195 findings, no undefined names, no live bug. Worth fixing: e28 measures a starting count it never checks; e42 has a step that does nothing; dead code (`scnOpenNow`, `BAL_AREAS`, 7 unused locals); APIARY redeclares 3 variables; LOG has an invisible non-breaking space in a pattern. Switch off as noise: no-useless-assignment (27), no-unmodified-loop-condition (2), no-regex-spaces (2). **Waiting on Timothy:** the 146 no-shadow findings (locals named `go` and `render` hide the app's own; SCIENCE's `pl` hides AUDIO's): rename all (recommended) or rule off. Then wire it into run.sh and CI and record it in DESIGN.

## Decided against

- **Requiring the CI check before anything lands on `main`** (a pull request per release): too clunky for one person working from an iPad (Timothy, 2026-11-11). The deploy gate (D72) already keeps an untested version off the iPads, and `main` is protected against force-pushes and deletion.

## Roadmap (standby modules)

Moved here from `CLAUDE.md` on 2026-11-11, unchanged.

Done since the first roadmap: Home Assistant (ENGINEERING, 2.24), backup and restore (2.33), the rename to Bridge (2.34), COMPUTER (2.35), the Morning Briefing (2.36), ASTROMETRICS and the Ship's Year (2.40), Notes in Capture as the INBOX (2.41), SCIENCE (2.42), RESSIKAN (2.44), HOLODECK (2.45; channels 2.46, the arch with AUDIO 2.47, NETWORK 2.48, sleep timer 2.49, commercial breaks 2.52), `tools/ia_fetch.py`, the review clean-up (2.50: assertions, privacy, docs). Set aside by Timothy (2026-10-21): a Scriptable home-screen widget; don't raise it again unless he does.

**Hardening (resumed 2026-10-23), in Timothy's order:** (1) ~~docs accuracy pass~~ done 2026-10-22 (README rebuilt as Setup, Stations, Reference); (2) ~~bridge version check~~ done 2026-10-23 (2.38, below); (3) ~~Notion schema check~~ done 2026-10-23 (2.39). ~~**WAITING fix**~~ done 2026-11-04 (2.58: `go("systems")` calls `loadLedger(false)`, `loadApiary(false)`, `loadTarot(false)`; `index.html` description refreshed). ~~Keys out of URLs and a CSP~~ done 2026-11-04 (2.58, bridge 1.38: section **Requests and the page's rules** under Code conventions). Still proposed (Timothy, 2026-11-04: next after MEALS mockups as he chooses): an optional PIN that encrypts the stored keys, a key per iPad with ROTATE KEY in SYSTEMS, a weekly export of every database to Drive or the NAS, ~~an error log in SYSTEMS~~ done 2026-11-05 (2.62, with the LEVEL safety net; Apps Script quota use is shown as BRIDGE TODAY from the app's side, a true UrlFetch count would need the bridge), ~~splitting `app.js`~~ done 2026-11-09 (2.73.1, D69: option A, the source split into `js/src/` parts and built into the one file; option B, separate browser modules, set aside). The backup reminder is an UPKEEP item Timothy made himself (2026-11-04), so no app feature; a **backup reminder** when the last backup (`tos.bkat.v1`) is over 30 days old, as a Bridge Condition item or as an UPKEEP item (Timothy's thought; decide with him).

Pinned for later, in no order:
- **Ask and breaks** (Timothy asked to be reminded about this one): the app should send its BREAKS list with ASK so `get_events` keeps an ignored "Out of office" lunch as a break, as the screens do (found in the 1.27 tool audit).
- **ENGINEERING:** doors; AUTO thermostat with two setpoints; scenes triggered by motion or presence (2.64 keeps to time, sunrise, sunset and a tap).
- ~~**Arboretum**~~: done (2.71, D67), built empty for Timothy to fill. Ideas if he asks: garden jobs in the Morning Briefing or a Bridge panel, frost nights from the weather, a photo per bed.
- **HOLODECK:** channels (2.46) and the arch with STORAGE as AUDIO (2.47) shipped after his mockup approvals. Nothing held.
- **RESSIKAN Phase 2, held (raise as he refines):** POCKET GRID (knobs and punch-in effects), TILT (gyroscope filter), VOICE GRAINS (mic, stays on the iPad), SKY SONATA (SCIENCE's aircraft, Kp and passes as sound), Claude's "compose from a mood" (about 1¢), and sound that carries on outside the station (a pill, as STORAGE has). **Held as a future option, only if he asks where RESSIKAN can go:** paid AI music generators (Google Lyria, ElevenLabs Music, Stable Audio); Suno and Udio have no official API; MusicGen needs a GPU the NAS lacks. Safari has no Web MIDI.
- **The SCIENCE group** (D50): a LISTENING POST when Timothy's digital shortwave antenna is up (band conditions already in SPACE WEATHER); other sensor stations he might add (a weather station, a BirdNET-Pi for the birds in his own yard, an ADS-B receiver of his own, a lightning detector).
- **Station discovery, shelved after COMPUTER (D43):** STATION BOARD (a Bridge panel of unpinned stations with a live line each, plus a count on ALL STATIONS) and ON DECK (one slot under the pins that shows the unpinned station with a reason to open now).
- **Ship's Computer on schedules:** the Morning Briefing is done (2.36, first open after 06:00 rather than a timed trigger, Timothy's choice). Still ideas: a Sunday draft review, a hive nudge after 10 days when the weather is GO.
- **A spoken ship's computer:** OpenAI's live (full-duplex) voice model, about $0.05 a minute, for talking with Bridge rather than reading the briefing (Timothy asked about it 2026-10-23; not planned).
- **From the 2026-10-21 brainstorm (proposals, none approved yet):** QUARTERMASTER (one stock list for bee, farm and household supplies; running low moves an item to the Replicator Queue); ASTROMETRICS (done, 2.40); voice capture through Shortcuts; splitting `app.js` into per-station modules (done as source parts with a small build, 2.73.1). My suggested order then: hardening, ARBORETUM, schedules.
- **Habits:** keep each day's water goal in Notion (needs a schema change: ask first).
- **Log italics** (Unicode italic): paused by Timothy.
- Moving hosting to his NAS (or a Mac mini with a local model: only the bridge's `claude_()` call would change) after a hosting review.

~~Standing reminder: rotate the NAS relay token~~: done by Timothy 2026-11-05 (both iPads updated). He also rotated the bridge access key the same week. No standing reminders left.
