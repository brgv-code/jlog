---
layout: ../../layouts/DocsLayout.astro
title: Application answers
description: The values autofill may use for questions your CV does not answer.
---

## Where they live

**Settings → Application answers.** The extension's **Fill with jlog** button uses these for questions your CV does not answer. Anything you leave empty stays empty on the form.

## The fields

| Field | How it is used |
|---|---|
| Phone | Filled into phone fields. |
| Where you can work without sponsorship | Comma separated. **EU** covers every member state. Used only when a question names one country: yes to authorisation there, no to sponsorship. |
| Salary expectation | Filled into free-text salary questions. Ranges in a dropdown are left for you. |
| Notice period | Filled into notice period and start date questions that take text. |
| Decline to self-identify on EEO questions | When ticked, equal opportunity questions get the decline option, if the form offers one. |

## What is never answered

jlog never guesses these, and never answers questions about **criminal history**, **visa type** or **date of birth**, whatever you save.

A sensitive question is filled only when exactly one option on the form fits your saved value. Anything else is left for you. See [autofill](/docs/autofill) for the full rules.
