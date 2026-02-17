const express = require("express");
const geoip = require("geoip-lite");

const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK = "eip155:84532";
const PRICE_AMOUNT = "2000";
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

const app = express();

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

async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) return next();
  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      accepts: [{
        scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT,
        resource: req.originalUrl, description: "IP geolocation lookup",
        mimeType: "application/json", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60,
        outputSchema: null, extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL, error: null,
    });
  }
  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: paymentHeader, details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "IP geolocation lookup", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } } }),
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: req.x402Payment, details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "IP geolocation lookup", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } } }),
  }).catch(err => console.error("Settlement error:", err.message));
}

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/stats", (req, res) => {
  res.json({ totalRequests, paidRequests, uptimeSeconds: Math.floor((Date.now() - startTime) / 1000), recentLogs: recentLogs.slice(-50) });
});

app.get("/lookup", x402PaymentCheck, (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: "Missing required parameter: ip" });

  // Basic IP validation
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) return res.status(400).json({ error: "Invalid IP address" });

  const geo = geoip.lookup(ip);
  if (!geo) return res.status(404).json({ error: "No geolocation data found for this IP", ip });

  settlePayment(req);
  res.json({
    ip,
    country: geo.country || null,
    region: geo.region || null,
    city: geo.city || null,
    latitude: geo.ll ? geo.ll[0] : null,
    longitude: geo.ll ? geo.ll[1] : null,
    timezone: geo.timezone || null,
  });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon IP Geo listening on 0.0.0.0:${PORT}`));
process.on("SIGTERM", () => process.exit(0));
