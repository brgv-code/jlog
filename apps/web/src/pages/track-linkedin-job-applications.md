---
layout: ../layouts/AnswerLayout.astro
title: Track LinkedIn job applications automatically · jlog
description: jlog's Chrome extension records a LinkedIn application the moment Easy Apply finishes, with the company, role, link and date, so your list keeps itself up to date. Free and open source.
question: How do I keep track of my LinkedIn job applications automatically?
answer: Install jlog's Chrome extension. When a LinkedIn Easy Apply dialog finishes, or you click through to a company's own application, it records the company, the role and the link with status Applied and today's date, so the list keeps itself without a spreadsheet.
updated: 2026-10-30
faqs:
  - q: Does jlog save anything else from LinkedIn, like my profile or messages?
    a: No. The extension watches LinkedIn pages for the confirmation that an application was sent, in your browser. The only thing it saves is the company, the role and the link of the job you applied to.
  - q: What about jobs that send me to the company's own site?
    a: The click through to an external application is recorded too. If that site is Greenhouse, Lever or Ashby, jlog can also fill the form's standard fields from your profile; it never submits.
  - q: Can I add an application I made without the extension?
    a: Yes. Add it by hand in the app with the company, role, status, date, link, a salary range and notes.
  - q: Does tracking LinkedIn applications need an AI key?
    a: No. Capture on LinkedIn and the other five supported boards never calls a model.
  - q: How much does it cost?
    a: Nothing. jlog is free and MIT licensed, and you can also run it yourself.
related:
  - href: /docs/capture
    label: Exactly what capture records, board by board
  - href: /features/tracking
    label: Tracking, from saved to offer
  - href: /track-greenhouse-job-applications
    label: Greenhouse applications and autofill
  - href: /open-source-job-tracker
    label: jlog is open source
---

## What gets recorded

| | |
|---|---|
| When | The Easy Apply dialog finishing, or a click through to an external application |
| What | The company, the role and the link |
| Status | Applied, dated today |
| Not saved or sent | Anything else from LinkedIn: your profile, messages, the feed |

The application lands at the top of your list, where you can change its status, add notes, keep the posting and see a timeline of what happened when.

## The other boards it watches

The same automatic capture works on Greenhouse, Lever, Ashby, Wellfound and Y Combinator's job board. On any other careers page, **Extract with AI** in the extension reads the posting with your own AI key, and nothing is saved until you confirm it.

## After you apply

- **Statuses** from saved to applied, interviewing, offer, rejected or withdrawn.
- **Home** opens on what needs you: applications gone quiet, replies you are waiting on, conversations in progress.
- **Notes** and the original posting stay with each application.

## Getting started

1. [Create a free account](/login) and install the extension.
2. Connect it with a key from **Settings**.
3. Apply on LinkedIn as you already do.

The [setup guide](/extension/welcome/) walks through it in about five minutes.
