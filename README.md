<div align="center">

# ⚡ Pylon

**Pay-per-request APIs for AI agents. No API keys. No subscriptions.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Base](https://img.shields.io/badge/Built%20on-Base-0052FF.svg)](https://base.org)
[![x402](https://img.shields.io/badge/Payments-x402-green.svg)](https://www.x402.org/)
[![Website](https://img.shields.io/badge/Website-pylonapi.com-black.svg)](https://pylonapi.com)

Utility APIs that AI agents can call and pay for instantly with USDC micropayments via [x402](https://www.x402.org/).  
No sign-up. No billing dashboard. Just HTTP.

[Website](https://pylonapi.com) · [MCP Server](https://www.npmjs.com/package/@pylonapi/mcp) · [Smithery](https://smithery.ai/servers/pylonapi/pylon) · [Twitter](https://twitter.com/pylonx402)

</div>

---

## How It Works

```
1. Your agent calls a Pylon API endpoint
2. Gets back HTTP 402 with payment details
3. Pays $0.01-0.05 USDC on Base, retries → gets the response
```

x402-compatible clients handle this automatically. One round-trip.

## Live APIs (20+)

| API | What it does | Price |
|-----|-------------|-------|
| **Screenshot** | Full-page screenshot of any URL | $0.01 |
| **Web Scrape** | Extract clean text/markdown from URLs | $0.01 |
| **Web Extract** | Structured data extraction from web pages | $0.01 |
| **Search** | Web search results | $0.01 |
| **PDF Parse** | Extract text + metadata from PDFs | $0.02 |
| **OCR** | Image → text via Tesseract | $0.03 |
| **Translate** | Translate text between languages | $0.005 |
| **Email Validate** | MX + SMTP verification | $0.005 |
| **Domain Intel** | WHOIS, DNS, SSL, tech stack | $0.01 |
| **DNS Lookup** | DNS record queries | $0.005 |
| **IP Geolocation** | IP → location, ISP, timezone | $0.005 |
| **QR Code** | Generate QR code images | $0.005 |
| **Image Resize** | Resize, crop, format convert | $0.01 |
| **Markdown → PDF** | Render markdown as styled PDF | $0.02 |
| **HTML → PDF** | Full Chromium HTML rendering | $0.02 |
| **Doc Gen** | Generate documents from templates | $0.02 |
| **Data Formatter** | Convert between JSON, CSV, XML, YAML | $0.005 |
| **URL Shortener** | Create short URLs | $0.005 |
| **File Storage** | Temporary file hosting | $0.005 |
| **Email Send** | Transactional email delivery | $0.01 |

All APIs run on [Fly.io](https://fly.io) with scale-to-zero. No third-party API dependencies.

## Quick Start

```bash
# Take a screenshot (will return 402 — use an x402 client for auto-payment)
curl -X POST https://pylon-screenshot-api.fly.dev/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "width": 1280, "height": 720}'
```

With an x402-compatible client:

```javascript
import { wrapFetch } from "@x402/fetch";

const fetch402 = wrapFetch(fetch, wallet);

const response = await fetch402("https://pylon-screenshot-api.fly.dev/screenshot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" }),
});

// Screenshot PNG returned directly
```

## MCP Server

Use all Pylon APIs from Claude, Cursor, or any MCP-compatible tool:

```bash
npx @pylonapi/mcp
```

Or install globally: `npm i -g @pylonapi/mcp`

See the [MCP server on npm](https://www.npmjs.com/package/@pylonapi/mcp) or browse it on [Smithery](https://smithery.ai/servers/pylonapi/pylon).

## Orchestration — `/do/chain`

Chain multiple Pylon APIs in a single request. The orchestration endpoint lets agents describe a pipeline of API calls where outputs flow into inputs:

```bash
POST https://pylonapi.com/do/chain
Content-Type: application/json

{
  "steps": [
    { "api": "web-scrape", "params": { "url": "https://example.com" } },
    { "api": "md-to-pdf", "params": { "markdown": "{{steps.0.output}}" } }
  ]
}
```

Each step runs sequentially. Reference previous outputs with `{{steps.N.output}}`. Payment covers all steps in the chain. One request, one payment, multiple operations.

## Why No API Keys?

API keys are a bottleneck for autonomous agents. An agent can't sign up for accounts, enter credit cards, or manage billing dashboards. x402 lets payment *be* authentication — if you can pay, you can use the API. No human in the loop.

## Self-Hosting

Every API is a standalone Express server. Clone this repo and deploy your own:

```bash
cd apis/screenshot
npm install
npm start
```

Remove the x402 middleware if you don't need payments. MIT licensed.

## Stack

- **Runtime:** Node.js + Express
- **Payments:** [x402](https://x402.org) — HTTP 402 micropayments
- **Settlement:** USDC on [Base](https://base.org)
- **Hosting:** [Fly.io](https://fly.io) (scale-to-zero)
- **No external API deps:** Puppeteer, Sharp, Tesseract, pdf-parse — all self-hosted

## Links

- 🌐 [pylonapi.com](https://pylonapi.com)
- 🐦 [@pylonx402](https://twitter.com/pylonx402)
- 🔌 [MCP Server](https://www.npmjs.com/package/@pylonapi/mcp)
- 📖 [x402 Protocol](https://x402.org)

## Adding Your Own API

Want to add an API to Pylon? See [PROVIDERS.md](PROVIDERS.md) for the full onboarding guide and check out the [provider-template/](provider-template/) for a starter repo.

## License

MIT
