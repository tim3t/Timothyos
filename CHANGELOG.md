# Changelog

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
