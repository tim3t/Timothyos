# Bridge · the app of TimothyOS

A personal, LCARS-inspired life dashboard that runs full-screen on an iPad home screen. It brings Timothy's calendars, Notion databases, finances, journal, habits, readings, hives, home and NAS into one place, with Claude on hand to answer questions and propose changes he confirms.

**Names used here**

| Name | Means |
|---|---|
| **Bridge** | The app on the iPad home screen (since 2.34) |
| **BRIDGE** | The app's overview screen, in the top-left corner |
| **the Google bridge** | The Google Apps Script the app talks to (`apps-script/Code.gs`). Its version numbers (1.28…) are separate from the app's (2.34…) |
| **TimothyOS** | The system as a whole: the name in the app's top bar, the repository, the Notion integration |

```
Bridge, the iPad app  (GitHub Pages, free, works offline)
  │  HTTPS + your private access key
  ▼
The Google bridge  (Apps Script, runs as you, in your personal Google account)
  ├─ Google Calendar: Work (read-only, shared to you), Personal, farm and Growth (once linked), US holidays (read-only)
  ├─ Notion: Master Task List, Key Dates, Weekly Reviews, Replicator Queue, Captain's Log,
  │          Habits, Library, Tarot, Tarot Books, Apiary, Inbox, Science Log
  ├─ YNAB (read-only)
  ├─ Claude (ASK, Log Ask, the Morning Briefing, summaries, inbox sorting, tarot suggestions, Ship's Year)
  ├─ OpenAI (optional: the Morning Briefing's AI voice)
  └─ public feeds for SCIENCE (aircraft, satellites, notable birds)

The app also talks, directly from the iPad:
  ├─ Open-Meteo (weather), Open Library (book search) and SCIENCE's other public feeds: free, no account
  └─ the NAS relay on your NAS (inside Tailscale): read-only folders for HOLODECK, and Home Assistant at /ha

On the NAS, only when you run it:
  └─ tools/ia_fetch.py: fills a HOLODECK folder with public access TV from the Internet Archive
```

**Costs:** no servers to rent. GitHub Pages and Apps Script are free. Claude is paid from prepaid API credit with three spending limits (see ASK), and the optional AI voice from a small prepaid OpenAI credit. The NAS relay runs on your own NAS.

**Contents**

| Part | Sections |
|---|---|
| [1 · Setup](#part-1--setup) | [Handshakes 1 to 5](#handshake-1--share-your-work-calendar-with-your-personal-account) · [Updating the Google bridge](#updating-the-google-bridge) · [Connect Notion](#connect-notion) · [Script Properties](#script-properties) · [Optional pieces](#optional-pieces) (calendars, holidays, Ask Claude, Ledger, Captain's Log, tarot books, [NAS relay](#nas-relay-holodeck-and-home-assistant), AI voice, Home Assistant) |
| [2 · Stations](#part-2--stations) | [TIME](#time) · [REFLECT](#reflect) · [RESOURCES](#resources) · [SCIENCE](#science) · [ALWAYS AVAILABLE](#always-available) |
| [3 · Reference](#part-3--reference) | [Daily use](#daily-use) · [Condition rules](#condition-rules) · [Backup, restore and reinstalling](#backup-restore-and-reinstalling) · [Troubleshooting](#troubleshooting) · [Security model](#security-model) · [Updating the app](#updating-the-app) · [Project layout](#project-layout) |

---

# Part 1 · Setup

Everything below works from Safari on the iPad. For Google pages, tap **aA → Request Desktop Website** first. This part describes a fresh setup of the current version; what changed when is in `CHANGELOG.md`.

## Handshake 1 · Share your work calendar with your personal account

> Check your employer's policy on calendar sharing before doing this.

1. Open **calendar.google.com** signed in to your **work** account.
2. Gear icon → **Settings** → under *Settings for my calendars*, tap your name.
3. **Share with specific people or groups** → **Add people and groups**.
4. Enter your **personal Gmail** address. Permission: **See all event details**. Send.
   - If only **See only free/busy** is offered, choose it. Those meetings show as hatched **Busy** blocks.
5. In your **personal** Gmail, open the "shared a calendar with you" email and tap **Add this calendar**.

## Handshake 2 · Create the Google bridge

1. Signed in to your **personal** Google account, open **script.google.com** → **New project**.
2. Rename it (top left) to `TimothyOS bridge`.
3. Delete the starter code. Paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs).
4. Change this line to your work email address (only this first time; `setup` saves it, so later updates keep it):
   ```js
   WORK_CALENDAR_ID: 'you@your-employer.com'
   ```
5. Save (disk icon).
6. In the function menu next to **Run**, choose **setup**, then tap **Run**.
7. Google asks for permission:
   **Review permissions** → pick your personal account → *Google hasn't verified this app* → **Advanced** → **Go to TimothyOS bridge (unsafe)** → **Allow**.
   The warning appears for every personal script.
8. The **Execution log** lists every calendar your account can see, then a status line for each part (calendars, Notion databases, YNAB, Ask) and:
   - `ACCESS KEY (paste into the iPad app): ...`

   Copy the access key. It is also stored under **Project Settings (gear) → Script Properties → ACCESS_KEY**, which is easier to copy on an iPad.

If the work calendar says **PROBLEM: not_found**, finish step 5 of Handshake 1, or copy the exact ID from the calendar list in the log. Parts not set up yet say **OFF** or **NOT READY** with the step to take; the sections below cover each.

## Handshake 3 · Deploy the Google bridge as a web app

1. **Deploy → New deployment**. Gear icon → **Web app**.
2. **Execute as: Me**. **Who has access: Anyone**.
3. **Deploy**. Copy the **Web app URL**. It ends in `/exec`.

"Anyone" lets the iPad app reach the script without a Google sign-in. Without your access key the script returns nothing.

## Handshake 4 · Turn on GitHub Pages

1. On github.com, open this repository → **Settings → Pages**.
2. **Source: Deploy from a branch**. Branch **main**, folder **/ (root)**. **Save**.
3. After a minute or two the app is live at **https://tim3t.github.io/Timothyos/**.

## Handshake 5 · Install on the iPad

1. In Safari, open **https://tim3t.github.io/Timothyos/**.
2. **Share → Add to Home Screen**. The name reads **Bridge**. **Add**.
3. Open **Bridge from the home screen** (not from Safari: the home-screen app keeps its own storage).
4. Paste the **Web app URL** and the **Access key** → **LINK**. (Reinstalling? Use **OR RESTORE THIS IPAD** with a backup file instead; see Backup, restore and reinstalling.)

The status block (bottom of the sidebar) turns green: **SYNCED**.

## Updating the Google bridge

New features sometimes need a newer Google bridge; the CHANGELOG says so when they do. The steps are always the same, and your access key and Script Properties never change:

1. In Safari (Request Desktop Website), open **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**. Select all, copy.
2. Open **script.google.com → TimothyOS bridge**. Select all the old code, delete it, paste the new code. Save.
3. Choose **setup** in the function menu, tap **Run**. If Google asks for a new permission, approve it. Near the end the log reads `Bridge version 1.x.y. Can write to: …`.
4. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** The URL stays the same.
5. In the app: **SYSTEMS → REFRESH NOW**.

Code changes have no effect until step 4. When the app needs a newer bridge than the one deployed (step 4 missed, or a new feature), the Bridge's Condition shows **Google bridge out of date** with what's missing; **SYSTEMS → NEEDS YOU** has these steps and **CHECK AGAIN**, and **SYSTEMS → APP** shows the version with **UP TO DATE** or **UPDATE TO**.

## Connect Notion

The Google bridge reaches Notion through one integration, which sees only the databases you connect to it, never the rest of your Life Hub.

**1. Create the integration** (Safari, Request Desktop Website)
1. Open **notion.so/profile/integrations** → **New integration**.
2. Name `TimothyOS bridge`, your workspace, type **Internal** → Save.
3. Capabilities: **Read content**, **Update content**, **Insert content**. User information: **No user information**. Save.
4. Copy the **Internal Integration Secret** (starts with `ntn_`). Treat it like a password: never paste it into chat, notes, or `Code.gs`.

**2. Put the key in the Google bridge:** **Project Settings (gear) → Script Properties → Add script property**: `NOTION_TOKEN`, value the secret. Save, then run **setup**.

**3. Connect each database:** open it as a full page → **•••** (top right) → **Connections** → add **TimothyOS bridge** → Confirm. Connect databases only, never the **Timothy's Life Hub** page (that would let the bridge see every page under it).

| Database | Powers | The bridge may |
|---|---|---|
| 🎯 Master Task List | PLAN DAY, Priorities, Balance, Review, Ask | Read; add tasks; set Focus Date and Status |
| 🗓️ Key Dates | DATES, Key Dates panel, markers, Capture | Read; add |
| 🧭 Weekly Reviews | REVIEW | Read; add and update a week's page |
| 🛸 Replicator Queue | LEDGER | Read; add; reorder; mark bought |
| 📓 Captain's Log | LOG | Read and write entries, behind your authorization code |
| 🔁 Habits | HABITS, Bridge strip, Review | Read; write a day's page |
| 📚 Library | LIBRARY | Read; add; change; move to Notion's trash |
| 🔮 Tarot | TAROT | Read; add; change; move to Notion's trash |
| 📖 Tarot Books | TAROT → BOOKS | Read; make pages from the import file |
| 🐝 Apiary | APIARY | Read; add; change; move checks and hives to Notion's trash |
| 📥 Inbox | CAPTURE → NOTE, INBOX | Read; add notes; mark them Sorted or Kept; move to Notion's trash |
| 🔭 Science Log | SCIENCE, ASTROMETRICS | Read; add events; star them |

After connecting, **run setup**: the log shows `OK` for each connected database (or `NOT READY: … Connect the TimothyOS integration…` for one that isn't), then **SYSTEMS → REFRESH NOW** in the app.

**Fields the app expects** (rename one in Notion and that part stops working until the code knows; Bridge checks these every six hours and shows **A Notion column changed** in Condition, with steps in **SYSTEMS → NEEDS YOU**):
- **Key Dates:** Name, Date (one day, or a start and end for windows), Life Area, Type, Repeats Yearly, Notes.
- **Weekly Reviews:** one page per week with the reflection, the week's numbers (including Hours Hobbies, used for GROWTH) and your intent lines.
- **Captain's Log:** Name, Date, Source, and **Search Text** (added by setup for LOG search). The entry is the page body.
- **Habits:** one page per day: Meditated, Evening Walk, Water (L), Debit Card.
- **Library:** Title, Author, Status, Started, Finished, Rating, Notes, Cover, Open Library, Published.
- **Tarot:** Title, Date, Kind, Weekly, Spread, Cards, Interpretation, Card, Data.
- **Apiary:** Name, Kind (Yard, Hive, Check), Date, Hive, the text columns (Queen, Frames, Feed, Did, Next…), Mites (%), Honey (lb), Data. Edit the text columns freely; leave **Data** to the app.
- **Science Log:** Event, When, Department, Kind, Detail, Value, Starred, Key. Star or annotate events freely; leave **Key** to the app (it stops an event being logged twice).

## Script Properties

All settings and keys live in **Project Settings (gear) → Script Properties**, never in the code (the repository is public). Names only here; the values are yours.

| Property | What it does |
|---|---|
| `ACCESS_KEY` | Made by setup; pasted into the app once. Run **rotateKey** if it ever leaks, then link the app again |
| `WORK_CALENDAR_ID` | Saved by setup from the code's first-time line |
| `NOTION_TOKEN` | The Notion integration secret |
| `FARM_CALENDAR_ID`, `GROWTH_CALENDAR_ID` | Link the farm and Growth calendars (see Optional pieces) |
| `HOLIDAY_CALENDAR_ID` | Only if the holidays calendar found on its own is the wrong one |
| `LOG_PIN` | The Captain's Log authorization code: a code word and four digits, like `OMEGA-0000` (words: ALPHA, BETA, GAMMA, DELTA, THETA, OMEGA; `omega 0000` or `Ω0000` work too, and six digits also work) |
| `ANTHROPIC_API_KEY` | Turns on ASK and every Claude feature |
| `AI_BUDGET_USD`, `AI_CAP_USD` | ASK's monthly reminder (default 8) and the ceiling shown beside it (default 10; match the Console's spend limit) |
| `AI_FAST_MODEL` | `claude-haiku-5-5` or `claude-haiku-4-5` moves everyday questions from Sonnet to Haiku, to spend less |
| `YNAB_TOKEN` | Turns on LEDGER (read-only) |
| `OPENAI_API_KEY` | Reads the Morning Briefing in the AI voice Nova (OpenAI) |
| `YNAB_PLAN_ID`, `LEDGER_FUND_CATEGORY` | Only if the plan or the fund category (default Discretionary) isn't the right one |
| `EBIRD_API_KEY` | Optional: notable birds nearby in SCIENCE → NATURE. A free key from ebird.org/api/keygen |

The bridge also keeps its own working values there (spend counters, the log's lock state, remembered database ids). Leave those alone.

## Optional pieces

### Farm and Growth calendars

Two extra Google calendars in the same personal account: **farm** (farm and bee work, amber, labelled with the calendar's own name) and **Growth** (personal growth and hobbies, coral, labelled GROWTH). Once linked, each sits beside Work and Personal everywhere (Today, Week, Month, Horizon, Balance, Review hours), and **CAPTURE** and **ASK** can add to it. Work stays read-only. Tasks in a Notion Life Area whose name mentions Farm or Bee count toward the farm; Growth, Creative or Hobby toward GROWTH; Work toward work.

1. **Create the calendar:** **calendar.google.com** → **Other calendars +** → **Create new calendar** → a name (**Growth** for the second), your time zone, **Create calendar**.
2. **Copy its ID:** **Settings** → the new calendar → **Integrate calendar** → **Calendar ID** (ends in `@group.calendar.google.com`).
3. **Add it:** Script Property `FARM_CALENDAR_ID` or `GROWTH_CALENDAR_ID`, value the ID. Run **setup**: the log shows `TimothyOS farm calendar: OK (…)` or `TimothyOS hobby calendar: OK (Growth)`, and `Can write to:` lists it.
4. **SYSTEMS → REFRESH NOW** in the app.

To unlink one, delete its property and run setup. The calendar itself is never deleted. Growth hours are saved to the Weekly Reviews database's **Hours Hobbies** field.

### Holidays

Google's US Holidays calendar shows beside your Key Dates as **HOLIDAY**, read-only: on the Bridge's Key Dates panel (at most one of its three slots), the DATES screen (with a **HOLIDAYS** filter) and the ◆ markers on Today, Week and Month. Dates come straight from Google, so holidays that move each year are always right. The Google bridge finds the holidays calendar you're subscribed to on its own (use Script Property `HOLIDAY_CALENDAR_ID` to pick another); setup logs `TimothyOS holidays: OK (Holidays in United States)`. Holidays are never written anywhere and never count toward calendar hours, meetings or BALANCE.

### Ask Claude

ASK uses your Claude API account (prepaid, separate from a Claude Pro plan).

1. **Console safeguards** at platform.claude.com: prepaid credit, **auto-reload off**, and **Settings → Billing → Spend limits** set to your monthly ceiling.
2. **Add the key:** Script Property `ANTHROPIC_API_KEY`, value your API key. Never paste it anywhere else.
3. Optional: `AI_BUDGET_USD`, `AI_CAP_USD`, `AI_FAST_MODEL` (see Script Properties).
4. Run **setup**: `Ask Claude: OK.` with this month's spend and the models in use. **SYSTEMS → REFRESH NOW**; **ASK** lights up.

**compareModels** in the script editor runs Sonnet, Opus and Haiku side by side on your own data (about 10¢), if you want to compare.

### Ledger (YNAB)

1. **In YNAB:** create a category named **Discretionary** (any group). Its available balance funds the Replicator Queue, top item first.
2. **Token:** app.ynab.com → **Account Settings** → **Developer Settings** → **New Token**. Script Property `YNAB_TOKEN`. Treat it like your YNAB password.
3. Connect **🛸 Replicator Queue** to the integration (Connect Notion).
4. Run **setup**: `Ledger (YNAB): OK. … Fund category "Discretionary": found` and `Notion replicator queue: OK`. If it says `ynab_not_found`, the log lists your plans as `name -> id`; add `YNAB_PLAN_ID`.

### Captain's Log: authorization code and search

1. Connect **📓 Captain's Log** to the integration.
2. Script Property `LOG_PIN`, value a code word and four digits (see Script Properties). Change it there any time; no deployment and nothing on the iPad needs updating.
3. Run **setup**: `Captain's Log: OK (… days written). Authorization code set (OMEGA and four digits)` (your word, never the digits). `LOG_PIN NOT VALID` means the value isn't one of the six words and four digits. Setup also adds the **Search Text** field to the database (its only change to it) and logs `Captain's Log search: OK`, with how many older entries still need indexing.
4. Older entries become searchable while LOG is open, newest first (a bar under the search box shows progress, roughly one to two entries a second). To do it all at once, run **buildLogSearch** in the script editor (about five minutes a run; run again if some are left). In Notion you can hide the Search Text column; it's a plain copy kept for searching.

**Bringing in old entries:** in your diary app choose **Export (Text)** and copy the text. In **LOG**, after your code, tap **IMPORT A DIARY EXPORT** (at the bottom), paste, **CHECK**. It shows the days found, the date range and anything unusual (a day written twice joins one page; text before the first date is left out). **IMPORT** sends three days at a time and shows how many are in Notion so far; keep the app open until it says done. If it stops, paste again and it sends only what's left.

### Tarot books

Liz Dean's *The Ultimate Guide to Tarot* and Jessa Crispin's *The Creative Tarot*, one Notion page per card per book (156 pages) in **📖 Tarot Books**, a private database in your Life Hub beside 🔮 Tarot. The book text lives only in your Notion: never in the app's code, this repository or the iPad's storage.

1. Connect **📖 Tarot Books** to the integration. Setup logs `Notion tarot books: OK (Liz Dean 0 of 78, Jessa Crispin 0 of 78; tap IMPORT BOOKS in Systems)`.
2. **SYSTEMS → TAROT → IMPORT BOOKS** makes the pages from the import file already in the database: about three minutes in a few steps; keep the app open. When both show **78 of 78**, you can delete the **📦 Import file** page. Running it again only fills gaps; it never overwrites a page.

The text came from the EPUB of Dean's book and a scan of Crispin's, so a few of Crispin's pages may carry small scanning slips (a joined word, a missing apostrophe). Fix them on the page in Notion; the app uses your version (the bridge remembers a card's passages for six hours).

### NAS relay (HOLODECK and Home Assistant)

A web page can't use SMB (the protocol the Files app uses), so the NAS runs a small **read-only relay**: Caddy serving chosen folders, behind **Tailscale** so it has a trusted HTTPS address and is reachable only from your own devices.

1. **Tailscale admin** (console.tailscale.com): turn on **MagicDNS** and **HTTPS Certificates** (DNS tab), then **Settings → Keys → Generate auth key**.
2. **Make a relay token:** a strong password from the iPad's Passwords app ("TimothyOS relay").
3. **UGOS → Docker → Project → Create**, name `timothyos`, storage path `docker/timothyos`, and paste the compose below with the placeholders filled in (table below it). UGOS ignores compose `configs:`, which is why the settings travel in environment variables.
4. **Tailscale admin → Machines → timothyos-nas → Disable key expiry**, then delete the auth key from wherever you noted it.
5. **Check:** in Safari, `https://timothyos-nas.YOUR-TAILNET.ts.net/?k=YOUR-TOKEN` shows a folder list with no certificate warning. Without `?k=` it's a blank page (refused), as it should be.

```yaml
services:
  tailscale:
    image: tailscale/tailscale:v1.98.10
    hostname: timothyos-nas
    entrypoint: ["/bin/sh", "-c", "mkdir -p /config && printf '%s' \"$$SERVE_JSON\" > /config/serve.json && exec /usr/local/bin/containerboot"]
    environment:
      TS_AUTHKEY: PASTE_TAILSCALE_AUTH_KEY
      TS_HOSTNAME: timothyos-nas
      TS_STATE_DIR: /var/lib/tailscale
      TS_USERSPACE: "true"
      TS_SERVE_CONFIG: /config/serve.json
      SERVE_JSON: '{"TCP":{"443":{"HTTPS":true}},"Web":{"$${TS_CERT_DOMAIN}:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8080"}}}}}'
    volumes:
      - ./ts-state:/var/lib/tailscale
    restart: unless-stopped

  relay:
    image: caddy:2.8.4-alpine
    network_mode: service:tailscale
    command: ["/bin/sh", "-c", "printf '%s' \"$$CADDYFILE\" > /tmp/Caddyfile && exec caddy run --config /tmp/Caddyfile --adapter caddyfile"]
    environment:
      RELAY_TOKEN: PASTE_RELAY_TOKEN
      HA_URL: PASTE_HOME_ASSISTANT_ADDRESS
      CADDYFILE: |
        {
          admin off
          auto_https off
        }
        :8080 {
          bind 127.0.0.1
          header Access-Control-Allow-Origin "https://tim3t.github.io"
          header Access-Control-Allow-Headers "Authorization, Range, Content-Type"
          header Access-Control-Allow-Methods "GET, HEAD, POST, OPTIONS"
          header Access-Control-Expose-Headers "Content-Range, Accept-Ranges, Content-Length"
          header Vary Origin
          route {
            @preflight method OPTIONS
            respond @preflight 204
            @denied {
              not header Authorization "Bearer {$$RELAY_TOKEN}"
              not query k={$$RELAY_TOKEN}
            }
            respond @denied 401
            handle_path /ha/* {
              uri query -k
              reverse_proxy {$$HA_URL} {
                header_up -X-Forwarded-For
                header_down -Access-Control-Allow-Origin
              }
            }
            handle {
              root * /media
              file_server browse
            }
          }
        }
    volumes:
      - PASTE_FOLDER_PATH:/media/Music:ro
    depends_on:
      - tailscale
    restart: unless-stopped
```

| Placeholder | Fill in |
|---|---|
| `PASTE_TAILSCALE_AUTH_KEY` | The auth key from step 1. Used only the first time the container starts; after step 4 it can stay or be blanked |
| `PASTE_RELAY_TOKEN` | The relay token from step 2 |
| `PASTE_HOME_ASSISTANT_ADDRESS` | Home Assistant's local address, like `http://192.168.x.x:8123`. Leave it as it is until you set up Home Assistant: `/ha` then answers with an error and everything else works |
| `PASTE_FOLDER_PATH` | A NAS folder to share, as UGOS's File Manager shows its path. The name after `/media/` is the folder's name in AUDIO |
| `YOUR-TAILNET`, `YOUR-TOKEN` (in the addresses below) | Your tailnet's name (Tailscale admin → DNS) and the relay token |

`route` keeps the token check first, so nothing reaches Home Assistant or a folder without the relay token.

**Sharing folders:** one `- PATH:/media/NAME:ro` line under the relay's `volumes` per folder, then redeploy the `timothyos` project. Put quotes around a line whose path has spaces: `- "/PATH/TO/Old Radio:/media/Old Radio:ro"`. `:ro` keeps every share read-only.
- **For AUDIO:** each share is a folder on AUDIO's front page. A new one appears the next time you open AUDIO (or within a minute while it's open).
- **For VISUAL:** put videos under `/media/Video/`: `- "/PATH/TO/My Show:/media/Video/My Show:ro"`, one line per channel folder. Or share one parent folder that holds all your video folders, once, as `- "/PATH/TO/VIDEOS:/media/Video:ro"` in place of the channel lines: new folders there then show up in **+ ADD CHANNEL** with no relay change (the relay can then read everything in that folder, read-only, inside Tailscale). AUDIO leaves the `Video` share to VISUAL.
- **Check a share** in Safari: `https://timothyos-nas.YOUR-TAILNET.ts.net/Video/?k=YOUR-TOKEN` lists that folder.

**On the iPad:** install Tailscale and sign in to the same account (VPN On Demand: Always). Then **SYSTEMS → NAS RELAY**: paste the relay address (`https://timothyos-nas.YOUR-TAILNET.ts.net`) and the token, **SAVE AND TEST**.

#### Public access TV from the Internet Archive (optional)

`tools/ia_fetch.py` fills a NAS folder with old public access TV from archive.org, arranged for a NETWORK channel: one folder per show (the series name from the title, "Episode 3" and years dropped), files named `Title [identifier].mp4`, the iPad-friendly H.264 copy of each video. It lists what it would fetch unless given `--go`; it skips what it already has, resumes cut-off downloads, checks each file against the Archive's MD5, gives up at once on a file the Archive refuses (not found, forbidden), pauses between files, and logs every file's source page and license (blank if the item gives none) to `_ia_log.csv`. For personal viewing.

**On the NAS** (a throwaway Python container, nothing installed on the NAS itself):

1. Make the folder beside your other video folders, for example `Public Access`, and note its path (UGOS File Manager → the folder → **Properties**).
2. **UGOS → Docker → Project → Create**, name `ia-fetch`, and paste, with `/PATH/TO/Public Access` replaced by that path:
   ```yaml
   services:
     ia-fetch:
       image: python:3.12-slim
       container_name: ia-fetch
       restart: "no"
       volumes:
         - "/PATH/TO/Public Access:/out"
       entrypoint: ["sh", "-c"]
       command:
         - |
           set -e
           pip install -q internetarchive
           python -c "import urllib.request as u; u.urlretrieve('https://raw.githubusercontent.com/tim3t/Timothyos/d0127c8218cf4086dc30393323235d95f2c2897a/tools/ia_fetch.py', '/tmp/ia_fetch.py')"
           python -u /tmp/ia_fetch.py --out /out --max-items 50 --exclude "talk radio" "conference"
   ```
3. Deploy, then read **Logs**: the list of what it would fetch, with sizes and licenses. Trim with more `--exclude` words, or aim it with `--query`, `--collection` or `--ids` (below).
4. When the list looks right, add `--go` (and a budget, `--max-gb 50`) to the last line and **Redeploy**. It downloads and stops; redeploy again any time to fetch more (what's there is skipped).
5. Share the folder with the relay (`- "/PATH/TO/Public Access:/media/Video/Public Access:ro"`, redeploy the `timothyos` project), then **HOLODECK → VISUAL → + ADD CHANNEL → Video → Public Access**, and tap **NETWORK**. You can add the channel while downloads are still going: **LOOK AGAIN** in the channel list picks up what's new.

**What runs on your NAS:** the compose fetches the script as it was at one fixed commit of this repository (the long code in the address), so a later change here never changes what your NAS runs until you change that code. The container sees only the folder mounted at `/out`, talks only to archive.org (and to PyPI to install the `internetarchive` library), never logs in, and holds no keys or tokens.

| Option | Default | What it does |
|---|---|---|
| `--query '…'` | public, cable or community access television | Search terms (Internet Archive syntax), e.g. `'"public access" AND subject:cooking'`. The TV News Archive and restricted items are always left out |
| `--years FROM-TO` or `--years any` | `1980-2009` | Date range |
| `--collection NAME` | any | Only one collection |
| `--ids ITEM ITEM` | | Exactly these items (the part after `/details/` in an item's address) instead of a search |
| `--exclude WORD "A PHRASE"` | none | Leave out items that mention these |
| `--sort '…'` | `downloads desc` | Search order: most downloaded first |
| `--group series\|creator\|collection\|none` | `series` | How show folders are named |
| `--max-items N` | `200` | Items looked at per run |
| `--max-gb N` | `50` | Stop after this much per run |
| `--max-file-gb N` | `4` | Skip single files bigger than this |
| `--max-per-item N` | `25` | Skip items holding more videos than this (conference dumps, whole channels) |
| `--pause SECONDS` | `2` | Wait between files |
| `--strict` | off | Only items that state a license (usually public domain or Creative Commons) |
| `--no-verify` | off | Skip the MD5 check |
| `--go` | off | Download; without it, only list |

The broad search is mixed: talk shows, conference recordings and adult cable-access programmes turn up next to the gems, which is why it lists first. Quality is what was uploaded: many 80s and 90s tapes only have the Archive's small 320×240 copy.

### AI voice for the Morning Briefing (OpenAI)

READ IT TO ME in **Nova**, OpenAI's voice, styled "Calm, measured starship computer. Even pacing, clear diction, warm but precise, with a slight South African accent." Without it, the iPad's Moira reads (iPadOS keeps downloaded Premium voices from web apps).

1. **OpenAI account** at platform.openai.com: a small prepaid credit (about $5 is plenty), **auto-recharge off**, a low monthly budget on the project.
2. **A key:** a project (TimothyOS) and a secret API key in it. Script Property `OPENAI_API_KEY`. Never paste it anywhere else.
3. Run **setup**: `AI voice (OpenAI): OK (nova, gpt-4o-mini-tts)` (it speaks one short test line, a fraction of a cent).
4. **SYSTEMS → REFRESH NOW.** **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** shows **AI voice: Nova** with **TEST AI VOICE**.

Each briefing's audio is made when it compiles (in the background; OpenAI takes about two minutes for a whole briefing, so on a 06:00 Standby compile it's ready long before you are) and kept on this iPad, so READ IT TO ME starts at once and replays cost nothing. About 1.5¢ a minute of speech: under 1¢ a briefing. The bridge allows 30 voice requests a day.

Times are spoken in ship's style (08:00 is "oh eight hundred", 21:05 "twenty-one oh five") and °F, ¢, %, lb in words; the printed text keeps its figures.

### Home Assistant

Reached through the NAS relay's `/ha` path, so it stays inside Tailscale and needs the relay token as well as its own.

1. **A Home Assistant user for TimothyOS** (whoever administers Home Assistant): **Settings → People → Add person**, allow login, *not* an administrator. Note Home Assistant's local address (like `http://192.168.x.x:8123`).
2. **A token:** log in as that user → profile (bottom left) → **Security → Long-lived access tokens → Create token**. Copy it; it's shown only once.
3. **The relay:** make sure the compose has the `HA_URL` line with Home Assistant's address (as above), then redeploy.
4. **On the iPad:** **SYSTEMS → HOME ASSISTANT → USE THE NAS RELAY**, paste the token, **SAVE AND TEST**.

---

# Part 2 · Stations

**ALL STATIONS** (the block under the sidebar buttons) opens every station, grouped as below; **EDIT PINS** picks the seven in the sidebar. **BRIDGE** always keeps the corner. **COMPUTER** finds any station, or something to do inside one, by name (see ALWAYS AVAILABLE).

## TIME

### BRIDGE (the overview)

The app opens here (or on Today; **SYSTEMS → BRIDGE → Opens on**). One full-width column, top to bottom:

| Panel | Shows |
|---|---|
| **Morning Briefing** | This morning's report in plain words, above Condition (see below) |
| **Condition** | **GREEN**, **YELLOW** or **RED**, with every item that needs you. Tap an item to fix it (rules in Part 3) |
| **Now / Next** | Free time until your next event (or time left in the current one), the next event, and today from 07:00 to 21:00 |
| **Habits** | Today's habits, tap to record (once Habits is connected) |
| **Tarot** | This week's card, or **RECORD** (once Tarot is connected) |
| **Environment** | Weather, **hive check** (GO when it's 60°F+, wind under 12 mph and dry, between 10:00 and 17:00) and **frost watch** for tonight |
| **Priorities** | Your picks for today (tap to check off), plus tasks due or overdue that you didn't pick |
| **Horizon** | Hours booked for the next 7 days, ◆ key dates, and heavy days (7 hours or more). Tap a day to open it |
| **Key Dates** | The next three, with countdowns |
| **Balance** | Work: calendar hours over 7 days against a ceiling. Other areas: a dot for each day they got attention (a task done or calendar time), hours against a minimum where they have a calendar, QUIET after 5 days. Targets in **SYSTEMS → BALANCE TARGETS** |
| **Intent + Bearing** | One line of intent for today, and your **bearing** for the day |

Tap **+** beside a panel title for its details (hours booked and open, wind and sunrise, the list of due tasks, the legend). The Bridge remembers which panels you leave open. Balance counts tasks marked ✅ Done; Notion doesn't record the day a task was finished, so the date of its last edit stands in, and only the Life Area and that date leave Notion, never titles.

**Morning Briefing** (needs ASK set up)
- **When:** the first time Bridge is in front after 06:00, it writes this morning's briefing: about 5 to 10 seconds, once a day. If Bridge stood by overnight, that happens at 06:00, so it's waiting when you arrive, and Standby shows **BRIEFING READY · TAP TO READ** (the tap wakes the screen onto it).
- **What:** short (about 80 words): the condition and why, today (meetings, the first and last, the longest open stretch, whether priorities are picked), outside (weather, hive check, frost), the week ahead, then one **RECOMMENDED** first action. Finances only with their **SHARE WITH ASK** switch on. Never the Captain's Log, habits, tarot or the apiary.
- **How it looks:** it prints itself once like a teleprinter, in Courier New (tap the text to finish it at once). The header says when it was compiled, the model (Sonnet) and the cost (about 1 to 2¢).
- **READ IT TO ME** reads it in **Nova**, the AI voice (see Optional pieces), with each paragraph lighting up as it goes; tap again to stop. It never plays on its own. Tapped before the audio is ready, it says **PREPARING VOICE…** and starts when it lands. Without the AI voice, or when OpenAI can't, the iPad's **Moira** reads it (iPadOS keeps downloaded Premium voices from web apps; **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** shows both voices, with a test for each).
- **Folding:** **−** folds it to one line (a short headline, without the condition, which sits right below) and the Condition banner moves back up. It also folds itself at 10:30 unless you opened it after that. Tap the line, or **+**, to read it again. Before 06:00 the line shows yesterday's.
- **REFRESH** writes a new one, for example after PLAN DAY. If it couldn't be written (no connection, Claude busy, the monthly reminder), it says why and offers **COMPILE NOW**.
- **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** turns it off and on. It counts toward ASK's monthly total, listed as BRIEFING.

**Settings** (in **SYSTEMS → BRIDGE**, kept on this iPad): **Location** for weather (**USE THIS IPAD'S LOCATION**, or latitude and longitude; rounded to about 1 km) · **Bearings**, your guiding words, one per line; the Bridge shows one each day, tap it for the next · **Opens on**: Bridge or Today.

### TODAY, WEEK, MONTH

Your calendars in day, week and month views. The arrows beside the title move through time; **TODAY** jumps back. Tap a day in Week or Month to open it, an event for its details, an empty spot on Today or Week to capture there. The calendar chips on Today hide or show a calendar on every view. Finished events are dimmed with a ✓. **PLAN DAY** picks up to three priorities from the Master Task List (or adds a new task); tap a priority on Today to mark it ✅ Done in Notion, again to reopen. To plan tomorrow, go to tomorrow on Today and tap **PLAN** in Priorities.

### INBOX

Notes you captured to sort later (CAPTURE → **NOTE**), saved in **📥 Inbox** in Notion. Open it from **ALL STATIONS**, **COMPUTER**, or the Bridge's **INBOX · N** line (shown under Condition only while notes wait; Condition never counts them).

- **WAITING:** oldest first. Each note has **TASK · KEY DATE · EVENT · QUEUE · KEEP**. The first four open the usual form filled in from the note (a task takes a Life Area, priority and due date; QUEUE adds to the bottom of the Replicator Queue). **SAVE** makes it, then marks the note Sorted with what it became; it leaves the list and Notion keeps it as the record. **KEEP** moves it to KEPT as it is.
- **SUGGEST SORTING:** Sonnet reads the waiting notes with your Life Areas, priorities, key date types and calendars, and puts a suggestion on each (about 1¢, counted in ASK's monthly total as INBOX SORTING). Nothing is saved until **CONFIRM**; **CHANGE** opens the form filled in; **SKIP** drops it. Names Notion doesn't have are left blank for you to pick.
- **KEPT:** notes kept as they are. **SORT IT NOW** brings one back to WAITING with the form open. COMPUTER finds kept and waiting notes by any word.
- **✕** asks twice (**DELETE IT**), then moves the note to Notion's trash.
- Offline, a new note waits on this iPad marked **QUEUED**; sorting marks wait too and reach Notion when the bridge answers.

### LOOM

Your calendars and key dates on an infinity loop. The focused day sits at the crossing, largest, with its events named beside it.

- **Swipe left** to move forward in time: your finger pulls the coming days down the top of the right loop into the crossing. **Swipe right** to go back; the days just past carry on round the lower-left loop. A swipe coasts and settles on a day.
- The **arrows** step one day; **TODAY** glides home. With a keyboard: arrow keys, Page Up/Down (a week), T (today).
- **Beads** are events in their calendar's color, read top to bottom in time order (the day's last sits on the loop); **diamonds** are key dates. Tap one of the focused day's beads (or a row in the list on the right) for details. Tap any other day to glide to it.
- On the right: the focused day's events and key dates, and the next four key dates with a countdown. Hidden calendars and ignored titles stay out, as on every screen.

### DATES

Key dates for the next 12 months, filtered by area (and **HOLIDAYS**). **+ ADD** or **CAPTURE → KEY DATE** adds one: **UNTIL** for a window, **YEARLY** for birthdays and seasons. Tap one for details, **OPEN IN NOTION** to change or delete it. A holiday you don't care about: tap it, **HIDE THIS HOLIDAY** (it joins IGNORED EVENTS, where you can bring it back).

## REFLECT

### REVIEW

**REVIEW** opens on a log of your reviews; tap a week to open it, **◀ ALL REVIEWS** comes back. **Due** from Sunday 14:00 to Tuesday night; the Bridge shows **Weekly review due** until you save it, and goes straight to that week.

- **A week, top to bottom:** Time (hours per calendar, change from the week before, busiest day, open hours) · Output (tasks finished per Life Area) · Priorities kept · Habits · Tarot · Intent log · Next week (heavy days, key dates, tasks due) · Reflection, four questions: What went well? · What drained me? · What's my next focus? · Where did I hold my bearing? (a line for each of your bearings, saved to Notion as one paragraph with each line starting "Bearing:"; text written before the lines shows above them as **EARLIER NOTES**; one box when no bearings are set)
- **Writing is kept on the iPad as you type.** **SAVE TO NOTION** writes it; saving again updates the same page. **◀ ▶** browse earlier weeks.
- **WRITE SUMMARY** asks Claude (Sonnet) for a short summary of the week from its numbers and your reflection, into **CLAUDE SUMMARY**. With SHARE LOG WITH ASK on, it asks for your authorization code and includes that week's Log entries; **WITHOUT THE LOG** writes it from the rest.
- **The log page:** up next (the week that's due, this week); trends over the last 12 weeks (reviews saved, week streak, priorities kept on average, Work and Personal hours, hours per week; **+** for priorities kept, tasks finished and where the work went by Life Area; tap a bar or point for its values; numbers come from saved reviews, so unsaved weeks are gaps); **PATTERNS**, where Claude (Sonnet) reads your saved reflections and names what keeps coming up (about 8¢, only when you tap it; the answer stays on this iPad until you ask again); and all reviews by month, each week's numbers and next focus, with SAVED, DUE, IN PROGRESS or NOT SAVED. A missed week can still be written.

### LOG (Captain's Log)

A plain journal: a calendar of days and a blank page. Each day is one page in **📓 Captain's Log** in Notion, with the entry as its body, so it reads naturally there too. No reminders, no streaks, no counts.

- **Opening LOG always asks for your authorization code:** tap your code word, then the four digits (or type its first letter and the digits on a keyboard). Your word shows only as a filled slot. The Google bridge checks it; five wrong tries lock the log for 15 minutes, and each lockout straight after another lasts twice as long (up to a day). The panel says until when.
- **It locks** when you leave LOG, tap **LOCK**, the app goes to the background, standby starts, or after 10 minutes without a touch.
- **Jump to a month:** tap the month name above the calendar, pick a year, then a month.
- **Saving:** 5 seconds after you stop typing, on **SAVE**, and when it locks. Beside the day's name, **SAVING** shows from your first keystroke until Notion has it, then **SAVED**; nothing moves on the page. Until Notion has it, your writing is kept on this iPad; once saved it's removed from the iPad.
- **Editing** an earlier day changes only the paragraphs you changed. A page that also holds something LOG can't show (a photo, a table) opens read-only; edit it in Notion.
- **Lists:** type **- ** at the start of a line for a bullet; Return carries it on, Return on an empty bullet ends the list. **• LIST** turns lines into bullets and back. They're real list items in Notion. REVIEW's questions work the same way.
- **+ BEARINGS** adds your bearings as a closing block to fill in. Today's intent from the Bridge shows above today's page.
- **SEARCH THE LOG** (under the calendar): type a word or phrase, tap **FIND**: every entry that uses it, newest first, with the words around it. **EXACT WORD** (on to start) matches the whole word only; capitals never matter. Tap a result to read it; **NEWER** and **OLDER** step through the rest, **RESULTS** goes back. An entry edited directly in Notion keeps its old searchable wording until you next save that day in LOG.
- **The ASK button never sees the log.** It isn't in the snapshot and ASK has no way to read it.

**Ask Claude about the log** (off until **SYSTEMS → CAPTAIN'S LOG → SHARE LOG WITH ASK**), in the open LOG:

1. **Narrow first.** **ASK CLAUDE** for the month on the calendar (or **WITH THE MONTH BEFORE**), or run a search and tap **ASK ABOUT THESE**.
2. **Ask.** **KEY MOMENTS**, **THEMES**, **LIFTED · DRAINED**, **ONE PHRASE**, **WHAT CHANGED**, or your own question. **THINK HARDER** uses Opus.
3. **PREVIEW** shows how many entries, which dates, about how many tokens and the cost. Nothing is sent until **SEND**. Above about 25K tokens it says so.
4. **Read.** Dates in the answer open that entry (**ASK THE LOG** brings you back). **FOLLOW UP** asks more about the same entries, usually for under 1¢.
5. **SAVE TO NOTION** keeps an answer as an undated "Claude insight" page in the Captain's Log database; **SHOW SAVED** lists them.

Limits, checked by the Google bridge: 62 entries, about 60K tokens and two months per question, so a whole year never goes at once (ask month by month instead). Each request needs your authorization code. Claude gets only the chosen entries, has no tools and can't change anything. Answers aren't kept on the iPad and are forgotten when the log locks. Spending counts toward ASK's monthly reminder and shows as LOG in Systems (never the text).

### HABITS

- **HABITS** (or the strip on the Bridge): tap **MEDITATED**, **EVENING WALK**, the **water bottles** (1 L each; tap a full bottle again for half, or **+ ½ BOTTLE** / **− ½**) and **DID NOT SWIPE** / **SWIPED**. Tap again to undo.
- It saves to Notion a moment after your last tap. Without a connection it waits on the iPad and goes when you're back.
- **Water goal:** the chips under the tiles (2 to 4 L). Streaks and the grid count a day as won at the goal or more. A new goal counts from the day you choose it; earlier days keep the goal they had, so raising it never turns past days into misses. The note under the chips lists recent changes; the history is kept on this iPad.
- Earlier days: the arrows beside the title, or tap a square in **LAST 12 WEEKS**. **REVIEW** shows the week's habits day by day; **ALL REVIEWS** week by week.

### TAROT

Records the cards you draw from your own deck: this week's card and any reading through the week, in any spread. Saved to **🔮 Tarot** in Notion, one page per reading, with the cards written out so they read well there too.

- **This week's card:** **RECORD THIS WEEK'S CARD** (or the Bridge's TAROT panel), tap the position, pick the card, mark it **REVERSED** if it came out that way. Weeks run Monday to Sunday. It shows on the Bridge and in that week's Review.
- **A reading:** **+ NEW READING**, pick a spread (one card up to the Celtic Cross, **FREE** for any number, or one of yours), an optional question, then tap each position and pick the card you drew. **DRAW HERE** shuffles on the iPad for days without your deck.
- **Your reading:** a note per position and **WHAT IT SAYS** for the whole; saved a moment after you stop typing, and when you leave the app.
- **A card's history:** tap any card for every reading it came up in, and **MY MEANING**, your own words for it, shown wherever it turns up.
- **MY SPREADS:** place positions on a grid, name them, mark one as crossing.
- **Patterns:** suits, reversals and repeat cards over 90 days; your weekly cards over 8 weeks.
- **From your books:** **BOOKS** under any card opens both books for that card, with a tab for each (for a reversed card Dean's reversed meaning comes first; **OPEN IN NOTION** goes to that page; your last choice of book stays chosen; **CLOSE BOOKS** folds it away). Inside it, **SUGGEST A MEANING HERE** asks Claude what the card could mean in that position, using only your two books, your MY MEANING, your question and your notes (about 1¢). For readings of two or more cards, **SUGGEST A READING FROM MY BOOKS** under WHAT IT SAYS does the same for the whole spread (about 1¢ plus half a cent a card). An answer waits in a dashed box marked **NOT SAVED** until **ADD TO MY NOTE** / **ADD TO WHAT IT SAYS** (it goes after what you've written and saves like typing) or **DISMISS**. A card's history (**EVERY TIME THIS CARD CAME UP**) has **FROM YOUR BOOKS** too, without suggestions. Suggestions count toward ASK's monthly total (TAROT SUGGESTION in Systems); nothing goes to Claude until you tap SUGGEST.
- Deleting a reading or spread puts it in Notion's trash, where it can be restored.

### ASTROMETRICS

The year at a glance, across every station. Not pinned by default: **ALL STATIONS → ASTROMETRICS**, or **COMPUTER** and type "year".

- **SENSOR SWEEP:** the headline numbers for the year so far: tasks done, hours planned, books finished, Log days, honey (or tarot readings), weekly reviews. Tap one to open its sector.
- **STAR CHART:** one row per station, one cell per week (Monday to Sunday). Brighter means busier, and each row is shaded against its own busiest week (marked ✦), so hours and books never compete. Hatching means no record yet that year (the station is new, or nothing was logged); dots are weeks still ahead; the gold line is today; ✦ above the rows are key dates. Tap a cell for that week's numbers, a row name for its sector.
- **SECTOR:** the row by month (CALENDAR stacks Work, Farm, Personal and Growth), tap a month for its numbers, and a few facts (the busiest week, the highest-rated book, the most drawn card, the honey…).
- **Where the numbers come from:** what Bridge already reads. Calendar hours are counted as REVIEW counts them (ignored titles and breaks left out). Tasks count on the day they were last edited after being marked Done (Notion keeps no finished date). UPKEEP counts from 2.40 on. Read every six hours; **RESCAN** reads it all again.
- **Captain's Log:** locked until you tap **UNLOCK LOG** and enter the PIN; then it shows how many days you wrote each week, never the words. Forgotten when the app is put away; never stored or sent to Claude.
- **◀ ▶** step a year at a time; **THIS YEAR** comes back.
- **SHIP'S YEAR:** at the first open after 06:00 on 31 December, Sonnet writes about 200 words on your year from the counts, printed like the Morning Briefing. **READ IT TO ME** reads it in Nova (or Moira). **COMPILE** gives a year-so-far version any day (a few cents, counted in ASK's monthly total as SHIP'S YEAR). It never sees the Log; tarot, the apiary and the Replicator Queue's spend go in only when SHARE WITH ASK is on for them. Kept on this iPad and in backups. Needs bridge 1.32 and Ask Claude.

### RESSIKAN

Play with sound, named after Picard's flute. Everything is made on this iPad (Web Audio): nothing to download, no keys, works offline. **ALL STATIONS → RESSIKAN**, or **COMPUTER** ("theremin", "beat", "ambient"). Tap **▶ SOUND ON** (or just touch a surface). Headphones bring out the low end; with newer iPadOS it plays even with the silent setting on.

- **SOUND** (over both cards): **ECHO** (timed to the beat), **SPACE**, **LO-FI**, **WOW** (tape wobble). **SCALE LOCK** keeps every note in a scale (Pentatonic, Dorian, Hirajoshi, Whole Tone) in the **KEY** you pick; **◌ FREEFORM** lets every pitch through. **RECORD** captures what you hear; each take plays back here, and **SAVE TO FILES** puts it in the Files app (takes aren't kept after you leave).
- **FIELD:** the theremin. Touch and hold: height is pitch, across is tone, two fingers make two voices, Apple Pencil pressure adds vibrato. **ACROSS THE FIELD** can instead sweep **VOWEL** (a voice saying "ah, eh, ee, oh, oo"), **RING MOD** (metallic) or **FOLD** (gritty). **HOLD NOTES** keeps a note sounding when you lift your finger (up to four; **RELEASE** lets them go). **SYNTH** knobs, live on every voice: **VOICE** (WAVE, SUB, SPREAD, RANGE), **COLOUR** (FOLD, RESO, VOWEL, RING MOD), **MOTION** (GLIDE, VIBRATO, TREMOLO).
- **The beat ring:** **▶ BEAT**. Four rings (KICK, SNARE, HAT, KEYS) of fixed steps; the gold beam sweeps and plays the lit dots. Tap a dot to light it or clear it. Patterns to start from: **LOFI, BOOM BAP, DUB, MOTORIK, SPARSE, CLEAR**. Tap a ring's name to make it 16, 12, 10 or 8 steps, so it drifts against the others. **TEMPO, SWING, BEAT LEVEL**, and **VINYL** crackle. **RING INSIDE / BESIDE** sets it into the field's corner or next to it.
- **DRIFT:** ambient. **LISTEN** (it plays on its own), **PLAY** (only your touches: tap blooms a note, hold to swell, drag to scatter chimes) or **DUET** (both; sometimes the room answers a note you played, later and softer, from the other side). **BED**: wind, surf, rain or none. **DENSITY, GLOW, DEPTH, ANSWER, BED**, and **SLEEP** (15, 30, 60 minutes). A beat that's on keeps playing here.
- **Leaving RESSIKAN** turns its sound off. Your settings, patterns and knobs are kept on this iPad (and in your backups); nothing goes to Notion or the bridge.

## RESOURCES

### LEDGER

Your finances from YNAB at a glance. YNAB stays where you budget: the Google bridge only reads it and can never change it.

- **Accounts:** checking (working balance), age of money with its 12-month trend, savings, and loans with % paid off (from the loan's starting balance in YNAB).
- **Average spend:** per category for the last **3M / 6M / 12M** full months (months before your plan existed are skipped), with a white tick for this month so far. Tap a category for all three averages; **+** shows the smaller ones. Card payments, hidden and internal categories are left out.
- **Replicator Queue:** things to buy once **Discretionary** can cover them. **ADD** with a rough cost and note: it lands where its price puts it (just above the first item that costs more; no price, the bottom). Reorder with ▲ ▼ and your order is kept; **PRICE ORDER** (shown when the queue is out of price order) sorts it lowest to highest. **BOUGHT** (with a yes/no check) moves an item to *Bought recently*, where **UNDO** puts it back. You can also edit items, links and costs in Notion.
- **Freshness:** opening LEDGER asks YNAB itself when the iPad's copy is over a minute old; **pull down** or **REFRESH** for the latest (**AS OF** shows when). Otherwise the bridge asks YNAB at most every 10 minutes and keeps past months for 6 hours, far below YNAB's limit of 200 requests an hour.

### LIBRARY

- **+ ADD BOOK:** type a title or author; pick **WANT**, **READING NOW** or **ALREADY READ**. Not listed? Add it by hand from the same sheet.
- **FINISHED** on a book you're reading files it under **READ** with today's date; tap it to rate it.
- Tap any book to change its shelf, its dates, the stars or notes (**DONE** saves), or **REMOVE** it (tap twice; it goes to Notion's trash).
- Searches go from the iPad straight to Open Library (openlibrary.org, free, no account); only the search words are sent.

### HOLODECK

HOLODECK opens on **the arch**, as on the ship: **ENTER PROGRAM** with two programs. **PROGRAM 01 VISUAL** is a TV with channels always on air (what's on each shows on the arch); **PROGRAM 02 AUDIO** is your NAS folders and the audio player (what's playing or where to continue shows on the arch). Tap one to go in; **◇ ARCH** at the top of each program comes back. Tapping HOLODECK in the bar, or opening it from anywhere, always starts at the arch. One plays at a time: tuning in the TV pauses audio, and starting audio turns the TV off.

#### VISUAL

A TV that's always on air. **COMPUTER** ("tv", then **Tune in to the HOLODECK**) goes straight in. Each channel is one NAS folder, played in one of two styles, chosen per channel in the channel list:

- **IN ORDER** (the start): a folder of videos, or a series with one folder per season, played in order (file names in number order; a series season by season, episode by episode, then its specials and extras), laid end to end from the moment you added it, and starting again from the top at the end.
- **NETWORK:** a folder of show folders, programmed like a TV network: a new lineup each day from 6:00, shows in turn, now and then two episodes of one in a row (details below).

Either way the clock decides what's on, so **TUNE IN** always joins mid-broadcast, and every channel keeps running whichever one you watch; nothing about your viewing is remembered. Your channels, their styles and the look (CRT or CLEAN) are kept on this iPad (and in your backups); measured video lengths only on this iPad.

- **Adding a channel:**
  1. Share the folder with the relay under `/media/Video/` (NAS relay, in Part 1): one more line under the relay's `volumes`, then redeploy the project. Put quotes around a line whose path has spaces: `- "/PATH/TO/My Show:/media/Video/My Show:ro"`.
  2. Check it in Safari: `https://timothyos-nas.YOUR-TAILNET.ts.net/Video/?k=YOUR-TOKEN` lists the folder.
  3. **HOLODECK → VISUAL → + ADD CHANNEL → Video →** your folder **→ USE THIS FOLDER** (it says what it found: "12 SEASONS + SPECIALS · 281 EPISODES", or "100 VIDEOS"). The new channel comes on at its beginning. Bridge measures each video's length once (kept on this iPad); a channel can be watched as soon as its first videos are measured, and the rest are measured as it plays.
- **A series:** one level of folders inside the channel's folder. A folder with a season number in its name ("Season 3", "Show — Season 3", "S03") is a season, played in number order; episodes go by the number in their names ("Episode 7", "S03E07", "3x07"). Folders without a season number (Specials, Extras) follow the last season, then any episode without a number, then videos loose beside the season folders. Bracketed video IDs and "Full Episode" are left out of what's shown.
- **Changing channel:** **CH ▲ / CH ▼**, the dial (turn it and let go near a number, or tap it for the next one), **WATCH** in the channel list, or the guide's other-channel line. A moment of static, then whatever that channel is showing now. Channels are numbered in the order you added them; **RENAME** and **REMOVE** (tap twice; the folder on the NAS is untouched) are in the list.
- **On screen:** **● LIVE**, the channel mark (HOLODECK 2), and in each video's first and last seconds the artist and title ("Artist - Title" with or without a leading number) or the series, season and episode. **GUIDE**: now (with time left), the next three with their start times, and what's on the other channels. **CRT** (scan lines, the shows' own 4:3 shape) or **CLEAN**. **MUTE** (the iPad's buttons set the volume).
- **SLEEP** under the TV: 15 MIN, 30 MIN, 1 HOUR, 2 HOURS or END OF THIS SHOW turns the TV off, on other screens and in Picture in Picture too (the chip counts down). Turning the TV off by hand clears it.
- **Standby** never starts on HOLODECK (the arch, VISUAL or AUDIO) or while the TV is on air. Once a sleep timer (VISUAL's or AUDIO's) has run out, Standby takes over as usual, so a night in front of the TV ends on the dim night clock; the next touch holds HOLODECK awake again.
- **PICTURE IN PICTURE** keeps a small TV floating while you use other stations or apps; otherwise leaving HOLODECK turns it off. **FULL SCREEN** for the iPad's own player. Coming back to the app catches up with the broadcast.
- **What plays:** MP4, M4V and MOV (H.264 or HEVC video, AAC audio). Other files (AVI, MKV, WMV and so on) are skipped and counted in the channel list. A one-time fix on the NAS, with ffmpeg (a free converter; easiest in a Docker container):
  - MKV that already holds H.264 video: repackage, quick and lossless: `ffmpeg -i "in.mkv" -c copy -movflags +faststart "out.mp4"`
  - Anything else: convert once: `ffmpeg -i "in.avi" -c:v libx264 -crf 20 -preset slow -c:a aac -b:a 160k -movflags +faststart "out.mp4"`
  - `+faststart` puts the index at the front, so a video starts and jumps to the middle quickly.
  - A whole series, every season folder at once (in the series folder): `for f in */*.mkv; do ffmpeg -n -i "$f" -c copy -movflags +faststart "${f%.*}.mp4"; done`
- **LOOK AGAIN** reads every channel's folder afresh after you add videos (new ones take their place in the order).
- **NETWORK in detail** (tap **NETWORK** beside a channel in the channel list; **IN ORDER** switches back). For a folder of show folders (each show's episodes directly inside it, or in season folders inside it), programmed like a TV network:
  - Each broadcast day, from 6:00, has its own lineup, worked out from the date (nothing is stored; the guide and the other channels' line work as usual).
  - A show at random each time, never the same show twice in a row, except about one pick in four is a block: two episodes of it in a row, in order.
  - Through the day, each show works through a shuffle of its own episodes, so none repeats that day.
  - The show's name comes from its folder (`night_owl_theatre` → Night Owl Theatre); the guide reads "Night Owl Theatre · S2 E5 · title". In an episode's last 15 seconds, **UP NEXT** names the next show (or MORE … for a block).
  - It's on air at once: an episode not yet measured counts as the show's typical length, and the times settle as real lengths come in (each measured once, and kept). A big folder takes a while to measure the first time, only while Bridge is open.
  - A plain folder of videos (no show folders) set to NETWORK is a fresh shuffle every day from 6:00, no repeats that day; videos loose beside show folders join the rotation as one more "show".
  - Leftovers from a downloader (`.part`, or `.f247`-style streams that were never joined) are ignored; only finished MP4/M4V/MOV files play.
- **Public access TV:** `tools/ia_fetch.py` fills a folder with old public access shows from the Internet Archive, arranged for NETWORK (setup under NAS relay, Part 1).

#### AUDIO (was STORAGE)

Folders on the NAS, through the relay, with an audio player for podcasts, music and audiobooks. STORAGE became this program in 2.47; everything it kept (places, speed, hidden folders, track order) carried over, and a STORAGE pin in the bar became HOLODECK. **COMPUTER** ("podcast", "music", "storage") opens it directly, and the floating player's title opens the player.

- **Folders** on the front page are the relay's shares (NAS relay, Part 1), on a radio band: tap one and the needle swings to it, then the folder opens (the band only moves by tapping). A share added on the NAS appears the next time you open AUDIO. Tap into folders, tap an episode to play. **CONTINUE LISTENING** offers anything stopped part way. From the arch, AUDIO opens the player while something is playing, and the folders otherwise.
- **The player:** the place in each file, speed and "play the next one" are kept **on this iPad** (and in your backups). While something plays, a small pill on every other screen pauses or opens it; **›** minimizes it to a play button, **✕** stops it and puts it away (the place is kept). **MARK PLAYED** and **START OVER** are on the full player; the lock screen and headphone controls work too.
- **Playing on in the background:** with **PLAY THE NEXT ONE** on, the next file is read into the iPad's memory during the last 90 seconds of the current one (files up to 150 MB) and starts a moment before the end. iPadOS keeps a home-screen web app awake in the background only while it's making sound, and this hand-off happens while it still is, so the next track no longer waits for you to come back to Bridge. A file over 150 MB, or one that couldn't be read in time, is fetched from the NAS at the end as before, and may still wait if iPadOS has already paused Bridge. Most dependable: Bridge left open on screen, or in Split View or Slide Over beside the other app.
- **Artwork:** a `cover.jpg` (or folder, front, album, artwork, poster; .jpg, .png or .webp) in a folder gives it art. MP3 titles, show names and artwork come from the files' own tags as they play.
- **Lengths:** each track shows its length, read from a few kilobytes of each MP3, M4A/M4B, FLAC or WAV when a folder opens and remembered on this iPad. Other formats (OGG, Opus, AAC) show their length once played. Documents show their size.
- **TRACK #** (folders with MP3s) orders by disc and track number from the files' tags. The line under the sort chips says how many files have a number; files without one go last. Retagged files are read again by themselves; **READ TAGS AGAIN** re-reads the whole folder. Each folder remembers its own sort.
- **Search this folder** (the box above the list) narrows the folder you're in by name; **ALL / UNPLAYED / IN PROGRESS** filter its audio files; **A TO Z / NEWEST** (and TRACK #) sort it.
- **SLEEP** on the full player: 15 MIN, 30 MIN, 1 HOUR or END OF EPISODE pauses playback (the chip counts down). Standby then takes over as usual (see VISUAL).
- **HIDE FOLDER** keeps a folder out of AUDIO on this iPad; **SYSTEMS → NAS RELAY** lists hidden folders with UNHIDE.

### ENGINEERING

Two tabs. **CONTROLS** shows only the Home Assistant devices you add; **UPKEEP** tracks recurring maintenance. Both start empty, and everything you set up here is kept on this iPad (and in your backups).

- **Adding a device:** **+ ADD DEVICE**, search, **NEXT**, pick how it looks and which room, **ADD TO ENGINEERING**.
- **Layout:** LIGHTS AND SWITCHES (your rooms as chips: ALL, a room, OTHER), CLIMATE (thermostats: target with + and −, modes) and SENSORS. **ROOMS** renames, reorders and deletes rooms; they're separate from the areas set up in Home Assistant.
- **Each device** has a card style (TOGGLE, DIMMER, COLOR, COMPACT, READING) and a room, set from its **⋯** button. Lights open a panel with the controls they actually have: color wheel and quick colors, white warm-to-cool, brightness, effects. **CARDS / LIST** switches the whole screen; **ALL OFF** turns off what the chosen room shows. Switches and lights toggle, sensors show their reading, refreshed every 30 seconds while open.
- **UPKEEP:** items due by time (days to years) or by a reading (miles, hours). Overdue items also show in the Bridge's Condition.
- A non-admin Home Assistant user can still switch every device in that Home Assistant. The list on ENGINEERING is what's shown, not a lock; the protection is Tailscale plus the two tokens. **FORGET** in Systems removes the address and token from the iPad; deleting the token in Home Assistant cuts it off everywhere.

### APIARY

Your hive log, in **🐝 Apiary** in Notion (under your beekeeping page): one Yard page, one page per hive and one per check, each check linked to its hive. It opens on **the yard**, each hive drawn as its own box stack (honey supers on top, deeps below, the frames drawn lit up); tap a hive to zoom in, tap a check to zoom in again.

- **The yard:** the top line shows **HIVE CHECK GO / HOLD** (the Bridge's hive weather, when a location is set), honey this year and the year's mite checks (the lowest hive's count out of 4). **THIS YEAR** opens honey per hive, mite checks per hive and **the yard list** (supplies, winter prep: tap to tick, ✕ to remove, type and ADD).
- **A hive:** its stack large (tap a box for what it held at the last check), **NEXT TIME** from the last check, every check newest first, and **ABOUT THIS HIVE** with **EDIT HIVE** (name, queen, start date, source, foundation, equipment, place, notes, paint).
- **TRUE UP STACK**, under a hive's stack, for something you did at the hive but didn't log. **+ DEEP, + MEDIUM, + SUPER, + EXCLUDER, + FEEDER** put a piece where it normally sits (one feeder and one excluder at most). Tap a piece (on the stack or in the list) for its frame count (8, 9 or 10; supers start at 9, deeps and mediums at 10), frames drawn or filled, capped % (supers and mediums), the feeder's syrup, **▲ UP / ▼ DOWN** and **REMOVE** (two taps). **LOG THIS TOO** also adds a short check on the date you pick ("Added a super (logged later)"). **SAVE STACK**.
- **+ NEW CHECK** walks five short steps: **QUEEN** (what you saw, brood pattern, temperament, who was there), **FRAMES** (count each deep, medium and super out of its own frame count; capped % per super and medium; **+ DEEP**, **+ MEDIUM**, **+ SUPER**, **+ EXCLUDER**, **+ FEEDER** or **TOP PIECE OFF** when you change the stack), **STORES** (the FEEDER answer also sets the feeder's syrup on the stack), **PESTS** (sugar roll or alcohol wash works out the mite load: under 2% fine, 2 to 3% watch, over 3% treat), **WRAP UP** (what you did, honey pulled in lb, an issue, notes, next time, and **REMIND ME IN 7 DAYS**, which adds "Hive check: …" to the Master Task List). Tap a chip again to clear it. A half-finished check is kept on the iPad (**RESUME CHECK**). **SAVE CHECK** writes it to Notion as plain sentences, updates the stack, and offers **CHECK … NEXT** for the other hive.
- **A check:** everything recorded, **EARLIER / LATER**, **EDIT** (every field as text) and **DELETE** (two taps; it goes to Notion's trash).
- **+ ADD HIVE** on the yard for a new package, nuc or split. **REMOVE HIVE** (two taps, in EDIT HIVE) moves the hive page to Notion's trash; its checks stay.
- **No signal at the hives:** saves wait on the iPad and go when the Google bridge answers. A save Notion refuses shows in red with **RETRY**.

## SCIENCE

### SCIENCE (the hub)

Free public feeds about the sky and your surroundings, worked out from your **Location** (SYSTEMS → BRIDGE), rounded to about 1 km as for the weather. Open it from **ALL STATIONS → SCIENCE**, **COMPUTER** ("aircraft", "iss", "aurora", "quake", "moon"), or the Bridge's **SCIENCE** line. It opens on **SKY TRAFFIC**; the **SENSOR SWEEP** tiles along the top switch departments, and tapping SCIENCE again comes back to SKY TRAFFIC. Feeds refresh only while it's open.

- **SKY TRAFFIC:** aircraft within 50 km on the scope (you're the gold dot; each mark points where it flies), every 10 seconds. Amber is low (under 5,000 ft), orange is military. Tap a mark or a row for its card: type, operator, route, height, speed, heading and squawk, with **TRACK LIVE** (the live map) and **PHOTOS**. Coverage is whatever volunteers' receivers hear, so a quiet sky may just be a gap.
- **Landmarks** on the scope, to judge distance: a few towns (◇) and airports (○, with a line for the runway's heading) suggested from OpenStreetMap the first time SKY TRAFFIC opens, spread round the scope and across the rings, at most 8. They're muted and drawn under the aircraft; a label that would overlap another is left off. Tap one for its name and distance. A plane within 8 km of one reads **near …** in its row, and its card says where ("1 km WNW of …"). The **LANDMARKS** chip under the scope turns them off. **SYSTEMS → SCIENCE → Landmarks → EDIT**: rename (tap the name), **SHOWN / HIDDEN**, **+ add** by place name or latitude, longitude, or **ADD WHERE I AM** when you're standing there (your own places are squares, and ✕ removes them), **SUGGEST AGAIN**, and the name for the centre. Kept only on this iPad and in your backups.
- **SPACE STATIONS + SATELLITES:** where the ISS is now and its next visible pass here, then every visible pass of the ISS, Tiangong and Hubble for five days: when, the direction it rises, how high it gets, where it sets, how long. Only passes you can actually see (a dark sky, the station in sunlight) are listed; 40° or more is bright and easy. While one is overhead, the scope's rim shows where to look.
- **SPACE WEATHER:** Kp (geomagnetic activity, 0 to 9) now, the last day and the forecast; whether an aurora could reach your latitude tonight; solar flux, sunspots, this week's flares; shortwave band conditions day and night.
- **EARTH:** earthquakes within 500 km (and M6 anywhere this week), tap one for USGS; weather alerts from the National Weather Service; air quality.
- **NIGHT SKY:** the Moon, full darkness, planets, the next meteor shower and eclipses, and this week's closest asteroids (LD: lunar distances).
- **NATURE:** what people have confirmed seeing nearby this week (iNaturalist), and notable birds (eBird, with the optional `EBIRD_API_KEY`).
- **EVENT LOG:** anything worth remembering lands here once: military, emergency or low aircraft, bright station passes, storms, M and X flares, nearby or big quakes, alerts, full and new moons, meteor peaks, eclipses, close asteroids, notable birds. The iPad keeps 30 days; **🔭 Science Log** in Notion keeps every one (it waits on the iPad when offline). **☆** stars one in both; starred events show on ASTROMETRICS' key-date line. **ALL DEPARTMENTS** or just the one you're on.
- **The Bridge line:** on days with something worth knowing (a bright ISS or Tiangong pass tonight, an aurora chance, a nearby M4 quake, a meteor shower peak), one **SCIENCE** line under Condition; never a Condition item. The Morning Briefing mentions the same. **SYSTEMS → SCIENCE** turns the line off.

## ALWAYS AVAILABLE

### COMPUTER

Find any station, or something to do inside one, by typing a few letters. Open it with **COMPUTER** in the header, **⌘K** on a keyboard (iPadOS keeps ⌘Space for its own Spotlight), or a **swipe down on the sidebar**.

- **Before you type:** **WAITING ON YOU** (the Bridge's Condition items, which open the same place a tap on the Bridge does), **RECENT** stations, and **NOT OPENED LATELY**: stations not in the sidebar that you haven't opened in 14 days.
- **Type to narrow:** stations, and actions inside them (Plan the day, Add a book, Write this week's review, Search the log, Record this week's card, Add to the Replicator Queue, Make a backup…), plus your books, hives (New hive check · and True up stack · for each), the 78 tarot cards (every time a card came up), episodes part way, upkeep items and Systems settings. Other words work too: "bees" finds APIARY, "journal" finds LOG, "money" finds LEDGER.
- **Choose:** tap a row, or **↑ ↓** and **Return**. **Esc** or a tap outside closes it. **Search the log** and **Ask Claude about the log** open LOG, which asks for your code first, then go straight there.
- **It only opens things.** Every change still happens on the screen it opens, with that screen's own buttons. Searching happens on this iPad: nothing typed in COMPUTER goes to the Google bridge or Claude. When you last opened each station is kept on this iPad (not in backups).

### CAPTURE

**CAPTURE** (top right), or tap an empty spot on the Day or Week timeline: an event on Personal (or the farm or Growth calendar, once linked), a **KEY DATE**, or a **NOTE** to sort later in INBOX (one box, no area or day; the keyboard's microphone takes dictation). Work is never offered. A capture made offline appears as a dashed block marked **QUEUED**, and the status block counts it; it saves automatically when you're back. Each one carries a unique ID, so a retry never creates a duplicate. If Google rejects one, the status turns red (**NOT SAVED**) and **SYSTEMS → CAPTURE** offers **RETRY** or **DISCARD**.

### ASK

The ship's computer: questions about your days, tasks and dates, answered by Claude.

- **Each question goes with a snapshot** of what the app shows: today and the next six days, condition, priorities, open tasks, key dates, weather, your intent and bearing. Ignored events are left out. Claude can look further (other dates, other weeks) through the Google bridge. Finances, tarot readings and the apiary go along only with **SHARE WITH ASK** on in their Systems sections (off by default; switching one off applies to the very next question). The Captain's Log never does.
- **Claude never changes anything.** Suggested changes appear as cards: add a task, pick or unpick a priority, change a status, add a key date, add an event or reminder to Personal (or the farm or Growth calendar), draft a weekly review. Nothing happens until you tap **CONFIRM**. The Work calendar is never offered.
- **How Claude chooses:** "remind me to…" with no time becomes a task; something at a time becomes a calendar event (a reminder is a short event your devices alert you to); a deadline, a window or anything yearly becomes a key date. Weeks start on Monday. Life Areas, priorities and key date types must match your Notion names exactly; Claude is told the right names if it gets one wrong, before the card reaches you.
- **Models:** Sonnet 5.5 at low effort for questions (about 1 to 2¢); **THINK HARDER** uses Opus 5.5 (about three times that).
- **Spending:** each answer shows its cost; the sheet and **SYSTEMS → ASK CLAUDE** show the month so far against your ceiling, with the last eight questions (model, tokens, cost; never the text). At the **$8 reminder** ASK pauses; **CONTINUE THIS MONTH** carries on until the Console's spend limit stops it. The count is worked out from each answer's tokens at list prices, so it can drift from the Console a little; **MATCH THE CONSOLE** sets it to the Console's figure.
- **OPEN IN CLAUDE** opens the Claude app (your Pro plan) for longer conversations, with your question first and the snapshot after it; the whole prompt is also copied. If the link can't hold it all, whole sections are left out (least needed first) and the prompt starts with **[SNAPSHOT SHORTENED · PASTE FROM CLIPBOARD FOR THE FULL VERSION]**: select all in Claude and paste to send everything, or send it as is (it says what was left out). If Claude opens empty, paste.
- The conversation stays on this iPad for 6 hours or until **NEW CHAT**. Questions and the snapshot are sent to Anthropic to answer them; no web search is ever used.

### STANDBY

Tap **STANDBY** at the right end of the top bar any time, or let it start after 15 minutes without a touch (change or turn off in **SYSTEMS → STANDBY**). It never starts on its own on HOLODECK or while the HOLODECK TV is on air, until a sleep timer there has run out. A dim clock with weather, next up, the condition and the next key date; amber at night (22:00 to 06:00). Tap anywhere to wake: that tap only wakes the screen.

### SYSTEMS

Tap the **SYNCED** status in the bottom-left corner; it lights up while Systems is open. Wherever these steps say **SYSTEMS →**, start there. It holds the connection and **REFRESH NOW**, **NEEDS YOU** cards for anything broken (with the steps for that exact problem), **BACKUP AND RESTORE**, recent requests, calendars (with **IGNORED EVENTS** and **BREAKS**), each database's status with its **SHARE WITH ASK** switch where there is one, the NAS relay, Home Assistant, Balance targets, Standby and the version you're on.

**Ignored events:** booking blocks (a weekend out-of-office, say) can be left out of every view and total: tap the event → **IGNORE THIS TITLE**, or edit the list under CALENDARS. Kept on this iPad; your calendars aren't changed.

**Breaks:** **SYSTEMS → CALENDARS → BREAKS** holds titles (Lunch to start; add Walk or anything else). A timed event whose **whole title** is one of them (capitals and an "Out of office" in front aside) shows as a break even if its title is ignored: "Lunch" and "Out of office — Lunch" are breaks, a meeting called "Team Lunch" is not. Add a longer title to the list if it should count as a break too. Breaks show on Today, Week and the Bridge but never count as Work hours, meetings, BALANCE or Review hours.

---

# Part 3 · Reference

## Daily use

| Do | How |
|---|---|
| See everything at a glance | **BRIDGE** (top-left corner). Tap any item to jump to it |
| Open a station that isn't in the sidebar | **COMPUTER** (or **⌘K**, or swipe down on the sidebar) and type its name, or **ALL STATIONS**. **EDIT PINS** there picks the seven in the bar |
| Find something to do (add a book, a hive check, a setting) | **COMPUTER**, type a word or two, **Return** |
| Move between days, weeks, months | The arrows next to the title. **TODAY** jumps back |
| See event details | Tap the event |
| Add an event | **CAPTURE**, or tap an empty spot on the Day or Week timeline |
| Add a key date | **CAPTURE → KEY DATE**, or **+ ADD** on the Key Dates panel or DATES |
| Change or delete a key date | Tap it → **OPEN IN NOTION** |
| Hide or show a calendar | Tap its chip on Today |
| Plan your day | **PLAN DAY**. Pick up to 3 open tasks, or add a new one, then **SET PRIORITIES** |
| Finish a priority | Tap it on Today. It's marked ✅ Done in Notion. Tap again to reopen |
| Record habits | **HABITS**, or the strip on the Bridge |
| Log a hive check | **APIARY** → the hive → **+ NEW CHECK** |
| Watch TV or listen to a podcast | **HOLODECK** → **VISUAL** (**TUNE IN**) or **AUDIO** (tap a folder, then an episode) |
| Sort captured notes | **INBOX** (or the Bridge's **INBOX · N** line) |
| Look up the sky, quakes or birds nearby | **SCIENCE** |
| Find every Log entry that mentions something | **LOG** → **SEARCH THE LOG** |
| Update the balances | **LEDGER** → pull down from the top, or **REFRESH** |
| Ask about your days | **ASK**. Type or dictate; tap **CONFIRM** on any change you want |
| Hear this morning's briefing | **BRIDGE** → **READ IT TO ME** (or **COMPUTER** → Morning briefing) |
| Review the week | **REVIEW** (or tap **Weekly review due** on the Bridge on Sunday). Write, then **SAVE TO NOTION** |
| Leave out booking blocks | Tap the event → **IGNORE THIS TITLE** |
| Back up this iPad's settings, or restore them | **SYSTEMS → BACKUP AND RESTORE** |
| Force a sync | **SYSTEMS → REFRESH NOW** |
| Check connection health | **SYSTEMS**, or tap the status block |

The app syncs when opened, when you return to it, and every 5 minutes while open. With no connection it shows the last synced data and the status turns amber (**OFFLINE**).

## Condition rules

| Level | When |
|---|---|
| 🔴 RED | A High-priority task is overdue · Events on two different calendars overlap later today · Sync has failed for over 6 hours |
| 🟡 YELLOW | A key date is 3 days away or less · Any other task is overdue · A task is due today but not picked · No priorities picked by 10:00 · Weekly review due · An upkeep item is overdue · Frost tonight (32°F or below) · A capture hasn't saved after 2 tries · The task list didn't load · The Google bridge is older than this app needs · A Notion column Bridge uses was renamed, deleted or changed type |
| 🟢 GREEN | None of the above |

Items that need Systems say **SYSTEMS**: tap one and Systems opens on **NEEDS YOU** with the steps for that exact problem and a button for the first one. Scrolled away? The **▲ NEEDS YOU** tab on the right edge brings it back.

## Backup, restore and reinstalling

Everything the app keeps only on this iPad goes into one file you keep: the Google bridge, NAS and Home Assistant links (with their keys), ENGINEERING devices, rooms and upkeep, pins, ignored events, breaks, bearings, location, SCIENCE's landmarks, HOLODECK's channels, AUDIO's places, RESSIKAN's settings and the other settings.

- **Make one:** **SYSTEMS → BACKUP AND RESTORE**, type a passphrase twice (8 characters or more), **MAKE BACKUP**, then **SAVE TO FILES** and choose **Save to Files** (iCloud Drive or On My iPad). The header shows when you last made one. Make a fresh one after any big setup change.
- **The passphrase locks the file** (AES-GCM, with a key derived from your passphrase). It is never stored anywhere: without it the file can't be opened, so keep it in your password manager. The file holds your keys, so treat it like one.
- **Not in a backup:** data from Notion and Google (it comes back on the next sync), the Captain's Log draft and other unsaved drafts, and saves still on their way. While any save is waiting, **MAKE BACKUP** waits too; drafts that won't be included are named.
- **Restore:** on a fresh install the link screen has **OR RESTORE THIS IPAD**; on a linked app it's under **SYSTEMS → BACKUP AND RESTORE**. Choose the file, type the passphrase, **OPEN BACKUP**: the app shows what the file holds (links, devices, rooms, upkeep items, listening places…) before anything changes. **RESTORE** writes those settings, reloads and syncs. Stations show **WAITING** in Systems until each is opened once.
- **Rehearse it** without touching the installed app: open the app's address in a **Private** tab in Safari, restore there, look around, close the tab. A private tab starts empty and forgets everything when closed. Anything you change in it is real (it's linked to the same Google bridge), so look rather than tap.

**Reinstalling (or renaming) the app:** iPadOS reads an app's name only when it's added to the home screen, and removing the icon erases everything the app kept on this iPad, so:

1. Make a fresh backup and save it to Files. Make sure no red line says changes are waiting.
2. Touch and hold the icon → **Delete Bookmark** (or **Remove App**) → confirm.
3. In Safari open **https://tim3t.github.io/Timothyos/**, pull down once to reload, then **Share → Add to Home Screen** → **Add**.
4. Open the app from the home screen. On the link screen, **OR RESTORE THIS IPAD**: choose the file, type the passphrase, **OPEN BACKUP**, **RESTORE**.

## Troubleshooting

**Linking and the connection**

| Symptom | Fix |
|---|---|
| "The access key doesn't match" | Re-copy `ACCESS_KEY` from Script Properties |
| "The script didn't send calendar data" | You pasted the editor URL. Use the **Web app URL** from the deployment |
| "Couldn't reach the script", or OFFLINE flickers | The URL must end in `/exec` and the deployment's access must be **Anyone**. Then **SYSTEMS → RECENT REQUESTS** shows what's failing. Mostly DROPPED: the connection (Wi-Fi, VPN, content filter). Mostly TIMEOUT: Google is slow; check **Executions** in the script editor for long runs or errors |
| A Systems row says **WAITING** | Not an error: that station hasn't been opened since the app started fresh. Open it once |
| A Systems row says **ERROR** in red | The reason is underneath; tap **REFRESH NOW** after fixing it |
| A capture says NOT SAVED | **SYSTEMS → CAPTURE** shows why. Retry or discard it |
| The iPad still locks while Bridge is open | **SYSTEMS → STANDBY** shows whether iPadOS kept the screen on. If it declined: Settings → Display & Brightness → Auto-Lock → Never while docked |

**The Google bridge, calendars and Notion**

| Symptom | Fix |
|---|---|
| Changes to `Code.gs` have no effect | Deploy a **new version** (Updating the Google bridge, step 4) |
| **Google bridge out of date** in Condition, "The bridge refused it", or a station or feature says it needs bridge 1.x | **SYSTEMS → NEEDS YOU** names the version needed and the steps (Updating the Google bridge). Usually the new version wasn't deployed (step 4). Then **CHECK AGAIN** (in ASTROMETRICS, **RESCAN**) |
| A station says SETUP | It needs a database connected, a key in Script Properties, or a newer Google bridge: see its part of Setup |
| Work calendar **NOT FOUND** | Accept the share invite (Handshake 1, step 5); check `WORK_CALENDAR_ID` |
| Work meetings all say **Busy** | Your employer allows only free/busy sharing, or the events are private |
| "isn't connected to the TimothyOS integration" (any database) | That database → **•••** → **Connections** → add **TimothyOS bridge**, then **REFRESH NOW** |
| "Notion rejected the bridge's key" | Re-copy the secret into `NOTION_TOKEN` in Script Properties |
| **A Notion column changed** in Condition | Someone renamed, deleted or retyped a column. **SYSTEMS → NEEDS YOU** names it: rename it back (or change the type back) in Notion, then **CHECK AGAIN**. Renamed on purpose? Ask Claude to update the code |
| Setup says `LOG_PIN NOT VALID` | The value isn't one of the six code words and four digits (or six digits) |

**Claude, the Morning Briefing and the AI voice**

| Symptom | Fix |
|---|---|
| No Morning Briefing on the Bridge | **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** says why: ASK isn't set up, or it's turned off. Before 06:00 there's only yesterday's |
| The briefing says **NOT COMPILED** | The reason is underneath. **COMPILE NOW** tries again; it also tries on its own a few minutes later |
| READ IT TO ME uses Moira, not Nova | **SYSTEMS → ASK CLAUDE → MORNING BRIEFING** says why (no `OPENAI_API_KEY`, AI voice turned off, OpenAI refused the key or is out of credit). **TEST AI VOICE** checks it, and the **VOICE LOG** below it shows each step. A new briefing (REFRESH) tries Nova again |
| "Ask paused at this month's reminder" | **CONTINUE THIS MONTH** carries on to the Console limit, or wait for the 1st |
| "Claude Console credit is used up" | Add credit at platform.claude.com (keep auto-reload off) |

**Stations**

| Symptom | Fix |
|---|---|
| Environment says SETUP | **SYSTEMS → BRIDGE → LOCATION** |
| "Weather didn't load" | Open-Meteo didn't answer. It retries on its own; the rest of the Bridge is unaffected |
| Setup says `Ledger (YNAB): PROBLEM: ynab_not_found` | The log lists your plans as `name -> id`. Add `YNAB_PLAN_ID`, run setup, deploy a new version |
| LEDGER says YNAB didn't accept the token | Make a new Personal Access Token in YNAB, replace `YNAB_TOKEN`, run setup |
| SCIENCE asks for a location | Set **Location** in **SYSTEMS → BRIDGE** |
| SCIENCE shows no aircraft | Coverage depends on volunteers' receivers near you; the source is named under the scope. If it says it couldn't read the feed, it tries again on its own |
| SCIENCE events don't reach Notion ("waiting to reach Notion" in the EVENT LOG) | Connect **🔭 Science Log** to the TimothyOS integration (Connect Notion), then **REFRESH NOW** |
| HOLODECK or ENGINEERING can't reach the NAS | Tailscale on the iPad must be on and signed in; check the relay address and token in **SYSTEMS → NAS RELAY** (**SAVE AND TEST**), and that the address with `?k=` opens in Safari (NAS relay, step 5) |
| A folder shared on the NAS doesn't show in AUDIO or + ADD CHANNEL | Redeploy the `timothyos` project after adding its line, check it in Safari (NAS relay, Sharing folders), then open AUDIO again. Video channels must be under `/media/Video/` |
| HOLODECK says a video wouldn't play, or TUNE IN stays grey | Grey with MEASURING: wait for the first lengths. Videos that never play: convert them to MP4 (HOLODECK → VISUAL, What plays) |
| Music stops at the end of a track while Bridge is in the background | Files over 150 MB, or a slow NAS link, can stall the hand-off: keep Bridge in Split View or Slide Over, or open it to carry on |
| RESSIKAN is silent though SOUND is on | If it says **IPADOS PAUSED THE SOUND**, tap SOUND ON (or any surface) to start again; something else on the iPad took the sound. Check the volume and, on older iPadOS, the silent setting |

## Security model

- **The repository is public and holds no secrets.** Keys live in Script Properties (`ACCESS_KEY`, `NOTION_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `YNAB_TOKEN`, `LOG_PIN`) and, for the access key and the NAS and Home Assistant tokens, in the app's storage on this iPad.
- **The access key** is checked on every request. Leaked? Run **rotateKey** in the script editor, then **SYSTEMS → UNLINK** and link again. **UNLINK** also deletes the cached calendar data from the iPad.
- **Calendars:** the Google bridge reads Work, Personal, farm, Growth and the holidays calendar. It can **only add** events, and only to Personal, farm and Growth. Work is never writable, and it never edits or deletes an event.
- **Notion:** the integration sees only the databases you connected (the table under Connect Notion), with only the actions listed there. The bridge checks that every page it changes belongs to the right database. **Removing** a book, a tarot reading or spread, an apiary check or a hive **moves it to Notion's trash** (restorable there). The only real deletion is in LOG: paragraphs you remove from your own entry.
- **YNAB** is read-only: the bridge only ever reads it.
- **Captain's Log:** every log request carries your authorization code (in the request address over HTTPS, like the access key, because Google's redirects can drop a POST body), checked by the bridge, with a 15-minute lock after five misses that doubles with each lockout in a row. The code is never stored on the iPad or logged by the app. Entries are never stored on the iPad (only unsaved writing, until it reaches Notion), are dropped from memory when the log locks, are never in a backup, and never go to the ASK button.
- **Claude:** the API key lives only in Script Properties. What goes to Anthropic, and only when you ask: for **ASK**, your question and the snapshot (plus finances, tarot or the apiary only with their SHARE WITH ASK switch on); for **Log Ask**, only the entries you chose, with your code; for **WRITE SUMMARY** and **PATTERNS**, the week's numbers and your reflections (and that week's Log entries only with SHARE LOG WITH ASK on and your code); for **SUGGEST**, the card's book passages, your meaning, question and notes; for the **MORNING BRIEFING**, the same snapshot ASK sends minus tarot and the apiary, once a day (Claude gets no tools for it, so it can only describe). Claude proposes; only your **CONFIRM** changes anything, through the same actions as the app's own buttons. No web tool, ever. Spending is capped three ways: prepaid credit with auto-reload off, the Console spend limit, and the bridge's $8 reminder.
- **NAS relay and Home Assistant:** the relay is reachable only inside Tailscale and refuses anything without the relay token; folders are mounted read-only. Home Assistant sits behind the same relay at `/ha` and also needs its own token, from a non-admin user made for TimothyOS. Both tokens are kept only on this iPad (and in your backups). A Home Assistant token can switch any device, so treat it like a key.
- **Backups** hold the access key and the NAS and Home Assistant tokens, locked with your passphrase; the passphrase is never stored, and nothing leaves the iPad except the file you save. A restore writes only the settings a backup is meant to hold, whatever else a file contains.
- **OpenAI** (AI voice, when its key is set and it's on): only the Morning Briefing's text, to turn it into speech. Never the Captain's Log, never anything else.
- **COMPUTER** searches only on the iPad; what you type there never leaves it.
- **HOLODECK** streams from your NAS through the relay only; your channels (folders and names) and the video lengths stay on this iPad (channels also in your backups).
- **`tools/ia_fetch.py`** runs only on your NAS, only when you start it, from one fixed commit; it talks to archive.org alone and holds no keys.
- **RESSIKAN** makes all its sound on the iPad; nothing it plays or records leaves it unless you save a take to Files.
- **Straight from the iPad:** weather from Open-Meteo (only your rounded coordinates), book searches from Open Library (only the search words). Location, bearings, your intent lines, ignored events and the other iPad settings never go to this repository.
- **SCIENCE** sends only your rounded coordinates (about 1 km): from the iPad to NOAA, USGS, the National Weather Service, Open-Meteo, NASA and iNaturalist, and through the Google bridge to the ADS-B network (adsb.lol), CelesTrak and eBird. Aircraft and route lookups send a callsign or aircraft code to adsbdb. Landmarks: the rounded location goes once to OpenStreetMap (Overpass) to suggest them, and a place you search for goes to Open-Meteo's place search; the landmarks themselves stay on this iPad and never reach the bridge, Notion or the Science Log. Nothing else leaves; the bridge never stores the location.

## Updating the app

New versions arrive from this repository within a few minutes of a push. When you return to the app, it checks for a newer version and shows **UPDATE READY · TAP TO LOAD**. Tap it: it reads **LOADING UPDATE…** while the new version finishes downloading, then reloads into it (a few seconds at most). Closing and reopening the app also brings a downloaded update in. **SYSTEMS** shows the version you're on. App updates never need the Google bridge redeployed unless the CHANGELOG says so.

Releasing a new version is described in **CLAUDE.md → Release checklist**.

## Project layout

```
index.html               app page
css/app.css              styles (design tokens at the top)
js/app.js                app logic (one file, no build step)
js/vendor/               satellite.js and Astronomy Engine (MIT), for SCIENCE's passes and night sky
sw.js                    offline cache
manifest.webmanifest     home screen install settings (the name Bridge)
version.json             current version (the app checks it for updates)
icons/, fonts/           app icon, self-hosted fonts (SIL Open Font License)
apps-script/Code.gs      the Google bridge
tools/bump_version.py    sets the version everywhere before a release
tools/ia_fetch.py        public access TV from the Internet Archive, run on the NAS (NAS relay, Part 1)
tests/run.sh             all tests: the Google bridge against simulated Google, Notion, YNAB and Claude,
                         then the real app in a headless browser against simulated bridges and a simulated NAS
                         (about 5 minutes, in lanes)
CHANGELOG.md             what changed in each version
CLAUDE.md                working notes for Claude: architecture, rules, testing, release checklist, roadmap
docs/DESIGN.md           decisions log and the original design
```

## Roadmap

The next steps and the ideas parked for later are kept in **CLAUDE.md → Roadmap**.
