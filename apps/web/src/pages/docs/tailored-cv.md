---
layout: ../../layouts/DocsLayout.astro
title: Tailored CVs
description: A CV for one posting, built only from facts you already wrote, with the source of every line. Pro.
---

> Tailored CVs and cover letters are part of **Pro**. See [plans and billing](/docs/plans).

## What you need

- A **Pro** plan.
- An [AI provider](/docs/ai-providers) set in Settings.
- Your CV [imported as facts](/docs/cv).
- Your name and contact details on the CV page, for the header.
- A **job description** on the application. Captured and extracted applications usually have one; for others, paste it in.

## Building one

Open the application and use **Build a CV from this job description**. jlog reads the posting, chooses which of your facts answer it, puts them in order, and compiles a PDF in the design you picked. You can also download the LaTeX source.

## The rule it follows

**The model chooses, it does not write.** It returns the ids of facts and an order. There is no place in its answer for a new sentence, so it cannot add experience you do not have.

Every line on the CV is one of:

- a fact from your imported CV, word for word, or
- a wording you already sent in an earlier application.

When few of your facts fit the posting, the CV comes out shorter. It is not padded.

## Seeing where a line came from

Each line links back to its source: the line of your CV it was read from, highlighted on the original page, or the earlier application its wording was sent with. The posting side shows the passage the model quoted as the reason for choosing it; jlog checks that the quote really is in the posting.

## When it fails

| Message | What it means |
|---|---|
| Tailoring is a Pro feature | The account is on the Free plan. |
| No model configured | Add an AI provider in Settings. |
| The model could not be reached | Your provider rejected the request; its reason is shown. |
| The model could not settle on a selection | It kept referring to facts that do not exist. What it got wrong is listed; try again. |
| Compile service unavailable | This deployment has no PDF service. The LaTeX is still yours to download. |
