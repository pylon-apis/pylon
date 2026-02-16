<div align="center">

# ⚡ Pylon AI

**Pay-per-request APIs for the agent economy**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Base](https://img.shields.io/badge/Built%20on-Base-0052FF.svg)](https://base.org)
[![x402](https://img.shields.io/badge/Payments-x402-green.svg)](https://www.x402.org/)
[![Website](https://img.shields.io/badge/Website-pylonapi.com-black.svg)](https://pylonapi.com)

10 production APIs that AI agents can call and pay for with USDC micropayments via the [x402 protocol](https://www.x402.org/). No API keys. No accounts. No subscriptions. Just call, pay, and get your response.

[Website](https://pylonapi.com) · [Twitter](https://twitter.com/pylonx402) · [x402 Protocol](https://www.x402.org/)

</div>

---

## How It Works

Pylon uses the **x402 HTTP payment protocol** — three steps, zero sign-up:

```
1. Call any Pylon API endpoint
2. Receive a 402 Payment Required response with payment details
3. Pay the USDC micropayment on Base and retry — get your result
```

That's it. Your agent's HTTP client handles the x402 flow automatically. Every request is a self-contained economic transaction.

---

## API Catalog

| API | Description | Price | Endpoint |
|-----|-------------|-------|----------|
| **Web Search** | Search the web and get structured results | $0.01 | `api.pylonai.com/search` |
| **Web Scrape** | Extract clean text/markdown from any URL | $0.005 | `api.pylonai.com/scrape` |
| **Image Generation** | Generate images from text prompts | $0.05 | `api.pylonai.com/image/generate` |
| **Text Summarization** | Summarize long documents or articles | $0.01 | `api.pylonai.com/summarize` |
| **Sentiment Analysis** | Analyze sentiment of text inputs | $0.005 | `api.pylonai.com/sentiment` |
| **Translation** | Translate text between 50+ languages | $0.01 | `api.pylonai.com/translate` |
| **Code Generation** | Generate code from natural language | $0.02 | `api.pylonai.com/code/generate` |
| **PDF Extract** | Parse and extract content from PDFs | $0.01 | `api.pylonai.com/pdf/extract` |
| **Entity Extraction** | Extract named entities from text | $0.005 | `api.pylonai.com/entities` |
| **Embeddings** | Generate text embeddings for RAG/search | $0.005 | `api.pylonai.com/embeddings` |

> All endpoints are live at `https://api.pylonai.com`. Prices are in USDC on Base.

---

## Quick Start

```bash
# Call the Web Search API — your x402-compatible client handles payment automatically
curl -X POST https://api.pylonai.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "latest AI agent frameworks 2026"}'

# Response: 402 Payment Required
# Your x402 client pays $0.01 USDC on Base, retries, and gets:
{
  "results": [
    {
      "title": "Top AI Agent Frameworks in 2026",
      "url": "https://example.com/article",
      "snippet": "The leading frameworks for building autonomous AI agents..."
    }
  ]
}
```

For automated agent workflows, use an x402-compatible HTTP client that handles the 402 → pay → retry loop:

```javascript
import { x402Client } from "@x402/client";

const client = x402Client({ wallet: yourAgentWallet });

const response = await client.post("https://api.pylonai.com/search", {
  query: "latest AI agent frameworks 2026",
});

console.log(response.data.results);
```

---

## Why Pylon?

- **No API keys** — Payment _is_ authentication
- **No accounts** — No sign-up, no dashboards, no OAuth
- **No subscriptions** — Pay only for what you use, per request
- **Agent-native** — Built for autonomous agents that need to transact independently
- **Instant settlement** — USDC on Base, sub-cent transaction fees

---

## Built With

- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) — API server
- [x402](https://www.x402.org/) — HTTP payment protocol
- [Base](https://base.org/) — L2 settlement layer
- [USDC](https://www.circle.com/usdc) — Stablecoin payments

---

## Links

- 🌐 **Website:** [pylonapi.com](https://pylonapi.com)
- 🐦 **Twitter:** [@pylonx402](https://twitter.com/pylonx402)
- 📖 **x402 Protocol:** [x402.org](https://www.x402.org/)

---

## License

MIT — see [LICENSE](LICENSE) for details.
