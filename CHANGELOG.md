# Changelog

## 1.1.0 · 2026-10-06
- Day and Week views give the focus hours (07:00 to 21:00) most of the height. Overnight hours (00:00 to 07:00, 21:00 to 24:00) shrink to thin shaded bands, so all-day blocks no longer squeeze the work day.
- Week view fits the focus hours to the iPad screen height.
- Events that start overnight show their title at 07:00, where it's visible.
- New "UPDATE READY · TAP TO LOAD" banner when a newer version is published.
- The app revalidates its page on every launch, so updates arrive sooner.
- `tools/bump_version.py` sets the version everywhere in one step.

## 1.0.0 · 2026-10-06
- Calendar Core: work + personal Google Calendars in Today, Week and Month views, read through the Apps Script bridge. Offline cache, Systems screen, standby stubs.
