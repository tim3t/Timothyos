# Bridge actions

Working notes for Claude, moved out of `CLAUDE.md` on 2026-11-11 (the index there lists every notes file). Text below is unchanged from before the move.

## Bridge actions

| Method | action | Does | Notes |
|---|---|---|---|
| GET | `ping` | version, capabilities, calendar + Notion status, Ask spend | |
| GET | `batch` `calls` (JSON list, ≤ 8) | runs each read in `BATCH_READS` through `read_()`, `results[]` | each result has its own ok/error |
| GET | `events` `from` `to` (epoch ms, ≤ 62 days) | events from every linked calendar (Work, Personal, farm, Growth) | declined personal events hidden; untitled = `Busy` |
| GET | `holidays` `from` `to` | US holidays in range | read-only; never counted in hours |
| GET | `tasks` `day` (yyyy-mm-dd) | `focus` (Focus Date = day) + `open` tasks + Life Area options | |
| GET | `dates` | all key dates + Life Area and Type options | app computes yearly repeats and countdowns |
| GET | `week` `week` (Monday yyyy-mm-dd) `from` `to` (local midnights, ISO) | tasks finished (last edit in range), tasks picked (Focus Date in week), saved review | `reviewsError` set if Weekly Reviews isn't connected; the rest still returns |
| GET | `aispend` | this month's Ask spend `{month, usd, calls, budget, cap, cont}` and `log` (last 25 calls: time, mode, model, tokens, usd; never text) | |
| GET | `done` `days` (1 to 60) | Life Area + last-edit time of tasks marked Done | no titles; feeds the Bridge's Balance panel |
| GET | `inbox` | `waiting[]` (Status New, oldest first) and `kept[]` (newest first, ≤ 200): `{id, url, text, at, status, as}`, `url` | batchable; cached 2 min per inbox generation (1.33) |
| POST | `inboxadd` `note{cid, text ≤ 2000, at}` | one page: Note, Captured (script time zone), Status New | repeat-safe by cid (1.33) |
| POST | `inboxset` `id` `status` (new / sorted / kept) `as` (task / date / event / queue, only with sorted) | sets Status and Sorted As | only Inbox pages (`inboxOwn_`), set-to-value (1.33) |
| POST | `inboxremove` `id` | moves the page to Notion's trash | only Inbox pages (1.33) |
| GET | `sky` `lat` `lon` (rounded to 0.01°) | `aircraft[]` within 50 km, nearest first, ≤ 60: `{hex, cs, reg, type, alt, gs, track, km, dir, sq, mil, emergency, cat}`, `source` | adsb.lol, then adsb.fi; cached 8 s; not batched (1.34) |
| GET | `sciencefeeds` `lat` `lon` | `tle{iss, css, hst}` (CelesTrak, 12 h), `bands` (hamqsl, 1 h), `birds[]` (eBird notables with `EBIRD_API_KEY`, 1 h), `ebird`; `tleError` / `bandsError` / `birdsError` per part | batchable (1.34) |
| GET | `sciencelog` `from` `to` (yyyy-mm-dd, ≤ 400 days) | `events[]` newest first: `{id, url, title, at, dept, kind, detail, value, starred, key}` | batchable; cached 2 min per science generation (1.34) |
| POST | `sciencelogadd` `events[]` (≤ 25: `{key, at, dept, kind, title, detail, value, starred}`) | `added[{key, id}]`, `skipped[{key, id}]` | an event whose Key is already in Notion (or in the 6 h `skey:` cache) is skipped (1.34) |
| POST | `sciencestar` `id` `starred` | sets Starred | only Science Log pages, set-to-value (1.34) |
| GET | `year` `from` `to` (ISO local midnights, ≤ 400 days) | `done[{area, at}]` (tasks marked Done by last edit, no titles), `bought[{day, cost}]` (Replicator Queue); `doneError` / `boughtError` per part | read-only; batchable; cached 5 min per task generation (1.32, ASTROMETRICS) |
| GET | `exportstatus` | `export` {weekly, keep, last {ok, at, done, name, folder, root, pages, bytes, dbs, of, failed[], runs} or {ok: false, error}, running {since, db, n, of, pages, stalled} or null} (also in `ping`) | Script Properties only, no network (1.41) |
| POST | `exportnow` | starts a run by trigger in 1 s (or wakes a stalled one); never runs in the request | `drive_scope` / `drive_full` / `notion_not_configured` (1.41) |
| GET | `schema` `fresh` (1/0) | each database in `schemaSpec_()`: `{key, name, missing[{name, type}], wrong[{name, want, got}], error?}` | read-only (GET `/data_sources/{id}` only); cached 6 h unless `fresh`; `notion_not_configured` without the token (1.31) |
| POST | `create` `item{cid,area,title,allDay,start,end}` | new event on `personal`, or `farm` / `hobby` (Growth) once linked | `WRITABLE` allow-list; Work can never be written |
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
| GET (or POST) | `logsearch` `pin` `q` `whole` | entries using the word, newest first, with snippets (bridge 1.16) | needs `LOG_SEARCH_READY` (setup); reads only the Search Text field |
| POST | `logindex` `pin` [`run`] | fills Search Text for older entries, newest first; dry run counts | up to 20 s per call, under the script lock |
| GET (or POST) | `logsessions` `pin` | every session, newest first: `{id, url, type solo\|couples, day, where, felt, arriving, leaving, next, landed, phrase, nextTime, topics[{name, note}], onMind, practice[], carried[{text, did y\|p\|n}]}` | log gate; nothing cached (1.35) |
| POST | `logsessionsave` `pin` `session{cid\|id, …}` | the whole session: columns, `Data` JSON (notes, practice, carried) and a readable page body, rewritten each save | `sesClean_` bounds; cid keeps only the page id 6 h |
| POST | `logsessionnext` `pin` `id` `text` | sets one session's Bring Up Next Time (ADD TO NEXT TIME / UNDO) | set-to-value |
| POST | `logsessionremove` `pin` `id` | moves the page to Notion's trash | only Session Notes pages |
| POST | `logsessionsuggest` `pin` `type` `ids[≤12]` `mode` `preview` | preview `{count, dates, tokens, usd}` or `topics[{title, why, dates}]` (TOPIC/WHY/FROM lines parsed, dates kept only if sent) | one type only; no tools; spend logged as `sessions` |
| POST | `ask` `{cid, mode: fast\|deep\|summary\|patterns\|brief, messages[{role,text}], context, ignore[]}` | Claude answers; returns `reply`, `proposals`, `model`, `cost`, `spend` | reads only; proposals are executed by the app after CONFIRM; cached by cid 10 min; stops at the monthly budget |
| GET | `profile` | `{rev, items: {key: {v, at, by}}}`, the synced profile (2.54) | User Properties of the bridge's owner, gzipped and chunked (`prof_0..n`); batchable |
| POST | `profileput` `items{key: {v, at, by}}` (≤ 80) | keeps each item newer than what's stored (`tos.plays.v1` merges episode by episode, newest 1,500); returns the whole profile | keys must match `tos.*.vN`, never `PROFILE_NEVER` (links, drafts, AI switches, `tos.profile.v1`); `too_large` past 450,000 chars |
| GET | `news` | `{source: "NPR", items[≤5]{title, link, at}}` from NPR's National RSS (`NEWS_FEED`), entities and CDATA decoded, https links only | cached 30 min; `news_unavailable` when the feed fails; batchable; for personal use (NPR's terms) |
| GET | `upkeep` | `items[{id (App ID), page, name, cat, every, unit, last, lastRead, read, hist}]` | 🛠 Upkeep (`NOTION_UPKEEP_DATABASE`); cached 2 min by generation |
| POST | `upkeepsave` `item{id, name, cat, every, unit, last, lastRead, read, hist}` | upsert by App ID | validated (`UPKEEP_KEY`, units, days); safe to repeat |
| POST | `upkeepremove` `id` | moves the App ID's page to Notion's trash | `id`, never `key` (that's the access key) |
| GET | `health` `from` (yyyy-mm-dd, ≤ 400 days back) | `days[{date, rhr, hrv, resp, steps, active, exercise, stand, vo2, weight, temp, sleep{asleep, deep, rem, core, awake, bed, wake, len, segs[[d\|r\|c\|a, min after bed, min]]}}]`, `items[{id, kind medicine\|reading\|note, name, date, data}]`, `last` (the last healthput) | 🩺 Sickbay (`NOTION_SICKBAY_DATABASE`); batchable; cached 2 min by `skgen` (1.43) |
| POST | `healthput` `lines` (CODE\|VALUE\|START\|END per line, ≤ 400,000 chars) | days merged into their Day pages (App ID `day-yyyy-mm-dd`), last 14 days, ≤ 10 | **`key` = HEALTH_KEY only** (`healthKeyRefusal_`; the main key is refused, and HEALTH_KEY opens nothing else); codes rhr hrv resp (averaged), steps active exercise stand standmin (summed), vo2 weight temp (last; °F and kg converted), sleep (stage text; night by its end); `message` for the shortcut (1.43) |
| POST | `sickbaysave` `item{kind, id, name, date, data}` / `sickbayremove` `id` | upsert by App ID / to Notion's trash | never a Day page or a `day-` id (1.43) |
| POST | `aicontinue` | carry on past the reminder for the rest of this month (`AI_CONTINUE`) | |
| POST | `aispendset` `{usd}` | set this month's total to the Console's figure; logged as `matched` | |
| POST | `speak` `texts[≤12]` (≤ 4,000 chars) | one base64 MP3 per text from OpenAI gpt-4o-mini-tts, voice Nova with `VOICE.STYLE`, all at once (`fetchAll`); `est`, month `spend` (estimated) | needs `OPENAI_API_KEY` (capability `voice`, 1.30); 30 a day (`voice_daily_cap`); errors `voice_unauthorized`, `voice_no_credit`, `voice_busy`, `voice_error` |
| POST | `logask` `pin` `{scope, mode, messages, preview}` | Log Ask: `preview` returns entries, dates, tokens, cost; otherwise Claude's answer | needs capability `logask`; ≤ 62 entries, ≈ 60K tokens, two months; no tools |
| POST | `logasksave` / `loginsights` / `loginsight` `pin` | save a Log Ask answer as an undated "Claude insight" page; list them; read one | |
| GET | `habits` `from` `to` | one row per day (Meditated, Evening Walk, Water, Debit Card) | |
| POST | `habitset` `day{date,…}` | create or update that day's page | only fields sent are written |
| GET | `library` | every book | |
| POST | `booksave` `book` / `bookremove` `id` | add or change a book; remove moves it to Notion's trash | only Library pages |
| GET | `tarot` `from` `to` | readings, spreads and MY MEANING pages | |
| POST | `tarotsave` `reading` / `tarotspread` `spread` / `tarotmeaning` `card` `text` / `tarotremove` `id` | save a reading, a spread or a card's meaning; remove moves it to Notion's trash | only Tarot pages |
| GET | `tarotbooks` | import progress per book (`n of 78`) | |
| GET | `tarotbook` `card` [`fresh`] | both books' passages for one card | cached 6 h; never stored on the iPad |
| POST | `tarotbookimport` | makes card pages from the 📦 Import file, a step at a time | fills gaps only; never overwrites |
| POST | `tarotsuggest` `{mode: card\|reading, at, cards[{id, rev, pos, note, mine}], q, sname, sum}` | Claude suggests a meaning from the two books only | needs `tarotsuggest`; counts toward Ask spend |
| GET | `apiary` | yard, hives, checks (with `Data` JSON) | |
| POST | `apiarysave` `item` / `apiaryremove` `id` | add or change a yard, hive or check (`apiaryBoxes_` validates stacks); remove moves it to Notion's trash | only Apiary pages |

Key refusals are distinct: `no_key` (request arrived without its details; a POST can become an empty GET on a Google redirect), `key_unreadable` (settings store answered empty), `unauthorized` (wrong key). The app's `transient()` retries the first two. Log reads go as GET via `logRead()` (falls back to POST on `unknown_action`). The written-days list is cached 6 h under `logdates` and updated in place by `logDatesAdd_()`; setup clears it.

Batched reads: `api()` holds batchable reads for 40 ms and sends them as GET `batch` (`calls` = JSON list, ≤ 8) when more than one is waiting; the bridge's `batch_()` runs each through `read_()` and returns `results[]`, each with its own ok/error. Falls back to single requests on `unknown_action`. `netPending` counts requests in flight (REFRESH NOW's spinner); `markRetried()` flags netlog entries for attempts `withRetry()` tried again.

**Speed** (app 2.12.1, bridge 1.18): a batch is answered one read after another inside one Apps Script run, so `flushBatch()` splits it: `BATCH_LATER` actions (aispend, done, week, reviews, ledger, library) go in a second batch sent at the same time (MAX_PARALLEL 2). Keep screen-critical reads out of `BATCH_LATER`. `tasks_()` fetches its two queries' first pages together via `queryFirstPages_()` (`UrlFetchApp.fetchAll`; falls back to one at a time where fetchAll is missing, as in some tests). `saveTasks()` keeps today's and `plan.day`'s lists first, then the most recently fetched (max 8, nothing older than 3 days), and stores only non-provisional ones; never prune by date order alone (2.12.2: four later days evicted today's list and caused a fetch loop). `state.tasksAsked` blocks an unforced refetch of the same day within 15 s. On a new day `loadTasks()` first fills `state.tasks[day]` with `tasksStandIn()` (latest real list within 3 days, `provisional: true`, focus from each task's Focus Date); a provisional list is always refetched, Plan Day shows UPDATING and re-seeds its picks from the real list unless `plan.touched`. Test: `app_e2e28` (mock_v22 `tslow`).

Capabilities drive the UI (`capabilities_()`): always `read`, `create`, `holidays`; with `NOTION_TOKEN`: `tasks`, `dates`, `done`, `reviews`, `reviewlog`, `queue`, `log`, `habits`, `library`, `tarot`, `tarotbooks`, `apiary`; `logpin` once `LOG_PIN` is set and `logcode` when it is a code word (has a `-`); `logsearch` once `LOG_SEARCH_READY`; `ask` and `brief` (1.29) with `ANTHROPIC_API_KEY`; `logask` and `tarotsuggest` with both the Claude and Notion keys; `ledger` with `YNAB_TOKEN`; `voice` with `OPENAI_API_KEY` (1.30); `schema` with `NOTION_TOKEN` (1.31); `year` with `NOTION_TOKEN` and `shipsyear` with `ANTHROPIC_API_KEY` (1.32); `inbox` with `NOTION_TOKEN` and `inboxsort` with `ANTHROPIC_API_KEY` (1.33); `science` always and `sciencelog` with `NOTION_TOKEN` (1.34); `sessions` with `NOTION_TOKEN` and `sessionsuggest` with both keys (1.35); `profile` always and `upkeep` with `NOTION_TOKEN` (1.36); `news` always (1.37); `sickbay` with `NOTION_TOKEN` and `healthkey` once `HEALTH_KEY` is set (1.43). Every write is idempotent (cid cache for 6 h, or set-to-value), so retries are safe.
