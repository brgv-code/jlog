---
layout: ../../layouts/DocsLayout.astro
title: AI providers
description: Which model jlog uses, what it is used for, and how your key is kept.
---

## Bring your own model

jlog does not resell model access. You choose a provider in **Settings → LLM provider** and use your own key, billed by that provider at their price. jlog never marks it up. A whole job search usually costs under €2 in model usage.

## Supported providers

| Provider | Default model | Needs a key |
|---|---|---|
| Anthropic | `claude-3-5-haiku-20241022` | Yes |
| OpenAI | `gpt-4o-mini` | Yes |
| Gemini | `gemini-1.5-flash` | Yes |
| Ollama | `llama3` | No, it runs on your own machine |

You can change the model name for any of them. For Ollama, set the server's URL (by default `http://localhost:11434`) and pick from the models it reports.

## What it is used for

- **Extract with AI** in the extension, to read a posting. See [capturing applications](/docs/capture).
- **CV import**, to structure the text of a PDF. Without a provider, jlog's own rules do it.
- **Tailored CVs** and **drafted answers**, on Pro.

Tracking, capture on the six boards, and autofill never call a model.

## How your key is kept

Your key is encrypted with AES-GCM before it is stored, and is sent nowhere except the provider you picked. The settings page shows only that a key is saved, never the key itself. Save a new one to replace it.

## Ollama and the hosted version

The model is called from jlog's API, not from your browser. On the hosted version the API runs on Cloudflare, so `http://localhost` means Cloudflare's machine, not yours: your Ollama server has to be reachable from the internet, for example through a Cloudflare Tunnel. When you [run jlog locally](/docs/self-hosting/local), `localhost` works as expected.
