---
layout: ../layouts/AnswerLayout.astro
title: Job application tracker with your own AI key or Ollama · jlog
description: jlog runs its AI features on your own Anthropic, OpenAI or Gemini key, or a local Ollama model. Billed by your provider at cost, never marked up. A whole job search usually costs under €2.
question: Is there a job tracker where I can use my own AI key, or a local model like Ollama?
answer: Yes. jlog runs its AI features on your own key from Anthropic, OpenAI or Gemini, or on an Ollama model you run yourself. Your provider bills you at its own price and jlog adds nothing; a whole job search usually costs under €2 in model usage.
updated: 2026-10-30
faqs:
  - q: Which AI providers does jlog support?
    a: Anthropic, OpenAI, Gemini and Ollama. You pick the provider and the model in Settings, and can change either at any time.
  - q: How much does it cost to use my own key?
    a: jlog charges nothing for its features and adds no markup. Your provider bills the model usage directly. A whole job search usually comes to under €2; with Ollama on your own hardware there is no model bill at all.
  - q: Is my API key safe?
    a: It is encrypted with AES-GCM before it is stored, is never shown again after you save it, and is sent only to the provider you chose.
  - q: Can I use jlog with no AI key at all?
    a: Yes. Capture on the six supported job boards, tracking and autofill never call a model. You need a key only to read postings on other pages, to read a CV with a model, and for tailored CVs, cover letters and drafted answers.
  - q: Does Ollama work with the hosted jlog?
    a: Yes, if your Ollama server can be reached from the internet, for example through a Cloudflare Tunnel, because the hosted API runs on Cloudflare rather than on your computer. If you run jlog yourself on your own machine, localhost works.
related:
  - href: /docs/ai-providers
    label: AI providers, in the docs
  - href: /open-source-job-tracker
    label: Self-host jlog
  - href: /features/tailored-cv
    label: Tailored CVs from your real experience
  - href: /docs/plans
    label: Plans
---

## Supported providers

| Provider | Key | Where it runs |
|---|---|---|
| Anthropic | Your API key | Anthropic's servers |
| OpenAI | Your API key | OpenAI's servers |
| Gemini | Your API key | Google's servers |
| Ollama | None | Your own server or machine |

You choose the provider and the model in **Settings → LLM provider**, and can switch either whenever you like. For Ollama you give jlog the server's address and pick from the models it reports.

## What the model does in jlog

- **Extract with AI** reads a job posting on any careers page, so you can save it in one click.
- **CV import** can use the model to structure a PDF. Without one, jlog's own rules do it.
- **Tailored CVs** and **cover letters** are built from sentences you already wrote, with the source of every line.
- **Drafted answers** to open questions on application forms list the facts they used, and say so when your CV does not cover the question.

**What never calls a model:** capture on LinkedIn, Greenhouse, Lever, Ashby, Wellfound and Y Combinator's job board, the applications list and Home, and autofill. Those work with no key.

## What it costs

jlog does not resell model access. Every feature is free, and the model usage is billed by your provider at its own price with no markup. A whole job search usually costs under €2. With Ollama on your own hardware, there is no model bill.

## What is sent where

- **Your key** is encrypted with AES-GCM before it is stored, is never returned to the browser, and is sent only to the provider you chose.
- **To the provider:** the posting, question or CV text a feature needs, and nothing else.
- **On the hosted jlog**, model calls are also traced in Langfuse so a failed or expensive run can be investigated. That trace holds the content, the prompt, the answer and your account id. A self-hosted jlog traces nothing unless you configure it.

The [privacy policy](/privacy) has the full list.

## Ollama, hosted or self-hosted

The model is called from jlog's API, not from your browser.

- **Hosted at jlog.ai:** the API runs on Cloudflare, so `localhost` means Cloudflare's machine, not yours. Your Ollama server has to be reachable from the internet, for example through a Cloudflare Tunnel.
- **Self-hosted on your own machine:** `localhost` works, and model calls never leave it. A self-hosted deployment can also reach an Ollama server behind Cloudflare Access with a service token. See the [configuration reference](/docs/self-hosting/configuration).
