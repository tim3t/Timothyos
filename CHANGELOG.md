# Changelog

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
