# TimothyOS

A personal, LCARS-inspired life dashboard that runs full-screen on an iPad home screen.

**v1.0 · Calendar Core:** your work calendar and your personal Google Calendar, merged into Today, Week and Month views. Read-only. Every other section is visible but on **STANDBY** until its stage is built.

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

## Daily use

| Do | How |
|---|---|
| Move between days, weeks, months | ◀ ▶ next to the title. **TODAY** jumps back |
| Open a day from Week or Month | Tap the day |
| See event details | Tap the event |
| Force a sync | **SYSTEMS → REFRESH NOW** |
| Check connection health | **SYSTEMS**, or tap the status block |

The app syncs when opened, when you return to it, and every 5 minutes while open. With no connection it shows the last synced data and the status turns amber (**OFFLINE**).

## Updating

- **App:** new versions arrive automatically from this repository. Close and reopen the app (sometimes twice) to load them. **SYSTEMS** shows the version.
- **Bridge:** paste the new `Code.gs`, save, then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The access key doesn't match" | Re-copy `ACCESS_KEY` from Script Properties |
| "Couldn't reach the script" | URL must end in `/exec`; deployment access must be **Anyone** |
| "The script didn't send calendar data" | You pasted the editor URL. Use the **Web app URL** from the deployment |
| Work calendar **NOT FOUND** | Accept the share invite (Handshake 1, step 5); check `WORK_CALENDAR_ID` |
| Work meetings all say **Busy** | Your employer allows only free/busy sharing, or the events are private |
| Changes to `Code.gs` have no effect | Deploy a **new version** (see Updating) |

## Security model

- The repository is public and holds **no secrets**.
- The **access key** lives in two places only: the script's properties and the iPad app's storage.
- The bridge is **read-only**. It never creates, edits or deletes events.
- Leaked key? Run **rotateKey** in the script editor, then re-link the iPad in **SYSTEMS → UNLINK**.
- **UNLINK** also deletes all cached calendar data from the iPad.

## Project layout

```
index.html            app page
css/app.css           styles (design tokens at the top)
js/app.js             app logic
sw.js                 offline cache (bump VERSION on each release)
manifest.webmanifest  home screen install settings
icons/, fonts/        app icon, self-hosted fonts (SIL Open Font License)
apps-script/Code.gs   the Google Apps Script bridge
docs/DESIGN.md        full design and roadmap
```

## Standby modules (later stages)

Quick Capture · Ask Claude · Plan Day · Priorities · Key Dates · Weekly Review · Farm + Bees and Hobbies calendars. See `docs/DESIGN.md`.
