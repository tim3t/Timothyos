# TimothyOS

A personal, LCARS-inspired life dashboard that runs full-screen on an iPad home screen.

**Calendar Core + Capture + Plan Day + Key Dates:** your work calendar and your personal Google Calendar, merged into Today, Week and Month views. **Capture** adds events to your Personal calendar in seconds, even offline. **Plan Day** picks up to three priorities from your Notion **Master Task List**, and you check them off on Today. **Key Dates** (deadlines, seasonal windows, birthdays) come from a Notion database, with countdowns on Today, a DATES screen, and markers on the calendar. Work stays read-only. Every other section is visible but on **STANDBY** until its stage is built.

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

**5. In TimothyOS:** **SYSTEMS → REFRESH NOW**. **PLAN DAY** lights up and the Priorities panel fills in.

## Key Dates (bridge 1.3)

Key dates live in **🗓️ Key Dates**, a Notion database inside Timothy's Life Hub. Fields: Name, Date (one day, or a start and end for windows), Life Area, Type, Repeats Yearly, Notes.

1. **Connect the integration to Key Dates:** open **🗓️ Key Dates** as a full page → **•••** → **Connections** → add **TimothyOS bridge**. (It still has no access to the Life Hub page or anything else.)
2. **Update the bridge code to 1.3:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save, run **setup**. The log should show `Notion key dates: OK (🗓️ Key Dates, N dates)`.
3. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
4. In TimothyOS: **SYSTEMS → REFRESH NOW**. The **DATES** screen and the **Key Dates** panel fill in, and **KEY DATE** appears in Capture.

## The Bridge (app 1.7)

The app opens on the **Bridge**: one screen above the calendars, one full-width column, top to bottom. Tap **BRIDGE** in the top-left corner (or first in the menu row on a phone) to come back to it.

| Panel | Shows |
|---|---|
| **Condition** | **GREEN**, **YELLOW** or **RED**, with every item that needs you. Tap an item to fix it |
| **Now / Next** | Free time until your next event (or time left in the current one), the next event, and today from 07:00 to 21:00 |
| **Environment** | Weather, **hive check** (GO when it's 60°F+, wind under 12 mph and dry, between 10:00 and 17:00) and **frost watch** for tonight |
| **Priorities** | Your picks for today (tap to check off), plus tasks due or overdue that you didn't pick |
| **Horizon** | Hours booked for the next 7 days, ◆ key dates, and heavy days (7 hours or more). Tap a day to open it |
| **Key Dates** | The next three, with countdowns |
| **Balance** | Tasks finished per area in the last 7 days, hours on Work and Personal, and areas that have gone quiet |
| **Captain's Log** | One line of intent for today, and your **bearing** for the day |

**Condition rules**

| Level | When |
|---|---|
| 🔴 RED | A High-priority task is overdue · Work and Personal events overlap later today · Sync has failed for over 6 hours |
| 🟡 YELLOW | A key date is 3 days away or less · Any other task is overdue · A task is due today but not picked · No priorities picked by 10:00 · Frost tonight (32°F or below) · A capture hasn't saved after 2 tries · The task list didn't load |
| 🟢 GREEN | None of the above |

**Details:** each panel shows its essentials. Tap **+** beside a panel title for the rest (hours booked and open, wind and sunrise, the list of due tasks, the legend). The Bridge remembers which panels you leave open.

**One-time settings** (all in **SYSTEMS → BRIDGE**, saved on this iPad only):
- **Location** for weather: tap **USE THIS IPAD'S LOCATION**, or type latitude and longitude. It's rounded to about 1 km.
- **Bearings:** your guiding words, one per line. The Bridge shows one each day; tap it to see the next.
- **Opens on:** Bridge or Today.

## Bridge 1.4 update (turns on Balance)

1. Copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code in the script editor, save, run **setup**. The log should end with `Bridge version 1.4.0`.
2. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
3. In TimothyOS: **SYSTEMS → REFRESH NOW**. The **Balance** panel fills in.

Balance counts tasks marked ✅ Done in the Master Task List. Notion doesn't record the day a task was finished, so the date of its last edit stands in. Only the Life Area and that date leave Notion, never titles.

## Weekly Review (bridge 1.5)

Reviews live in **🧭 Weekly Reviews**, a Notion database inside Timothy's Life Hub: one page per week with your reflection, the week's numbers and your Captain's Log lines.

1. **Connect the integration:** open **🧭 Weekly Reviews** as a full page → **•••** → **Connections** → add **TimothyOS bridge**.
2. **Update the bridge to 1.5:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save, run **setup**. The log should show `Notion weekly reviews: OK (🧭 Weekly Reviews, 0 reviews)` and end with `Bridge version 1.5.0`.
3. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
4. In TimothyOS: **SYSTEMS → REFRESH NOW**, then open **REVIEW**.

**How it works**
- **Due** from Sunday 14:00 to Tuesday night. The Bridge shows **Weekly review due** until you save it.
- **The screen, top to bottom:** Time (hours per calendar, change from the week before, busiest day, open hours) · Output (tasks finished per Life Area) · Priorities kept · Intent log (your Captain's Log lines) · Next week (heavy days, key dates, tasks due) · Reflection, four questions: What went well? · What drained me? · What's my next focus? · Where did I hold my bearing?
- **Writing is kept on the iPad as you type.** **SAVE TO NOTION** writes it; saving again updates the same page.
- **◀ ▶** browse earlier weeks and their saved reviews. **CLAUDE SUMMARY** waits for Ask Claude.

## Review log (bridge 1.7)

**REVIEW** now opens on a log of your reviews. Tap a week to open it; **◀ ALL REVIEWS** beside the arrows comes back. The Bridge's **Weekly review due** still goes straight to that week.

**Update the bridge to 1.7:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save, run **setup** (the log ends with `Bridge version 1.7.0`), then **Deploy → Manage deployments → pencil → Version: New version → Deploy**, and in TimothyOS **SYSTEMS → REFRESH NOW**. No new keys or Notion changes.

- **Up next:** the week that's due and this week.
- **Trends, last 12 weeks:** reviews saved, week streak, priorities kept on average, Work and Personal hours on average, and hours per week. **+** shows priorities kept, tasks finished, and where the work went by Life Area. Tap a bar or point for its values. Numbers come from saved reviews, so unsaved weeks show as gaps.
- **PATTERNS:** Claude (Sonnet 5.5) reads your saved reflections and names what keeps coming up. About 8¢, only when you tap it; the answer stays on this iPad until you ask again.
- **All reviews,** by month: each week's numbers and next focus, with SAVED, DUE, IN PROGRESS or NOT SAVED. A missed week can still be written.

## Ask Claude (bridge 1.6)

**ASK** opens the ship's computer: questions about your days, tasks and dates, answered by Claude through your API account (prepaid, separate from Claude Pro).

**One-time setup**
1. **Console safeguards** at platform.claude.com: prepaid credit, **auto-reload off**, and **Settings → Billing → Spend limits** set to your monthly ceiling.
2. **Update the bridge to 1.6:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save.
3. **Add the key:** Project Settings (gear) → **Script Properties** → **Add script property**: name `ANTHROPIC_API_KEY`, value your API key. Never paste it anywhere else.
4. Optional: add `AI_BUDGET_USD` to change the pause point (default **8**, so Ask pauses before a $10 Console limit).
5. Run **setup**. The log should show `Ask Claude: OK. This month $0.00 of $8.00` and `Bridge version 1.6.0`.
6. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** Then in TimothyOS: **SYSTEMS → REFRESH NOW**. **ASK** lights up.

**How it works**
- Each question goes with a snapshot of what the app shows: today and the next six days, condition, priorities, open tasks, key dates, weather, your log line and bearing. Ignored events are left out. Claude can look further (other dates, other weeks) through the bridge.
- **Claude never changes anything.** Suggested changes appear as cards: add a task, pick or unpick a priority, change a status, add a key date, add an event or reminder to Personal (or the farm calendar, once linked), draft a weekly review. Nothing happens until you tap **CONFIRM**. The Work calendar is never offered.
- **Models:** Haiku 4.5 by default (about 1 to 2¢ a question). **THINK HARDER** uses Sonnet 5.5 (about 3 to 5¢). **WRITE SUMMARY** on Review uses Sonnet 5.5.
- **Spending:** each answer shows its cost; the sheet and **SYSTEMS → ASK CLAUDE** show the month so far. At the budget the bridge stops calling Claude until the 1st.
- **OPEN IN CLAUDE** copies the snapshot and opens the Claude app (your Pro plan) for longer conversations. If Claude opens empty, paste.
- The conversation stays on this iPad for 6 hours or until **NEW CHAT**. Questions and the snapshot are sent to Anthropic to answer them; no web search is ever used.

## Farm calendar (bridge 1.8)

A third Google calendar for farm and bee work. Once linked, it sits beside Work and Personal everywhere (Today, Week, Month, the Bridge, Review hours) in amber, labeled with the calendar's own name. **CAPTURE** and **ASK** can add to it. Work stays read-only.

1. **Create the calendar** in the same personal Google account that runs the bridge: on a computer (or Safari on the iPad with *Request Desktop Website*) open **calendar.google.com** → **Other calendars +** → **Create new calendar** → name it, time zone **Eastern Time** (yours), **Create calendar**.
2. **Copy its ID:** **Settings** → under *Settings for my calendars* pick the new calendar → **Integrate calendar** → **Calendar ID** (ends in `@group.calendar.google.com`).
3. **Update the bridge to 1.8:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save.
4. **Add the ID:** Project Settings (gear) → **Script Properties** → **Add script property**: name `FARM_CALENDAR_ID`, value the Calendar ID. (It lives there, not in the code, so code updates keep it.)
5. Run **setup**. The log should show `TimothyOS farm calendar: OK (<your calendar's name>)` and end with `Bridge version 1.8.0. Can write to: personal, farm`.
6. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** Then in TimothyOS: **SYSTEMS → REFRESH NOW**.

To unlink, delete `FARM_CALENDAR_ID` and run setup. The calendar itself is never deleted.

## Ledger (bridge 1.9)

**LEDGER** shows your finances from YNAB at a glance: checking, age of money, savings and loans, average spend by category, and the **Replicator Queue**, your list of things to buy once the **Discretionary** category can cover them. YNAB stays where you budget: the bridge only reads it and can never change it.

1. **In YNAB:** create a category named **Discretionary** (any group). Its available balance funds the Replicator Queue, top item first.
2. **YNAB token:** app.ynab.com → **Account Settings** → **Developer Settings** → **New Token**. Copy it. Treat it like your YNAB password: it only goes into Script Properties.
3. **In Notion:** open **🛸 Replicator Queue** (in your Life Hub) as a full page → **•••** → **Connections** → add **TimothyOS bridge**.
4. **Update the bridge to 1.9:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save.
5. **Add the token:** Project Settings (gear) → **Script Properties** → **Add script property**: name `YNAB_TOKEN`, value the token. Optional: `YNAB_PLAN_ID` (if the plan you open most isn't the one to show) and `LEDGER_FUND_CATEGORY` (a different fund category name).
6. Run **setup**. The log should show `Ledger (YNAB): OK. 1 checking, … Fund category "Discretionary": found`, `Notion replicator queue: OK (0 waiting)` and end with `Bridge version 1.9.0`.
7. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** Then in TimothyOS: **SYSTEMS → REFRESH NOW** and open **LEDGER**.

**How it works**
- **Accounts:** checking (working balance), age of money with its 12-month trend, savings, and loans with % paid off (from the loan's starting balance in YNAB).
- **Average spend:** per category for the last **3M / 6M / 12M** full months (months before your plan existed are skipped), with a white tick for this month so far. Tap a category for all three averages. **+** shows the smaller categories. Card payments, hidden and internal categories are left out.
- **Replicator Queue:** reorder with ▲ ▼, **ADD** with a rough cost and note, **BOUGHT** (with a yes/no check) moves an item to *Bought recently*, where **UNDO** puts it back. You can also edit items, links and costs in Notion.
- **Freshness:** YNAB figures refresh every 10 minutes at most; past months are kept for 6 hours. That stays far below YNAB's 200 requests an hour.
- **Ask Claude:** your finances are never sent with questions unless you choose **SYSTEMS → LEDGER → SHARE WITH ASK**.

## Captain's Log (bridge 1.10)

**LOG** is a plain journal: a calendar of days and a blank page. Each day is one page in the **📓 Captain's Log** database in Notion, with the entry as the page body, so it reads naturally there too. No reminders, no streaks, no counts.

1. **In Notion:** open **📓 Captain's Log** (in your Life Hub) as a full page → **•••** → **Connections** → add **TimothyOS bridge**.
2. **Update the bridge to 1.10:** copy **https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs**, replace all the code, save.
3. **Choose your PIN:** Project Settings (gear) → **Script Properties** → **Add script property**: name `LOG_PIN`, value **six digits**. Change it there any time; nothing on the iPad needs updating.
4. Run **setup**. The log should show `Captain's Log: OK (0 days written). PIN set` and end with `Bridge version 1.10.0`.
5. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** Then in TimothyOS: **UPDATE READY** if shown, **SYSTEMS → REFRESH NOW**, and open **LOG**.

**Bringing in old entries:** in your diary app choose **Export (Text)** and copy the text. In TimothyOS open **LOG**, enter the PIN, tap **IMPORT**, paste, **CHECK**. It shows how many days it found, the date range and anything unusual (a day written twice joins one page; text before the first date is left out). **IMPORT** sends three days at a time and shows how many are in Notion so far. A request that fails is retried on its own. Keep TimothyOS open until it says done; if it stops (the app went to the background), paste again and it sends only what's left.

**How it works**
- **Opening LOG always asks for the PIN.** The bridge checks it; five wrong tries lock the log for 15 minutes.
- **It locks** when you leave LOG, tap **LOCK**, the app goes to the background, standby starts, or after 10 minutes without a touch.
- **Saving:** 5 seconds after you stop typing, on **SAVE**, and when it locks. Until Notion has it, your writing is kept on this iPad; once saved it is removed from the iPad.
- **Editing** an earlier day changes only the paragraphs you changed. A page that also holds something the LOG can't show (a photo, a table) opens read-only; edit it in Notion.
- **+ BEARINGS** adds your bearings (SYSTEMS) as a closing block to fill in. Today's intent from the Bridge shows above today's page.
- **Ask Claude never sees the log.** It isn't in the snapshot and Ask has no way to read it.

## Daily use

| Do | How |
|---|---|
| See everything at a glance | **BRIDGE** (top-left corner). Tap any item to jump to it |
| Standby (screensaver) | Tap **STANDBY** at the right end of the top bar any time, or let it start after 15 minutes without a touch (change or turn off in **SYSTEMS → STANDBY**). A dim clock with weather, next up, the condition and the next key date; amber at night (22:00 to 06:00). Tap anywhere to wake: that tap only wakes the screen |
| Open **SYSTEMS** (settings, sync health, links) | Tap the **SYNCED** status in the bottom-left corner. It lights up while Systems is open. Wherever these steps say **SYSTEMS →**, start there |
| Move between days, weeks, months | The arrows next to the title. **TODAY** jumps back |
| Open a day from Week or Month | Tap the day |
| See event details | Tap the event |
| Add an event | **CAPTURE**, or tap an empty spot on the Day or Week timeline |
| Hide or show a calendar | Tap **Work** or **Personal** on Today |
| Plan your day | **PLAN DAY**. Pick up to 3 open tasks, or add a new one, then **SET PRIORITIES** |
| Plan tomorrow | Go to tomorrow on Today (right arrow), then **PLAN** in the Priorities panel |
| Finish a priority | Tap it on Today. It's marked ✅ Done in Notion. Tap again to reopen |
| See what's coming | **Key Dates** panel on Today (next 30 days), or the **DATES** screen (next 12 months, filter by area) |
| Add a key date | **▶ CAPTURE → KEY DATE**, or **+ ADD** on the panel or DATES screen. Add **UNTIL** for a window, **YEARLY** for birthdays and seasons |
| Ask about your days | **ASK**. Type or dictate; tap **CONFIRM** on any change you want |
| Review the week | **REVIEW** (or tap **Weekly review due** on the Bridge on Sunday). Write, then **SAVE TO NOTION** |
| Leave out booking blocks (e.g. weekend out-of-office) | Tap the event → **IGNORE THIS TITLE**. Edit or undo in **SYSTEMS → CALENDARS → IGNORED EVENTS** |
| Change or delete a key date | Tap it → **OPEN IN NOTION** |
| Force a sync | **SYSTEMS → REFRESH NOW** |
| Check connection health | **SYSTEMS**, or tap the status block |

The app syncs when opened, when you return to it, and every 5 minutes while open. With no connection it shows the last synced data and the status turns amber (**OFFLINE**).

**Capture offline:** a capture made with no connection appears as a dashed block marked **QUEUED**, and the status block counts it. It saves automatically when you're back online. Each capture carries a unique ID, so a retry never creates a duplicate. If Google rejects one, the status turns red (**NOT SAVED**) and **SYSTEMS → CAPTURE** offers **RETRY** or **DISCARD**.

## Updating

- **App:** new versions arrive from this repository within a few minutes of a push. When you return to the app, it checks for a newer version and shows **UPDATE READY · TAP TO LOAD**. Tap it. **SYSTEMS** shows the version you're on.
- **Releasing (for whoever edits the code):** run `python3 tools/bump_version.py X.Y.Z` before every push. It updates the version in all five places, which is what makes iPads fetch the new files and show the banner.
- **Bridge:** paste the new `Code.gs`, save, then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. UI changes never need this.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The access key doesn't match" | Re-copy `ACCESS_KEY` from Script Properties |
| "Couldn't reach the script" | URL must end in `/exec`; deployment access must be **Anyone** |
| "The script didn't send calendar data" | You pasted the editor URL. Use the **Web app URL** from the deployment |
| Setup says `Ledger (YNAB): PROBLEM: ynab_not_found` | The log lists your plans as `name -> id`. Add Script Property `YNAB_PLAN_ID` with the right id, run setup again, deploy a new version |
| LEDGER says YNAB didn't accept the token | Make a new Personal Access Token in YNAB → replace `YNAB_TOKEN` → run setup |
| Replicator Queue says not connected | Notion: Replicator Queue → ••• → Connections → add TimothyOS bridge |
| The iPad still locks while TimothyOS is open | SYSTEMS → STANDBY shows whether iPadOS kept the screen on. If it declined: Settings → Display & Brightness → Auto-Lock → Never while docked |
| Work calendar **NOT FOUND** | Accept the share invite (Handshake 1, step 5); check `WORK_CALENDAR_ID` |
| Work meetings all say **Busy** | Your employer allows only free/busy sharing, or the events are private |
| Changes to `Code.gs` have no effect | Deploy a **new version** (see Updating) |
| Capture says "bridge needs the 1.1 update" | Follow **Bridge 1.1 update** above |
| A capture says NOT SAVED | **SYSTEMS → CAPTURE** shows why. Retry or discard it |
| PLAN DAY says SETUP | Follow **Notion link** above |
| "isn't connected to the TimothyOS integration" | Master Task List → ••• → Connections → add TimothyOS bridge |
| "Notion rejected the bridge's key" | Re-copy the secret into `NOTION_TOKEN` in Script Properties |
| Key Dates says it isn't connected | 🗓️ Key Dates → ••• → Connections → add TimothyOS bridge |
| ASK says SETUP | Follow **Ask Claude (bridge 1.6)** above |
| "Ask is paused" | The monthly budget is used. It resumes on the 1st, or raise `AI_BUDGET_USD` |
| "Claude Console credit is used up" | Add credit at platform.claude.com (keep auto-reload off) |
| Review says it needs bridge 1.5 | Follow **Weekly Review (bridge 1.5)** above |
| "Weekly Reviews isn't connected" | 🧭 Weekly Reviews → ••• → Connections → add TimothyOS bridge |
| Balance says it needs bridge 1.4 | Follow **Bridge 1.4 update** above |
| Top line hidden under the clock and battery | **SYSTEMS → APP → TOP SPACING → MORE** (or **MOST**) |
| "Couldn't reach the script" or OFFLINE flickers | **SYSTEMS → RECENT REQUESTS** shows what's failing. Mostly DROPPED: the connection (Wi-Fi, VPN, content filter). Mostly TIMEOUT: Google is slow; check **Executions** in the script editor for long runs or errors |
| Environment says SETUP | **SYSTEMS → BRIDGE → LOCATION** |
| "Weather didn't load" | Open-Meteo didn't answer. It retries on its own; the rest of the Bridge is unaffected |

## Security model

- The repository is public and holds **no secrets**.
- The **access key** lives in two places only: the script's properties and the iPad app's storage.
- The bridge can **only add** events, and **only to Personal**. Work is not in its writable list. It never edits or deletes events.
- In Notion it can only read and change pages **inside the Master Task List**, and only the Focus Date and Status fields (plus adding new tasks). In **Key Dates** it can read and add, nothing else. In **Weekly Reviews** it reads, adds and updates review pages. It never deletes anything. The Notion key lives only in Script Properties.
- Leaked key? Run **rotateKey** in the script editor, then re-link the iPad in **SYSTEMS → UNLINK**.
- **UNLINK** also deletes all cached calendar data from the iPad.
- **Captain's Log:** every log request needs the 6-digit PIN (Script Property `LOG_PIN`), checked by the bridge, with a 15-minute lock after five misses. Entries are never stored on the iPad (only unsaved writing, until it reaches Notion), are dropped from memory when the log locks, and are never sent to Ask. Editing an entry is the one place the bridge removes anything: paragraphs you delete from your own entry.
- **Ask Claude:** the API key lives only in Script Properties. Claude reads through the bridge and proposes changes; only your CONFIRM makes them, through the same actions as the app's own buttons. Spending is capped three ways: prepaid credit with auto-reload off, the Console spend limit, and the bridge's own monthly budget.
- **Weather** comes from Open-Meteo (free, no account, no key). Requests carry only your rounded coordinates, straight from the iPad. Location, bearings and the Bridge's intent line are stored on the iPad and never go to the bridge or this repository.

## Project layout

```
index.html            app page
css/app.css           styles (design tokens at the top)
js/app.js             app logic
sw.js                 offline cache
version.json          current version (the app checks it for updates)
tools/bump_version.py sets the version everywhere before a release
tests/run.sh          runs all tests (simulated bridges + headless browser)
CLAUDE.md             working notes for Claude: architecture, rules, release checklist
manifest.webmanifest  home screen install settings
icons/, fonts/        app icon, self-hosted fonts (SIL Open Font License)
apps-script/Code.gs   the Google Apps Script bridge
docs/DESIGN.md        full design and roadmap
```

## Standby modules (later stages)

Notes in Capture · Ask Claude · Weekly Review · Farm + Bees and Hobbies calendars. See `docs/DESIGN.md`.
