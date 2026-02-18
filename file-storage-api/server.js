const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || "/data";
const FILES_DIR = path.join(DATA_DIR, "files");
const META_DIR = path.join(DATA_DIR, "meta");
const BASE_URL = process.env.BASE_URL || "https://pylon-file-storage-api.fly.dev";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const EXPIRY_DAYS = 30;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PRICE_AMOUNT = "5000"; // $0.005 in USDC (6 decimals)
const NETWORK = "eip155:8453"; // Base Mainnet
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";

// Ensure directories
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(META_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const app = express();
app.use(express.json({ limit: "1mb" }));

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
        description: "Upload a file and get a public URL",
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
          maxAmountRequired: PRICE_AMOUNT,
          resource: req.originalUrl,
          description: "Upload a file and get a public URL",
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
          description: "Upload a file and get a public URL",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 60,
          outputSchema: null,
          extra: { name: "USDC", version: "2" },
        },
      }),
    }).catch(err => console.error("Settlement error:", err.message));
  }
}

function generateId() {
  return crypto.randomBytes(12).toString("hex"); // 24 chars
}

function saveMeta(id, meta) {
  fs.writeFileSync(path.join(META_DIR, `${id}.json`), JSON.stringify(meta, null, 2));
}

function loadMeta(id) {
  const p = path.join(META_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function deleteMeta(id) {
  const p = path.join(META_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Free routes
app.get("/", (req, res) => {
  res.json({
    service: "Pylon File Storage API",
    version: "1.0.0",
    endpoints: {
      upload: "POST /upload",
      files: "GET /files/:id/:filename",
      health: "GET /health",
      delete: "DELETE /files/:id",
    },
    pricing: "$0.005 per upload via x402",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Serve files — no auth, URL is the access token
app.get("/files/:id/:filename", (req, res) => {
  const { id, filename } = req.params;
  const meta = loadMeta(id);
  if (!meta) return res.status(404).json({ error: "File not found" });

  // Check expiry
  if (new Date(meta.expiresAt) < new Date()) {
    // Clean up expired file
    const filePath = path.join(FILES_DIR, id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteMeta(id);
    return res.status(410).json({ error: "File has expired" });
  }

  const filePath = path.join(FILES_DIR, id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  res.set({
    "Content-Type": meta.contentType,
    "Content-Disposition": `inline; filename="${meta.filename}"`,
    "Cache-Control": "public, max-age=86400",
  });
  res.sendFile(filePath);
});

// Upload — payment required
app.post("/upload", x402PaymentCheck, upload.single("file"), async (req, res) => {
  try {
    let buffer, filename, contentType;

    if (req.file) {
      // Multipart upload
      buffer = req.file.buffer;
      filename = req.file.originalname || "upload";
      contentType = req.file.mimetype || mime.lookup(filename) || "application/octet-stream";
    } else if (req.body && req.body.url) {
      // URL fetch mode
      const { url, filename: reqFilename } = req.body;
      try {
        const fetchRes = await fetch(url, { timeout: 30000 });
        if (!fetchRes.ok) return res.status(400).json({ error: `Failed to fetch URL: ${fetchRes.status}` });

        const contentLength = fetchRes.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          return res.status(400).json({ error: "File exceeds 50MB limit" });
        }

        buffer = Buffer.from(await fetchRes.arrayBuffer());
        if (buffer.length > MAX_FILE_SIZE) {
          return res.status(400).json({ error: "File exceeds 50MB limit" });
        }

        filename = reqFilename || path.basename(new URL(url).pathname) || "download";
        contentType = fetchRes.headers.get("content-type") || mime.lookup(filename) || "application/octet-stream";
        // Strip charset etc from content-type
        contentType = contentType.split(";")[0].trim();
      } catch (err) {
        return res.status(400).json({ error: `Failed to fetch URL: ${err.message}` });
      }
    } else {
      return res.status(400).json({ error: "Provide a file upload or { url, filename } in JSON body" });
    }

    const id = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Save file
    fs.writeFileSync(path.join(FILES_DIR, id), buffer);

    // Save metadata
    const meta = {
      id,
      filename,
      size: buffer.length,
      contentType,
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    saveMeta(id, meta);

    settlePayment(req);

    res.json({
      id,
      url: `${BASE_URL}/files/${id}/${encodeURIComponent(filename)}`,
      filename,
      size: buffer.length,
      contentType,
      uploadedAt: meta.uploadedAt,
      expiresAt: meta.expiresAt,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed", detail: err.message });
  }
});

// Delete — requires test key
app.delete("/files/:id", (req, res) => {
  if (!TEST_BYPASS_KEY || req.headers["x-test-key"] !== TEST_BYPASS_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const meta = loadMeta(id);
  if (!meta) return res.status(404).json({ error: "File not found" });

  const filePath = path.join(FILES_DIR, id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  deleteMeta(id);

  res.json({ deleted: true, id });
});

// Periodic cleanup of expired files (every hour)
setInterval(() => {
  try {
    const metaFiles = fs.readdirSync(META_DIR).filter(f => f.endsWith(".json"));
    const now = new Date();
    let cleaned = 0;
    for (const mf of metaFiles) {
      const meta = JSON.parse(fs.readFileSync(path.join(META_DIR, mf), "utf-8"));
      if (new Date(meta.expiresAt) < now) {
        const id = mf.replace(".json", "");
        const filePath = path.join(FILES_DIR, id);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        fs.unlinkSync(path.join(META_DIR, mf));
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[cleanup] Removed ${cleaned} expired files`);
  } catch (err) {
    console.error("[cleanup] Error:", err.message);
  }
}, 60 * 60 * 1000);

app.listen(PORT, "0.0.0.0", () => console.log(`Pylon File Storage listening on 0.0.0.0:${PORT}`));
