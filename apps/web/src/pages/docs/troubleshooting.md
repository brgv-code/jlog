---
layout: ../../layouts/DocsLayout.astro
title: Troubleshooting
description: The messages you might see, what they mean, and what to do.
---

## The extension

### "Your jlog key expired"

Keys last as long as you chose when you made them. Generate a new one in **Settings → Chrome extension** and paste it into the popup. The popup also links there with **Renew it in Settings**.

### "This key is no longer valid"

The key was revoked, or belongs to a deleted account. Generate a new one.

### "Your key may well be fine, the server just did not answer"

The popup could not reach the API. Check your connection and press **Try again**.

### "Nothing to track here"

Chrome does not let extensions read its own pages (`chrome://`) or the Web Store. Open a job posting and try again.

### An application I made was not recorded

Automatic capture works on LinkedIn, Greenhouse, Lever, Ashby, Wellfound and YC's job board, and waits for the confirmation that the application was sent. Check that the extension is connected, then add it with **Extract with AI** or by hand. See [capturing applications](/docs/capture).

## Extract with AI

### "Configure an LLM provider in settings first"

Extract uses your AI provider. Add one in **Settings → LLM provider**. See [AI providers](/docs/ai-providers).

### "Could not identify company or role from this page"

The model could not find a posting in the page's text. Open the posting itself, not a search results page, and try again.

### "Failed to decrypt API key"

Your saved key can no longer be read, usually because a self-hosted instance's `ENCRYPTION_SECRET` changed. Save your key again in Settings.

## Autofill

### The Fill with jlog button does not appear

- It appears only on Greenhouse, Lever and Ashby forms, including ones embedded in a careers page.
- A page with fewer than two fields it recognises is treated as a posting, not a form.
- The extension has to be connected.

### A field was left empty

On purpose, when the answer would be a guess. Sensitive questions are filled only from your [application answers](/docs/application-answers) and only when exactly one option fits. Fill the rest yourself.

## Your CV

### "That PDF has no text in it"

It is probably a scan, which has no text to read. Paste the CV's text instead.

## Billing

### "Payment went through, but the upgrade has not arrived yet"

Stripe tells jlog about a payment separately from sending you back. Reload in a minute.

## Self-hosting

### Sign-in is refused, or loops back to the login page

- `WEB_ORIGIN` on the API must be exactly the web app's origin, with scheme and no trailing slash.
- `COOKIE_DOMAIN` must be `localhost` locally and anything else on HTTPS.
- Each sign-in provider's callback must be `/api/auth/callback/<provider>` on the API's origin.

### The extension cannot reach a self-hosted API

- `EXTENSION_ID` on the API must be your build's ID from `chrome://extensions`. The API accepts only that extension.
- Your API's origin must be in the extension's `host_permissions`, and in `VITE_API_BASE` when you built it.

### Sign in with Apple fails locally

Apple does not work on `http://localhost`. Set it up on your deployed HTTPS origin.

### Pro features say Pro is required

They are not part of the open-source build. See [plans and billing](/docs/plans#self-hosted).

## Still stuck

Email [support@jlog.ai](mailto:support@jlog.ai) with what you tried and what you saw. On a self-hosted instance, whoever runs it is your first stop; for a bug in jlog itself, [open an issue](https://github.com/brgv-code/jlog/issues).
