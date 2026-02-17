const express = require("express");
const { mdToPdf } = require("md-to-pdf");

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "10000"; // $0.01 in USDC (6 decimals)
const NETWORK = "eip155:84532";

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon Markdown to PDF API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>📝 Pylon Markdown to PDF API <span class="badge">x402</span></h1>
<p>Convert Markdown to beautiful PDFs. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Convert Markdown</h2>
<pre>POST /convert
Content-Type: text/markdown

# Your Markdown Here
...</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Request Body</h2>
<p>Send raw Markdown as the request body with <code>Content-Type: text/markdown</code> or <code>text/plain</code>.</p>

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
app.use(express.text({ type: ["text/markdown", "text/plain", "application/octet-stream"], limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));

const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

function getPaymentDetails(resource) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: PRICE_AMOUNT,
    resource,
    description: "Convert Markdown to PDF",
    mimeType: "application/pdf",
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
      accepts: [getPaymentDetails(req.originalUrl)],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    });
  }

  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: paymentHeader, details: getPaymentDetails(req.originalUrl) }),
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
app.post("/convert", x402PaymentCheck, async (req, res) => {
  let markdown = typeof req.body === "string" ? req.body : (req.body && req.body.markdown) || "";
  if (!markdown || !markdown.trim()) {
    return res.status(400).json({ error: "Missing markdown content in request body" });
  }

  try {
    const pdf = await mdToPdf({ content: markdown }, {
      launch_options: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    });

    if (!pdf || !pdf.content) {
      return res.status(500).json({ error: "PDF generation returned empty result" });
    }

    settlePayment(req);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdf.content.length,
      "Content-Disposition": "attachment; filename=document.pdf",
    });
    res.send(pdf.content);
  } catch (err) {
    console.error("PDF conversion error:", err.message);
    res.status(500).json({ error: "Failed to convert markdown to PDF", detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon listening on 0.0.0.0:${PORT}`));
