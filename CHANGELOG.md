# Changelog

## 2.41.0 · 2026-10-24 (bridge 1.33)
- **CAPTURE → NOTE:** a thought to sort later. One box (type or dictate), no area or day; it saves to the new **📥 Inbox** in Notion, and waits on the iPad when offline like other captures.
- **INBOX** (ALL STATIONS → TIME, COMPUTER, or the Bridge's line): the waiting notes, oldest first, and a **KEPT** tab.
  - Each note sorts into a **TASK** (Life Area, priority, due date), **KEY DATE**, **EVENT** or the Replicator **QUEUE** through a form filled in from the note, or **KEEP** holds it as it is. A sorted note is marked Sorted with what it became and leaves the list; Notion keeps it as the record.
  - **✕** asks twice, then moves the note to Notion's trash. **SORT IT NOW** brings a kept note back.
  - **SUGGEST SORTING:** Sonnet proposes a place for each waiting note (about 1¢), checked against your Notion lists. Nothing is saved until **CONFIRM**; **CHANGE** opens the form filled in; **SKIP** drops the suggestion.
- **The Bridge:** **INBOX · N** under Condition while notes wait. Condition never counts them.
- **COMPUTER** finds notes (waiting and kept) and has **Write a note**.
- **SYSTEMS → INBOX** replaces the STANDBY MODULES placeholder.
- **Bridge 1.33** (update the Google bridge, then connect **📥 Inbox** to the TimothyOS integration in Notion): `inbox`, `inboxadd`, `inboxset`, `inboxremove`, the sorting mode, and a due date on `addtask`. Setup logs `Notion inbox: OK (…)`.

## 2.40.1 · 2026-10-24
- **Times spoken in ship's style.** Nova (and Moira) now hear 08:00 as "oh eight hundred" and 21:05 as "twenty-one oh five" (Nova had read 08:00 as "8 OK"). °F, ¢, %, lb and the · separators are spoken as words too. The printed briefing and Ship's Year are unchanged. Today's briefing audio is made again with the new reading the next time it's needed (under 1¢).

## 2.40.0 · 2026-10-23 (bridge 1.32)
- **ASTROMETRICS,** a new station (ALL STATIONS → REFLECT, or COMPUTER: "year"): the year at a glance.
  - **SENSOR SWEEP:** tasks done, hours planned, books finished, Log days, honey (or tarot readings) and reviews. Tap one for its sector.
  - **STAR CHART:** every station's year as a row of weeks, brighter for busier. Each row is shaded against its own busiest week (✦), hatched before its first record that year, with key dates above and a TODAY line. Tap a week for its numbers.
  - **SECTOR:** the row you tap, by month (the calendars split by area), with its key facts. Tap a month for its numbers.
  - **The Captain's Log** stays locked: **UNLOCK LOG** asks for the PIN, then shows how many days you wrote (never the words). Forgotten when the app is put away; never stored, never sent to Claude.
  - **◀ ▶** step a year; **THIS YEAR** comes back. **RESCAN** reads it all again (otherwise every six hours).
- **The Ship's Year:** at the first open after 06:00 on 31 December, Sonnet writes about 200 words on the year from the counts, printed like the Morning Briefing; **READ IT TO ME** reads it in Nova (Moira without the AI voice). **COMPILE** gives the year so far on any day (a few cents). Never the Log; tarot, the apiary and the queue's spend only when shared with ASK. Kept on the iPad and in backups.
- **UPKEEP** now keeps each day an item is marked done (for ASTROMETRICS; earlier ones only have their last date).
- **Bridge 1.32** (update the Google bridge): a read-only `year` action (tasks marked Done in a year by Life Area and day, no titles; Replicator Queue items bought, day and cost) and the Ship's Year writing mode. Without it, ASTROMETRICS leaves out TASKS and QUEUE and says so.

## 2.39.0 · 2026-10-23 (bridge 1.31)
- **Notion column check.** The bridge compares each connected database's columns with the ones Bridge uses (name and type). When one is renamed, deleted or changed type, the Bridge's Condition shows **A Notion column changed** (YELLOW) naming it, and **SYSTEMS → NEEDS YOU** has the steps (rename it back or change its type, or tell Claude if it was on purpose) and **CHECK AGAIN**. **SYSTEMS → NOTION** has a **Columns** row and **CHECK NOTION COLUMNS**. Checked at most every six hours; extra columns are fine; a database that isn't connected is reported as such, not as missing columns.
- **Bridge 1.31** (update the Google bridge): a read-only `schema` action, cached six hours; setup's log adds **Notion columns: OK** or names the problem.

## 2.38.0 · 2026-10-23
- **Bridge version check.** When the Google bridge deployed is older than this app needs (a new feature, or the Deploy → New version step missed), the Bridge's Condition shows **Google bridge out of date** (YELLOW) with what's missing, and **SYSTEMS → NEEDS YOU** has the five steps, a link to the code and **CHECK AGAIN**. **SYSTEMS → APP** shows the bridge's version as **UP TO DATE** or **UPDATE TO**. Errors an old bridge causes now say so. A newer bridge never warns.
- **STORAGE:** after CONTINUE LISTENING, the rest of the folder now appears under UP NEXT as soon as it's loaded (it could stay empty until something else redrew the screen).

## 2.37.2 · 2026-10-23
- **Nova's audio for the 06:00 briefing now arrives.** OpenAI takes about two minutes for a whole briefing; the app used to stop waiting at two minutes (then Moira read it). It now waits up to five, on its own line so syncing isn't held up behind it, and if the voice still fails it tries again ten minutes later.

## 2.37.1 · 2026-10-23
- **Voice log** under **SYSTEMS → ASK CLAUDE → MORNING BRIEFING**: each step of asking for and playing Nova (the bridge's answer, its time and size, whether the iPad can and did play it, any refusal), so a silent failure can be read. For the case where Nova was never heard.

## 2.37.0 · 2026-10-23 (bridge 1.30)
- **The Morning Briefing in Nova,** OpenAI's AI voice, styled as a calm, measured starship computer with a slight South African accent. The audio is made when the briefing compiles and kept on the iPad, so READ IT TO ME starts at once (each paragraph still lights up) and replays are free. Under 1¢ a briefing.
  - Tapped before it's ready: **PREPARING VOICE…**, then it plays.
  - Without the key, turned off, or if OpenAI can't: **Moira**, the best of the iPad's own voices, reads it.
  - **SYSTEMS → ASK CLAUDE → MORNING BRIEFING:** the AI voice on or off, this month's estimated cost, **TEST AI VOICE**; the iPad voice with **TEST VOICE**.
- **Bridge 1.30** (update the Google bridge): `OPENAI_API_KEY` in Script Properties turns on a `speak` action (OpenAI gpt-4o-mini-tts, Nova, at most 30 requests a day); setup checks the key.

## 2.36.3 · 2026-10-23
- **Audition the voices:** your iPad keeps Isha (Premium) from web apps, so **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** now lists every English voice it does offer Bridge as a button that plays a test line (Apple's novelty voices last). Nothing is saved; the one you choose becomes the briefing's voice.

## 2.36.2 · 2026-10-23
- **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** now says which voice reads the briefing, and if Isha isn't offered to Bridge, which English voices are. **TEST VOICE** plays a line in it. (iPadOS may keep downloaded voices, Premium ones included, from web apps.)

## 2.36.1 · 2026-10-23
- **Morning Briefing, shorter:** about 80 words, one or two sentences a paragraph. Yesterday's habits, tarot and the apiary are left out (even when shared with ASK).
- **Read aloud in Isha (Premium),** the iPad voice you downloaded; the iPad's default voice if it isn't there.

## 2.36.0 · 2026-10-23 (bridge 1.29)
- **Morning Briefing on the Bridge.** The first time Bridge is in front after 06:00 (at 06:00 itself if it stood by overnight), the ship's computer writes this morning's report: the condition and why, today, outside, the week ahead, yesterday's habits, and one recommended first action. Sonnet, about 1 to 2¢ a day.
  - It prints itself once like a teleprinter, in Courier New; a tap finishes it.
  - **READ IT TO ME** reads it aloud in the iPad's own voice, lighting up each paragraph.
  - **−** folds it to one line (a headline without the condition) so the Condition banner comes back up; it also folds itself at 10:30. **+** opens it again.
  - **REFRESH** writes a new one; **COMPILE NOW** if it couldn't be written. Standby shows **BRIEFING READY** when one is waiting.
  - Off and on under **SYSTEMS → ASK CLAUDE**. Never the Captain's Log; the apiary, tarot and finances only with their SHARE WITH ASK switch.
- **COMPUTER:** "Morning briefing" opens it.
- **Bridge 1.29** (update the Google bridge): a "brief" mode for ASK (Sonnet, no tools, logged as BRIEFING). Until then the briefing stays off and Systems says so.

## 2.35.0 · 2026-10-22
- **COMPUTER: find any station, or something to do, by name.** Open it with **COMPUTER** in the header, **⌘K** on a keyboard, or a swipe down on the sidebar.
  - **Before you type:** what's waiting on you (the Bridge's Condition items), recent stations, and stations outside the sidebar you haven't opened in 14 days.
  - **Type to narrow:** stations and the actions inside them (Add a book, New hive check · a hive, True up stack, Write this week's review, Search the log, Record this week's card, Make a backup…), plus your books, hives, tarot cards, episodes part way, upkeep items and settings. ↑ ↓ and Return on a keyboard.
  - **It only opens things;** every change still happens on the screen it opens. Searching happens on the iPad: nothing typed goes to the Google bridge or Claude.
- At phone width the four header buttons now fit on one row.

## Docs · 2026-10-22 (app and bridge unchanged)
- **README rebuilt** in three parts: **Setup** (the five handshakes, one way to update the Google bridge, Notion with all ten databases, every Script Property, the optional pieces), **Stations** (TIME, REFLECT, RESOURCES, ALWAYS AVAILABLE, as in ALL STATIONS) and **Reference** (daily use, Condition rules, backup and reinstalling, troubleshooting, security, updating). The bridge-by-bridge update steps are gone; the CHANGELOG says when a new bridge is needed.
- **Corrected:** the security model (calendars add-only to Personal, farm and Growth; removals go to Notion's trash; YNAB read-only; what goes to Claude for each feature), the Condition rules (Weekly review due, overdue upkeep, overlaps across any two calendars), the Bridge panels (Habits, Tarot, Intent + Bearing), and new troubleshooting rows (WAITING, ERROR, an out-of-date bridge, any database not connected, the NAS).
- **CLAUDE.md:** every bridge action and capability listed, all secrets named, the test clock described as it really is. **DESIGN.md:** current status, decisions in order with D40 (backup), D41 (the name Bridge) and D42 (test lanes), and a note that sections 1 to 13 are the original plan.

## 2.34.0 · 2026-10-22
- **The app is now called Bridge** on the home screen, in the app switcher and in Safari's tab. TimothyOS stays as the system name in the top bar. iPadOS only picks up the new name when the app is added to the home screen again: back up, remove the old icon, add it again from Safari, then restore (README, Renaming or reinstalling the app).

## 2.33.0 · 2026-10-22
- **Backup and restore.** **SYSTEMS → BACKUP AND RESTORE** saves everything kept only on this iPad in one file: the bridge, NAS and Home Assistant links, ENGINEERING devices, rooms and upkeep, pins, ignored events, breaks, bearings, podcast places and the other settings.
  - **Locked with a passphrase you choose,** never stored. Without it the file can't be read.
  - **Left out on purpose:** Notion and Google data (the next sync brings it back), the Captain's Log draft and other unsaved drafts. While a save is still on its way, MAKE BACKUP waits.
  - **Restore** from the link screen of a fresh install (**OR RESTORE THIS IPAD**) or from Systems. You see what the file holds before anything changes; RESTORE brings it all back and links the app.

## Tests · 2026-10-22 (app and bridge unchanged)
- **The test suite runs in about 5 minutes instead of 12.** Browser tests now run in lanes, three at a time. Tests that share a simulated bridge stay in one lane in their original order, so none of them sees another lane's saves or counters; the simulated NAS runs once per lane that needs it. The motion test, which times animations frame by frame, still runs alone. Every test and check is unchanged, and each result now shows its time.

## 2.32.0 · 2026-10-21 (bridge 1.28)
- **APIARY: TRUE UP STACK.** On a hive, under its stack: set the hive as it really stands when you changed something at the hive but didn't log it.
  - **+ DEEP, + MEDIUM, + SUPER, + EXCLUDER, + FEEDER.** Each lands where it sits on a hive (feeder on top, then supers, the queen excluder, mediums, deeps). One feeder and one excluder at most.
  - **Tap a piece** (on the stack or in the list) to set its frame count (8, 9 or 10; supers default to 9, deeps and mediums to 10), frames drawn (or filled, for a super), capped % for supers and mediums, the feeder's syrup (empty, low, full), move it **▲ UP / ▼ DOWN**, or **REMOVE** it (two taps).
  - **LOG THIS TOO** also adds a short check on the date you did it ("Added a super (logged later)"), so the hive's history stays right. Off by default: then only the stack changes. The hive shows "Trued up" with the date.
- **New pieces everywhere:** mediums, supers with their own frame count and frames filled, feeders and queen excluders are drawn on the yard and the hive. A new check counts each framed box against its own frame count, has + MEDIUM, + EXCLUDER and + FEEDER beside + DEEP and + SUPER, and its FEEDER answer sets the feeder's syrup on the stack.
- **EDIT HIVE** keeps names and details; box changes for an existing hive now go through TRUE UP STACK. A new hive starts with deeps, mediums and supers.
- **Bridge 1.28** accepts the new pieces (deploy it before using TRUE UP; 1.27 refuses a stack with mediums, feeders or excluders).

## Bridge 1.27 · 2026-10-21 (app unchanged at 2.31.1)
- **ASK's tools now say exactly what they do**, so Claude picks and fills them right the first time. Claude only ever sees a tool's name and description, never the code, so each one was checked against what the bridge actually does.
- **Fixed: a week asked for by a day other than Monday** quietly read the wrong seven days and missed the saved review. ASK now gets told the right Monday and asks again. A drafted review for a non-Monday is refused the same way.
- **Fixed: Growth calendar events reached Claude unlabelled** ("undefined"). They now read Growth, and the calendar tool mentions the Growth calendar.
- **Clearer choices for Claude:** "remind me" with no time is a task; something at a time is a calendar event; a deadline, window or yearly date is a key date. The task tool says it lists open tasks only and points to the week tool for finished ones.
- **A Life Area, priority or key date type Claude gets slightly wrong is caught before you see the card**, with the right names listed so it can fix it, instead of failing when you tap CONFIRM.

## 2.31.1 · 2026-10-21
- **Fixed: a meeting with "Lunch" in its name counted as a break.** A break now needs the event's whole title to be one of your BREAKS (capitals, extra spaces and a trailing full stop don't matter, and an "Out of office —" in front is still fine). "Lunch" and "Out of office — Lunch" stay breaks; a monthly team lunch meeting counts as Work again. A longer title can be added to the list if you want it treated as a break.

## 2.31.0 · 2026-10-21 (bridge 1.26)
- **New station: APIARY.** Your hive log, built from the zooming mockup:
  - **The yard** shows each hive as its own box stack (supers, deeps, frames drawn), with its queen, last check and any open issue, plus hive-check weather, honey this year and mite checks.
  - **Tap a hive** for its stack (tap a box for what it held), NEXT TIME, every check and ABOUT THIS HIVE.
  - **+ NEW CHECK** in five short steps: queen and brood, frame counts per box (the stack follows as you count or add a box), stores and feed, mites (load worked out) and pests, then what you did, honey pulled, notes and next time. **REMIND ME IN 7 DAYS** adds a task. After saving, it offers the other hive next.
  - **Edit or delete a check, add or edit a hive, keep a yard list.** Saves wait on the iPad when there's no signal.
- **New Notion database 🐝 Apiary** (under 🐝 Beekeeping), with your hives and every check from the Hive Inspections log already in it. The original pages are unchanged.
- **Ask:** Systems → APIARY → SHARE WITH ASK (off by default).
- **Bridge 1.26:** reads and saves the Apiary (apiary, apiarysave, apiaryremove). Deploy it, then connect 🐝 Apiary to the integration (README, Apiary).

## 2.30.2 · 2026-10-21
- **Fixed: OPEN IN CLAUDE cutting off your question.** The prompt was the snapshot followed by your question, cut at 6,000 characters for the claude.ai link, so a long snapshot (tarot sharing on, for example) lost the question and stopped mid-sentence. Now:
  - **Your question comes first,** before the snapshot.
  - **When the link can't hold everything, whole sections are left out,** least needed first (tarot readings, finances, ignored event titles, the lists of life areas and types, weather, key dates, open tasks, the next 6 days). A closing line names what was left out, and the prompt opens with **[SNAPSHOT SHORTENED · PASTE FROM CLIPBOARD FOR THE FULL VERSION]**.
  - **The clipboard always holds the whole prompt,** question first, with no marker: select all in Claude and paste to send everything.
- The in-app ASK is unchanged: it always sends the whole snapshot.

## 2.30.1 · 2026-10-20
- **Fixed: TRACK # doing nothing in some folders.** Four causes, all fixed:
  - **Tags remembered from before you numbered the files** were never read again. The app now notes each file's date and size with its tags and reads them again when the file changes (after retagging).
  - **A big cover picture placed before the track number** pushed the number past the part of the file the scan read. The scan now steps over the picture to the frames after it, without downloading it.
  - **ID3v2.2 tags and "unsynchronised" tags** (written by some taggers) were skipped. Both are read now, as is ID3v2.4's data-length layout.
  - **Files with only an old ID3v1 tag** now give their track number from the end of the file.
- **TRACK # says what it found:** "IN TRACK ORDER" or "120 OF 176 MP3S HAVE A TRACK NUMBER", with **READ TAGS AGAIN** to read the whole folder afresh.

## 2.30.0 · 2026-10-20
- **STORAGE shows each track's length instead of its size.** Read from a few kilobytes of each file when a folder opens (MP3, including variable bitrate and files with large artwork; M4A/M4B; FLAC; WAV) and remembered on this iPad. Other formats show their length once played; documents keep their size.
- **HABITS: changing the water goal no longer rewrites the past.** A new goal counts from the day you choose it; every earlier day is judged by the goal it had, in streaks, the 30-day rate, the 12-week grid and the Review. A past day's tile shows its own goal, and the note under the goal chips lists recent changes. Changing back the same day leaves no trace.

## 2.29.2 · 2026-10-20
- **Fixed: giant letters in empty spread positions.** The position names (PAST, PRESENT, CHALLENGE…) on cards not yet picked were sized against the whole screen instead of the card, so they overflowed and the Celtic Cross was unreadable. They're now sized to the card, sit at its foot where a filled card shows its name (clear of the number and of the crossing card), and the crossing card's label reads level across it.

## 2.29.1 · 2026-10-19 (bridge 1.25.1)
- **Fixed: the cursor jumping out of a tarot note and the last few letters disappearing.** Two causes: the note boxes had no stable identity, so any redraw (a save landing, a sync) dropped the keyboard; and a save arriving from Notion could briefly put back the older text from before your last few keys. Every text box now keeps its place, cursor and text through a redraw, and what you're typing always wins over a copy coming back from Notion. A new reading keeps your typing as it gets its Notion id. Text typed in one reading can no longer appear in another's box.
- **Typing is saved when you leave the app** (home screen, app switch, lock), not only after the 1.2 s pause. MY MEANING too.
- **Fixed: red "Lock timeout" and TIMEOUT errors on saves while the books were importing.** Each IMPORT BOOKS step held the bridge's lock for most of a minute, so saves queued behind it timed out. The import no longer takes the lock, and a save that does meet a busy bridge now answers BUSY and is retried quietly (a few seconds apart) instead of showing an error.

## 2.29.0 · 2026-10-19 (bridge 1.25)
- **Your tarot books, beside every card.** Liz Dean's *The Ultimate Guide to Tarot* and Jessa Crispin's *The Creative Tarot* now live in **📖 Tarot Books**, a private Notion database (one page per card per book, yours to read and edit). Set up once with **IMPORT BOOKS** in Systems.
  - **BOOKS** under each card in a reading opens a drawer with both books, a tab each; reversed cards lead with Dean's reversed meaning. Closed until you ask.
  - **SUGGEST A MEANING HERE** and **SUGGEST A READING FROM MY BOOKS** ask Claude, only when tapped, using only your two books, your own meaning, the question and your notes. The answer waits marked **NOT SAVED** until **ADD** (into your note or WHAT IT SAYS) or **DISMISS**. About 1¢ a card.
  - **FROM YOUR BOOKS** in a card's history, for reading without suggestions.
  - The book text stays in your Notion: never in the app's code, this repository or the iPad's storage.
- **Bridge 1.25:** `tarotbooks`, `tarotbook`, `tarotbookimport`, `tarotsuggest`.

## 2.28.0 · 2026-10-19
- **ENGINEERING · CONTROLS laid out by type**, as in the first Engineering mockup: **LIGHTS AND SWITCHES** on the left, **CLIMATE** and **SENSORS** on the right (stacked on narrow screens).
- **Rooms as chips** over the lights (ALL, each of your rooms, OTHER for devices without one) instead of folding group sections. The choice is remembered; **ALL OFF HERE** turns off what the chosen room shows. Every tile shows its room. GROUPS is now **ROOMS** (still on this iPad only, separate from Home Assistant's areas).
- **CLIMATE:** thermostats from Home Assistant can be added: target temperature with + and − (sent once your taps settle), the room's temperature and humidity, what it's doing, and its modes (HEAT, COOL, AUTO, OFF).
- **SENSORS** have their own area. Doors and scenes are planned for later.

## 2.27.0 · 2026-10-19
- **Tarot card faces.** Every Major Arcana card now has its own mark instead of a shared sun: a flower for the Fool, infinity over a wand for the Magician, the crescent between pillars for the High Priestess, the Venus sign, a crown, crossed keys, linked rings, the chariot, infinity over a heart, the lantern, the wheel, scales, the hanged man, the scythe, water poured between cups, chains, the struck tower, the star, the crescent moon, the sun, the trumpet and the laurel wreath.
- **Minor Arcana show their count.** Two to Ten carry that many suit marks, laid out like playing-card pips; the Ace is one large mark; the courts carry a sign above the mark (Page a star, Knight a chevron, Queen a three-point crown, King a five-point crown). Everywhere cards appear: TAROT, the Bridge, Review and card history.

## 2.26.1 · 2026-10-19
- **Text boxes grow with their text, everywhere.** Tarot notes and readings, Review answers, Library notes, the Systems lists, Engineering and the rest now size themselves to what's written as you type (and shrink back), so nothing hides behind a scroll. The Ask box grows up to 40% of the screen, then scrolls inside. The Captain's Log editor keeps its own sizing.

## 2.26.0 · 2026-10-19 (bridge 1.24)
- **TAROT, a new station** (REFLECT), saved to a new **🔮 Tarot** database in Notion.
  - **This week's card** (Monday to Sunday) with its keywords, your own meaning and a note for the week. Also on the **Bridge** (a TAROT panel) and in that week's **Review**.
  - **Readings in any spread:** one card, Past · Present · Future, Situation · Action · Outcome, Five-card cross, Horseshoe, Celtic Cross (laid out with the crossing card), **FREE** for any number, and **MY SPREADS** you build on a grid. Record the cards you drew position by position (with REVERSED), or **DRAW HERE**.
  - **Notes** per position and for the whole reading, saved shortly after you stop typing. Changes made offline wait on the iPad and go when the bridge answers.
  - **Card history** for any card, with **MY MEANING** in your own words. **Patterns** over 90 days: suits, reversals, cards that keep coming back, and the last 8 weekly cards.
  - **SHARE WITH ASK** in Systems (off by default) sends this week's card and the last 14 days of readings with Ask questions.
- **Ask: turning a sharing switch off now applies to the very next question.** Ask keeps a short snapshot of your day; changing SHARE WITH ASK (finances or tarot) now rebuilds it instead of waiting for it to expire.
- **Bridge 1.24:** `tarot`, `tarotsave`, `tarotmeaning`, `tarotspread`, `tarotremove`.

## 2.25.1 · 2026-10-16
- **Fixed: Engineering's styles leaking onto other screens.** The list-view switch borrowed a class name already used by the colour swatches, so big toggle shapes sat over LIFE AREAS on Today and the STREAKS names on Habits; the CARDS / LIST control also outlined the Bridge's week bars; and small chips everywhere grew a pixel. Engineering now uses its own names, and a test checks the other screens keep their look.

## 2.25.0 · 2026-10-16
- **ENGINEERING · CONTROLS grows up.** Everything here is kept on this iPad; nothing in Home Assistant is changed.
  - **Card styles per device:** TOGGLE, DIMMER (drag the bar along the bottom), COLOR (the tile takes the light's own colour), COMPACT (one slim button) and READING (sensors). Picked when adding a device, changed later from its **⋯** button. Styles a device can't use are greyed out; new devices start on the richest one they support.
  - **Full light panel** (tap a colour card, a list row or **⋯**): big ON / OFF, **COLOR** with a colour wheel and quick colors, **WHITE** warm-to-cool, **BRIGHTNESS**, and effects when the light has them. Only the controls a light supports appear. Dragging updates the light about three times a second, then once more when you let go.
  - **CARDS / LIST** switch for the whole screen. List rows have a switch at the right; tap a row for the panel.
  - **Groups** (your own, e.g. Outside, Living Room, Office): made while adding a device or under **GROUPS** (rename, reorder, delete). Tap a group's name to fold it; folds are remembered. **ALL OFF** per group. Devices without a group sit under UNGROUPED.

## 2.24.0 · 2026-10-15
- **ENGINEERING, a new station** (under RESOURCES in ALL STATIONS). Two tabs, both empty to start.
  - **CONTROLS:** Home Assistant devices you pick with **+ ADD DEVICE** (search by name; switches, lights, fans, toggles and sensors). A switch or light is one big tap to turn on or off; a sensor shows its reading. Refreshed every 30 seconds while open. **REMOVE** takes a device off the screen only.
  - **UPKEEP:** recurring maintenance by time (days, weeks, months, years) or by a reading (miles, hours). Each item shows how far along it is and when it's due; **MARK DONE** records today (and asks for the odometer or hour meter). Saved on this iPad. Overdue items also show in the Bridge's CONDITION, one tap from UPKEEP.
- **Systems → HOME ASSISTANT:** address (USE THE STORAGE RELAY fills it in) and token, SAVE AND TEST, FORGET. Kept on this iPad.
- **The relay gains `/ha`:** Home Assistant is reached through the Storage relay, behind Tailscale and the relay token. The relay settings in the README change (an `HA_URL` line and a new `CADDYFILE`); see **Engineering** there.

## 2.23.0 · 2026-10-15
- **BREAKS: protected time you can see.** A new list in Systems (next to IGNORED EVENTS), starting with **Lunch**. A timed event whose title contains a break word is always shown, even when it also matches an ignored title, so "Out of office — Lunch" on the Work calendar appears while plain "Out of office" stays hidden.
  - Shown on Today, Week and the Bridge as a soft hatched block labelled with the rest of its title (the "Out of office —" prefix is dropped). NOW / NEXT on the Bridge shows LUNCH with the time left.
  - Never counted as Work hours, meetings, BALANCE or Review hours.

## 2.22.0 · 2026-10-14
- **Finished events look finished.** On Today, Week and the Bridge's day strip, every event that ended before the now line is dimmed, and on Today and Week it gets a ✓ before its title. Events still running or still to come look as before. The change happens on its own as the day goes on.

## 2.21.0 · 2026-10-14 (bridge 1.23)
- **Holidays beside Key Dates.** Google's US Holidays calendar is read (bridge 1.23, read-only) and shown as HOLIDAY on the Bridge's KEY DATES panel (at most one of its three), the DATES screen with a new HOLIDAYS filter, and the ◆ markers on Today, Week and Month. Moving holidays are always right because the dates come from Google.
- **Never counted:** holidays aren't calendar events here, so they add nothing to hours, meetings or BALANCE. Nothing is written to Notion.
- **HIDE THIS HOLIDAY** on a holiday's card adds it to IGNORED EVENTS. Systems shows which holidays calendar is linked.

## 2.20.0 · 2026-10-13 (bridge 1.22)
- **HOBBIES is now GROWTH** everywhere: Today, Week, the Bridge, BALANCE, Capture, Key Dates filters and Systems. Tasks in Notion's Personal Growth Life Area count here, as before.
- **A Growth calendar can be linked** (bridge 1.22, Script Property `GROWTH_CALENDAR_ID`). Once linked, Growth works like the farm calendar: shown on Today, Week, Month and Horizon, its hours count in BALANCE against the Growth minimum and in Review, and CAPTURE and ASK can add to it. Steps are in the README under Growth calendar.

## 2.19.0 · 2026-10-13
- **BALANCE, rethought.** Work is time to contain; everything else is attention to keep up.
  - **Work:** calendar hours over the last 7 days against a ceiling (45 h to start). Yellow with OVER BY when it runs past. No task count and no "quiet" warning, since work isn't tracked as tasks.
  - **Personal, Farm + Bees, Hobbies:** seven dots, one per day, lit when the area got attention that day (a task marked done in Notion, or time on its calendar), plus hours against a minimum where the area has its own calendar. QUIET after 5 days without attention.
  - **Systems → BALANCE TARGETS:** set the Work ceiling and the minimums (0 turns one off). Saved on this iPad.

## 2.18.0 · 2026-10-12
- **STORAGE: sort by TRACK #.** In a folder with MP3s, TRACK # reads every file's tags (just the first 64 KB of each, four at a time, with a progress line) and orders the folder by disc, then track. Rows show the number and the song's real title; later discs show as 2·01. Files without a number go last, by name.
- **The sort is remembered per folder** (TRACK # for albums, NEWEST for podcasts), and "play the next one" follows it.
- **Search also matches tag titles.**

## 2.17.1 · 2026-10-11
- **The playing pill can be minimized or closed.**
  - **›** shrinks it to a play button at the edge (remembered); **‹** brings it back.
  - **✕** pauses and puts it away until something plays again. Your place is kept under STORAGE → CONTINUE LISTENING.
  - Pages leave room at the bottom while the pill shows, so it no longer covers their last buttons.

## 2.17.0 · 2026-10-11
- **STORAGE shows artwork and real titles.**
  - **Episode tags:** when an MP3 starts playing, its title, show and artwork are read from the file itself (ID3 tags). They show on the player, in the folder and on the lock screen. Titles are remembered on this iPad.
  - **Folder art:** a picture in a folder named cover, folder, front, album, artwork or poster (.jpg, .png or .webp) becomes that folder's art. Otherwise the first picture in the folder is used. A folder without a picture borrows the artwork from the first episode played from it.
  - Nothing changes on the NAS. M4A files keep their filenames for now.

## 2.16.1 · 2026-10-11
- **STORAGE: hide a folder.** HIDE FOLDER inside any folder keeps it off Storage (handy for folders you never play from). Hidden folders are listed under **Systems → STORAGE**, each with UNHIDE. Saved on this iPad; nothing changes on the NAS.

## 2.16.0 · 2026-10-11
- **New station: STORAGE.** Browse folders on the NAS and play podcasts from them, through a small read-only relay on the NAS reached over Tailscale (setup in the README under Storage).
  - **Folders** on the front page; inside a folder, search, filters for unplayed and in progress, and A TO Z or NEWEST.
  - **Player:** back 15, forward 30, speed, sleep timer, and play the next one in the folder. A bar along the bottom of Storage, a small pill on every other screen while it plays, and lock screen and headphone controls.
  - **CONTINUE LISTENING** picks up where you stopped. Places are saved on this iPad only.
  - **Systems → STORAGE** holds the relay address and token, kept on this iPad.
- AUDIO is no longer a standby station: it's part of STORAGE.

## 2.15.4 · 2026-10-10
- **NAS check page** at `tools/nas-check.html`: a one-off test of whether TimothyOS can read the NAS over WebDAV, ahead of the Storage station. Nothing typed there is stored.
- **Offline copy stays the app.** Opening another page on the site (like the NAS check) no longer replaces the saved offline copy of TimothyOS.

## 2.15.3 · 2026-10-10
- **LOG: search runs across the top.** SEARCH THE LOG is now one bar above the calendar and the page, with FIND and EXACT WORD beside the field.
- **SAVE lines up with the right edge of the entry box.**

## 2.15.2 · 2026-10-10
- **A tidier LOG.** Fewer, better-placed buttons, in three sizes with one job each:
  - **LOCK** sits at the right end of the CAPTAIN'S LOG heading.
  - **TODAY** and **ASK CLAUDE** share one even row under the calendar.
  - **EXACT WORD** is a small switch on the SEARCH THE LOG line; the field and **FIND** are the same height.
  - **IMPORT** is a quiet link at the bottom (it's rarely needed).
  - Writing tools (**• LIST**, **+ BEARINGS**, **OPEN IN NOTION**) sit in a slim bar above the page; **SAVE** stands alone below it.

## 2.15.1 · 2026-10-10 (bridge 1.21.0)
- **LEDGER shows current figures.** Opening LEDGER now asks YNAB itself whenever the iPad's copy is more than a minute old. Before, the bridge kept its own copy of YNAB for 10 minutes and the iPad didn't ask again for 5, so you often saw an older balance.
- **Pull down to refresh** at the top of LEDGER (only there): pull, let go at RELEASE TO REFRESH, and it asks YNAB at once. **REFRESH** beside OPEN YNAB does the same.
- **The header says when YNAB was asked** ("AS OF 20:05"), and UPDATING… while it's asking.

## 2.15.0 · 2026-10-10 (bridge 1.20.0)
- **Ask Claude about the Captain's Log.** Off until you turn on SYSTEMS → CAPTAIN'S LOG → **SHARE LOG WITH ASK**. In the open LOG, **ASK CLAUDE** works on the month on the calendar, that month with the one before, or the entries a search found (**ASK ABOUT THESE**). Ready-made questions: KEY MOMENTS, THEMES, LIFTED · DRAINED, ONE PHRASE, WHAT CHANGED; or your own. THINK HARDER uses Opus.
- **PREVIEW before anything is sent:** how many entries, the dates, about how many tokens and the cost, with a note above about 25K tokens. **SEND** only then.
- **Answers you can follow:** dates in the answer open the entry, and follow-ups reuse the same entries (usually under 1¢).
- **SAVE TO NOTION** keeps an answer as a "Claude insight" in the Captain's Log database (undated, so it never appears as a day); **SHOW SAVED** reads them back.
- **Limits, checked on the bridge:** 62 entries, about 60K tokens and two months per question, and your authorization code every time. Claude gets nothing but the chosen entries and has no tools. Answers are forgotten when the log locks.
- **Weekly summary with the log:** with sharing on, REVIEW's WRITE SUMMARY asks for your authorization code and adds that week's entries. WITHOUT THE LOG writes it as before.

## 2.14.2 · 2026-10-10
- **Fixed: a book's notes showing on the next book.** After writing notes on one book in LIBRARY, opening another showed the same notes (and DONE could have saved them to it). Each book now opens with its own notes. Notes you cancel go nowhere.

## 2.14.1 · 2026-10-09
- **No seam when you tap BRIDGE.** The tap's light-up brightened the corner alone, so for a moment you could see where it meets the top bar. The corner, its inner curve and the bar now light up together, as one piece.

## 2.14.0 · 2026-10-09 (bridge 1.19.0)
- **Bulleted lists in the Captain's Log and REVIEW.** Type **- ** at the start of a line and it becomes **• **. Return starts the next bullet; Return on an empty bullet ends the list. **• LIST** (beside SAVE in the LOG, and beside each REVIEW question) turns the current line, or the lines you've selected, into bullets and back, without hiding the keyboard. Undo works as usual.
- **In Notion, LOG bullets are real list items** (bridge 1.19), so a page reads as a proper list there too, and lists made in Notion now open and edit in the LOG. When an entry is reopened, a list sits a blank line apart from the paragraphs around it. REVIEW answers keep their bullets as lines of text in the week's Notion page.
- **Editing an entry rewrites only what changed.** Before, every paragraph after the first change was rewritten too.

## 2.13.0 · 2026-10-09
- A few things aboard for the crew to discover.

## 2.12.2 · 2026-10-09
- **Fixed: Plan Day stuck on "Loading your Master Task List…".** The iPad keeps task lists for a few days, and it kept the four latest dates. Once lists for later days were stored (from looking ahead on TODAY, say), today's list was dropped the moment it arrived, so Plan Day went back to loading while the app fetched it again and again. It now always keeps today's list and the day you're planning, then the most recently fetched (up to eight, nothing older than three days). A safety net also stops any repeat fetch of the same day within 15 seconds unless you ask for it.

## 2.12.1 · 2026-10-09 (bridge 1.18.0)
- **Plan Day and Priorities open at once on a new morning.** Each day used to start with no task list until the bridge answered. Now they show the most recent list straight away (marked **UPDATING**), with today's picks taken from each task's Focus Date, and swap in the fresh list when it arrives. Picks you change in the meantime are kept.
- **The task list no longer waits behind everything else.** The bridge answers a combined request one item at a time, so the startup request had grown long as modules were added. It's now two requests sent together: what's on screen first (calendars, tasks, key dates, habits), and the rest (balance, reviews, ledger, library, Ask's spend) alongside.
- **Bridge 1.18:** the task list's two Notion lookups (today's picks and every open task) run at the same time instead of one after the other.

## 2.12.0 · 2026-10-09 (bridge 1.17.0)
- **Authorization codes for the LOG.** Like a Starfleet override ("Riker, Alpha 6-9-3"): the LOG's lock panel now shows six code words (ALPHA, BETA, GAMMA, DELTA, THETA, OMEGA) above the keypad. Tap your word, then four digits. Once chosen, your word shows only as a filled slot, never by name. ⌫ takes back the digits, then the word. With a keyboard: a, b, g, d, t or o, then the digits.
- **Set it in the bridge:** Script Property `LOG_PIN` becomes your word and four digits, for example `OMEGA-0000` (spaces, no separator or the Greek letter itself work too). A six-digit PIN still works until you change it.
- **Longer lockouts in a row.** Five wrong tries still lock the LOG for 15 minutes; each lockout straight after another now lasts twice as long (up to a day), and the panel says until when. Getting it right resets this. A word and four digits has fewer combinations than six digits, so this keeps guessing impractical.

## 2.11.0 · 2026-10-09 (bridge 1.16.0)
- **SEARCH THE LOG.** Under the calendar in LOG: type a word or phrase and tap **FIND** (or Return). Every entry that uses it is listed newest first, grouped by year, with the date, how many times it appears and the words around it highlighted. Capitals don't matter; a phrase matches across line breaks.
- **EXACT WORD** (on to start) finds "homework" but not "homeworks". Turn it off to include longer words that start or end with what you typed.
- **Open a result** and the entry shows with **RESULTS** to go back, **NEWER** and **OLDER** to step through the matches, and the lines where your words appear. The calendar follows along.
- **How it stays quick:** each entry's text is also kept in a new **Search Text** field on its Notion page, so one search is one request, not one per day. Saves and imports fill it from now on. Older entries are filled in while the log is open, newest first, with a progress bar under the search box.
- Same PIN as the log. Searches and results stay in memory only and are forgotten when the log locks. Ask still can't see the log.

## 2.10.2 · 2026-10-09
- **Waking from Standby is smooth all the way.** The fade back to the app used to be cut off part-way (about a third of a second in, with the screen still mostly black) and the app popped in. Now it runs to the end, easing out over just under a second, for both the STANDBY button and the automatic timeout. Falling asleep is unchanged.

## 2.10.1 · 2026-10-09
- **LOOM: swipe left for the future, right for the past.** Your finger now pulls the coming days in from the right, where they wait on the loop. Everything else is unchanged: the layout, the arrows (right still steps forward) and TODAY.

## 2.10.0 · 2026-10-08
- **NEEDS YOU on Systems.** A Condition item that sends you to SYSTEMS (task list didn't load, sync failing, captures not saved) now opens on a card at the top saying what happened and the steps back to green, matched to the actual error: connect the database in Notion, check a key, redeploy, or simply try again. The first step is a button (**RETRY NOW**, **REFRESH NOW**, **SEND NOW**), and **DETAILS IN …** jumps to the section below.
- **A tab on the right edge** (▲ 1 NEEDS YOU) appears once the card is scrolled away and brings you straight back to it.
- **Fixed?** The card turns green, says whether anything else remains on the Bridge, and offers **BACK TO BRIDGE**. If a try doesn't work, it says so and points to the next step.

## 2.9.0 · 2026-10-08 (bridge 1.15.0)
- **Ask now uses Sonnet; THINK HARDER uses Opus.** Questions go to Sonnet 5.5 at low effort (about 1 to 2¢ each), THINK HARDER to Opus 5.5 (about three times that), weekly summaries stay on Sonnet. Haiku is no longer used; `AI_FAST_MODEL` = `claude-haiku-5-5` brings it back.
- **A reminder at $8, a ceiling at $10.** At $8 Ask pauses and offers **CONTINUE THIS MONTH**; one tap carries on until the Claude Console's own $10 limit stops it. The meter in SYSTEMS runs to $10 with a mark at the reminder.
- **A spend count closer to the Console.** Costs are worked out at each model's current list price, including dated model names; a model with no known price is flagged instead of guessed high.
- **RECENT QUESTIONS** in SYSTEMS → ASK CLAUDE lists the last eight: when, which model, tokens in and out, and cost (never the question itself).
- **MATCH THE CONSOLE:** type the month's figure from the Claude Console and the count lines up with it from there.

## 2.8.1 · 2026-10-08
- **LOOM reads top to bottom.** Each day's beads now run in time order from the top: the morning's first event is highest and the day's last sits on the loop, matching the list beside it.

## 2.8.0 · 2026-10-08
- **Command Gold.** The BRIDGE corner and the bar across the top are now gold, warming into apricot to the right: one piece, on every screen, and the only place the color appears. On the Bridge they carry a faint glow (they used to turn cream).
- **Apricot joins the side bar** as a fourth LCARS color, so no two neighbouring buttons match. It also marks the RESOURCES group in ALL STATIONS, the Replicator Queue, Systems → APP and the Library's typical-book figure.
- **CAPTURE's date field fits again.** Since 2.7.0 it stretched to full width and ran past the edge of the sheet on the iPad.

## 2.7.3 · 2026-10-08
- **ASK (and every other panel) stays below the iPad's status bar.** Panels now fit the part of the screen you can see: below the faded top strip, and above the keyboard while you type.
- **TOP SPACING is gone from Systems.** The space below the status bar is fixed at the MORE setting you chose.

## 2.7.2 · 2026-10-08
- **The screen no longer zooms.** A quick double tap (a PIN with a repeated digit, say) counts as two taps instead of zooming the whole app, and an accidental pinch is ignored. TimothyOS always stays at its full-screen size. The iPad's own Accessibility Zoom is unaffected.

## 2.7.1 · 2026-10-08
- **REVIEW no longer scrolls sideways.** The week numbers under HABITS PER WEEK (ALL REVIEWS) borrowed the Week screen's width and pushed the page wider than the screen.
- **Replicator Queue, by price.** A new item lands just above the first item that costs more, instead of at the bottom; items with no price yet still go last. The order you set with the arrows is kept as it is. When the queue is out of price order, **PRICE ORDER** sorts it lowest to highest in one tap.

## 2.7.0 · 2026-10-08 (bridge 1.14.0)
- **Stations.** The bar now holds the seven stations you pin. The block below them is **ALL STATIONS**: every screen in three groups (TIME, REFLECT, RESOURCES), with AUDIO and MEALS waiting under STANDBY. **EDIT PINS** there swaps what sits in the bar; it changes as you tap and is kept on this iPad. While you're on a screen that isn't pinned, ALL STATIONS lights up and names it. Starts with TODAY, WEEK, LOOM, REVIEW, LOG, HABITS, LIBRARY (MONTH, DATES and LEDGER are one tap further in).
- **HABITS** (new): meditated, evening walk, water in 1 L bottles (half-bottle steps; goal 3 L, change it under the tiles) and the debit card (DID NOT SWIPE or SWIPED). One tap each; the day saves to a new 🔁 Habits database in Notion a moment later, and taps made offline wait on the iPad until they land. Streaks (now, best, 30-day rate) and a 12-week grid; tap a square or use the arrows for an earlier day. A day you don't touch stays blank, never counted as a miss.
- **On the Bridge:** HABITS · TODAY under NOW / NEXT, the same four in one tap each.
- **On REVIEW:** the week's habits day by day, against your 12 weeks before; ALL REVIEWS trends gain HABITS PER WEEK. Read live from the Habits database, so a day changed later shows there too.
- **LIBRARY** (new): READING, WANT TO READ, READ (by year, with stars and days to read) and SET ASIDE, with books read this year, your typical days per book and most-read author. **+ ADD BOOK** searches Open Library as you type (title, author, year, cover), or adds by hand. Tap a book to move it, set dates, rate it, write notes, or remove it (to Notion's trash). Kept in a new 📚 Library database in Notion.

## 2.6.0 · 2026-10-08
- **TIME LOOM** (new screen, under LOG): your calendars and key dates on an infinity loop, with the focused day at the crossing. The coming days ride the top of the right loop; the days just past carry on round the lower left. **Swipe right to move forward**, left to go back; it coasts after a swipe and settles on a day. The arrows step a day and **TODAY** glides home.
- Each day's events hang from it as beads in their calendar's color, and key dates sit below as diamonds. Days near the crossing are large and named; the rest shrink and fade round the loop. Weeks are shaded in turn along the thread.
- Beside the loom: the focused day's events and key dates (tap one for its details), and the next four key dates with a countdown. Tapping one of today's beads on the loom opens that event; tapping any other day glides to it.
- Hidden calendars and ignored titles stay out, as everywhere else. Moving a fortnight or more fetches the events around the new day.

## 2.5.6 · 2026-10-08
- **Tidier side panel:** the empty block at the foot of the left panel is now the same height as the screen buttons above it; the SYSTEMS block takes up the rest of the space.

## 2.5.5 · 2026-10-08 (bridge 1.13.0)
- **REFRESH NOW shows it's working:** a turning ring and REFRESHING… until every request it started (and any retries) has finished, then SYNCED ✓ for a moment.
- **Fewer of Google's lost answers:** reads asked for at the same moment, such as on returning to the app, now travel together as one request (shown as SYNC in Systems), so Google runs one execution instead of five. Google's servers sometimes run a request and then lose the answer (HTTP 404); five requests at once made that far more likely. Each read still answers on its own. An older bridge gets them one at a time as before.
- **Recent requests tells retries from failures:** a failed attempt that was tried again is marked RETRIED in amber; only red lines are real failures, and the header counts them separately.

## 2.5.4 · 2026-10-08 (bridge 1.12.0)
- **Ask runs on Claude Haiku 5.5** for everyday questions, at low effort: newer, better at following instructions and using the app's tools, with a 1M-token window, at about a tenth of Haiku 4.5's price ($0.10 / $0.50 per million tokens, against $1 / $5). THINK HARDER and summaries stay on Sonnet 5.5.
- The bridge counts Haiku 5.5 at its own price in the monthly budget, leaves room for its brief thinking (answers up to 4,000 tokens), and sends none of the settings it rejects.
- **compareModels** in the script editor asks five everyday questions of Haiku 4.5 and Haiku 5.5 (low and medium effort) with your real calendar and tasks, and logs answers, time and cost side by side. Nothing is changed; proposals are only listed.
- **Switch back any time:** Script Property `AI_FAST_MODEL` = `claude-haiku-4-5`.

## 2.5.3 · 2026-10-08 (bridge 1.11.0)
- **Steadier LOG.** Opening the log, reading a day and the list of written days now travel as plain GET requests (the access key and PIN in the address), the same way every calendar sync does. POST requests could lose their details on a Google redirect, which the bridge reported as "The access key doesn't match".
- The bridge now tells apart a request that arrived **without** its key (`no_key`), a moment when Google's settings store didn't answer (`key_unreadable`), and a genuinely **wrong** key (`unauthorized`). The app retries the first two on its own, everywhere in the app; only a wrong key shows the access key message.
- Opening the log is faster: the list of written days is kept by the bridge for 6 hours and updated in place when you write a new day, instead of being re-read from Notion after every save.

## 2.5.2 · 2026-10-08
- **LOG, jump to a month:** tap the month name above the calendar. Pick a year (from your first entry to now), then a month; a dot marks months you wrote in, and months still ahead are closed. Tap the name again to close it.
- **LOG, saving shows:** when a save lands, the bar beside the day's name fills left to right and fades, and the status flashes. Tapping SAVE also reads **SAVED ✓** for a moment. Autosave (5 seconds after you stop typing) shows the same small bar, without stealing the keyboard or the caret.

## 2.5.1 · 2026-10-07 (bridge 1.10.1 optional)
- **Import that finishes on its own:** a request that doesn't go through is retried automatically with growing pauses (10 s up to 2 min), and the screen says so. Only a PIN or setup problem stops it.
- **True progress:** IMPORT shows **IN NOTION: X of 278 · N to go**, counted from the days Notion actually holds. Pasting the same export again sends only what's left (**IMPORT THE N LEFT**).
- Smaller requests (3 days each instead of 5), which fail less often.
- Bridge 1.10.1: if Google's settings store answers empty for a moment, the bridge reads the access key again instead of refusing a good request with "The access key doesn't match".

## 2.5.0 · 2026-10-07 (needs bridge 1.10.0 + LOG_PIN; Captain's Log connected in Notion)
- **LOG:** a plain journal in the left panel. A calendar of days (a dot where you've written) and a blank page for each day, stored as one page per day in the new **📓 Captain's Log** database in Notion. No reminders, no streaks, no counts.
  - **PIN:** opening LOG always asks for your 6-digit PIN (Script Property `LOG_PIN`), on a keypad or a keyboard. The bridge checks it; five wrong tries lock the log for 15 minutes.
  - **Locks** when you leave LOG, tap LOCK, the app goes to the background, standby starts, or after 10 minutes without a touch. Entries are never stored on the iPad.
  - **Saves** 5 seconds after you stop typing, on SAVE, and when it locks. Unsaved writing stays on the iPad until Notion has it. Editing an earlier day changes only the paragraphs you changed.
  - **+ BEARINGS** adds your bearings as a closing block. Today's intent from the Bridge shows above today's page.
  - **IMPORT:** paste a diary app's text export; it checks the days, then brings them in five at a time, skipping days already written.
  - **Never sent to Ask.**
- The Bridge panel for the daily intent and bearing is now titled **INTENT + BEARING**, so it isn't confused with the journal.

## 2.4.3 · 2026-10-08
- Standby: when nothing is left on today's calendar it reads **Clear for the rest of the day**, with tomorrow's first item in small print below. Tomorrow's items take the main line only after midnight.
- Tests: the sync-recovery check now waits for the app's retry (30 s, then 60 s) instead of checking at a fixed moment; under load it occasionally checked too early.

## 2.4.2 · 2026-10-08
- **Calmer standby:** one centered column, one typeface and three sizes (the clock, the event title, small spaced capitals). The date and weather share one line under the clock; a short rule; next up as time and countdown, the title on one line, then what follows; condition and key date on one quiet line. The calendar color is a small dot, like the condition. Same information, less clutter.

## 2.4.1 · 2026-10-08
- Fix: text typed into a form could vanish when a sync landed mid-entry. The screen redraws when fresh data arrives, and it kept only the field in use: adding "New glasses" with a price, then tapping the note field, cleared the item and price. Everything typed since the last redraw now survives in every field on every screen. A field you haven't touched still shows fresh data, and the Replicator Queue form clears once the item is added.

## 2.4.0 · 2026-10-08
- **Standby:** after 15 minutes without a touch, the screen fades to a dim clock with the date, weather (high and low), **Next up** with a countdown and what follows, the condition and the next key date. Amber and dimmer from 22:00 to 06:00. Tap anywhere to wake; that tap only wakes the screen. Content drifts a few pixels each minute so nothing burns into an OLED screen.
  - **STANDBY** at the right end of the top bar starts it any time, like a screensaver.
  - **SYSTEMS → STANDBY:** Off, 5, 15 or 30 minutes; STANDBY NOW; and whether iPadOS is keeping the screen on.
- **Motion,** quick and only when you do something: buttons light up when pressed, screens rise in, sheets slide up and back down, + details ease open (+ turns into −), bars grow when a screen opens, a priority marked done pops, Replicator Queue items slide to their new place, and the condition color crossfades when it changes. Background syncs never animate. Reduce Motion on the iPad turns all of it off.

## 2.3.2 · 2026-10-07
- The **SYSTEMS** button is gone from the left panel. Tap the **SYNCED** status in the bottom-left corner to open Systems; it lights up while Systems is open. More room in the panel for future screens.

## 2.3.1 · 2026-10-07 (bridge 1.9.2)
- The Replicator Queue's fund category is found even with an emoji or symbols in its YNAB name: "🪽 Discretionary" matches "Discretionary". Systems shows the name without the emoji, like other labels.

## Bridge 1.9.1 · 2026-10-07 (app unchanged)
- Fix: a YNAB plan younger than 12 months stopped the Ledger with "ynab_not_found". Months before the plan began are now skipped.
- If an account only answers on YNAB's older `/budgets` address, the bridge falls back to it and remembers.
- Setup names the YNAB request that failed and, for "not found", lists the plans the token can see with their IDs (for `YNAB_PLAN_ID`).

## 2.3.0 · 2026-10-07 (needs bridge 1.9.0 + YNAB_TOKEN; Replicator Queue connected in Notion)
- **LEDGER** (new screen in the left panel): your finances from YNAB at a glance. Read-only; YNAB stays where you budget.
  - **Accounts:** checking in large type, age of money with its 12-month trend, savings, and loans with % paid off.
  - **Average spend** by category for the last 3, 6 or 12 months, with this month so far. Tap a category for detail; **+** shows the smaller ones.
  - **Replicator Queue:** things to buy once the **Discretionary** category can cover them, funded top-down in priority order. Reorder, add, mark bought, undo. Lives in Notion.
- **Ask Claude** never sees your finances unless you turn on **SYSTEMS → LEDGER → SHARE WITH ASK**.
- Bridge 1.9.0: `ledger` (YNAB, GET only, cached), `queueadd`, `queueorder`, `queuebought`.

## 2.2.0 · 2026-10-06 (farm calendar needs bridge 1.8.0 + FARM_CALENDAR_ID)
- **Farm calendar goes live:** once linked, your farm and bee calendar joins Work and Personal on Today, Week, Month, the Bridge (Now/Next, Horizon, clashes, Balance hours) and Review, in amber, under the calendar's own name.
- **Capture** has a chip for it (your last choice is remembered). **Ask** can propose events for it; nothing is added until you CONFIRM.
- **Review** shows its hours beside Work and Personal and saves them as Hours Farm; the Review log's hours chart stacks them.
- Clash alerts name both calendars.
- Bridge 1.8.0: reads and writes the calendar set in Script Property `FARM_CALENDAR_ID`; setup reports it. Work stays read-only.

## 2.1.1 · 2026-10-06
- Fix: opening a week from REVIEW made the header wrap to two lines on the iPad, which squeezed the left bar into a thin stripe above SYSTEMS. The week's header now matches the Week screen (week number above, dates as the title), and **ALL REVIEWS** takes the place of THIS WEEK, so the header stays on one line and the left bar looks the same on every screen.
- The left bar is also sturdier: if the header ever needs two lines (for example in Split View), the buttons give a little height evenly instead of leaving a sliver.

## 2.1.0 · 2026-10-06 (needs bridge 1.7.0 for trends and the full list)
- **Review log:** REVIEW opens on a landing page.
  - **Up next:** the week that's due and this week.
  - **Trends, last 12 weeks:** reviews saved, week streak, priorities kept, average hours, and an hours-per-week chart. **+** adds priorities kept, tasks finished and where the work went by Life Area. Tap a bar for its values.
  - **PATTERNS:** Claude (Sonnet 5.5) names what keeps coming up across your saved reflections. About 8¢, only on tap.
  - **All reviews by month,** with each week's numbers and next focus. Tap a week to open it; **◀ ALL REVIEWS** comes back. The Bridge reminder still opens the due week directly.
- **Four questions:** What went well? · What drained me? · What's my next focus? · Where did I hold my bearing? All four are equal; none is marked optional.
- Bridge 1.7.0: `reviews` (saved reviews, newest first) and the `patterns` ask mode.

## 2.0.2 · 2026-10-06
- **Week view, easier to read:** focus hours (07:00 to 21:00) are taller (72 px an hour), so a 30-minute meeting has room for its title. Every block now shows its title: short ones on one line ending in "…", longer ones wrapped with their start time on top. Slightly more padding inside blocks.

## 2.0.1 · 2026-10-06
- **Calmer Bridge:** one type scale (hero 40, count 28, title 19, body 17, secondary 15, label 13) with one letter spacing per role. Visible text styles on the Bridge went from 28 to 15.
- **Details behind +:** each panel title has a + that shows its secondary readouts (booked and open hours, wind, rain, sunrise and sunset, hive and frost notes, the due and overdue list, the Horizon legend, Key Dates buttons, the Balance note). Your choice is remembered per panel.
- **More room:** wider spacing between sections and under the condition banner; smaller buttons inside panels; Horizon bars use their space better.

## 2.0.0 · 2026-10-06 (needs bridge 1.6.0 + ANTHROPIC_API_KEY)
- **ASK is live:** the ship's computer, powered by Claude.
  - Type or dictate questions. Each one carries a snapshot of what the app shows; Claude can look further through the bridge.
  - **Changes need your CONFIRM:** add a task, pick or unpick a priority, change a status, add a key date, add a Personal calendar event or reminder, draft a weekly review. The Work calendar is never offered.
  - **Haiku 4.5** by default; **THINK HARDER** uses **Sonnet 5.5**.
  - Each answer shows its cost; the month so far shows in the sheet and in **SYSTEMS → ASK CLAUDE**.
  - **OPEN IN CLAUDE** copies the snapshot and opens the Claude app for long conversations.
- **Review:** **WRITE SUMMARY** drafts the week's Claude Summary (Sonnet 5.5); it saves with the review.
- Bridge 1.6.0: `ask` (tool loop with read tools and proposals only), `aispend`, a monthly budget that stops calls (`AI_BUDGET_USD`, default $8), and review saves that change only the fields sent.
- Fix: the Systems screen no longer scrolls sideways on a phone.

## 1.9.1 · 2026-10-06
- Fix: on the Bridge, the lit BRIDGE corner met the mauve top bar with a visible seam. The corner, its curve and the top bar are one piece again: the whole arm lights up on the Bridge and returns to mauve elsewhere.

## 1.9.0 · 2026-10-06 (needs bridge 1.5.0 + Weekly Reviews connected)
- **REVIEW unlocked:** a weekly look back, then a reflection saved to Notion.
  - **Time:** hours per calendar with the change from the week before, busiest day, open hours 07:00 to 21:00, work events. Ignored events are left out.
  - **Output:** tasks finished, by Life Area (all of them, as plain labels), plus the list.
  - **Priorities kept:** picked, done and still open.
  - **Intent log:** the week's Captain's Log lines.
  - **Next week:** heavy days, key dates, tasks coming due.
  - **Reflection:** Went well, Drained me, Next focus, Bearing. Kept on the iPad as you type; **SAVE TO NOTION** writes one page per week (saving again updates it).
  - **◀ ▶** browse earlier weeks.
- **Bridge:** **Weekly review due** from Sunday 14:00 to Tuesday night, until saved.
- New Notion database **🧭 Weekly Reviews** (in the Life Hub).
- Bridge 1.5.0: `week` (finished and picked tasks for a week, plus its saved review) and `savereview` (create or update that week's page).

## 1.8.0 · 2026-10-06
- **Ignored events:** events that only exist to block bookings (such as a weekend-long out-of-office block on the work calendar) can be left out of everything: Day, Week, Month, the Bridge (Now / Next, Horizon hours and heavy days, clashes, Balance hours), Life Area counts and Plan Day.
  - Quickest: tap the event, then **IGNORE THIS TITLE**.
  - Or **SYSTEMS → CALENDARS → IGNORED EVENTS**: one title per line; any event whose title contains it is left out. Shows how many events are being left out.
  - Saved on this iPad. Google Calendar is not changed, so customers still see you as unavailable.

## 1.7.4 · 2026-10-06
- The Bridge is one full-width column instead of two, in this order: date and time, condition, Now / Next, Environment, Priorities, Horizon, Key Dates, Balance, Captain's Log and bearing.

## 1.7.3 · 2026-10-06
- Fix: frequent "Couldn't reach the script" and OFFLINE flicker.
  - Requests cut off when the iPad sleeps or switches apps are re-run when you come back, instead of failing.
  - Dropped connections are retried up to 3 times (they weren't retried before).
  - The task list refreshes every 5 minutes in the background, not every minute. Your own actions (check-off, Plan Day, Refresh) still refresh at once.
  - At most 2 bridge requests run at once; the rest wait their turn.
  - Requests wait up to 45 seconds for an answer (was 30).
- A short failure over good saved data no longer turns the status OFFLINE or paints red errors. The status reads SYNCED · RETRYING and panels show a quiet "Showing 07:40. Retrying." note. It turns OFFLINE only after 3 failures in a row, or when the iPad has no connection.
- **SYSTEMS → RECENT REQUESTS:** the last 12 bridge requests with how long each took and how it ended (OK, DROPPED, TIMEOUT, in background), plus failures in the last hour.

## 1.7.2 · 2026-10-06
- No emoji in the interface. Buttons read PLAN DAY, ASK, CAPTURE, SAVE, UPDATE READY; the day arrows are drawn shapes.
- Notion labels show as plain text (High, Work & Calling, Deadline). Notion itself is unchanged, and the app still sends the original values back.
- Plain marks remain where they carry meaning: ◆ key dates, ▲ ▼ ✕ on condition items, ✓ on checkboxes.

## 1.7.1 · 2026-10-06
- Fix: the iPad status bar (clock, battery) could cover the top line of the app. The app now leaves clear space below it, keeps a solid strip behind it, and no longer stretches when pulled down.
- **SYSTEMS → APP → TOP SPACING:** Standard, More or Most, if the top still looks crowded. Also shows the status bar height the iPad reports.

## 1.7.0 · 2026-10-06 (Balance needs bridge 1.4.0)
- **The Bridge:** a new overview screen. Tap **BRIDGE** in the top-left corner. The app now opens here (change it in **SYSTEMS → BRIDGE**).
- **Condition banner:** GREEN, YELLOW or RED, listing every item that needs you: overdue tasks, Work and Personal clashes, key dates within 3 days, unpicked tasks due today, no priorities by 10:00, frost tonight, stuck captures, failing sync. Tap an item to go fix it.
- **Now / Next:** free time or time left, the next event, a 07:00 to 21:00 strip of the day (clashes outlined in red), booked and open hours.
- **Priorities** with check-off, plus tasks due or overdue that aren't picked.
- **Horizon:** hours booked for the next 7 days with key-date markers and heavy-day warnings.
- **Key Dates:** the next three, with countdowns.
- **Environment:** weather, hive check and frost watch from Open-Meteo, once a location is set.
- **Balance:** tasks finished per area in the last 7 days, Work and Personal hours, quiet areas. Needs bridge 1.4.
- **Captain's Log** (one line of intent per day) and **Bearings** (your guiding words, one per day). Both stay on the iPad.
- Bridge 1.4.0: adds a read-only `done` action (Life Area and date of recently finished tasks, no titles).

## 1.6.1 · 2026-10-06
- Fix: if a save reached Google or Notion but the reply was lost, the item stayed queued and kept retrying. The app now checks what's already saved before resending and clears those items ("already saved"), so nothing is duplicated, even after the 6-hour duplicate guard expires.
- Systems shows why a queued item is still waiting ("Last reply: …").
- Saves wait up to 60 seconds for a reply (was 30), to ride out a slow first run of the bridge.

## 1.6.0 · 2026-10-06 (needs bridge 1.3.0)
- **Key Dates** from the new 🗓️ Key Dates Notion database: deadlines, windows (start and end), birthdays and other yearly dates.
- Today: **Key Dates panel** with countdowns for the next 30 days ("IN 6 D", "19 D LEFT", "ENDS TODAY").
- **DATES screen** unlocked: happening now, then the next 12 months by month, with an area filter.
- ◆ markers on Day (including "DAY 6 OF 25" inside a window), Week and Month views. Tap for details and an Open in Notion link.
- **Capture → KEY DATE**: Life Area, Type, optional end date, ↻ yearly. Works offline through the same queue.
- Plan Day shows key dates coming up in the next 14 days.
- Capture error messages clear as soon as you change the form.
- Bridge 1.3.0: reads and adds key dates; nothing else.

## 1.5.1 · 2026-10-06
- Fix: Google's servers occasionally answer a bridge request with a 404 or an error page even though the script ran. The app now retries those automatically (up to twice). Every bridge action is safe to repeat, so retries never duplicate events or tasks.
- Captures hit by those errors stay queued instead of being marked NOT SAVED.
- Clearer message if the error persists after retrying.

## 1.5.0 · 2026-10-06 (needs bridge 1.2.0 + Notion link)
- **Plan Day:** pick up to three priorities from your Notion Master Task List. Suggestions are grouped: carried over, overdue, due in 7 days, high priority or in progress, plus all other open tasks. Shows the day's events, first meeting and longest open stretch. Add a new task right from the sheet.
- **Priorities panel** on Today: tap to mark ✅ Done in Notion, tap again to reopen. Plan any future day from its Today view.
- Systems shows the Notion connection.
- Bridge 1.2.0: Notion API (2025-09-03). Reads the Master Task List; writes only Focus Date, Status and new tasks; refuses pages outside that database. Notion key stays in Script Properties.
- Notion: added a **Focus Date** field to the Master Task List.

## 1.4.0 · 2026-10-06 (needs bridge 1.1.0)
- **Capture:** add events to the Personal calendar from the ▶ CAPTURE button, or by tapping an empty spot on the Day or Week timeline. Pick today, tomorrow or any date, a start time, and a length (15 min to 2 hr, or all day).
- Captures appear immediately as dashed blocks, save in the background, and wait in a queue when offline. Status block shows QUEUED and NOT SAVED counts.
- Systems lists anything waiting, with Retry and Discard.
- Bridge 1.1.0: adds a create-only write path limited to Personal, duplicate protection, and remembers the work calendar ID across code updates.
- Temporary Google errors are retried instead of failing.

## 1.3.0 · 2026-10-06
- Top-left corner reads BRIDGE. TimothyOS and the version stay in the top bar.
- Tap the Work or Personal row on Today to hide or show that calendar. The choice applies to Day, Week and Month, is remembered between launches, and is labeled wherever a calendar is hidden.

## 1.2.0 · 2026-10-06
- Day and Week views show every hour, 00:00 to 23:59. Focus hours (07:00 to 21:00) are twice as tall as the others, which keep a faint shading.
- Both views scroll. Week view keeps the day headers fixed while the hours scroll, and opens at the current time (or 07:00 for other weeks).
- Event titles stay pinned to the top of the visible area while you scroll through a long event.
- Hour lines added to the Week view.
- Replaces the 1.1.0 compressed night bands.

## 1.1.0 · 2026-10-06
- Day and Week views give the focus hours (07:00 to 21:00) most of the height. Overnight hours (00:00 to 07:00, 21:00 to 24:00) shrink to thin shaded bands, so all-day blocks no longer squeeze the work day.
- Week view fits the focus hours to the iPad screen height.
- Events that start overnight show their title at 07:00, where it's visible.
- New "UPDATE READY · TAP TO LOAD" banner when a newer version is published.
- The app revalidates its page on every launch, so updates arrive sooner.
- `tools/bump_version.py` sets the version everywhere in one step.

## 1.0.0 · 2026-10-06
- Calendar Core: work + personal Google Calendars in Today, Week and Month views, read through the Apps Script bridge. Offline cache, Systems screen, standby stubs.
