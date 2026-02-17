const express = require("express");

const PORT = process.env.PORT || 3000;
const SEARCH_BACKEND = process.env.SEARCH_BACKEND || "searxng";

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_PER_QUERY = "$0.003";
const PRICE_USDC = "3000"; // $0.003 in USDC (6 decimals)
const NETWORK = "eip155:84532"; // Base Sepolia
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

// Load backend
function getBackend() {
  return require(`./backends/${SEARCH_BACKEND}.js`);
}

const app = express();

// ── Request Logging ──
const startTime = Date.now();
let totalRequests = 0;
let paidRequests = 0;

app.use((req, res, next) => {
  totalRequests++;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && (req.headers["x-payment"] || req.headers["payment-signature"])) {
      paidRequests++;
    }
    console.log(`[req] ${req.method} ${req.originalUrl} → ${res.statusCode}`);
  });
  next();
});

// x402 payment middleware
async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) {
    return next();
  }

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];

  if (!paymentHeader) {
    const paymentRequirements = {
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: PRICE_USDC,
        resource: req.originalUrl,
        description: "Web search query",
        mimeType: "application/json",
        payTo: WALLET_ADDRESS,
        maxTimeoutSeconds: 60,
        outputSchema: null,
        extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    };
    return res.status(402).json(paymentRequirements);
  }

  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        details: {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: PRICE_USDC,
          resource: req.originalUrl,
          description: "Web search query",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 60,
          outputSchema: null,
          extra: { name: "USDC", version: "2" },
        },
      }),
    });

    if (!verifyRes.ok) {
      return res.status(402).json({ error: "Payment verification failed" });
    }

    const result = await verifyRes.json();
    if (!result.isValid) {
      return res.status(402).json({ error: "Invalid payment", details: result });
    }

    req.x402Payment = paymentHeader;
    next();
  } catch (err) {
    console.error("Payment verification error:", err.message);
    return res.status(500).json({ error: "Payment verification service unavailable" });
  }
}

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", backend: SEARCH_BACKEND, uptime: process.uptime() });
});

app.get("/stats", (req, res) => {
  res.json({
    totalRequests,
    paidRequests,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    backend: SEARCH_BACKEND,
  });
});

app.get("/search", x402PaymentCheck, async (req, res) => {
  const { q, count, category } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing required parameter: q" });
  }

  const numResults = Math.min(Math.max(parseInt(count) || 10, 1), 50);
  const cat = category || "general";

  try {
    const backend = getBackend();
    const result = await backend.search(q, numResults, cat);

    // Settle payment after success
    if (req.x402Payment) {
      fetch(`${FACILITATOR_URL}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: req.x402Payment,
          details: {
            scheme: "exact",
            network: NETWORK,
            maxAmountRequired: PRICE_USDC,
            resource: req.originalUrl,
            description: "Web search query",
            payTo: WALLET_ADDRESS,
            maxTimeoutSeconds: 60,
            outputSchema: null,
            extra: { name: "USDC", version: "2" },
          },
        }),
      }).catch(err => console.error("Settlement error:", err.message));
    }

    res.json(result);
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(502).json({ error: "Search backend error", detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pylon Search API listening on 0.0.0.0:${PORT} (backend: ${SEARCH_BACKEND})`);
});
