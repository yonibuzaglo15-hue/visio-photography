# VISIO — דו״ח אודיט עצמי מלא
**תאריך:** 5 ביוני 2026  
**גרסת פרויקט:** 2.0.0 (Next.js 14)  
**URL חי:** https://visio-photography.vercel.app  
**מטרת המסמך:** בסיס לתהליך אופטימיזציה ושדרוג סוכנות ה-AI של VISIO

---

## תקציר מנהלים

סוכנות VISIO מורכבת כיום מ**אתר שיווקי ומערכת הזמנות פעילה** (Next.js + Vercel), לצד **ארכיטקטורת סוכני AI מתוכננת אך כמעט לא ממומשת בקוד**.  
מה שעובד בפועל: הזמנה → Google Calendar + מייל + WhatsApp אופציונלי + `triggerAriel()` ל-sessionStorage.  
מה שלא עובד: 13 הסוכנים, Pipeline אוטונומי, עיבוד תמונות, וידאו, סיור וירטואלי, CRM, Make.com, Claude API.

---

## 1. תעודת זהות והגדרה עצמית

### 1.1 מי אני בהקשר הנוכחי?

אני **סוכן פיתוח AI של Cursor** (Composer), שפועל בתוך סביבת העבודה של פרויקט VISIO.  
אינני "אריאל בן-דוד" מהקוד — אריאל הוא **דמות Orchestrator מוגדרת ב-UI**, לא הזהות הטכנית שלי.

**תפקידי בפועל:**
- פיתוח, תחזוקה ופריסה של אתר `visio-photography`
- עריכת קוד React/Next.js, API Routes, אינטגרציות
- ביצוע משימות לפי הנחיות המשתמש (יוני) בשיחה
- שימוש בכלים: Shell, Grep, Read/Write, Vercel CLI, GitHub CLI, Subagents

### 1.2 הנחיות ליבה (Core Instructions) שאני פועל לפיהן

| מקור | הנחיה מרכזית |
|------|-------------|
| **System Prompt** | סוכן קוד ב-Cursor; מבצע שינויים בפועל; לא מוותר אחרי כשל ראשון |
| **User Rules** | עברית/אנגלית לפי הקשר; קוד מינימלי; התאמה לקונבנציות קיימות; Git commit רק לפי בקשה |
| **פרויקט VISIO** | RTL, עברית, אסתטיקה זהב-שחור, צילום נדל״ן מקצועי |
| **שיחה אחרונה** | ללא תשלום Stripe; הזמנה ישירה; תשלום ביום הצילום; Ariel + Calendar |
| **Skills זמינים** | automate, babysit, canvas, create-hook, create-rule, create-skill, sdk, loop, split-to-prs, statusline, update-cursor-settings |

### 1.3 מה אני **לא** מוגדר לעשות (לפי ההקשר הנוכחי)

- אין לי גישה ישירה למצלמה, ל-Lightroom, ל-Runway, ל-Matterport API
- אין לי Runtime אוטונומי 24/7 — אני מופעל רק כשמשתמש פותח שיחה ב-Cursor
- אין לי זיכרון ארוך טווח בין שיחות (מלבד סיכומי שיחה וקבצים בפרויקט)

---

## 2. מיפוי ארכיטקטורה וסוכני משנה

> **חשוב:** קיימים **שלושה מודלים חופפים** של סוכנים בפרויקט — זו נקודת תורפה מרכזית.

### 2.1 מודל A — 13 סוכנים (Admin · `AgentsAdmin.jsx`) — **המודל העיקרי ב-UI**

| ID | שם | תפקיד | טריגר | כלים (מתוכננים) | שולח ל |
|----|-----|-------|-------|-----------------|--------|
| `ariel` | אריאל בן-דוד | CEO / Orchestrator | כל אירוע נכנס | Claude API, Webhooks | itay |
| `itay` | איתן כץ | Organizer / Archiver | כל סוכן בשרשרת | Google Drive, AWS S3 | — |
| `noa` | נועה לוי | Image Polisher | RAW מ-Drive | Lightroom, PIL, AI Denoiser | idan, itay |
| `idan` | עידן גולן | Animation Engine | תמונות מנועה | Runway ML, FFmpeg, AE | maya |
| `tomer` | תומר בר | Building Animator | תמונות מנועה | Blender, SketchUp, Matterport SDK | maya |
| `barak` | ברק לוי | Audio Scout | פרויקט וידאו חדש | Spotify, Epidemic Sound, SFX | maya |
| `maya` | מאיה כהן | Video Editor | Payload מעידן + ברק | Premiere, DaVinci, Beat Detection | itay, gal |
| `lior` | ליאור אביב | Copywriter | חומרים מאושרים | Claude API, Headline Analyzer | gal, hila |
| `gal` | גל פז | Social Poster | וידאו + קופי | Instagram, Facebook, Buffer | — |
| `dana` | דנה סגל | Client Communicator | חומרים לאישור | WhatsApp, Gmail, Webot CRM | hila |
| `ronen` | רונן שקד | Virtual Tour Agent | תמונות 360 | Matterport API, Ricoh SDK, Three.js | hila |
| `hila` | הילה ירון | Web CMS Agent | אישור מדנה + קופי | CMS API, SEO, Database | ariel |
| `amit` | עמית טל | Follow-up / CRM | יומי 09:00 | Webot CRM, Claude, WhatsApp | — |

**מבנה תיקיות (איתן):**  
`root/{agency}/{city}/{neighborhood}/{street}-{client}`

### 2.2 מודל B — 6 סוכנים (`App.jsx` · `AgentsSection`) — **קוד מת (Dead Code)**

לא מחובר לניווט האתר. מוגדר אך לא מוצג למשתמש.

| סוכן | טריגר | תיאור |
|------|-------|--------|
| Orchestrator | Any Event | State machine, שגיאות |
| Intake Agent | Google Drive Upload | אימות RAW/JPG, BRISQUE ≥ 85 |
| Client Report | Processing Complete | PDF + WhatsApp |
| Customer Service | WhatsApp Inbound | RAG על הזמנות |
| Analytics | שישי 08:00 | insights שבועיים |
| Retention | יומי 09:00 | 60 יום ניחותא |

כותרת: *"Make.com + Claude API · 6 סוכנים אוטונומיים"*

### 2.3 מודל C — אריאל (`ArielOrchestrator.jsx`) — **היחיד שמחובר להזמנה**

| שדה | ערך |
|-----|-----|
| טריגר | `triggerAriel()` אחרי אישור הזמנה |
| אחסון | `sessionStorage["visio_jobs"]` |
| סטטוסים | `waiting_photos` → `photos_received` → `processing` → `done` |
| פעולה | בניית הודעת WhatsApp + `wa.me` link (לא נשלח אוטומטית) |
| תצוגה | טאב Pipeline באדמין, רענון כל 3 שניות |

### 2.4 מודל D — מפרט (`visio-config.json`) — **תיעוד, לא קוד**

6 סוכנים + אינטגרציות מתוכננות (Make.com, Claude Sonnet, Webot, PostgreSQL).

### 2.5 סטטוס מימוש לפי סוכן

| סטטוס | סוכנים |
|-------|--------|
| **ממומש חלקית** | אריאל (UI + sessionStorage), איתן (מבנה תיקיות מתוכנן בלבד) |
| **ממומש ב-Backend** | דנה (חלקית — מייל/WhatsApp דרך `fulfill-booking.js`) |
| **UI בלבד (Mock)** | כל 13 הסוכנים ב-AgentsAdmin, 6 ב-AgentsSection |
| **לא קיים בקוד** | נועה, עידן, תומר, ברק, מאיה, ליאור, גל, רונן, הילה, עמית |

---

## 3. ממשקים וקשרי גומלין

### 3.1 זרימת מידע — מה שעובד היום

```
[משתמש באתר]
    │
    ▼
BookingSection (תאריך → שעה → פרטים → אישור)
    │
    ├─► POST /api/book-appointment
    │       └─► fulfillBooking()
    │             ├─► Google Calendar (יצירת אירוע 2 שעות)
    │             ├─► Gmail → GMAIL_OWNER
    │             └─► Twilio WhatsApp (אופציונלי)
    │
    └─► triggerAriel(payload)
            └─► sessionStorage["visio_jobs"]
                    └─► AdminPanel → Pipeline (ArielOrchestrator)
                            └─► עדכון סטטוס ידני בלבד
```

### 3.2 Pipeline קשיח (מתוכנן · `PIPELINE_STEPS`)

```
ariel → itay → noa → idan ─┐
tomer ──────────────────────┼─► maya ← barak
lior ──────────────┬────────┘
                   ├─► gal (סושיאל)
                   └─► hila (אתר) ← dana
hila → ariel (סגירת מעגל)
```

### 3.3 תלויות בין סוכנים (לפי התכנון)

| שלב | תלות | סוג |
|-----|------|-----|
| נועה → עידן | תמונות מעובדות | **חובה** |
| עידן + ברק → מאיה | Payload וידאו + סאונד | **חובה (מקביל)** |
| ליאור → גל/הילה | קופי מאושר | **חובה** |
| דנה → הילה | אישור לקוח | **חובה** |
| רונן → הילה | סיור 360 מוכן | **חובה** |
| הילה → אריאל | פרסום הושלם | **חובה** |

**בפועל:** אף תלות אלה לא מופעלת אוטומטית — אין Job Queue, אין Webhooks בין סוכנים.

### 3.4 ממשקים בין שכבות

| ממשק | פרוטוקול | סטטוס |
|------|----------|-------|
| אתר ↔ API | HTTP POST JSON | ✅ פעיל |
| API ↔ Google | googleapis SDK | ✅ כתיבה בלבד |
| API ↔ Gmail | nodemailer | ✅ פעיל (עם env) |
| API ↔ Twilio | twilio SDK | ⚠️ אופציונלי |
| אתר ↔ Ariel | `triggerAriel()` JS function | ✅ sessionStorage |
| Admin ↔ Agents | React state | ⚠️ Mock |
| סוכנים ↔ סוכנים | — | ❌ לא קיים |

---

## 4. רמת מידע ומקורות נגישים

### 4.1 קוד מקור — פרויקט פעיל

```
/Users/yonibuzaglo/Downloads/visio-final/visio-photography/
├── src/
│   ├── App.jsx              ← אתר ראשי (11.4MB — תמונות base64 מוטמעות)
│   ├── AdminPanel.jsx       ← אדמין + טאבים
│   ├── ArielOrchestrator.jsx← אריאל + triggerAriel()
│   └── AgentsAdmin.jsx      ← 13 סוכנים + Pipeline UI
├── app/
│   ├── layout.jsx
│   ├── page.jsx
│   ├── globals.css          ← Responsive mobile-first
│   └── api/book-appointment/route.js
├── lib/fulfill-booking.js   ← Calendar + Email + WhatsApp
├── .env.example / .env.local
├── package.json             ← next 14, googleapis, nodemailer, twilio
├── deploy.sh
├── next.config.mjs
└── VISIO_AI_AUDIT.md        ← מסמך זה
```

### 4.2 גרסאות היסטוריות (לא פעילות, אך נגישות)

| נתיב | תוכן |
|------|------|
| `~/Downloads/visio-v5-7/` | Vite, ללא PaymentModal, booking → Ariel |
| `~/Downloads/visio-v5-6/` | + PaymentModal Stripe |
| `~/Downloads/visio-v5-5/` | גרסה קודמת |
| `~/Downloads/files/visio-config.json` | מפרט מלא: עיצוב, סוכנים, אינטגרציות |
| `~/Downloads/files/visio-claude-code-prompt.md` | Mission brief מקורי |
| `~/Downloads/visio-final/CURSOR_INSTRUCTIONS.md` | הנחיות Deploy (מיושנות — Vite) |

### 4.3 מסמכי הנחיה ו-Skills (Cursor)

```
~/.cursor/skills-cursor/
├── automate/SKILL.md
├── babysit/SKILL.md
├── canvas/SKILL.md
├── create-hook/SKILL.md
├── create-rule/SKILL.md
├── create-skill/SKILL.md
├── sdk/SKILL.md          ← Cursor SDK לאוטומציה חיצונית
├── loop/SKILL.md
├── split-to-prs/SKILL.md
└── ...
```

### 4.4 נתונים מוטמעים באתר

| נתון | מיקום | הערה |
|------|-------|------|
| 9 נכסי פורטפוליו | `PROPERTY_IMAGES` ב-App.jsx | Base64, ~15MB |
| 4 חבילות (+ ייעוץ חינם) | `PACKAGES` ב-App.jsx | |
| הזמנות Mock | `MOCK_BOOKINGS` ב-AdminPanel | לא אמיתי |
| Jobs Ariel | `sessionStorage` | נמחק ב-refresh |

### 4.5 מה **אינני** רואה / אין גישה אליו

- מסד נתונים (PostgreSQL וכו')
- Google Drive של הצלם
- תיקיות RAW של לקוחות
- חשבונות API אמיתיים (Claude, Make, Webot) — רק placeholders ב-.env
- שיחות WhatsApp נכנסות

---

## 5. אינטגרציות וכלים חיצוניים

### 5.1 ממומש ופעיל (בתנאי env vars ב-Vercel)

| שירות | חבילה | פעולה | קובץ |
|-------|-------|-------|------|
| Google Calendar | `googleapis` | **יצירת** אירוע בלבד | `lib/fulfill-booking.js` |
| Gmail | `nodemailer` | מייל HTML לבעלים | `lib/fulfill-booking.js` |
| Twilio WhatsApp | `twilio` | הודעה ל-OWNER_PHONE | `lib/fulfill-booking.js` |
| Vercel | CLI | Deploy production | `deploy.sh` |
| GitHub | `gh` CLI | Repo + push | `deploy.sh` |

**משתני סביבה נדרשים (`.env.example`):**
```
GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_CREDENTIALS
GMAIL_FROM, GMAIL_APP_PASSWORD, GMAIL_OWNER
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, OWNER_PHONE
NEXT_PUBLIC_SITE_URL
```

### 5.2 מתוכנן במפרט — לא ממומש

| שירות | env var מתוכנן | שימוש מתוכנן |
|-------|---------------|-------------|
| Anthropic Claude | `ANTHROPIC_API_KEY` | כל הסוכנים הלשוניים + CS + Analytics |
| Make.com | `MAKE_WEBHOOK_SECRET` | Orchestration חיצוני |
| Webot CRM | `WEBOT_API_KEY` | דנה, עמית, Analytics, Retention |
| Google Drive | `GOOGLE_DRIVE_CREDENTIALS` | Intake, איתן, דוחות |
| WhatsApp Business | `WHATSAPP_API_TOKEN` | CS, Retention |
| PostgreSQL | `DATABASE_URL` | Job persistence |
| Stripe | `STRIPE_SECRET_KEY` | **הוסר** — תשלום ביום הצילום |

### 5.3 כלים חיצוניים של Cursor Agent (לא חלק מ-VISIO)

| כלי | שימוש |
|-----|-------|
| Shell | פקודות, npm, vercel, git |
| Grep / Glob / Read | חיפוש וקריאת קוד |
| Task (Subagents) | explore, shell, bugbot, security-review |
| WebSearch / WebFetch | מידע חיצוני |
| MCP Tools | לפי הגדרת משתמש (לא מוגדר בפרויקט) |

### 5.4 אינטגרציות "רכות" (לינקים בלבד)

- **Matterport:** `window.open('https://my.matterport.com/show/?m=...')` — אין API
- **WhatsApp (Ariel):** `wa.me` link — לא שליחה אוטומטית

---

## 6. פערים ומגבלות (Gaps)

### 6.1 פערים קריטיים — מ-Raw לתוצר סופי ללא מגע יד

| שלב | מה חסר |
|-----|--------|
| **קבלת RAW** | אין Intake Agent; אין חיבור ל-Drive upload webhook |
| **עריכת תמונות** | אין נועה (Lightroom/PIL/AI) — אפס קוד עיבוד |
| **אנימציה / וידאו** | אין עידן, תומר, ברק, מאיה — אפס pipeline מדיה |
| **סיור וירטואלי** | אין רונן — Matterport SDK לא מחובר; רק לינקים קיימים |
| **קופי / סושיאל** | אין ליאור, גל — אין Claude API, אין Instagram API |
| **פרסום לאתר** | אין הילה — אין CMS API; תמונות מוטמעות ידנית ב-App.jsx |
| **תקשורת לקוח** | דנה חלקית (מייל בעלים בלבד, לא ללקוח) |
| **CRM / Retention** | אין Webot, אין עמית |

### 6.2 פערים ארכיטקטוניים

1. **שלושה מודלים סותרים** של סוכנים (6 / 13 / אריאל / config) — אין מקור אמת יחיד
2. **אין Job Queue** — אין Redis, Bull, PostgreSQL jobs table
3. **אין Event Bus** — אין Webhooks פנימיים בין סוכנים
4. **אין State Machine אמיתי** — רק UI + sessionStorage
5. **אין הרצה אוטונומית** — הכל דורש Cursor chat או לחיצה ידנית באדמין
6. **תמונות 15MB ב-JSX** — לא סקיילבילי; חוסם build time וגודל bundle

### 6.3 פערים בהנחיות / תיעוד

| מסמך | בעיה |
|------|------|
| `CURSOR_INSTRUCTIONS.md` | מתייחס ל-Vite — הפרויקט עבר ל-Next.js |
| `api/setup-guide.md` | עדיין מזכיר Stripe webhooks |
| `visio-config.json` | מתאר Tailwind — האתר משתמש ב-inline styles + globals.css |
| `visio-config.json` | 6 סוכנים — הקוד מגדיר 13 |

### 6.4 נקודות תורפה טכניות

| נקודה | סיכון |
|-------|-------|
| סיסמת אדמין בקוד (`AdminPanel.jsx`) | אבטחה |
| Google login מזויף (`prompt()`) | אבטחה |
| לוח שנה — slots קשיחים | חוויית משתמש; אין sync אמיתי |
| Ariel OWNER_PHONE = placeholder | WhatsApp לא מגיע ליעד נכון |
| sessionStorage בלבד | אובדן jobs ב-refresh |
| אין בדיקות (tests) | רגרסיות בשדרוגים |

### 6.5 מה נדרש לאוטונומיה מלאה (Roadmap מוצע)

```
שלב 1 — תשתית
  □ PostgreSQL / Supabase — jobs, agents, clients
  □ מקור אמת יחיד לסוכנים (מיזוג 6+13 → 13)
  □ Webhook endpoint: /api/jobs + state machine

שלב 2 — Orchestration
  □ Make.com או Cursor SDK Agent — הרצת pipeline
  □ Claude API — ליאור, דנה, עמית, CS
  □ Google Drive watch — Intake trigger

שלב 3 — מדיה
  □ נועה: Cloud Function + Replicate/Adobe API
  □ עידן/מאיה: FFmpeg + Runway API
  □ רונן: Matterport SDK או Kuula

שלב 4 — פרסום
  □ הילה: CMS headless (Sanity/Contentful) או Git-based
  □ גל: Meta Graph API
  □ Webot CRM sync
```

---

## נספח א׳ — מפת קבצים לשדרוג

| עדיפות | קובץ | פעולה מומלצת |
|--------|------|---------------|
| 🔴 | `AgentsAdmin.jsx` | חיבור ל-API אמיתי במקום mock |
| 🔴 | `ArielOrchestrator.jsx` | DB persistence + webhook triggers |
| 🔴 | `lib/fulfill-booking.js` | הוספת calendar read (free/busy) |
| 🟡 | `App.jsx` | הפרדת תמונות ל-`/public/properties/` |
| 🟡 | `visio-config.json` | סנכרון עם קוד (מקור אמת) |
| 🟢 | `AgentsSection` ב-App.jsx | מחיקה או חיבור לניווט |
| 🟢 | `api/setup-guide.md` | עדכון (הסרת Stripe) |

---

## נספח ב׳ — הגדרת "סוכנות VISIO" כמערכת

```
┌─────────────────────────────────────────────────────────┐
│                    VISIO AI AGENCY                       │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   WEBSITE   │    │    ADMIN     │    │  BACKEND   │ │
│  │  (Next.js)  │◄──►│  (React UI)  │◄──►│ (Vercel)   │ │
│  └──────┬──────┘    └──────┬───────┘    └─────┬──────┘ │
│         │                  │                   │         │
│         ▼                  ▼                   ▼         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           ARIEL (Orchestrator) — UI ONLY          │   │
│  └──────────────────────────────────────────────────┘   │
│         │                  │                   │         │
│    ┌────┴────┐       ┌─────┴─────┐       ┌─────┴─────┐  │
│    │ 13 Agents│       │ Pipeline  │       │ Calendar  │  │
│    │  (Mock)  │       │  (Mock)   │       │ Email WA  │  │
│    └──────────┘       └───────────┘       └───────────┘  │
│                                                          │
│  ❌ Make.com  ❌ Claude  ❌ Drive  ❌ Video  ❌ Matterport API │
└─────────────────────────────────────────────────────────┘
```

---

*מסמך זה נוצר כחלק מתהליך אודיט עצמי. לשימוש כבסיס לתכנון שדרוג VISIO v3.*
