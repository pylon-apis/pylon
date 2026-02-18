const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "10000"; // $0.01 in USDC (6 decimals)
const NETWORK = "eip155:8453"; // Base Mainnet

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon PDF Parse API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>📄 Pylon PDF Parse API <span class="badge">x402</span></h1>
<p>Extract text from PDFs for the agent economy. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Parse a PDF</h2>
<pre>POST /parse  (multipart/form-data, field: "file")</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Response</h2>
<pre>{
  "text": "extracted text...",
  "pages": 5,
  "info": { "Title": "...", "Author": "..." }
}</pre>

<h2>How to Pay</h2>
<p>Send a request without payment — you'll get a <code>402 Payment Required</code> response with payment instructions. Include payment in the <code>X-Payment</code> header and retry. x402-compatible clients handle this automatically.</p>

<h2>Health Check</h2>
<pre>GET /health  <em>(free, no payment required)</em></pre>
</body></html>`;

const app = express();

// ── Request Logging ──────────────────────────────────────────────
const startTime = Date.now();
let totalRequests = 0;
let paidRequests = 0;
const recentLogs = []; // ring buffer, last 1000
const MAX_LOGS = 1000;

function logRequest(req, res) {
  const entry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    endpoint: req.originalUrl || req.url,
    wallet: req.headers["x-payment"] ? "(paid)" : null,
    status: res.statusCode,
  };
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  console.log(`[req] ${entry.method} ${entry.endpoint} → ${entry.status}${entry.wallet ? " (paid)" : ""}`);
}

app.use((req, res, next) => {
  totalRequests++;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && (req.headers["x-payment"] || req.headers["payment-signature"])) {
      paidRequests++;
    }
    logRequest(req, res);
  });
  next();
});

app.get("/stats", (req, res) => {
  res.json({
    totalRequests,
    paidRequests,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    recentLogs: recentLogs.slice(-50),
  });
});
// ── End Request Logging ──────────────────────────────────────────

// x402 payment middleware
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

function getPaymentDetails(resource) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: PRICE_AMOUNT,
    resource,
    description: "Extract text from a PDF document",
    mimeType: "application/json",
    payTo: WALLET_ADDRESS,
    maxTimeoutSeconds: 60,
    outputSchema: null,
    extra: { name: "USDC", version: "2" },
  };
}

async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) {
    return next();
  }

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];

  if (!paymentHeader) {
    res.status(402).json({
      x402Version: 2,
      accepts: [getPaymentDetails(req.originalUrl)],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    });
    return;
  }

  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: paymentHeader, details: getPaymentDetails(req.originalUrl) }),
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

function settlePayment(req) {
  if (req.x402Payment) {
    fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: req.x402Payment, details: getPaymentDetails(req.originalUrl) }),
    }).catch(err => console.error("Settlement error:", err.message));
  }
}

// Free routes
app.get("/", (req, res) => res.type("html").send(DOCS_HTML));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// Protected route
app.post("/parse", x402PaymentCheck, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing required field: file (PDF upload)" });

  if (req.file.mimetype !== "application/pdf" && !req.file.originalname.endsWith(".pdf")) {
    return res.status(400).json({ error: "File must be a PDF" });
  }

  try {
    const data = await pdfParse(req.file.buffer);
    settlePayment(req);
    res.json({
      text: data.text,
      pages: data.numpages,
      info: data.info || {},
    });
  } catch (err) {
    console.error("PDF parse error:", err.message);
    res.status(500).json({ error: "Failed to parse PDF", detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon listening on 0.0.0.0:${PORT}`));
