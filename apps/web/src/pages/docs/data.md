---
layout: ../../layouts/DocsLayout.astro
title: Data and privacy
description: What jlog stores, where, and how to take it out or delete it. The full policy is on the privacy page.
---

This page is the short version. The [privacy policy](/privacy) is the full one.

## What is stored

On the hosted jlog, in its database:

- **Your account:** name, email, and how you signed in.
- **Your applications:** company, role, link, status, notes, the job description, and the timeline of changes.
- **Your CV:** the facts you ticked on import, your profile details, and the original file when you imported a PDF.
- **Generated documents**, on Pro.
- **Your application answers**, from Settings.
- **Your AI provider key**, encrypted with AES-GCM.
- **Extension keys**, with their names and expiry dates.

## What the extension reads

- On the six boards: the company, role and link of an application, when you submit it. Nothing else from the page.
- On any other page: the page's text, only when you press **Extract with AI**, sent to the API and on to your AI provider.
- On application forms: it fills fields in your browser from your account. Nothing from the form is sent back.
- When you press **Draft** on Pro: the question, and the posting's text if the application is not in jlog yet, are sent to draft the answer.

## Who else sees it

Only these, each with only what its job needs:

| Who | What for |
|---|---|
| Cloudflare | Hosts the site, the API, the database and uploaded CV files. |
| GitHub, Google or Apple | Only if you sign in with them. jlog receives your name, verified email and avatar; they receive none of your job data. |
| Resend | Delivers sign-in link emails, so it sees that address. |
| Stripe | Payment for Pro, including card details, plus your name, email and account id for matching payments. |
| Your AI provider | The posting, question or CV text a feature needs, under your own key. With no provider configured, nothing is sent. |
| Langfuse | On the hosted jlog, traces of AI calls (the content, the prompt, the answer and your account id) for investigating failed or expensive runs. Never advertising. |

Nothing is sold, rented or shared with advertisers.

## Deleting it

**Settings → Delete account** deletes everything at once, when you confirm: applications and their timelines, your CV and its facts, generated documents and files, saved answers, your provider key and your extension keys. A Pro subscription is cancelled at the same time.

Expired sign-in links and sessions are cleared by a daily job. Expired extension keys are kept for 30 more days, so the extension can still tell you when its key expired, and then removed.

## Self-hosted

If you self-host, the database is yours and none of the above involves anyone else. Deleting a row is the whole procedure.
