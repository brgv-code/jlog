# jlog — Feature Ideas by Bhargav

---

## Free vs Pro Split

The core tension: jlog is self-hostable (developers can run everything for free), but a hosted version needs a sustainability model.

### Free Forever (self-hosted or hosted tier)
Everything that runs on the user's own infra or has no per-request cost to us:
- Unlimited application tracking
- Chrome extension (all detectors)
- Manual entry + AI extraction (user brings their own LLM API key)
- Job description capture
- Notes, timeline, stats strip
- Follow-up button (mailto + WhatsApp — no API cost)
- CSV export *(not yet built)*
- GitHub OAuth

### Pro (hosted tier — future)
Features that cost money per user to run, or require deep integrations:

| Feature | Why it's Pro |
|---|---|
| **Related jobs feed** | We pay for job board API calls (Adzuna, JSearch) |
| **Managed LLM extraction** | We provide the API key — no setup needed |
| **Interview assistant** | Google Calendar OAuth + LLM transcript summaries |
| **AI follow-up drafting** | Per-request LLM cost on our key |
| **Email digest / reminders** | Cloudflare Cron + email delivery cost |
| **Priority support** | Human time |

### What stays free forever even in hosted
- Core CRUD (applications, status, notes)
- Extension capture
- Timeline / stats
- Follow-up with your own LLM config

### Principle
**Never paywalled:** anything that just stores and displays your own data.
**Pro:** anything that requires us to pay a third-party API per user action.

---

## 1. Related Jobs Feed

Show relevant job recommendations alongside the user's tracked applications.

**How it works:**
- Pull from the user's profile: location, skills, job titles from past applications
- Scrape / hit APIs from open job boards: Remotive, Adzuna, The Muse, Arbeitnow, JSearch (RapidAPI), Jooble
- LinkedIn is not feasible to scrape reliably — skip it
- Show a sidebar panel on the dashboard: "Jobs you might like"
- Each card has a one-click "Track this" button that opens the extension confirm form

**Nice-to-haves on top of this:**
- Let the user set a skills list and preferred roles in Settings
- Auto-refresh feed daily via Cloudflare Cron Trigger
- "Not interested" dismiss on each card so it doesn't resurface
- Match score shown per job (how closely it matches your profile)

---

## 2. Interview Meeting Assistant

A centralized place to manage the entire interview lifecycle — from booking to notes.

**How it works:**
- Connect Google Calendar (OAuth) — pull meetings tagged with company names from tracked applications
- Before a meeting: notify the user to join, show them the job details, show prep notes
- During/after a meeting: record or accept a pasted transcript
- Use LLM to summarize the transcript: key questions asked, your answers, action items, red flags
- Save the summary + transcript to the job application (new `interviews` table)
- Text-to-speech: read out the meeting summary or job description aloud (Web Speech API — no external dependency)

**Nice-to-haves on top of this:**
- AI interview coaching: given the job description, generate likely questions and ideal answers
- Sentiment analysis on the transcript: did it go well?
- Auto-detect interview stage (phone screen, technical, final) from the transcript

---

## 3. Follow-up Button

One-click follow-up from any job application detail page.

**How it works:**
- Button: "Send Follow-up"
- User picks channel: **WhatsApp** or **Email** (for now)
- LLM generates a draft message based on: company name, role, time since application, last status
- User can edit the draft before sending
- **WhatsApp:** open `https://wa.me/?text=<encoded message>` — no API needed, just a deep link
- **Email:** open `mailto:?subject=...&body=...` — same approach
- Log the follow-up as an event in the application timeline

**Nice-to-haves on top of this:**
- Save the recruiter/hiring manager's contact (name, email, LinkedIn) per application
- Schedule a follow-up reminder: "remind me in 5 days if no response"
- Template library: save your own follow-up templates

---

## Nice-to-Haves (Bhargav's direction, extended)

These follow the same "centralized job search HQ" vision:

| Feature | What it does |
|---|---|
| **Resume matcher** | Paste your resume, compare it to a job description, get a gap analysis and a rewrite suggestion |
| **Contact book** | Store recruiter/hiring manager details per job — name, email, LinkedIn, phone |
| **Offer comparison** | Side-by-side table of offers: salary, equity, benefits, location, role — helps with negotiation |
| **Company research panel** | Pull Glassdoor rating, recent news, employee count, funding stage into the job detail page |
| **Networking tracker** | Track who referred you, who you spoke to, and at what stage — separate from the application |
| **Deadline reminders** | Set an application deadline per job, get a push notification via Cloudflare Worker + email |
| **Rejection pattern analysis** | After N rejections, LLM analyses common patterns: same stage, same role type, same seniority |
| **Interview prep cards** | Per job, auto-generate a set of flashcard-style Q&A based on the job description |
| **Activity heatmap** | GitHub-style heatmap of application activity — keep the momentum visible |
| **Public share page** | Optional shareable link to your job search stats (anonymised) — for accountability partners |
