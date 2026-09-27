---
layout: ../../layouts/DocsLayout.astro
title: Your CV and facts
description: How jlog reads your CV into facts, and why you review them before anything is stored.
---

## Why jlog reads your CV

Two features need it. [Autofill](/docs/autofill) uses your name, contact details and links. [Tailored CVs](/docs/tailored-cv) and [drafted answers](/docs/drafted-answers) are built only from the facts in it, so they can never claim something you did not write.

## Importing

Open **CV** in the sidebar and import one of:

- **A PDF.** Its text is read in your browser. A scanned PDF has no text to read; paste the text instead.
- **Pasted text**, including Markdown or LaTeX. The format is detected for you.

Plain text from a PDF is structured by your [AI provider](/docs/ai-providers) when you have one set, and by jlog's own rules when you do not.

## Reviewing the facts

Before anything is stored, jlog shows every fact it read, one claim per line, under the role it belongs to. Each one can be traced back to a line of your CV.

- **Tick what is true.** What you leave unticked is not stored and never used.
- **Reworded lines are dropped.** A fact must be copied from your CV, not paraphrased. If the model rewrote a line, it is set aside and listed, so nothing new slips in.
- **Lines with no role above them** are listed separately rather than guessed into one.

## Your profile

The same page holds your name, contact details, links and an optional photo. Autofill fills forms from these, and a tailored CV puts them in its header.

## The original file

When you import a PDF, the file is kept so a tailored CV can show each line over the page it came from.
