---
layout: ../../layouts/DocsLayout.astro
title: Autofill
description: How the Fill with jlog button fills application forms, and the questions it leaves alone.
---

## Where it works

On application forms hosted by **Greenhouse**, **Lever** and **Ashby**. Many companies embed one of those forms inside their own careers page; the extension runs inside the embedded form too, so the button appears there as well.

A page with fewer than two fields the extension recognises is treated as a posting, not a form, and gets no button.

## Using it

1. Open the application form.
2. Press **Fill with jlog** in the bottom right corner.
3. Read the summary it shows, for example: *Filled 8 fields. 1 required field left for you. Review before you submit.*
4. Finish the rest yourself, check everything, and press the form's own submit button.

## What it fills

From your profile on the **CV** page:

- first name, last name, or full name
- email
- location
- LinkedIn, GitHub, Twitter and your website

From your [application answers](/docs/application-answers) in Settings:

- phone
- notice period
- work authorisation and sponsorship, salary expectation and equal opportunity questions, under the rules below

## The rules it follows

**Only empty fields.** Anything you or your browser already typed stays as it is.

**Sensitive questions are never guessed.** Questions about visa, sponsorship, work authorisation, salary and equal opportunity are recognised before anything else. They are answered only from values you saved, and only when exactly one option on the form fits. Criminal history is never answered, whatever you saved.

**Questions about someone else are left alone.** A "Referrer name" field does not get your name.

**It never submits.** Nothing in the extension clicks a button or sends a form.

When it is unsure, it leaves the field empty. A gap you can see is better than a wrong answer sent under your name.

## What it does not fill

Experience, education, file uploads such as your CV, and open questions. On Pro, open questions get a draft button of their own: see [drafted answers](/docs/drafted-answers).
