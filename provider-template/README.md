# Pylon Provider API Template

A clone-and-go template for listing your API on [Pylon](https://pylonapi.com), the x402 API gateway. Earn 85% of every API call — payments in USDC, zero billing overhead.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env — set your WALLET_ADDRESS

# 3. Run locally
npm run dev

# 4. Test
curl http://localhost:3000/health
curl "http://localhost:3000/api/your-tool?input=hello"
```

## Make It Yours

1. Open `server.js`
2. Replace the `/api/your-tool` endpoint with your actual logic
3. Update the payment middleware description and input validation
4. Add more endpoints if needed (each becomes a separate Pylon capability)

## Deploy

**Fly.io:**
```bash
fly launch          # First time
fly secrets set WALLET_ADDRESS=0x...
fly deploy
```

**Railway / Render / any platform:**
Deploy as a standard Node.js app. Set environment variables from `.env.example`.

## Register with Pylon

```bash
node register.js \
  --name "Your Tool" \
  --description "What your API does" \
  --url "https://your-app.fly.dev/api/your-tool" \
  --cost 0.01 \
  --keywords "keyword1,keyword2"
```

## How It Works

1. An AI agent discovers your API through Pylon's capability registry
2. The agent sends a request with an x402 payment proof
3. The `x402-express` middleware verifies payment before your code runs
4. Your endpoint processes the request and returns a response
5. Revenue is split: **85% to you**, 15% to Pylon

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express app with x402 middleware and your endpoint |
| `register.js` | Script to register your API with the Pylon gateway |
| `Dockerfile` | Container build for deployment |
| `fly.toml` | Fly.io configuration |
| `.env.example` | Environment variable template |

## Learn More

- [Pylon Provider Guide](../PROVIDER-GUIDE.md)
- [x402 Protocol](https://x402.org)
