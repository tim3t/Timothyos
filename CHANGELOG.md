# Changelog

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
