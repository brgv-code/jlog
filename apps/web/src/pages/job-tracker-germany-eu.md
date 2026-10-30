---
layout: ../layouts/AnswerLayout.astro
title: Job tracker for applying to tech jobs in Germany and the EU · jlog
description: jlog tracks applications and answers the visa, sponsorship and salary questions on Greenhouse, Lever and Ashby forms from values you save once, never guessing. CV designs with a photo, salaries in euros.
question: Is there a job tracker for applying to tech jobs in Germany and the EU that handles the visa and salary questions?
answer: 'jlog records each application and, on Greenhouse, Lever and Ashby forms, answers work authorisation, sponsorship and salary questions from values you save once, such as "EU" for where you can work without sponsorship. It never guesses: if no option fits exactly, it leaves the question for you.'
updated: 2026-10-30
faqs:
  - q: How does jlog answer "Are you authorised to work in Germany?"
    a: From the list of places you can work without sponsorship, saved in Settings. "EU" covers every member state. When a question names one country on that list, it answers yes to authorisation and no to sponsorship, and only if exactly one option on the form fits.
  - q: Will it answer questions about my visa type or date of birth?
    a: No. Visa type, date of birth and criminal history are never answered, whatever you save.
  - q: Can I track salaries in euros?
    a: Yes. Each application keeps a salary range with its own currency, and your saved salary expectation is filled into free-text salary questions. Salary ranges in a dropdown are left for you.
  - q: Can my CV include a photo?
    a: Yes. Of jlog's six CV designs, three show your photo by default and two more can show it; one, for applicant tracking systems, has none. Each tailored CV is built from sentences you already wrote.
  - q: Is it free?
    a: Yes, and open source. AI features run on your own key, which usually costs under €2 for a whole job search.
related:
  - href: /docs/application-answers
    label: Application answers, field by field
  - href: /features/autofill
    label: Autofill and its rules
  - href: /features/tailored-cv
    label: Tailored CVs, with or without a photo
  - href: /track-greenhouse-job-applications
    label: Greenhouse applications
---

## The questions European applications ask

Applying across borders means the same questions on every form: are you authorised to work here, will you need sponsorship, what salary do you expect, when can you start. jlog answers them from what you saved, under strict rules.

| Saved in Settings | Used for |
|---|---|
| Where you can work without sponsorship, for example `EU` or `Germany, Netherlands` | "Authorised to work in …?" gets yes and "Need sponsorship?" gets no, when the question names one country on your list |
| Salary expectation | Free-text salary questions |
| Notice period | Notice period and start date questions that take text |
| Decline to self-identify | Equal opportunity questions, when the form offers that option |

**Never answered:** visa type, date of birth, criminal history. **Never guessed:** a sensitive question is filled only when exactly one option on the form fits your saved value. Everything else is left for you to answer.

## Tracking the search

- Applications from LinkedIn, Greenhouse, Lever, Ashby, Wellfound and Y Combinator's job board are recorded as you apply.
- Each application keeps a salary range in its own currency, the posting, notes and a timeline.
- Home shows the applications that have gone quiet, so you know when to follow up.

## CVs for European applications

jlog builds a tailored CV for each posting from sentences you already wrote, in six designs typeset as PDFs. Three of them show a photo by default, two more can show one, and a plain single column without a photo is there for applicant tracking systems.

## Getting started

[Create a free account](/login), install the extension, and fill in **Settings → Application answers** once. The [setup guide](/extension/welcome/) takes about five minutes.
