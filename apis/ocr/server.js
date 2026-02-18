const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "10000"; // $0.01 in USDC (6 decimals)
const NETWORK = "eip155:8453"; // Base Mainnet

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Pre-create a worker for faster responses
let worker;
async function getWorker(lang = "eng") {
  if (!worker) {
    worker = await Tesseract.createWorker(lang);
  }
  return worker;
}

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon OCR API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>🔍 Pylon OCR API <span class="badge">x402</span></h1>
<p>Extract text from images with OCR. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Extract Text from an Image</h2>
<pre>POST /extract  (multipart/form-data)</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Parameters</h2>
<table>
<tr><th>Param</th><th>Default</th><th>Description</th></tr>
<tr><td><code>image</code></td><td><em>required</em></td><td>Image file (multipart upload)</td></tr>
<tr><td><code>language</code></td><td>eng</td><td>OCR language (e.g. eng, deu, fra, spa, chi_sim)</td></tr>
</table>

<h2>Response</h2>
<pre>{
  "text": "Extracted text from the image...",
  "confidence": 92.5,
  "language": "eng"
}</pre>

<h2>How to Pay</h2>
<p>Send a request without payment — you'll get a <code>402 Payment Required</code> response with payment instructions. Include payment in the <code>X-Payment</code> header and retry.</p>

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

const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

function makePaymentDetails(req) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: PRICE_AMOUNT, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    resource: req.originalUrl,
    description: "Extract text from an image via OCR",
    payTo: WALLET_ADDRESS,
    maxTimeoutSeconds: 60,
    outputSchema: null,
    extra: { name: "USDC", version: "2" },
  };
}

async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) return next();

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];

  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      accepts: [makePaymentDetails(req)],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    });
  }

  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: paymentHeader, details: makePaymentDetails(req) }),
    });

    if (!verifyRes.ok) return res.status(402).json({ error: "Payment verification failed" });

    const result = await verifyRes.json();
    if (!result.isValid) return res.status(402).json({ error: "Invalid payment", details: result });

    req.x402Payment = paymentHeader;
    next();
  } catch (err) {
    console.error("Payment verification error:", err.message);
    return res.status(500).json({ error: "Payment verification service unavailable" });
  }
}

function settlePayment(req) {
  if (!req.x402Payment) return;
  fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: req.x402Payment, details: makePaymentDetails(req) }),
  }).catch(err => console.error("Settlement error:", err.message));
}

app.get("/", (req, res) => res.type("html").send(DOCS_HTML));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.post("/extract", upload.single("image"), x402PaymentCheck, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing required file: image" });

  const language = req.body.language || "eng";

  try {
    const w = await getWorker(language);
    const { data } = await w.recognize(req.file.buffer);

    settlePayment(req);

    res.json({
      text: data.text.trim(),
      confidence: Math.round(data.confidence * 100) / 100,
      language,
    });
  } catch (err) {
    console.error("OCR error:", err.message);
    return res.status(500).json({ error: "OCR processing failed", detail: err.message });
  }
});

// Pre-load worker then start
getWorker()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Pylon OCR API listening on 0.0.0.0:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize OCR worker:", err);
    // Start anyway, worker will init on first request
    app.listen(PORT, "0.0.0.0", () => console.log(`Pylon OCR API listening on 0.0.0.0:${PORT} (worker init deferred)`));
  });

process.on("SIGTERM", async () => {
  if (worker) await worker.terminate().catch(() => {});
  process.exit(0);
});
