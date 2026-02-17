<div align="center">

# ⚡ Pylon

**Pay-per-request APIs for AI agents. No API keys. No subscriptions.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Base](https://img.shields.io/badge/Built%20on-Base-0052FF.svg)](https://base.org)
[![x402](https://img.shields.io/badge/Payments-x402-green.svg)](https://www.x402.org/)
[![Website](https://img.shields.io/badge/Website-pylonapi.com-black.svg)](https://pylonapi.com)

Utility APIs that AI agents can call and pay for instantly with USDC micropayments via [x402](https://www.x402.org/).  
No sign-up. No billing dashboard. Just HTTP.

[Website](https://pylonapi.com) · [MCP Server](https://github.com/pylon-apis/pylon-mcp) · [Twitter](https://twitter.com/pylonx402)

</div>

---

## How It Works

```
1. Your agent calls a Pylon API endpoint
2. Gets back HTTP 402 with payment details
3. Pays $0.01-0.05 USDC on Base, retries → gets the response
```

x402-compatible clients handle this automatically. One round-trip.

## Live APIs

| API | What it does | Price | Endpoint |
|-----|-------------|-------|----------|
| **Screenshot** | Full-page screenshot of any URL | $0.01 | `pylon-screenshot-api.fly.dev` |
| **PDF Parse** | Extract text + metadata from PDFs | $0.02 | `pylon-pdf-parse-api.fly.dev` |
| **OCR** | Image → text via Tesseract | $0.03 | `pylon-ocr-api.fly.dev` |
| **Email Validate** | MX + SMTP verification | $0.005 | `pylon-email-validate-api.fly.dev` |
| **Domain Intel** | WHOIS, DNS, SSL, tech stack | $0.01 | `pylon-domain-intel-api.fly.dev` |
| **QR Code** | Generate QR code images | $0.005 | `pylon-qr-code-api.fly.dev` |
| **Image Resize** | Resize, crop, format convert | $0.01 | `pylon-image-resize-api.fly.dev` |
| **Markdown → PDF** | Render markdown as styled PDF | $0.02 | `pylon-md-to-pdf-api.fly.dev` |
| **HTML → PDF** | Full Chromium HTML rendering | $0.02 | `pylon-html-to-pdf-api.fly.dev` |

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
npx @pylon-apis/pylon-mcp
```

See [pylon-apis/pylon-mcp](https://github.com/pylon-apis/pylon-mcp) for setup.

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
- 🔌 [MCP Server](https://github.com/pylon-apis/pylon-mcp)
- 📖 [x402 Protocol](https://x402.org)

## License

MIT
