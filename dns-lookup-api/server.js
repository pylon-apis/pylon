const express = require("express");
const dns = require("dns").promises;

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
        resource: req.originalUrl, description: "DNS lookup",
        mimeType: "application/json", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60,
        outputSchema: null, extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL, error: null,
    });
  }
  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: paymentHeader, details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "DNS lookup", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } } }),
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
    body: JSON.stringify({ payload: req.x402Payment, details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "DNS lookup", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } } }),
  }).catch(err => console.error("Settlement error:", err.message));
}

const RECORD_TYPES = ["A", "AAAA", "MX", "CNAME", "TXT", "NS", "SOA", "SRV", "PTR"];

async function resolveSingle(domain, type) {
  try {
    switch (type) {
      case "A": return await dns.resolve4(domain);
      case "AAAA": return await dns.resolve6(domain);
      case "MX": return await dns.resolveMx(domain);
      case "CNAME": return await dns.resolveCname(domain);
      case "TXT": return (await dns.resolveTxt(domain)).map(r => r.join(""));
      case "NS": return await dns.resolveNs(domain);
      case "SOA": return await dns.resolveSoa(domain);
      case "SRV": return await dns.resolveSrv(domain);
      case "PTR": return await dns.resolvePtr(domain);
      default: throw new Error(`Unsupported type: ${type}`);
    }
  } catch (err) {
    if (err.code === "ENODATA" || err.code === "ENOTFOUND") return null;
    throw err;
  }
}

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/stats", (req, res) => {
  res.json({ totalRequests, paidRequests, uptimeSeconds: Math.floor((Date.now() - startTime) / 1000), recentLogs: recentLogs.slice(-50) });
});

app.get("/lookup", x402PaymentCheck, async (req, res) => {
  const { domain, type = "A" } = req.query;
  if (!domain) return res.status(400).json({ error: "Missing required parameter: domain" });

  const upperType = type.toUpperCase();
  if (upperType !== "ALL" && !RECORD_TYPES.includes(upperType)) {
    return res.status(400).json({ error: `Unsupported record type. Supported: ${RECORD_TYPES.join(", ")}, ALL` });
  }

  try {
    if (upperType === "ALL") {
      const records = {};
      await Promise.all(RECORD_TYPES.map(async (t) => {
        const result = await resolveSingle(domain, t);
        if (result !== null) records[t] = result;
      }));
      settlePayment(req);
      return res.json({ domain, type: "ALL", records, queriedAt: new Date().toISOString() });
    }

    const records = await resolveSingle(domain, upperType);
    if (records === null) return res.status(404).json({ error: `No ${upperType} records found for ${domain}` });

    settlePayment(req);
    res.json({ domain, type: upperType, records, queriedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "DNS lookup failed", detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon DNS Lookup listening on 0.0.0.0:${PORT}`));
process.on("SIGTERM", () => process.exit(0));
