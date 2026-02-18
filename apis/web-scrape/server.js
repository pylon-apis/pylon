const express = require("express");
const { PlaywrightCrawler, Configuration } = require("crawlee");
const TurndownService = require("turndown");
const robotsParser = require("robots-parser");

const PORT = process.env.PORT || 3000;
const SCRAPE_TIMEOUT = 30_000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_PER_SCRAPE = "$0.01";
const NETWORK = "eip155:8453"; // Base Mainnet
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

// ── Abuse Prevention ─────────────────────────────────────────────

// Rate limiting state (in-memory, resets on restart)
const walletMinute = new Map(); // wallet -> { count, resetAt }
const walletDay = new Map();    // wallet -> { count, resetAt }
const domainBurst = new Map();  // domain -> [timestamps]

const RATE_LIMIT_MINUTE = 30;
const RATE_LIMIT_DAY = 1000;
const BURST_THRESHOLD = 10;
const BURST_WINDOW_MS = 60_000;

function checkRateLimit(wallet, domain) {
  const now = Date.now();

  // Per-wallet per-minute
  if (wallet) {
    let wm = walletMinute.get(wallet);
    if (!wm || now > wm.resetAt) {
      wm = { count: 0, resetAt: now + 60_000 };
      walletMinute.set(wallet, wm);
    }
    if (++wm.count > RATE_LIMIT_MINUTE) {
      return "Rate limit exceeded: 30 requests/minute per wallet";
    }

    // Per-wallet per-day
    let wd = walletDay.get(wallet);
    if (!wd || now > wd.resetAt) {
      wd = { count: 0, resetAt: now + 86_400_000 };
      walletDay.set(wallet, wd);
    }
    if (++wd.count > RATE_LIMIT_DAY) {
      return "Rate limit exceeded: 1000 requests/day per wallet";
    }
  }

  // Burst detection per domain
  if (domain) {
    let timestamps = domainBurst.get(domain) || [];
    timestamps = timestamps.filter(t => now - t < BURST_WINDOW_MS);
    timestamps.push(now);
    domainBurst.set(domain, timestamps);
    if (timestamps.length > BURST_THRESHOLD) {
      return `Burst detected: too many requests to ${domain}. Throttled to 1/min.`;
    }
  }

  return null;
}

// SSRF domain blocklist
const BLOCKED_HOSTS = ["localhost", "0.0.0.0", "[::]", "[::1]", "metadata.google.internal"];
const BLOCKED_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, /^fc00:/i, /^fe80:/i,
];

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  return BLOCKED_HOSTS.includes(h) || BLOCKED_PATTERNS.some(p => p.test(h));
}

// PII stripping
function stripPII(text) {
  // SSN patterns: XXX-XX-XXXX
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN REDACTED]");
  // Credit card patterns: 13-19 digit sequences with optional separators
  text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      return "[CARD NUMBER REDACTED]";
    }
    return match;
  });
  return text;
}

function luhnCheck(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// robots.txt checking
const robotsCache = new Map(); // origin -> { robots, fetchedAt }
const ROBOTS_CACHE_TTL = 300_000; // 5 minutes

async function checkRobotsTxt(url) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const now = Date.now();

  let cached = robotsCache.get(origin);
  if (cached && now - cached.fetchedAt < ROBOTS_CACHE_TTL) {
    return cached.robots.isAllowed(url, "PylonScraper") !== false;
  }

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    const text = res.ok ? await res.text() : "";
    const robots = robotsParser(robotsUrl, text);
    robotsCache.set(origin, { robots, fetchedAt: now });
    return robots.isAllowed(url, "PylonScraper") !== false;
  } catch {
    // If we can't fetch robots.txt, allow
    return true;
  }
}

// ── Scraping ─────────────────────────────────────────────────────

// Disable Crawlee's default storage to avoid filesystem writes
Configuration.getGlobalConfig().set("persistStorage", false);

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

async function scrapeUrl(url, format = "markdown", waitFor = 0) {
  let result = null;
  let error = null;

  const crawler = new PlaywrightCrawler({
    headless: true,
    browserPoolOptions: {
      useFingerprints: false,
    },
    launchContext: {
      launchOptions: {
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    },
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: SCRAPE_TIMEOUT / 1000,
    maxConcurrency: 1,
    async requestHandler({ page }) {
      await page.waitForLoadState("load");

      if (waitFor > 0) {
        await page.waitForTimeout(Math.min(waitFor, 10000));
      }

      if (format === "html") {
        result = await page.content();
      } else {
        // Get the main content HTML
        const html = await page.evaluate(() => {
          // Try to get article/main content first
          const main = document.querySelector("article") ||
                       document.querySelector("main") ||
                       document.querySelector('[role="main"]') ||
                       document.body;
          return main.innerHTML;
        });

        if (format === "text") {
          result = await page.evaluate(() => {
            const main = document.querySelector("article") ||
                         document.querySelector("main") ||
                         document.querySelector('[role="main"]') ||
                         document.body;
            return main.innerText;
          });
        } else {
          // markdown (default)
          result = turndown.turndown(html);
        }
      }

      // Get metadata
      const meta = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || null,
        url: window.location.href,
      }));
      result = { content: result, metadata: meta };
    },
    failedRequestHandler({ request }, err) {
      error = err.message || String(err);
    },
  });

  await crawler.run([url]);

  if (error) throw new Error(error);
  if (!result) throw new Error("No content extracted");

  return result;
}

// ── Express App ──────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Request logging
const startTime = Date.now();
let totalRequests = 0;
let paidRequests = 0;

app.use((req, res, next) => {
  totalRequests++;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && (req.headers["x-payment"] || req.headers["payment-signature"])) {
      paidRequests++;
    }
    console.log(`[req] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`);
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
        maxAmountRequired: "10000", // $0.01 in USDC (6 decimals)
        resource: req.originalUrl,
        description: "Scrape and extract content from any URL",
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
          maxAmountRequired: "10000",
          resource: req.originalUrl,
          description: "Scrape and extract content from any URL",
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

function settlePayment(req) {
  if (!req.x402Payment) return;
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
        description: "Scrape and extract content from any URL",
        payTo: WALLET_ADDRESS,
        maxTimeoutSeconds: 60,
        outputSchema: null,
        extra: { name: "USDC", version: "2" },
      },
    }),
  }).catch(err => console.error("Settlement error:", err.message));
}

// ── Routes ───────────────────────────────────────────────────────

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon Web Scrape API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>🕸️ Pylon Web Scrape API <span class="badge">x402</span></h1>
<p>Extract readable content from any URL. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Scrape a URL</h2>
<pre>POST /scrape
Content-Type: application/json

{ "url": "https://example.com", "format": "markdown" }</pre>
<p><strong>Price:</strong> $0.01 per request (USDC on Base Sepolia)</p>

<h2>Parameters</h2>
<table>
<tr><th>Param</th><th>Default</th><th>Description</th></tr>
<tr><td><code>url</code></td><td><em>required</em></td><td>URL to scrape (http/https)</td></tr>
<tr><td><code>format</code></td><td>markdown</td><td>Output: markdown, text, or html</td></tr>
<tr><td><code>waitFor</code></td><td>0</td><td>Extra ms to wait after load (max 10000)</td></tr>
</table>

<h2>Response</h2>
<pre>{
  "content": "# Page Title\\n\\nExtracted content...",
  "metadata": {
    "title": "Page Title",
    "description": "Meta description",
    "url": "https://example.com"
  }
}</pre>

<h2>How to Pay</h2>
<p>Send a request without payment — you'll get a <code>402 Payment Required</code> response with payment instructions. Include payment in the <code>X-Payment</code> header and retry.</p>

<h2>Health Check</h2>
<pre>GET /health  <em>(free, no payment required)</em></pre>
</body></html>`;

app.get("/", (req, res) => {
  res.type("html").send(DOCS_HTML);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/stats", (req, res) => {
  res.json({ totalRequests, paidRequests, uptimeSeconds: Math.floor((Date.now() - startTime) / 1000) });
});

app.post("/scrape", x402PaymentCheck, async (req, res) => {
  const { url, format = "markdown", waitFor = 0 } = req.body || {};

  if (!url) return res.status(400).json({ error: "Missing required parameter: url" });

  // Validate URL
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "URL must use http or https" });
  }

  // SSRF check
  if (isBlockedHost(parsed.hostname)) {
    return res.status(400).json({ error: "URL points to a blocked internal address" });
  }

  // Validate format
  if (!["markdown", "text", "html"].includes(format)) {
    return res.status(400).json({ error: "format must be markdown, text, or html" });
  }

  // Rate limiting
  const wallet = req.headers["x-wallet-address"] || "anonymous";
  const rateLimitError = checkRateLimit(wallet, parsed.hostname);
  if (rateLimitError) {
    return res.status(429).json({ error: rateLimitError });
  }

  // robots.txt check
  try {
    const allowed = await checkRobotsTxt(url);
    if (!allowed) {
      return res.status(403).json({ error: "Blocked by robots.txt" });
    }
  } catch {
    // Continue if robots.txt check fails
  }

  // Scrape
  try {
    const result = await scrapeUrl(url, format, waitFor);

    // Strip PII from content
    if (typeof result.content === "string") {
      result.content = stripPII(result.content);
    }

    settlePayment(req);
    res.json(result);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("Timeout") || msg.includes("timeout")) {
      return res.status(504).json({ error: "Page load timed out" });
    }
    return res.status(502).json({ error: "Failed to scrape URL", detail: msg });
  }
});

// Start
app.listen(PORT, "0.0.0.0", () => console.log(`Pylon Web Scrape API listening on 0.0.0.0:${PORT}`));

process.on("SIGTERM", () => process.exit(0));
