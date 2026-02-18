const express = require("express");
const { readFileSync } = require("fs");
const { join } = require("path");
const { wrapWithReliability, getCircuitState, getStatusData } = require("./reliability");
const { logUsage, getUsage, getUsageByCapability, getSpendOverTime } = require("./usage");
const { discoverForTask, activateDiscovered, getActiveDiscovered, isDiscovered, callDiscoveredBackend } = require("./discovery");

const PORT = process.env.PORT || 3000;

// Payment config
const WALLET_ADDRESS = "0xAd7658F913F50EAd66a8871d076C675294265Ff7";
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK = "eip155:8453"; // Base Mainnet
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || "";
const BACKEND_BYPASS_KEY = process.env.BACKEND_BYPASS_KEY || "";

// Load capabilities registry
const capabilities = JSON.parse(
  readFileSync(join(__dirname, "capabilities.json"), "utf8")
);

const { mountOrchestrator, looksLikeChain } = require("./orchestrator");

const app = express();
app.use(express.json({ limit: "10mb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// CORS — restrict to Pylon domains + localhost dev
const ALLOWED_ORIGINS = [
  "https://pylonapi.com",
  "https://www.pylonapi.com",
  "https://pylon-website.fly.dev",
  "http://localhost:3000",
  "http://localhost:8080",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-wallet-address, x-payment, x-test-key, payment-signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Gateway rate limiting — 60 req/min per IP
const gatewayRateLimits = new Map();
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/status" || req.method === "OPTIONS") return next();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const now = Date.now();
  const window = 60_000;
  const maxRequests = 60;
  
  let bucket = gatewayRateLimits.get(ip);
  if (!bucket || now - bucket.windowStart > window) {
    bucket = { windowStart: now, count: 0 };
    gatewayRateLimits.set(ip, bucket);
  }
  bucket.count++;
  
  if (bucket.count > maxRequests) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Max 60/minute." });
  }
  
  // Clean old entries every 100 requests
  if (Math.random() < 0.01) {
    for (const [k, v] of gatewayRateLimits) {
      if (now - v.windowStart > window * 2) gatewayRateLimits.delete(k);
    }
  }
  next();
});

// ── Status API cache for reliability data ──
let _statusCache = null;
let _statusCacheTime = 0;
const STATUS_CACHE_TTL = 60_000; // 1 minute

async function fetchStatusData() {
  const now = Date.now();
  if (_statusCache && now - _statusCacheTime < STATUS_CACHE_TTL) return _statusCache;
  try {
    const resp = await fetch("https://pylon-status-api.fly.dev/status", { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      _statusCache = await resp.json();
      _statusCacheTime = now;
    }
  } catch (e) {
    // Silently fail — reliability data is optional
  }
  return _statusCache;
}

// ── Health check ──
app.get("/health", (req, res) => res.json({ status: "ok", capabilities: capabilities.length }));

// ── Providers listing ──
app.get("/providers", (req, res) => {
  const providers = {};
  for (const cap of capabilities) {
    if (!cap.external || !cap.provider) continue;
    const name = cap.provider.name;
    if (!providers[name]) {
      providers[name] = {
        name,
        url: cap.provider.url,
        capabilities: [],
      };
    }
    providers[name].capabilities.push({
      id: cap.id,
      name: cap.name,
      description: cap.description,
      cost: cap.cost,
    });
  }
  res.json({
    providers: Object.values(providers),
    total: Object.keys(providers).length,
  });
});

// ── MCP tool definitions ──
app.get("/mcp", (req, res) => {
  const tools = capabilities.map(cap => ({
    name: cap.id,
    description: cap.description,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(cap.inputSchema).map(([key, schema]) => [
          key,
          {
            type: schema.type || "string",
            description: schema.description || key,
            ...(schema.default !== undefined ? { default: schema.default } : {}),
          },
        ])
      ),
      required: Object.entries(cap.inputSchema)
        .filter(([, s]) => s.required)
        .map(([k]) => k),
    },
  }));

  const mcpConfig = {
    name: "pylon-gateway",
    description: "Pylon Agent Gateway — pay-per-request APIs via x402. One endpoint for every tool an agent needs.",
    version: "1.0.0",
    url: "https://api.pylonapi.com/do",
    tools,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(mcpConfig, null, 2));
});

// ── Capabilities discovery ──
app.get("/capabilities", async (req, res) => {
  const statusData = await fetchStatusData();
  const reliabilityMap = {};
  if (statusData?.services) {
    for (const svc of statusData.services) {
      reliabilityMap[svc.id] = {
        uptime24h: svc.uptime24h,
        avgLatencyMs: svc.latencyMs,
        status: svc.status,
      };
    }
  }

  const summary = capabilities.map(c => {
    const base = {
      id: c.id,
      name: c.name,
      description: c.description,
      cost: c.cost,
      inputSchema: c.inputSchema,
      outputType: c.outputType,
    };
    if (reliabilityMap[c.id]) base.reliability = reliabilityMap[c.id];
    base.circuitState = getCircuitState(c.id);
    return base;
  });
  const payload = {
    version: "1.0",
    gateway: "Pylon Agent Gateway",
    description: "One endpoint for every tool an agent needs. Describe what you want, set a budget, get a result.",
    capabilities: summary,
    endpoints: {
      do: "POST /do — execute a task by description",
      capabilities: "GET /capabilities — list available tools",
    },
  };
  // Pretty-print for browsers, compact for programmatic access
  const accept = req.headers.accept || "";
  const indent = accept.includes("text/html") ? 2 : 2; // always pretty for now
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload, null, indent));
});

// ── Task matching ──
function matchTask(taskDescription) {
  const task = taskDescription.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const cap of capabilities) {
    let score = 0;

    // Check keyword matches
    for (const keyword of cap.keywords) {
      if (task.includes(keyword.toLowerCase())) {
        // Longer keyword matches are worth more
        score += keyword.length;
      }
    }

    // Check if capability name appears in task
    if (task.includes(cap.name.toLowerCase())) {
      score += 10;
    }

    // Check ID match
    if (task.includes(cap.id)) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cap;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

// ── Extract parameters from task description ──
function extractParams(task, capability) {
  const params = {};

  // URL extraction
  const urlMatch = task.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    let assigned = false;
    // Figure out which field wants a URL
    for (const [key, schema] of Object.entries(capability.inputSchema)) {
      if (key === "url" || schema.description?.toLowerCase().includes("url")) {
        params[key] = urlMatch[0];
        assigned = true;
        break;
      }
    }
    // If no URL field, try "data" field (e.g., QR code)
    if (!assigned && capability.inputSchema.data) {
      params.data = urlMatch[0];
    }
  }

  // Email extraction
  const emailMatch = task.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    for (const [key, schema] of Object.entries(capability.inputSchema)) {
      if (key === "email" || schema.description?.toLowerCase().includes("email")) {
        params[key] = emailMatch[0];
        break;
      }
    }
  }

  // Domain extraction
  const domainMatch = task.match(/\b([a-zA-Z0-9-]+\.(?:com|org|net|io|ai|dev|co|app|xyz|me|info|tech|gg|tv))\b/i);
  if (domainMatch) {
    for (const [key, schema] of Object.entries(capability.inputSchema)) {
      if (key === "domain" || schema.description?.toLowerCase().includes("domain")) {
        params[key] = domainMatch[1];
        break;
      }
    }
    // Also use as URL if no explicit URL and capability needs one
    if (!urlMatch && capability.inputSchema.url && !params.url) {
      params.url = `https://${domainMatch[1]}`;
    }
  }

  // Dimension extraction (width/height)
  const dimMatch = task.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (dimMatch) {
    if (capability.inputSchema.width) params.width = parseInt(dimMatch[1]);
    if (capability.inputSchema.height) params.height = parseInt(dimMatch[2]);
  }

  // Size extraction
  const sizeMatch = task.match(/(\d+)\s*(?:px|pixels?)/i);
  if (sizeMatch && capability.inputSchema.size) {
    params.size = parseInt(sizeMatch[1]);
  }

  // Full page flag
  if (/full\s*page/i.test(task) && capability.inputSchema.fullPage) {
    params.fullPage = true;
  }

  // Format extraction
  const formatMatch = task.match(/\b(png|jpe?g|webp|pdf)\b/i);
  if (formatMatch && capability.inputSchema.format) {
    params.format = formatMatch[1].toLowerCase();
  }

  return params;
}

// ── Payment replay protection ──
const paymentNonces = new Map(); // hash -> timestamp
const NONCE_TTL = 300_000; // 5 minutes
function isReplayedPayment(paymentHeader) {
  // Simple hash of payment header
  const hash = require("crypto").createHash("sha256").update(paymentHeader).digest("hex").slice(0, 16);
  const now = Date.now();
  // Clean old nonces periodically
  if (Math.random() < 0.01) {
    for (const [k, t] of paymentNonces) {
      if (now - t > NONCE_TTL) paymentNonces.delete(k);
    }
  }
  if (paymentNonces.has(hash)) return true;
  paymentNonces.set(hash, now);
  return false;
}

// ── x402 payment check ──
async function x402PaymentCheck(req, res, next) {
  // Test bypass — restricted to internal/known IPs only
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    const ALLOWED_TEST_IPS = (process.env.ALLOWED_TEST_IPS || "127.0.0.1,::1").split(",");
    const isInternal = ALLOWED_TEST_IPS.includes(ip) || ip.startsWith("fdaa:") /* Fly internal */;
    if (isInternal) return next();
    // Key matched but IP not allowed — don't reveal key exists, just fall through to payment
  }

  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];

  if (!paymentHeader) {
    // Estimate cost from task or use max
    const estimatedCost = req._estimatedCost || "$0.05";
    const costInMicro = Math.round(parseFloat(estimatedCost.replace("$", "")) * 1_000_000);

    const paymentRequirements = {
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: NETWORK,
        amount: String(costInMicro), asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        resource: "/do",
        description: "Pylon Agent Gateway — execute any task",
        mimeType: "application/json",
        payTo: WALLET_ADDRESS,
        maxTimeoutSeconds: 60,
        outputSchema: null,
        extra: { name: "USDC", version: "2" },
      }],
      facilitatorUrl: FACILITATOR_URL,
      error: null,
    };

    res.status(402).json(paymentRequirements);
    return;
  }

  // Check for payment replay
  if (isReplayedPayment(paymentHeader)) {
    return res.status(402).json({ error: "Payment already used. Submit a new payment." });
  }

  // Verify payment with facilitator
  try {
    const estimatedCost = req._estimatedCost || "$0.05";
    const verifyCostMicro = Math.round(parseFloat(estimatedCost.replace("$", "")) * 1_000_000);
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        details: {
          scheme: "exact",
          network: NETWORK,
          amount: String(verifyCostMicro), asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          resource: "/do",
          description: "Pylon Agent Gateway",
          mimeType: "application/json",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 60,
          outputSchema: null,
          extra: { name: "USDC", version: "2" },
        },
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.text();
      return res.status(402).json({ error: "Payment verification failed", details: err });
    }

    req._paymentVerified = true;
    req._paymentPayload = paymentHeader;
    next();
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
}

// ── Call backend API ──
async function callBackend(capability, params) {
  const headers = {};

  // Use bypass key so we don't double-pay x402 on the backend
  if (BACKEND_BYPASS_KEY) {
    headers["x-test-key"] = BACKEND_BYPASS_KEY;
  }

  const startTime = Date.now();
  // Route to providerEndpoint for external capabilities
  let url = (capability.external && capability.providerEndpoint) ? capability.providerEndpoint : capability.endpoint;
  const opts = { method: capability.method, headers };

  if (capability.method === "GET") {
    // Pass params as query string
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  } else {
    // POST with JSON body
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(params);
  }

  const resp = await fetch(url, opts);

  const durationMs = Date.now() - startTime;

  if (!resp.ok) {
    // If we get a 402 from backend (bypass key not set), flag it
    if (resp.status === 402) {
      return {
        error: "backend_payment_required",
        message: "Backend requires payment — gateway bypass key not configured",
        status: 402,
      };
    }
    const errText = await resp.text();
    return { error: "backend_error", message: errText, status: resp.status };
  }

  const contentType = resp.headers.get("content-type") || "";

  const backendStatus = resp.status;

  if (contentType.includes("application/json")) {
    const data = await resp.json();
    return { success: true, data, contentType: "application/json", durationMs, backendStatus };
  } else if (contentType.includes("image/") || contentType.includes("application/pdf")) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    return {
      success: true,
      data: {
        base64: buffer.toString("base64"),
        contentType,
        sizeBytes: buffer.length,
      },
      contentType,
      durationMs,
      backendStatus,
    };
  } else {
    const text = await resp.text();
    return { success: true, data: { text }, contentType: "text/plain", durationMs, backendStatus };
  }
}

// ── Reliability layer: wrap callBackend per capability ──
const reliableCallBackend = {};
for (const cap of capabilities) {
  reliableCallBackend[cap.id] = wrapWithReliability(cap.id, callBackend);
}

// ── Status endpoint ──
app.get("/status", (req, res) => {
  const capIds = capabilities.map(c => c.id);
  res.json({
    gateway: "Pylon Agent Gateway",
    timestamp: new Date().toISOString(),
    capabilities: getStatusData(capIds),
  });
});

// ── Main /do endpoint ──
app.post("/do", async (req, res, next) => {
  const reqStartTime = Date.now();
  const { task, params: explicitParams, budget, capability: explicitCapability } = req.body;

  if (!task && !explicitCapability) {
    return res.status(400).json({
      error: "missing_task",
      message: 'Provide a "task" (natural language) or "capability" (capability ID) in the request body.',
      example: { task: "take a screenshot of https://example.com" },
      available_capabilities: capabilities.map(c => c.id),
    });
  }

  // Detect multi-step tasks — flag it but still try single-step execution
  const multiStepHint = (task && !explicitCapability && looksLikeChain(task))
    ? { hint: "This task may benefit from POST /do/chain for multi-step orchestration", chainEndpoint: "/do/chain" }
    : null;

  // Match task to capability (native + partner + active discovered)
  let matched;
  let matchSource = "native"; // native | partner | discovered

  if (explicitCapability) {
    matched = capabilities.find(c => c.id === explicitCapability);
    // Also check active discovered capabilities
    if (!matched) {
      const discovered = getActiveDiscovered().find(c => c.id === explicitCapability);
      if (discovered) { matched = discovered; matchSource = "discovered"; }
    }
    if (!matched) {
      return res.status(404).json({
        error: "unknown_capability",
        message: `Capability "${explicitCapability}" not found.`,
        available: [...capabilities.map(c => c.id), ...getActiveDiscovered().map(c => c.id)],
      });
    }
  } else {
    matched = matchTask(task);
    // Also try matching against active discovered capabilities
    if (!matched) {
      const discovered = getActiveDiscovered();
      for (const cap of discovered) {
        const t = task.toLowerCase();
        const nameMatch = cap.name && t.includes(cap.name.toLowerCase());
        const keywordMatch = cap.keywords?.some(k => t.includes(k));
        if (nameMatch || keywordMatch) { matched = cap; matchSource = "discovered"; break; }
      }
    }

    // If still no match, try discovering from the bazaar
    if (!matched) {
      try {
        const discovery = await discoverForTask(task);
        if (discovery.found && discovery.capabilities.length > 0) {
          // Auto-activate the best match and return discovery info
          const bestMatch = discovery.capabilities[0];
          const activated = activateDiscovered(bestMatch);
          matched = activated;
          matchSource = "discovered";
          console.log(`[discovery] Auto-matched task to discovered service: ${activated.id}`);
        }
      } catch (err) {
        console.error(`[discovery] Discovery failed: ${err.message}`);
      }
    }

    if (!matched) {
      return res.status(404).json({
        error: "no_matching_capability",
        message: "Could not match your task to any available capability, and no matching services found on the x402 bazaar.",
        task,
        available: capabilities.map(c => ({ id: c.id, description: c.description })),
      });
    }
  }

  // Determine source tier
  if (matchSource === "native" && matched.external && matched.provider) {
    matchSource = "partner";
  }

  // Check budget
  const costNum = parseFloat(matched.cost.replace("$", ""));
  if (budget) {
    const budgetNum = parseFloat(String(budget).replace("$", ""));
    if (costNum > budgetNum) {
      return res.status(400).json({
        error: "over_budget",
        message: `This task costs ${matched.cost} but your budget is $${budgetNum.toFixed(3)}.`,
        capability: matched.id,
        cost: matched.cost,
      });
    }
  }

  // Set estimated cost for payment middleware
  req._estimatedCost = matched.cost;

  // Run payment check
  x402PaymentCheck(req, res, async () => {
    // Extract params from natural language or use explicit params
    let finalParams;
    if (explicitParams) {
      finalParams = explicitParams;
    } else {
      finalParams = extractParams(task, matched);
    }

    // Validate required fields
    const missing = [];
    for (const [key, schema] of Object.entries(matched.inputSchema)) {
      if (schema.required && !finalParams[key]) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        error: "missing_params",
        message: `Could not extract required parameter(s) from your task: ${missing.join(", ")}. Provide them in "params" or include them in your task description.`,
        capability: matched.id,
        required: missing,
        inputSchema: matched.inputSchema,
        extracted: finalParams,
      });
    }

    // Apply defaults
    for (const [key, schema] of Object.entries(matched.inputSchema)) {
      if (finalParams[key] === undefined && schema.default !== undefined) {
        finalParams[key] = schema.default;
      }
    }

    // Call backend
    try {
      let result;
      if (matchSource === "discovered") {
        result = await callDiscoveredBackend(matched, finalParams);
      } else {
        const reliableCall = reliableCallBackend[matched.id] || callBackend;
        result = await reliableCall(matched, finalParams);
      }

      if (result.error) {
        return res.status(result.status || 500).json({
          error: result.error,
          message: result.message,
          capability: matched.id,
          ...(result._retries !== undefined ? { retries: result._retries } : {}),
        });
      }

      // Log provider payout for external capabilities
      if (matched.external && matched.provider) {
        const costNum = parseFloat(matched.cost.replace("$", ""));
        const split = matched.revenueSplit || { provider: 0.85, pylon: 0.15 };
        const providerAmount = (costNum * split.provider).toFixed(6);
        const pylonAmount = (costNum * split.pylon).toFixed(6);
        console.log(`💰 Provider payout owed: $${providerAmount} to ${matched.provider.name} (${matched.provider.wallet}) | Pylon keeps: $${pylonAmount}`);
      }

      const totalDurationMs = Date.now() - reqStartTime;
      const backendResponseMs = result.durationMs;
      const gatewayOverheadMs = totalDurationMs - backendResponseMs;

      // Log usage
      const walletAddr = req.headers["x-wallet-address"] || req._paymentPayload || "anonymous";
      logUsage(walletAddr, matched.id, matched.cost, true, totalDurationMs);

      const responsePayload = {
        success: true,
        capability: {
          id: matched.id,
          name: matched.name,
          cost: matched.cost,
          source: matchSource,
        },
        params: finalParams,
        result: result.data,
        meta: {
          contentType: result.contentType,
          durationMs: totalDurationMs,
          gateway: "pylon",
          version: "1.0",
          retries: result._retries || 0,
          quality: {
            backendStatus: result.backendStatus,
            backendResponseMs,
            gatewayOverheadMs,
          },
        },
        ...(multiStepHint ? { multiStepHint } : {}),
      };

      // Transparent pricing for discovered services
      if (matchSource === "discovered" && matched.providerCost) {
        responsePayload.pricing = {
          source: "discovered",
          provider: matched.provider?.name || "unknown",
          providerCost: matched.providerCost,
          pylonFee: matched.pylonFee,
          totalCost: matched.cost,
          note: "This capability was discovered from the x402 bazaar. Pylon adds routing, reliability, and discovery.",
        };
      }

      res.json(responsePayload);
    } catch (err) {
      console.error("Backend call failed:", err);
      const walletAddr = req.headers["x-wallet-address"] || "anonymous";
      logUsage(walletAddr, matched.id, matched.cost, false, Date.now() - reqStartTime);
      res.status(502).json({
        error: "backend_unavailable",
        message: `Failed to reach ${matched.name} backend: ${err.message}`,
        capability: matched.id,
      });
    }
  });
});

// ── Discovery API ──
app.get("/discover", async (req, res) => {
  const query = req.query.q || req.query.query;
  if (!query) {
    return res.status(400).json({
      error: "missing_query",
      message: 'Provide a search query: /discover?q=email+sending',
    });
  }

  try {
    const discovery = await discoverForTask(query);
    res.json({
      query,
      ...discovery,
      nativeCapabilities: capabilities
        .filter(c => c.name.toLowerCase().includes(query.toLowerCase()) ||
                     c.description.toLowerCase().includes(query.toLowerCase()))
        .map(c => ({ id: c.id, name: c.name, description: c.description, cost: c.cost, source: c.external ? "partner" : "native" })),
    });
  } catch (err) {
    res.status(500).json({ error: "discovery_failed", message: err.message });
  }
});

// ── Usage API (requires test key or payment proof) ──
function usageAuth(req, res, next) {
  // Only allow usage queries from test key holders or with valid wallet self-query
  if (TEST_BYPASS_KEY && req.headers["x-test-key"] === TEST_BYPASS_KEY) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    const ALLOWED_TEST_IPS = (process.env.ALLOWED_TEST_IPS || "127.0.0.1,::1").split(",");
    if (ALLOWED_TEST_IPS.includes(ip) || ip.startsWith("fdaa:")) return next();
  }
  // For public access, wallet must come from x-wallet-address header (self-query only)
  const headerWallet = req.headers["x-wallet-address"];
  const queryWallet = req.query.wallet;
  if (!headerWallet) {
    return res.status(401).json({ error: "Authentication required. Provide x-wallet-address header." });
  }
  // Can only query your own wallet
  if (queryWallet && queryWallet.toLowerCase() !== headerWallet.toLowerCase()) {
    return res.status(403).json({ error: "Can only query your own wallet usage." });
  }
  req.query.wallet = headerWallet; // Force to own wallet
  next();
}

app.get("/usage", usageAuth, (req, res) => {
  const wallet = req.query.wallet || req.headers["x-wallet-address"];
  if (!wallet) return res.status(400).json({ error: "wallet required" });
  const stats = getUsage(wallet, { from: req.query.from, to: req.query.to });
  res.json(stats);
});

app.get("/usage/capabilities", usageAuth, (req, res) => {
  const wallet = req.query.wallet || req.headers["x-wallet-address"];
  if (!wallet) return res.status(400).json({ error: "wallet required" });
  const breakdown = getUsageByCapability(wallet, { from: req.query.from, to: req.query.to });
  res.json(breakdown);
});

app.get("/usage/timeline", usageAuth, (req, res) => {
  const wallet = req.query.wallet || req.headers["x-wallet-address"];
  if (!wallet) return res.status(400).json({ error: "wallet required" });
  const timeline = getSpendOverTime(wallet, { from: req.query.from, to: req.query.to });
  res.json(timeline);
});

// ── Docs page ──
app.get("/", (req, res) => {
  const capList = capabilities
    .map(c => `<tr><td><code>${c.id}</code></td><td>${c.name}</td><td>${c.description}</td><td>${c.cost}</td></tr>`)
    .join("\n");

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pylon Agent Gateway</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 60px auto; padding: 0 20px; color: #e0e0e0; background: #0a0a0a; line-height: 1.6; }
  h1 { font-size: 2.2rem; color: #fff; } h2 { margin-top: 2rem; color: #fff; }
  code { background: #1a1a2e; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #60a5fa; }
  pre { background: #1a1a2e; padding: 16px; border-radius: 8px; overflow-x: auto; color: #d1d5db; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #222; }
  th { color: #9ca3af; font-weight: 600; } a { color: #60a5fa; }
  .hero { text-align: center; margin: 40px 0; }
  .hero p { font-size: 1.2rem; color: #9ca3af; }
  .price { color: #34d399; font-weight: 600; }
</style>
</head><body>
<div class="hero">
  <h1>⚡ Pylon Agent Gateway</h1>
  <p>One endpoint. Every tool an agent needs.<br>No API keys. No docs to read. Just describe what you want.</p>
</div>

<h2>Quick Start</h2>
<pre>curl -X POST https://gateway.pylonapi.com/do \\
  -H "Content-Type: application/json" \\
  -d '{"task": "take a screenshot of https://example.com"}'</pre>
<p>The gateway figures out which tool to use, extracts parameters from your description, and returns the result. Pay via <a href="https://x402.org">x402</a> micropayment.</p>

<h2>Explicit Mode</h2>
<pre>curl -X POST https://gateway.pylonapi.com/do \\
  -H "Content-Type: application/json" \\
  -d '{
    "capability": "screenshot",
    "params": {"url": "https://example.com", "fullPage": true}
  }'</pre>

<h2>Available Capabilities</h2>
<table>
  <tr><th>ID</th><th>Name</th><th>Description</th><th>Cost</th></tr>
  ${capList}
</table>

<h2>Endpoints</h2>
<table>
  <tr><td><code>POST /do</code></td><td>Execute a task (natural language or explicit)</td></tr>
  <tr><td><code>GET /capabilities</code></td><td>List all available tools (JSON)</td></tr>
  <tr><td><code>GET /mcp</code></td><td>MCP tool definitions (for Claude, Cursor, etc.)</td></tr>
  <tr><td><code>GET /providers</code></td><td>List third-party API providers</td></tr>
  <tr><td><code>GET /health</code></td><td>Health check</td></tr>
</table>

<h2>MCP Integration</h2>
<p>Use the <code>/mcp</code> endpoint to get auto-generated tool definitions for all capabilities. Compatible with Claude, Cursor, and any MCP-compatible client.</p>
<pre>curl https://api.pylonapi.com/mcp | jq .</pre>

<h2>Providers</h2>
<p>Pylon is an open platform. Third-party API providers can list their APIs and earn 85% of revenue in USDC on Base. Visit <a href="https://pylonapi.com/providers.html">pylonapi.com/providers</a> to learn more.</p>

<h2>How It Works</h2>
<ol>
  <li>Send a task description to <code>/do</code></li>
  <li>Gateway matches your task to the best tool</li>
  <li>Extracts parameters from your description (or use explicit <code>params</code>)</li>
  <li>Calls the backend, returns the result</li>
  <li>Payment via x402 — USDC on Base. No API keys needed.</li>
</ol>

<p style="margin-top: 40px; color: #6b7280; text-align: center;">
  <a href="https://pylonapi.com">pylonapi.com</a> · 
  <a href="https://github.com/pylon-apis/pylon">GitHub</a> · 
  <a href="https://x402.org">x402 Protocol</a> ·
  Powered by Pylon AI
</p>
</body></html>`);
});

// ── Mount orchestrator ──
// Use reliability-wrapped backend for chain steps too
const reliableCallForChain = (capability, params) => {
  const fn = reliableCallBackend[capability.id] || callBackend;
  return fn(capability, params);
};
mountOrchestrator(app, capabilities, reliableCallForChain, x402PaymentCheck);

app.listen(PORT, () => {
  console.log(`⚡ Pylon Agent Gateway running on :${PORT}`);
  console.log(`   ${capabilities.length} capabilities loaded`);
});
