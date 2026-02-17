const express = require("express");
const Papa = require("papaparse");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const yaml = require("js-yaml");

const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK = "eip155:84532";
const PRICE_AMOUNT = "2000";
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

const app = express();
app.use(express.json({ limit: "10mb" }));

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

async function x402PaymentCheck(req, res, next) {
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) return next();
  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      accepts: [{
        scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT,
        resource: req.originalUrl, description: "Convert data between formats",
        mimeType: "application/json", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60,
        outputSchema: null, extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL, error: null,
    });
  }
  try {
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "Convert data between formats", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } },
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: req.x402Payment, details: { scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_AMOUNT, resource: req.originalUrl, description: "Convert data between formats", payTo: WALLET_ADDRESS, maxTimeoutSeconds: 60, outputSchema: null, extra: { name: "USDC", version: "2" } } }),
  }).catch(err => console.error("Settlement error:", err.message));
}

const FORMATS = ["json", "csv", "xml", "yaml"];
const xmlParser = new XMLParser({ ignoreAttributes: false });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true });

function parseInput(input, from) {
  switch (from) {
    case "json": return JSON.parse(input);
    case "csv": { const r = Papa.parse(input, { header: true, dynamicTyping: true }); return r.data; }
    case "xml": return xmlParser.parse(input);
    case "yaml": return yaml.load(input);
    default: throw new Error(`Unsupported format: ${from}`);
  }
}

function formatOutput(data, to, options = {}) {
  switch (to) {
    case "json":
      if (options.minify) return JSON.stringify(data);
      return JSON.stringify(data, null, options.pretty !== false ? 2 : undefined);
    case "csv": {
      const arr = Array.isArray(data) ? data : [data];
      return Papa.unparse(arr);
    }
    case "xml": {
      const wrapped = Array.isArray(data) ? { root: { item: data } } : { root: data };
      return xmlBuilder.build(wrapped);
    }
    case "yaml": return yaml.dump(data);
    default: throw new Error(`Unsupported format: ${to}`);
  }
}

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/stats", (req, res) => {
  res.json({ totalRequests, paidRequests, uptimeSeconds: Math.floor((Date.now() - startTime) / 1000), recentLogs: recentLogs.slice(-50) });
});

app.post("/convert", x402PaymentCheck, (req, res) => {
  const { input, from, to, options } = req.body || {};
  if (!input) return res.status(400).json({ error: "Missing required field: input" });
  if (!from || !FORMATS.includes(from)) return res.status(400).json({ error: `Invalid 'from' format. Supported: ${FORMATS.join(", ")}` });
  if (!to || !FORMATS.includes(to)) return res.status(400).json({ error: `Invalid 'to' format. Supported: ${FORMATS.join(", ")}` });

  try {
    const parsed = parseInput(input, from);
    const output = formatOutput(parsed, to, options || {});
    settlePayment(req);
    res.json({ output, from, to, inputSize: input.length, outputSize: output.length });
  } catch (err) {
    res.status(400).json({ error: "Conversion failed", detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon Data Formatter listening on 0.0.0.0:${PORT}`));
process.on("SIGTERM", () => process.exit(0));
