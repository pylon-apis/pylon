const express = require("express");
const Database = require("better-sqlite3");
const { nanoid } = require("nanoid");

const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK = "eip155:8453"; // Base Mainnet
const PRICE_AMOUNT = "2000"; // $0.002 in USDC (6 decimals)
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

// SQLite setup
const db = new Database(process.env.DB_PATH || "/data/urls.db");
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS urls (
  id TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_clicked TEXT
)`);

const insertStmt = db.prepare("INSERT INTO urls (id, original_url, clicks, created_at) VALUES (?, ?, 0, ?)");
const getStmt = db.prepare("SELECT * FROM urls WHERE id = ?");
const clickStmt = db.prepare("UPDATE urls SET clicks = clicks + 1, last_clicked = ? WHERE id = ?");

const app = express();
app.use(express.json());

// Request logging
const startTime = Date.now();
let totalRequests = 0;
let paidRequests = 0;
const recentLogs = [];
const MAX_LOGS = 1000;

app.use((req, res, next) => {
  totalRequests++;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && (req.headers["x-payment"] || req.headers["payment-signature"])) paidRequests++;
    const entry = { timestamp: new Date().toISOString(), method: req.method, endpoint: req.originalUrl, status: res.statusCode };
    recentLogs.push(entry);
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
    console.log(`[req] ${entry.method} ${entry.endpoint} → ${entry.status}`);
  });
  next();
});

// x402 payment middleware
async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) return next();

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: NETWORK,
        amount: PRICE_AMOUNT, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        resource: req.originalUrl,
        description: "Shorten a URL",
        mimeType: "application/json",
        payTo: WALLET_ADDRESS,
        maxTimeoutSeconds: 60,
        outputSchema: null,
        extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    });
  }

  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        details: {
          scheme: "exact", network: NETWORK, amount: PRICE_AMOUNT, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          resource: req.originalUrl, description: "Shorten a URL",
          payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null,
          extra: { name: "USDC", version: "2" },
        },
      }),
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
    body: JSON.stringify({
      payload: req.x402Payment,
      details: {
        scheme: "exact", network: NETWORK, amount: PRICE_AMOUNT, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        resource: req.originalUrl, description: "Shorten a URL",
        payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null,
        extra: { name: "USDC", version: "2" },
      },
    }),
  }).catch(err => console.error("Settlement error:", err.message));
}

// Routes
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/stats", (req, res) => {
  res.json({ totalRequests, paidRequests, uptimeSeconds: Math.floor((Date.now() - startTime) / 1000), recentLogs: recentLogs.slice(-50) });
});

app.post("/shorten", x402PaymentCheck, (req, res) => {
  const { url, custom_slug } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing required field: url" });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "Invalid URL" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "URL must use http or https" });

  let id = custom_slug || nanoid(8);
  if (custom_slug) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(custom_slug)) return res.status(400).json({ error: "Invalid custom_slug. Use alphanumeric, hyphens, underscores (1-64 chars)" });
    if (getStmt.get(custom_slug)) return res.status(409).json({ error: "Slug already taken" });
  } else {
    while (getStmt.get(id)) id = nanoid(8);
  }

  const created_at = new Date().toISOString();
  insertStmt.run(id, url, created_at);
  settlePayment(req);

  res.json({
    id,
    short_url: `https://pylon-url-shortener-api.fly.dev/s/${id}`,
    original_url: url,
    created_at,
  });
});

app.get("/s/:id", (req, res) => {
  const row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Short URL not found" });
  clickStmt.run(new Date().toISOString(), req.params.id);
  res.redirect(302, row.original_url);
});

app.get("/stats/:id", (req, res) => {
  const row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Short URL not found" });
  res.json({ id: row.id, original_url: row.original_url, clicks: row.clicks, created_at: row.created_at, last_clicked: row.last_clicked });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon URL Shortener listening on 0.0.0.0:${PORT}`));
process.on("SIGTERM", () => { db.close(); process.exit(0); });
