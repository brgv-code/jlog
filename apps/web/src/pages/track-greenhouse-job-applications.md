---
layout: ../layouts/AnswerLayout.astro
title: Track Greenhouse job applications, and fill the forms · jlog
description: jlog records a Greenhouse application when you submit it and fills the form's standard fields from your profile, including Greenhouse forms embedded in a company's careers page. It never submits.
question: How do I keep track of Greenhouse applications, and stop retyping the same answers?
answer: jlog's Chrome extension records a Greenhouse application when you submit it, and its Fill with jlog button fills the form's standard fields from your profile first. It works on Greenhouse forms embedded in a company's own careers page too, and it never presses submit.
updated: 2026-10-30
faqs:
  - q: Which fields does jlog fill on a Greenhouse form?
    a: Your name, email, location and links from your CV profile, and phone and notice period from your saved application answers. Work authorisation, sponsorship, salary and equal opportunity questions are filled only from values you saved, and only when exactly one option fits.
  - q: Does it submit the application for me?
    a: No. Nothing in the extension clicks a submit button or sends a form. You read the form and send it yourself.
  - q: What does it leave alone?
    a: Fields you already filled, experience and education, file uploads such as your CV, questions about someone else such as a referrer's name, and criminal history, which it never answers.
  - q: What about open questions like "why do you want to work here"?
    a: Those get a separate Draft button, which writes an answer from your imported CV with your own AI key, lists the facts it used, and says so when your CV does not cover the question.
  - q: Does it work on Lever and Ashby too?
    a: Yes, both capture and autofill. Capture also works on LinkedIn, Wellfound and Y Combinator's job board.
related:
  - href: /features/autofill
    label: Autofill, and the rules it follows
  - href: /docs/application-answers
    label: The answers autofill may use
  - href: /track-linkedin-job-applications
    label: LinkedIn applications
  - href: /bring-your-own-ai-key
    label: Drafts with your own AI key
---

## Recording the application

On a Greenhouse form, the extension waits for the form to be submitted and for its confirmation, then records the company, the role and the link with status **Applied** and today's date. Nothing else is read from the page.

## Filling the form

Press **Fill with jlog** in the corner of the form. It shows what it did, for example *Filled 8 fields. 1 required field left for you. Review before you submit.*

| Source | Fields |
|---|---|
| Your CV profile | First and last name, email, location, LinkedIn, GitHub, Twitter, website |
| Your saved application answers | Phone, notice period |
| Saved answers, only when exactly one option fits | Work authorisation, sponsorship, salary expectation, equal opportunity questions |
| Never | Criminal history, visa type, date of birth |

**Only empty fields are filled.** Anything you or your browser already typed stays. When it is unsure, it leaves the field empty: a gap you can see is better than a wrong answer sent under your name.

## Embedded forms

Many companies put a Greenhouse form inside their own careers page. The extension runs inside that embedded form as well, so the button appears there too.

## Cost

jlog is free and MIT licensed. Capture and autofill never call a model; drafted answers use [your own AI key](/bring-your-own-ai-key).
