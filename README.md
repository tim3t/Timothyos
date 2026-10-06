# TimothyOS

A personal, LCARS-inspired life dashboard that runs full-screen on an iPad home screen.

**Calendar Core + Capture + Plan Day:** your work calendar and your personal Google Calendar, merged into Today, Week and Month views. **Capture** adds events to your Personal calendar in seconds, even offline. **Plan Day** picks up to three priorities from your Notion **Master Task List**, and you check them off on Today. Work stays read-only. Every other section is visible but on **STANDBY** until its stage is built.

```
iPad home screen app  (GitHub Pages, free, works offline)
        │  HTTPS + your private access key
        ▼
Google Apps Script "bridge"  (runs as you, in your personal Google account)
        ├─ Personal calendar (default calendar)
        └─ Work calendar (shared to your personal account)
```

No servers to run. No monthly cost. Calendar data goes only between Google and your iPad.

---

## Setup: five one-time handshakes

Everything below works from Safari on the iPad. For the Google pages, tap **aA → Request Desktop Website** first.

### Handshake 1 · Share your work calendar with your personal account

> Check your employer's policy on calendar sharing before doing this.

1. Open **calendar.google.com** signed in to your **work** account.
2. Gear icon → **Settings** → under *Settings for my calendars*, tap your name.
3. **Share with specific people or groups** → **Add people and groups**.
4. Enter your **personal Gmail** address. Permission: **See all event details**. Send.
   - If only **See only free/busy** is offered, choose it. TimothyOS shows those meetings as hatched **Busy** blocks.
5. In your **personal** Gmail, open the "shared a calendar with you" email and tap **Add this calendar**.

### Handshake 2 · Create the calendar bridge

1. Signed in to your **personal** Google account, open **script.google.com** → **New project**.
2. Rename it (top left) to `TimothyOS bridge`.
3. Delete the starter code. Paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs).
4. Change this line to your work email address:
   ```js
   WORK_CALENDAR_ID: 'you@your-employer.com'
   ```
5. Save (disk icon).
6. In the function menu next to **Run**, choose **setup**, then tap **Run**.
7. Google asks for permission:
   **Review permissions** → pick your personal account → *Google hasn't verified this app* → **Advanced** → **Go to TimothyOS bridge (unsafe)** → **Allow**.
   The warning appears for every personal script. This one only reads your calendars.
8. The **Execution log** lists every calendar your account can see, then shows:
   - `TimothyOS work calendar: OK (...)` and `TimothyOS personal calendar: OK (...)`
   - `ACCESS KEY (paste into the iPad app): ...`

   Copy the access key. It is also stored under **Project Settings (gear) → Script Properties → ACCESS_KEY**, which is easier to copy on an iPad.

If the work calendar says **PROBLEM: not_found**, finish step 5 of Handshake 1, or copy the exact ID from the calendar list in the log.

### Handshake 3 · Deploy the bridge as a web app

1. **Deploy → New deployment**. Gear icon → **Web app**.
2. Description: `v1.0`. **Execute as: Me**. **Who has access: Anyone**.
3. **Deploy**. Copy the **Web app URL**. It ends in `/exec`.

"Anyone" lets the iPad app reach the script without a Google sign-in. Without your access key the script returns nothing.

### Handshake 4 · Turn on GitHub Pages

1. On github.com, open this repository → **Settings → Pages**.
2. **Source: Deploy from a branch**. Branch **main**, folder **/ (root)**. **Save**.
3. After a minute or two the app is live at **https://tim3t.github.io/Timothyos/**.

### Handshake 5 · Install on the iPad

1. In Safari, open **https://tim3t.github.io/Timothyos/**.
2. **Share → Add to Home Screen → Add**.
3. Open **TimothyOS from the home screen** (not from Safari. The home screen app keeps its own storage).
4. Paste the **Web app URL** and the **Access key** → **LINK**.

The status block (bottom of the sidebar) turns green: **SYNCED**.

---

## Bridge 1.1 update (turns on Capture)

Capture needs bridge version 1.1. Do this once, from Safari (Request Desktop Website):

1. Open the raw code: **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**. Select all, copy.
2. Open **script.google.com → TimothyOS bridge**. Select all the old code, delete it, paste the new code.
3. In the pasted code, put your work email back on the `WORK_CALENDAR_ID` line. This is the last time: from now on, `setup` saves it, so later updates keep it.
4. Save (disk icon). Choose **setup** in the function menu, tap **Run**. If Google asks for permission again, approve it (the bridge can now add events to your calendar).
5. Check the log: both calendars **OK**, and `Bridge version 1.1.0. Can write to: personal.` Your access key does **not** change.
6. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** The URL stays the same.
7. In TimothyOS: **SYSTEMS → REFRESH NOW**. The top bar changes to **CAPTURE ON**.

## Notion link (turns on Plan Day and Priorities)

Plan Day reads your **🎯 Master Task List** and writes only three things to it: the **Focus Date** field (the day you picked a task), **Status ✅ Done** when you check one off, and new tasks you add from Plan Day.

**1. Create the integration** (Safari, Request Desktop Website)
1. Open **notion.so/profile/integrations** → **New integration**.
2. Name `TimothyOS bridge`, your workspace, type **Internal** → Save.
3. Capabilities: **Read content**, **Update content**, **Insert content**. User information: **No user information**. Save.
4. Copy the **Internal Integration Secret** (starts with `ntn_`). Treat it like a password: never paste it into chat, notes, or `Code.gs`.

**2. Give it access to the Master Task List only**
- Open **🎯 Master Task List** as a full page → **•••** (top right) → **Connections** → add **TimothyOS bridge** → Confirm.
- Connect it to the **database only**, not to **Timothy's Life Hub**. Connecting the hub would let the bridge see every page under it.

**3. Put the key in the bridge**
- **script.google.com → TimothyOS bridge → Project Settings (gear) → Script Properties → Add script property**
- Property `NOTION_TOKEN`, value: the secret. **Save script properties.**

**4. Update the bridge code to 1.2**
1. Copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs** and replace all the code in the editor.
2. Skipped the 1.1 update? Put your work email on the `WORK_CALENDAR_ID` line this one time.
3. Save, choose **setup**, **Run**. Approve the new permission (the bridge now talks to Notion).
4. The log should show `Notion: OK (🎯 Master Task List, N open tasks)`.
5. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**

**5. In TimothyOS:** **SYSTEMS → REFRESH NOW**. **☀ PLAN DAY** lights up and the Priorities panel fills in.

## Daily use

| Do | How |
|---|---|
| Move between days, weeks, months | ◀ ▶ next to the title. **TODAY** jumps back |
| Open a day from Week or Month | Tap the day |
| See event details | Tap the event |
| Add an event | **▶ CAPTURE**, or tap an empty spot on the Day or Week timeline |
| Hide or show a calendar | Tap **Work** or **Personal** on Today |
| Plan your day | **☀ PLAN DAY**. Pick up to 3 open tasks, or add a new one, then **SET PRIORITIES** |
| Plan tomorrow | Go to tomorrow on Today (▶), then **☀ PLAN** in the Priorities panel |
| Finish a priority | Tap it on Today. It's marked ✅ Done in Notion. Tap again to reopen |
| Force a sync | **SYSTEMS → REFRESH NOW** |
| Check connection health | **SYSTEMS**, or tap the status block |

The app syncs when opened, when you return to it, and every 5 minutes while open. With no connection it shows the last synced data and the status turns amber (**OFFLINE**).

**Capture offline:** a capture made with no connection appears as a dashed block marked **QUEUED**, and the status block counts it. It saves automatically when you're back online. Each capture carries a unique ID, so a retry never creates a duplicate. If Google rejects one, the status turns red (**NOT SAVED**) and **SYSTEMS → CAPTURE** offers **RETRY** or **DISCARD**.

## Updating

- **App:** new versions arrive from this repository within a few minutes of a push. When you return to the app, it checks for a newer version and shows **▲ UPDATE READY · TAP TO LOAD**. Tap it. **SYSTEMS** shows the version you're on.
- **Releasing (for whoever edits the code):** run `python3 tools/bump_version.py X.Y.Z` before every push. It updates the version in all five places, which is what makes iPads fetch the new files and show the banner.
- **Bridge:** paste the new `Code.gs`, save, then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. UI changes never need this.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The access key doesn't match" | Re-copy `ACCESS_KEY` from Script Properties |
| "Couldn't reach the script" | URL must end in `/exec`; deployment access must be **Anyone** |
| "The script didn't send calendar data" | You pasted the editor URL. Use the **Web app URL** from the deployment |
| Work calendar **NOT FOUND** | Accept the share invite (Handshake 1, step 5); check `WORK_CALENDAR_ID` |
| Work meetings all say **Busy** | Your employer allows only free/busy sharing, or the events are private |
| Changes to `Code.gs` have no effect | Deploy a **new version** (see Updating) |
| Capture says "bridge needs the 1.1 update" | Follow **Bridge 1.1 update** above |
| A capture says NOT SAVED | **SYSTEMS → CAPTURE** shows why. Retry or discard it |
| PLAN DAY says SETUP | Follow **Notion link** above |
| "isn't connected to the TimothyOS integration" | Master Task List → ••• → Connections → add TimothyOS bridge |
| "Notion rejected the bridge's key" | Re-copy the secret into `NOTION_TOKEN` in Script Properties |

## Security model

- The repository is public and holds **no secrets**.
- The **access key** lives in two places only: the script's properties and the iPad app's storage.
- The bridge can **only add** events, and **only to Personal**. Work is not in its writable list. It never edits or deletes events.
- In Notion it can only read and change pages **inside the Master Task List**, and only the Focus Date and Status fields (plus adding new tasks). It never deletes anything. The Notion key lives only in Script Properties.
- Leaked key? Run **rotateKey** in the script editor, then re-link the iPad in **SYSTEMS → UNLINK**.
- **UNLINK** also deletes all cached calendar data from the iPad.

## Project layout

```
index.html            app page
css/app.css           styles (design tokens at the top)
js/app.js             app logic
sw.js                 offline cache
version.json          current version (the app checks it for updates)
tools/bump_version.py sets the version everywhere before a release
manifest.webmanifest  home screen install settings
icons/, fonts/        app icon, self-hosted fonts (SIL Open Font License)
apps-script/Code.gs   the Google Apps Script bridge
docs/DESIGN.md        full design and roadmap
```

## Standby modules (later stages)

Capture for notes and key dates · Ask Claude · Key Dates · Weekly Review · Farm + Bees and Hobbies calendars. See `docs/DESIGN.md`.
