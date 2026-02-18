const express = require("express");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 3000;
const PAGE_TIMEOUT = 30_000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "10000"; // $0.01 in USDC (6 decimals)
const NETWORK = "eip155:8453"; // Base Mainnet

let browser;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon HTML to PDF API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>📄 Pylon HTML to PDF API <span class="badge">x402</span></h1>
<p>Convert any webpage to PDF. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Convert a URL to PDF</h2>
<pre>GET /convert?url=https://example.com</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Parameters</h2>
<table>
<tr><th>Param</th><th>Default</th><th>Description</th></tr>
<tr><td><code>url</code></td><td><em>required</em></td><td>URL to convert (http/https)</td></tr>
<tr><td><code>format</code></td><td>letter</td><td>Page format: letter or a4</td></tr>
<tr><td><code>landscape</code></td><td>false</td><td>Landscape orientation (true/false)</td></tr>
</table>

<h2>How to Pay</h2>
<p>Send a request without payment — you'll get a <code>402 Payment Required</code> response with payment instructions in the headers. Include payment in the <code>X-Payment</code> header and retry. x402-compatible clients handle this automatically.</p>

<h2>Client Example (Node.js)</h2>
<pre>import { wrapFetch } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
const fetchWithPayment = wrapFetch(fetch, wallet);

const res = await fetchWithPayment(
  "https://pylon-html-to-pdf-api.fly.dev/convert?url=https://example.com"
);
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync("output.pdf", buf);</pre>

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
    maxAmountRequired: PRICE_AMOUNT,
    resource: req.originalUrl,
    description: "Convert a webpage to PDF",
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

app.get("/convert", x402PaymentCheck, async (req, res) => {
  const { url, format, landscape } = req.query;

  if (!url) return res.status(400).json({ error: "Missing required parameter: url" });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "Invalid URL" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "URL must use http or https" });
  }

  // SSRF protection — block internal/private IPs and metadata endpoints
  const hostname = parsed.hostname.toLowerCase();
  const blockedHosts = ["localhost", "0.0.0.0", "[::]", "[::1]", "metadata.google.internal"];
  const blockedPatterns = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, /^fc00:/i, /^fe80:/i,
  ];
  if (blockedHosts.includes(hostname) || blockedPatterns.some(p => p.test(hostname))) {
    return res.status(400).json({ error: "URL points to a blocked internal address" });
  }

  const pageFormat = format === "a4" ? "A4" : "Letter";
  const isLandscape = landscape === "true" || landscape === "1";

  let context, page;
  try {
    const b = await getBrowser();
    context = await b.newContext();
    page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT });

    const buf = await page.pdf({
      format: pageFormat,
      landscape: isLandscape,
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });

    settlePayment(req);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": buf.length,
      "Content-Disposition": `inline; filename="page.pdf"`,
      "Cache-Control": "public, max-age=300",
    });
    res.send(buf);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("Timeout") || msg.includes("timeout")) {
      return res.status(504).json({ error: "Page load timed out (30s limit)" });
    }
    return res.status(502).json({ error: "Failed to convert to PDF", detail: msg });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

getBrowser()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Pylon HTML to PDF API listening on 0.0.0.0:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to launch browser:", err);
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});
