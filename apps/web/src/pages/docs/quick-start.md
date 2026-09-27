---
layout: ../../layouts/DocsLayout.astro
title: Quick start
description: From a new account to your first captured application, in about five minutes.
---

## 1. Sign in

Open the sign-in page and pick any method it offers: GitHub, Google, Apple or an emailed link. The page only shows the methods the instance has configured.

Methods attach to one account. If you signed up with GitHub and later use Google with the same verified address, you land in the same account, not a new empty one.

## 2. Add the extension

The extension is what records applications and fills forms. See [the Chrome extension](/docs/extension) for how to install it.

## 3. Connect it to your account

1. In jlog, open **Settings** and find **Chrome extension**.
2. Press **Generate key**. You can name the key and choose how long it lasts: 1 day, 7 days, 30 days or no expiration.
3. Copy the key. It is shown once.
4. Open the extension's popup, where it says **Connect the extension**, and paste it.

The popup then shows the account it is linked to. Anyone holding the key can add applications as you, so revoke it in Settings if it ever leaves your machine.

## 4. Import your CV

Open **CV** in the sidebar and import the CV you already have, as a PDF or as pasted text. jlog reads it into single facts and shows you the list before anything is stored. Your name, contact details and links from it are what [autofill](/docs/autofill) uses.

See [your CV and facts](/docs/cv).

## 5. Choose an AI provider

Open **Settings → LLM provider** and add a key for Anthropic, OpenAI or Gemini, or point it at an Ollama server. The provider reads postings when you press **Extract with AI**, and powers the Pro documents. Tracking and autofill work without one.

See [AI providers](/docs/ai-providers).

## 6. Apply to something

Apply to a job on LinkedIn, Greenhouse, Lever, Ashby, Wellfound or YC's job board as you normally would. The application appears in your list, with status **Applied**.

On any other site, open the popup on the posting and press **Extract with AI**. See [capturing applications](/docs/capture).
