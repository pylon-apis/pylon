const express = require("express");
const puppeteer = require("puppeteer");
const Handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "20000"; // $0.02 in USDC (6 decimals)
const NETWORK = "eip155:84532";
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

// Handlebars helpers
Handlebars.registerHelper("formatPrice", (val) => {
  return Number(val).toFixed(2);
});
Handlebars.registerHelper("multiply", (a, b) => {
  return a * b;
});

// Load templates
const TEMPLATES_DIR = path.join(__dirname, "templates");
const templates = {};
const templateMeta = {
  invoice: {
    name: "Invoice",
    description: "Professional invoice with line items, totals, and dates",
    fields: {
      company: { type: "string", required: true, description: "Your company name" },
      to: { type: "string", required: true, description: "Bill to (recipient)" },
      items: { type: "array", required: true, description: "Line items: [{name, qty, price}]" },
      total: { type: "number", required: true, description: "Total amount" },
      due_date: { type: "string", required: true, description: "Due date" },
      invoice_number: { type: "string", required: true, description: "Invoice number" },
      notes: { type: "string", required: false, description: "Optional notes" },
    },
  },
  receipt: {
    name: "Receipt",
    description: "Simple transaction receipt",
    fields: {
      merchant: { type: "string", required: true, description: "Merchant name" },
      items: { type: "array", required: true, description: "Items: [{name, price, qty?}]" },
      total: { type: "number", required: true, description: "Total amount" },
      date: { type: "string", required: true, description: "Transaction date" },
      transaction_id: { type: "string", required: true, description: "Transaction ID" },
    },
  },
  report: {
    name: "Report",
    description: "Business report with title and sections",
    fields: {
      title: { type: "string", required: true, description: "Report title" },
      author: { type: "string", required: false, description: "Author name" },
      date: { type: "string", required: false, description: "Report date" },
      sections: { type: "array", required: true, description: "Sections: [{heading, content}]" },
    },
  },
  letter: {
    name: "Letter",
    description: "Formal letter",
    fields: {
      from: { type: "string", required: true, description: "Sender name/address" },
      to: { type: "string", required: true, description: "Recipient name/address" },
      date: { type: "string", required: true, description: "Date" },
      subject: { type: "string", required: false, description: "Subject line" },
      body: { type: "string", required: true, description: "Letter body text" },
      signature: { type: "string", required: true, description: "Signature name" },
    },
  },
};

for (const name of Object.keys(templateMeta)) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.html`), "utf-8");
  templates[name] = Handlebars.compile(html);
}

let browser;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }
  return browser;
}

const app = express();
app.use(express.json({ limit: "5mb" }));

// ── Request Logging ──────────────────────────────────────────────
const startTime = Date.now();
let totalRequests = 0;
let paidRequests = 0;
const recentLogs = [];
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
        maxAmountRequired: PRICE_AMOUNT,
        resource: req.originalUrl,
        description: "Generate a professional PDF document",
        mimeType: "application/pdf",
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
          maxAmountRequired: PRICE_AMOUNT,
          resource: req.originalUrl,
          description: "Generate a professional PDF document",
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
  if (req.x402Payment) {
    fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: req.x402Payment,
        details: {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: PRICE_AMOUNT,
          resource: req.originalUrl,
          description: "Generate a professional PDF document",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 60,
          outputSchema: null,
          extra: { name: "USDC", version: "2" },
        },
      }),
    }).catch(err => console.error("Settlement error:", err.message));
  }
}

// Free routes
app.get("/", (req, res) => {
  res.json({
    service: "Pylon Document Generation API",
    version: "1.0.0",
    endpoints: {
      generate: "POST /generate",
      templates: "GET /templates",
      health: "GET /health",
    },
    pricing: "$0.02 per document via x402",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/templates", (req, res) => {
  const result = {};
  for (const [name, meta] of Object.entries(templateMeta)) {
    result[name] = meta;
  }
  res.json(result);
});

// Generate document — payment required
app.post("/generate", x402PaymentCheck, async (req, res) => {
  const { template, data, custom_html } = req.body;

  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing 'data' object in request body" });
  }

  let html;
  if (custom_html) {
    // Custom HTML mode
    try {
      const compiled = Handlebars.compile(custom_html);
      html = compiled(data);
    } catch (err) {
      return res.status(400).json({ error: "Invalid custom HTML template", detail: err.message });
    }
  } else if (template) {
    if (!templates[template]) {
      return res.status(400).json({
        error: `Unknown template: ${template}`,
        available: Object.keys(templates),
      });
    }
    try {
      html = templates[template](data);
    } catch (err) {
      return res.status(400).json({ error: "Template rendering failed", detail: err.message });
    }
  } else {
    return res.status(400).json({ error: "Provide 'template' name or 'custom_html'" });
  }

  let page;
  try {
    console.log("[generate] Getting browser...");
    const b = await getBrowser();
    console.log("[generate] Creating page...");
    page = await b.newPage();
    console.log("[generate] Setting content...");
    await page.setContent(html, { waitUntil: "load", timeout: 10000 });
    console.log("[generate] Generating PDF...");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      timeout: 15000,
    });

    settlePayment(req);

    const pdfBuffer = Buffer.from(pdf);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="${template || "document"}.pdf"`,
    });
    res.end(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed", detail: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Start server immediately, browser launches lazily on first request
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pylon Doc Gen listening on 0.0.0.0:${PORT}`);
  // Pre-warm browser in background
  getBrowser().then(() => console.log("Browser pre-warmed")).catch(err => console.error("Browser pre-warm failed:", err.message));
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});
