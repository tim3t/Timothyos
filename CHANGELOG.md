# Changelog

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
