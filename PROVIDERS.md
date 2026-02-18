# Pylon Provider Onboarding Guide

**Go from zero to earning in 30 minutes.**

---

## What is Pylon?

Pylon is an x402 API gateway that lets AI agents discover and pay for APIs with cryptocurrency in a single HTTP request. Third-party providers list their APIs on Pylon and get paid instantly — no sales team, no billing system, no invoices.

## What You Get

- **85% revenue share** — you set the price, Pylon takes only 15%
- **Instant USDC payments** on Base — no net-30, no invoicing
- **Zero sales/billing overhead** — agents discover your API automatically via Pylon's capability registry
- **Built-in payment verification** — x402 protocol handles payment before your code runs
- **MCP + REST distribution** — agents find you through both protocols

---

## Prerequisites

- **Node.js 18+** (or any runtime — the template uses Node/Express)
- **A deployed API endpoint** (or something you want to turn into one)
- **A wallet address** on Base for receiving USDC payouts

---

## Step 1: Clone the Template Repo

```bash
git clone https://github.com/pylon-api/provider-template.git my-pylon-api
cd my-pylon-api
npm install
```

Or copy the `template-repo/` directory from this onboarding package.

## Step 2: Add Your Business Logic

Open `server.js` and replace the example endpoint with your API:

```js
// Replace this with your actual logic
app.get('/api/your-tool', paymentMiddleware, async (req, res) => {
  const { input } = req.query;
  
  // YOUR CODE HERE
  const result = await doYourThing(input);
  
  res.json({ result });
});
```

The `paymentMiddleware` is already wired up — it verifies x402 payments before your handler runs. You just write business logic.

**Key points:**
- One endpoint per capability (you can have multiple)
- Return JSON, images, PDFs — whatever makes sense
- The middleware handles payment verification automatically

## Step 3: Deploy

The template includes deployment configs for Fly.io out of the box:

**Fly.io (recommended):**
```bash
fly launch
fly secrets set WALLET_ADDRESS=0xYourWalletAddress
fly deploy
```

**Railway:**
```bash
railway init
railway up
```

**Vercel / any platform:**
Just deploy it however you normally deploy a Node.js Express app. Set the environment variables from `.env.example`.

## Step 4: Register with Pylon

Once deployed, register your API with the Pylon gateway:

```bash
# Using the included registration script
node register.js \
  --name "Your Tool Name" \
  --description "What your API does" \
  --url "https://your-app.fly.dev/api/your-tool" \
  --method GET \
  --cost 0.01 \
  --keywords "keyword1,keyword2,keyword3"
```

Or submit directly:

```bash
curl -X POST https://api.pylonapi.com/register \
  -H "Content-Type: application/json" \
  -d '{
    "id": "your-tool",
    "name": "Your Tool Name",
    "description": "What your API does in one sentence.",
    "keywords": ["keyword1", "keyword2"],
    "providerEndpoint": "https://your-app.fly.dev/api/your-tool",
    "method": "GET",
    "cost": "$0.01",
    "inputSchema": {
      "input": { "type": "string", "required": true, "description": "Input parameter" }
    },
    "outputType": "application/json",
    "provider": {
      "name": "Your Company",
      "wallet": "0xYourWalletAddress",
      "url": "https://yoursite.com",
      "contact": "you@yoursite.com"
    }
  }'
```

Pylon reviews submissions and adds approved capabilities to the registry.

## Step 5: Test & Start Earning

Once approved, your API appears in Pylon's `/capabilities` and `/mcp` endpoints. AI agents discover it automatically.

**Test it locally first:**
```bash
# Start your server
npm start

# Hit the health check
curl http://localhost:3000/health

# Test your endpoint (without payment, for local dev)
curl "http://localhost:3000/api/your-tool?input=test"
```

**Test through Pylon:**
```bash
# Agents will call your API through Pylon's /do endpoint
# Pylon handles x402 payment, forwards the request to you, splits revenue
curl -X POST https://api.pylonapi.com/do \
  -H "Content-Type: application/json" \
  -d '{"capability": "your-tool", "params": {"input": "test"}}'
```

Every successful request earns you money. 85% of the price you set goes directly to your wallet in USDC.

---

## FAQ

### How should I price my API?

Look at existing Pylon capabilities for reference:
- Simple lookups (DNS, IP geo): **$0.002–$0.005**
- Medium compute (OCR, parsing): **$0.01–$0.03**
- Heavy compute (rendering, generation): **$0.02–$0.05**

Price based on your actual costs plus margin. Agents are price-sensitive — lower prices get more volume. You can adjust pricing anytime.

### What is x402?

x402 is an HTTP-native payment protocol. When an agent calls your API, it includes a cryptographic payment proof in the request header. The x402 middleware verifies the payment before your code executes. No payment = no execution. It's like a toll booth for API calls.

Learn more: [x402.org](https://x402.org)

### How do payments settle?

- Payments are in **USDC on Base** (an Ethereum L2)
- Revenue is split automatically: **85% to you, 15% to Pylon**
- Payouts are tracked per-request and settled periodically to your wallet address
- You need a wallet that can receive USDC on Base (Coinbase, MetaMask, any EVM wallet)

### What are the SLA expectations?

- **Uptime:** Aim for 99%+ availability. Pylon monitors endpoints and may delist consistently unavailable APIs
- **Latency:** Keep responses under 10 seconds. Agents have timeout limits
- **Errors:** Return proper HTTP status codes. 5xx errors won't be charged to agents
- **Rate limits:** Handle your own rate limiting. Pylon doesn't throttle on your behalf

### Can I list multiple endpoints?

Yes. Each endpoint is a separate capability with its own pricing. Register each one individually.

### What networks/chains are supported?

Currently **Base Sepolia** (testnet) during beta, moving to **Base mainnet** for production. Payments are always in USDC.

### Do I need to handle payments myself?

No. The x402 middleware in the template handles payment verification. Pylon handles revenue splitting and payouts. You just write API logic.

### How do agents discover my API?

Pylon exposes all capabilities through:
- **REST:** `GET /capabilities` — JSON list of all available APIs
- **MCP:** Model Context Protocol endpoint for AI agent frameworks
- **Natural language matching** — agents describe what they need, Pylon matches keywords

### Can I update my API after listing?

Yes. Contact Pylon to update your capability definition (pricing, description, schema). Endpoint URL changes require re-verification.

---

## Support

- **Email:** providers@pylonapi.com
- **GitHub:** [github.com/pylon-api](https://github.com/pylon-api)
- **Spec:** See `PROVIDER-SPEC.md` for the full capability schema reference
