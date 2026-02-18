/**
 * Pylon Capability Discovery — finds x402 services from the bazaar
 * when no native/partner capability matches a task.
 *
 * Three source tiers:
 *   1. "native"     — built by Pylon, in capabilities.json
 *   2. "partner"    — third-party provider, onboarded via provider portal
 *   3. "discovered" — found on x402 bazaar, transparent pricing
 */

const BAZAAR_URL = "https://x402.org/api";
const BAZAAR_SEARCH_URL = `${BAZAAR_URL}/services/search`;
const DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 min
const DEFAULT_MARKUP = 1.0; // 100% markup (double the provider price)
const MAX_PROVIDER_COST = 0.25; // Don't discover services costing more than $0.25

// In-memory cache of discovered capabilities
const discoveryCache = new Map(); // keyword → { results, timestamp }
const activeDiscovered = new Map(); // capId → { capability, providerUrl, providerCost, pylonCost }

/**
 * Search the x402 bazaar for services matching a task description.
 * Returns normalized capability-like objects.
 */
async function searchBazaar(query) {
  // Check cache
  const cacheKey = query.toLowerCase().trim();
  const cached = discoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DISCOVERY_CACHE_TTL) {
    return cached.results;
  }

  try {
    const resp = await fetch(BAZAAR_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5 }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      // Try GET fallback
      const getResp = await fetch(`${BAZAAR_URL}/services?q=${encodeURIComponent(query)}&limit=5`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!getResp.ok) return [];
      const getData = await getResp.json();
      const results = normalizeResults(getData.services || getData.results || getData || []);
      discoveryCache.set(cacheKey, { results, timestamp: Date.now() });
      return results;
    }

    const data = await resp.json();
    const results = normalizeResults(data.services || data.results || data || []);
    discoveryCache.set(cacheKey, { results, timestamp: Date.now() });
    return results;
  } catch (err) {
    console.error(`[discovery] Bazaar search failed: ${err.message}`);
    return [];
  }
}

/**
 * Normalize bazaar results into capability-like objects.
 */
function normalizeResults(services) {
  if (!Array.isArray(services)) return [];

  return services
    .filter(s => {
      // Must have a URL and some cost info
      if (!s.url && !s.endpoint) return false;
      // Filter out unreasonably expensive services
      const cost = parseCost(s.cost || s.price || s.maxAmountRequired);
      if (cost > MAX_PROVIDER_COST) return false;
      return true;
    })
    .map(s => {
      const providerCost = parseCost(s.cost || s.price || s.maxAmountRequired);
      const pylonCost = Math.max(providerCost * (1 + DEFAULT_MARKUP), providerCost + 0.005);
      const roundedPylonCost = Math.ceil(pylonCost * 1000) / 1000; // round up to nearest $0.001

      return {
        id: `discovered:${slugify(s.name || s.description || s.url)}`,
        name: s.name || s.description?.slice(0, 40) || "Discovered Service",
        description: s.description || s.name || "",
        providerUrl: s.url || s.endpoint,
        providerCost: `$${providerCost.toFixed(3)}`,
        pylonCost: `$${roundedPylonCost.toFixed(3)}`,
        pylonFee: `$${(roundedPylonCost - providerCost).toFixed(3)}`,
        source: "discovered",
        provider: {
          name: s.provider || s.providerName || extractDomain(s.url || s.endpoint),
          url: s.providerUrl || s.url || s.endpoint,
        },
        // x402 payment details from bazaar
        paymentDetails: s.paymentDetails || s.accepts || null,
        network: s.network || "eip155:8453",
        payTo: s.payTo || s.wallet || null,
        // Schema info if available
        inputSchema: s.inputSchema || s.parameters || {},
        outputType: s.outputType || "application/json",
        method: s.method || "POST",
      };
    });
}

/**
 * Try to discover a capability for a task that didn't match any native/partner capability.
 * Returns { found: true, capabilities: [...] } or { found: false }
 */
async function discoverForTask(task) {
  // Extract key action terms from the task
  const searchTerms = extractSearchTerms(task);
  if (!searchTerms) return { found: false, reason: "Could not extract search terms from task" };

  const results = await searchBazaar(searchTerms);

  if (results.length === 0) {
    return { found: false, reason: `No x402 services found for: "${searchTerms}"` };
  }

  return {
    found: true,
    searchTerms,
    capabilities: results,
    message: `Found ${results.length} x402 service(s) that may fulfill this task. These are third-party services discovered on the x402 bazaar.`,
  };
}

/**
 * Activate a discovered capability — register it for immediate use.
 * Returns the capability object ready for the gateway to use.
 */
function activateDiscovered(discoveredCap) {
  const cap = {
    id: discoveredCap.id,
    name: discoveredCap.name,
    description: discoveredCap.description,
    endpoint: discoveredCap.providerUrl,
    method: discoveredCap.method || "POST",
    cost: discoveredCap.pylonCost,
    keywords: extractKeywords(discoveredCap.description),
    inputSchema: discoveredCap.inputSchema || {},
    outputType: discoveredCap.outputType || "application/json",
    source: "discovered",
    providerCost: discoveredCap.providerCost,
    pylonFee: discoveredCap.pylonFee,
    provider: discoveredCap.provider,
    paymentDetails: discoveredCap.paymentDetails,
    payTo: discoveredCap.payTo,
    network: discoveredCap.network,
  };

  activeDiscovered.set(cap.id, cap);
  console.log(`[discovery] Activated: ${cap.id} (${cap.provider.name}) at ${cap.cost} (provider: ${cap.providerCost})`);
  return cap;
}

/**
 * Get all currently active discovered capabilities.
 */
function getActiveDiscovered() {
  return Array.from(activeDiscovered.values());
}

/**
 * Check if a capability ID is a discovered one.
 */
function isDiscovered(capId) {
  return capId.startsWith("discovered:") || activeDiscovered.has(capId);
}

/**
 * Call a discovered x402 service.
 * Unlike native backends, we pay via x402 (not bypass key).
 */
// SSRF check for discovered endpoints
const BLOCKED_HOSTS = ["localhost", "0.0.0.0", "[::]", "[::1]", "metadata.google.internal"];
const BLOCKED_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, /^fc00:/i, /^fe80:/i,
];
function isBlockedEndpoint(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const h = parsed.hostname.toLowerCase();
    return BLOCKED_HOSTS.includes(h) || BLOCKED_PATTERNS.some(p => p.test(h));
  } catch { return true; }
}

async function callDiscoveredBackend(capability, params) {
  const startTime = Date.now();

  // SSRF check on discovered endpoint
  if (isBlockedEndpoint(capability.endpoint)) {
    return { error: "blocked_endpoint", message: "Discovered endpoint points to a blocked address" };
  }

  try {
    // First, make the request — if it needs payment, we'll get a 402
    const headers = { "Content-Type": "application/json" };
    const resp = await fetch(capability.endpoint, {
      method: capability.method || "POST",
      headers,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

    const durationMs = Date.now() - startTime;

    if (resp.status === 402) {
      // Need to handle x402 payment to the provider
      // For now, return the payment requirement so the gateway knows
      const payReq = await resp.json();
      return {
        error: "provider_payment_required",
        message: "Discovered service requires x402 payment. Auto-payment coming soon.",
        paymentRequirements: payReq,
        status: 402,
        durationMs,
      };
    }

    if (!resp.ok) {
      const errText = await resp.text();
      return { error: "backend_error", message: errText, status: resp.status, durationMs };
    }

    const contentType = resp.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await resp.json();
      return { success: true, data, contentType: "application/json", durationMs, backendStatus: resp.status };
    } else if (contentType.includes("image/") || contentType.includes("application/pdf")) {
      const buffer = Buffer.from(await resp.arrayBuffer());
      return {
        success: true,
        data: { base64: buffer.toString("base64"), contentType, sizeBytes: buffer.length },
        contentType, durationMs, backendStatus: resp.status,
      };
    } else {
      const text = await resp.text();
      return { success: true, data: { text }, contentType: "text/plain", durationMs, backendStatus: resp.status };
    }
  } catch (err) {
    return {
      error: "discovery_backend_error",
      message: `Failed to reach discovered service: ${err.message}`,
      status: 502,
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Helpers ──

function parseCost(costStr) {
  if (!costStr) return 0.01;
  if (typeof costStr === "number") {
    // If it's in micro-units (> 100), convert
    return costStr > 100 ? costStr / 1_000_000 : costStr;
  }
  const str = String(costStr).replace("$", "").trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0.01 : (num > 100 ? num / 1_000_000 : num);
}

function slugify(str) {
  return (str || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function extractSearchTerms(task) {
  if (!task) return null;
  // Remove URLs, emails, and noise words
  const cleaned = task
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
    .replace(/\b(the|a|an|is|to|of|and|for|in|on|at|by|with|from|this|that|it|I|my|me|we|our)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function extractKeywords(description) {
  if (!description) return [];
  return description
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3)
    .slice(0, 10);
}

module.exports = {
  searchBazaar,
  discoverForTask,
  activateDiscovered,
  getActiveDiscovered,
  isDiscovered,
  callDiscoveredBackend,
};
