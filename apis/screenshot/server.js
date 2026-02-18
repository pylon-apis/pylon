const express = require("express");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 3000;
const SCREENSHOT_TIMEOUT = 30_000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_PER_SCREENSHOT = "$0.01";
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
<html><head><meta charset="utf-8"><title>Pylon Screenshot API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>⚡ Pylon Screenshot API <span class="badge">x402</span></h1>
<p>Fast screenshots for the agent economy. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Take a Screenshot</h2>
<pre>GET /screenshot?url=https://example.com</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Parameters</h2>
<table>
<tr><th>Param</th><th>Default</th><th>Description</th></tr>
<tr><td><code>url</code></td><td><em>required</em></td><td>URL to screenshot (http/https)</td></tr>
<tr><td><code>width</code></td><td>1280</td><td>Viewport width in pixels</td></tr>
<tr><td><code>height</code></td><td>800</td><td>Viewport height in pixels</td></tr>
<tr><td><code>fullPage</code></td><td>false</td><td>Capture full scrollable page</td></tr>
<tr><td><code>format</code></td><td>png</td><td>Image format: png or jpeg</td></tr>
<tr><td><code>quality</code></td><td>80</td><td>JPEG quality (1-100, ignored for png)</td></tr>
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
  "https://pylon-screenshot-api.fly.dev/screenshot?url=https://example.com"
);
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync("screenshot.png", buf);</pre>

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

// x402 payment middleware — checks for X-Payment header, returns 402 if missing
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

async function x402PaymentCheck(req, res, next) {
  // Temporary test bypass
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) {
    return next();
  }

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];

  if (!paymentHeader) {
    // Return 402 with payment requirements
    const paymentRequirements = {
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: "10000", // $0.01 in USDC (6 decimals)
        resource: req.originalUrl,
        description: "Take a screenshot of any URL",
        mimeType: "image/png",
        payTo: WALLET_ADDRESS,
        maxTimeoutSeconds: 60,
        outputSchema: null,
        extra: {
          name: "USDC",
          version: "2",
        },
      }],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    };

    res.status(402).json(paymentRequirements);
    return;
  }

  // Verify payment with facilitator
  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        details: {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: "10000",
          resource: req.originalUrl,
          description: "Take a screenshot of any URL",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 60,
          outputSchema: null,
          extra: {
            name: "USDC",
            version: "2",
          },
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

    // Payment valid — settle after response
    req.x402Payment = paymentHeader;
    next();
  } catch (err) {
    console.error("Payment verification error:", err.message);
    return res.status(500).json({ error: "Payment verification service unavailable" });
  }
}

// Free routes
app.get("/", (req, res) => {
  res.type("html").send(DOCS_HTML);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Protected route — payment required
app.get("/screenshot", x402PaymentCheck, async (req, res) => {
  const { url, width, height, fullPage, format, quality } = req.query;

  if (!url) return res.status(400).json({ error: "Missing required parameter: url" });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
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

  const vw = Math.min(Math.max(parseInt(width) || 1280, 320), 3840);
  const vh = Math.min(Math.max(parseInt(height) || 800, 200), 2160);
  const full = fullPage === "true" || fullPage === "1";
  const fmt = format === "jpeg" ? "jpeg" : "png";
  const qual = fmt === "jpeg" ? Math.min(Math.max(parseInt(quality) || 80, 1), 100) : undefined;

  let context, page;
  try {
    const b = await getBrowser();
    context = await b.newContext({ viewport: { width: vw, height: vh } });
    page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: SCREENSHOT_TIMEOUT });

    const buf = await page.screenshot({ type: fmt, quality: qual, fullPage: full });

    // Settle payment after successful response
    if (req.x402Payment) {
      fetch(`${FACILITATOR_URL}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: req.x402Payment,
          details: {
            scheme: "exact",
            network: NETWORK,
            maxAmountRequired: "10000",
            resource: req.originalUrl,
            description: "Take a screenshot of any URL",
            payTo: WALLET_ADDRESS,
            maxTimeoutSeconds: 60,
            outputSchema: null,
            extra: { name: "USDC", version: "2" },
          },
        }),
      }).catch(err => console.error("Settlement error:", err.message));
    }

    res.set({
      "Content-Type": `image/${fmt}`,
      "Content-Length": buf.length,
      "Cache-Control": "public, max-age=300",
    });
    res.send(buf);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("Timeout") || msg.includes("timeout")) {
      return res.status(504).json({ error: "Page load timed out (30s limit)" });
    }
    return res.status(502).json({ error: "Failed to capture screenshot", detail: msg });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

// Pre-launch browser then start listening
getBrowser()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Pylon listening on 0.0.0.0:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to launch browser:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});
