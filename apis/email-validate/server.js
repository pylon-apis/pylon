const express = require("express");
const dns = require("dns").promises;

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "2000"; // $0.002 in USDC (6 decimals)
const NETWORK = "eip155:84532";

// Disposable email domains (common ones)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.net","tempmail.com","throwaway.email",
  "temp-mail.org","fakeinbox.com","sharklasers.com","guerrillamailblock.com","grr.la",
  "dispostable.com","yopmail.com","trashmail.com","trashmail.net","trashmail.org",
  "mailnesia.com","maildrop.cc","discard.email","mailcatch.com","tempail.com",
  "tempr.email","10minutemail.com","20minutemail.com","binkmail.com","suremail.info",
  "bugmenot.com","getnada.com","mailnator.com","spamgourmet.com","mytrashmail.com",
  "harakirimail.com","jetable.org","mailexpire.com","mailmoat.com","mailnull.com",
  "incognitomail.org","mintemail.com","nospam.ze.tc","trash-mail.com","safetymail.info",
  "spam4.me","spamfree24.org","filzmail.com","mailtemporaire.fr","lookugly.com",
  "emailondeck.com","instantemailaddress.com","objectmail.com","proxymail.eu",
  "rcpt.at","trash-mail.at","trashmail.me","wegwerfmail.de","wegwerfmail.net",
  "mohmal.com","crazymailing.com","tmail.ws","maildu.de","emailfake.com",
  "guerrillamail.info","guerrillamail.biz","guerrillamail.de","guerrillamail.org",
]);

// Free email providers
const FREE_PROVIDERS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com",
  "mail.com","zoho.com","protonmail.com","proton.me","yandex.com","yandex.ru",
  "gmx.com","gmx.net","live.com","msn.com","me.com","mac.com","inbox.com",
  "fastmail.com","tutanota.com","tuta.com","hey.com",
]);

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon Email Validate API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; } code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; margin-left: 8px; }
</style></head><body>
<h1>📧 Pylon Email Validate API <span class="badge">x402</span></h1>
<p>Validate email addresses instantly. Pay-per-request via <a href="https://x402.org">x402</a> — no API keys, no accounts.</p>

<h2>Validate an Email</h2>
<pre>GET /validate?email=user@example.com</pre>
<p><strong>Price:</strong> $0.002 per request (USDC on Base Sepolia)</p>

<h2>Parameters</h2>
<table>
<tr><th>Param</th><th>Default</th><th>Description</th></tr>
<tr><td><code>email</code></td><td><em>required</em></td><td>Email address to validate</td></tr>
</table>

<h2>Response</h2>
<pre>{
  "email": "user@example.com",
  "syntaxValid": true,
  "domainExists": true,
  "mxRecordsFound": true,
  "mxRecords": ["mx1.example.com", "mx2.example.com"],
  "isDisposable": false,
  "isFreeProvider": false,
  "verdict": "valid"
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
    maxAmountRequired: PRICE_AMOUNT,
    resource: req.originalUrl,
    description: "Validate an email address",
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.get("/validate", x402PaymentCheck, async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ error: "Missing required parameter: email" });

  const syntaxValid = EMAIL_REGEX.test(email);
  if (!syntaxValid) {
    settlePayment(req);
    return res.json({ email, syntaxValid: false, domainExists: false, mxRecordsFound: false, mxRecords: [], isDisposable: false, isFreeProvider: false, verdict: "invalid" });
  }

  const domain = email.split("@")[1].toLowerCase();
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isFreeProvider = FREE_PROVIDERS.has(domain);

  let domainExists = false;
  let mxRecordsFound = false;
  let mxRecords = [];

  try {
    const records = await dns.resolveMx(domain);
    if (records && records.length > 0) {
      domainExists = true;
      mxRecordsFound = true;
      mxRecords = records.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
    }
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      // Try resolving A record as fallback
      try {
        await dns.resolve4(domain);
        domainExists = true;
      } catch { /* domain doesn't exist */ }
    }
  }

  let verdict = "invalid";
  if (syntaxValid && mxRecordsFound && !isDisposable) verdict = "valid";
  else if (syntaxValid && mxRecordsFound && isDisposable) verdict = "disposable";
  else if (syntaxValid && domainExists && !mxRecordsFound) verdict = "no_mx";
  else if (syntaxValid && !domainExists) verdict = "domain_not_found";

  settlePayment(req);

  res.json({ email, syntaxValid, domainExists, mxRecordsFound, mxRecords, isDisposable, isFreeProvider, verdict });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon Email Validate API listening on 0.0.0.0:${PORT}`));
