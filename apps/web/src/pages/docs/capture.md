---
layout: ../../layouts/DocsLayout.astro
title: Capturing applications
description: Three ways an application gets into jlog, and exactly what each one records.
---

## On six boards, automatically

On these boards the extension waits for the moment an application is sent, then records it with status **Applied** and today's date.

| Board | What it watches for |
|---|---|
| LinkedIn | The Easy Apply dialog finishing, or a click through to an external application |
| Greenhouse | The form being submitted, then its confirmation |
| Lever | The submit button, then the thank-you page |
| Ashby | The submit button, then the thank-you page |
| Wellfound | The apply button, then its confirmation on the page |
| YC's job board | The apply click, then its confirmation |

**It records the company, the role and the link.** Nothing else is read from the page.

## Anywhere else, with Extract

On a company's careers page or any other site:

1. Open the posting and open the extension's popup.
2. Press **Extract with AI**.
3. The page text goes to [your AI provider](/docs/ai-providers), which returns the company, role and location.
4. Check the result. Fix anything it got wrong, and keep or edit the job description it picked up.
5. Save it.

Nothing is saved until you confirm. Extract needs an AI provider set in Settings; without one, the popup tells you so.

Chrome does not let extensions read its own pages or the Web Store, so Extract does nothing there.

## By hand

For a referral, a recruiter's call or anything that never touched a job page, add it in the app with **Add application**. The dialog takes the company, role, location, status, the date you applied, a link, a salary range and notes.

## Where the application goes

Every captured application lands at the top of **Applications**, where you can change its status, add notes and keep the posting. See [tracking and Home](/docs/tracking).
