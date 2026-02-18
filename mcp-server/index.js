#!/usr/bin/env node

/**
 * Pylon MCP Server
 * 
 * Gives Claude, Cursor, and any MCP-compatible client access to
 * Pylon's full capability set — the action layer for AI agents.
 *
 * Usage:
 *   PYLON_API_KEY=pylon-test-2026 npx @pylon/mcp
 *
 * Or add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "pylon": {
 *         "command": "npx",
 *         "args": ["@pylon/mcp"],
 *         "env": { "PYLON_API_KEY": "your-key" }
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GATEWAY_URL = process.env.PYLON_GATEWAY_URL || "https://api.pylonapi.com";
const API_KEY = process.env.PYLON_API_KEY || "";
const CAPABILITIES_CACHE_TTL = 5 * 60 * 1000; // 5 min

let capabilitiesCache = null;
let cacheTimestamp = 0;

// ── Fetch capabilities from gateway ──
async function getCapabilities() {
  const now = Date.now();
  if (capabilitiesCache && now - cacheTimestamp < CAPABILITIES_CACHE_TTL) {
    return capabilitiesCache;
  }

  try {
    const resp = await fetch(`${GATEWAY_URL}/capabilities`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    capabilitiesCache = data.capabilities || [];
    cacheTimestamp = now;
    return capabilitiesCache;
  } catch (err) {
    console.error(`[pylon-mcp] Failed to fetch capabilities: ${err.message}`);
    // Return cache even if stale
    return capabilitiesCache || [];
  }
}

// ── Convert Pylon inputSchema to JSON Schema ──
function toJsonSchema(pylonSchema) {
  if (!pylonSchema || typeof pylonSchema !== "object") {
    return { type: "object", properties: {} };
  }

  const properties = {};
  const required = [];

  for (const [key, spec] of Object.entries(pylonSchema)) {
    const prop = {
      type: spec.type || "string",
      description: spec.description || key,
    };
    if (spec.default !== undefined) {
      prop.default = spec.default;
    }
    if (spec.enum) {
      prop.enum = spec.enum;
    }
    properties[key] = prop;
    if (spec.required) {
      required.push(key);
    }
  }

  return { type: "object", properties, required };
}

// ── Call the Pylon gateway ──
async function callPylon(capabilityId, params) {
  const headers = {
    "Content-Type": "application/json",
  };

  // Use API key for authentication (test bypass or future auth)
  if (API_KEY) {
    headers["x-test-key"] = API_KEY;
  }

  const body = {
    capability: capabilityId,
    params,
  };

  const resp = await fetch(`${GATEWAY_URL}/do`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (resp.status === 402) {
    const payReq = await resp.json();
    return {
      error: true,
      message: "Payment required. Configure PYLON_API_KEY or set up x402 wallet payment.",
      paymentRequired: payReq,
    };
  }

  if (!resp.ok) {
    const errText = await resp.text();
    let errObj;
    try { errObj = JSON.parse(errText); } catch { errObj = { message: errText }; }
    return { error: true, message: errObj.message || errText, status: resp.status };
  }

  return await resp.json();
}

// ── Call the Pylon /do with natural language ──
async function callPylonNatural(task, budget) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["x-test-key"] = API_KEY;
  }

  const body = { task };
  if (budget) body.budget = budget;

  const resp = await fetch(`${GATEWAY_URL}/do`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let errObj;
    try { errObj = JSON.parse(errText); } catch { errObj = { message: errText }; }
    return { error: true, message: errObj.message || errText };
  }

  return await resp.json();
}

// ── Call the Pylon /do/chain for multi-step ──
async function callPylonChain(task, budget, dryRun) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["x-test-key"] = API_KEY;
  }

  const body = { task };
  if (budget) body.budget = budget;
  if (dryRun) body.dryRun = true;

  const resp = await fetch(`${GATEWAY_URL}/do/chain`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let errObj;
    try { errObj = JSON.parse(errText); } catch { errObj = { message: errText }; }
    return { error: true, message: errObj.message || errText };
  }

  return await resp.json();
}

// ── Format result for MCP ──
function formatResult(result) {
  if (result.error) {
    return {
      content: [{ type: "text", text: `Error: ${result.message}` }],
      isError: true,
    };
  }

  const parts = [];

  // If result contains base64 image data
  const data = result.result || result.finalResult?.result || result;
  if (data?.base64 && data?.contentType?.startsWith("image/")) {
    parts.push({
      type: "image",
      data: data.base64,
      mimeType: data.contentType,
    });
  } else if (data?.base64 && data?.contentType === "application/pdf") {
    parts.push({
      type: "text",
      text: `PDF generated (${data.sizeBytes} bytes). Base64 data available in response.`,
    });
    // Include base64 for agents that can handle it
    parts.push({
      type: "text",
      text: `base64: ${data.base64.slice(0, 100)}...`,
    });
  } else {
    // Text/JSON result
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    parts.push({ type: "text", text });
  }

  // Add metadata
  if (result.capability) {
    parts.push({
      type: "text",
      text: `\n---\nCapability: ${result.capability.id} (${result.capability.cost}) | Source: ${result.capability.source || "native"} | Duration: ${result.meta?.durationMs || "?"}ms`,
    });
  }

  // Add pricing transparency for discovered services
  if (result.pricing) {
    parts.push({
      type: "text",
      text: `Pricing: Provider ${result.pricing.providerCost} + Pylon fee ${result.pricing.pylonFee} = ${result.pricing.totalCost}`,
    });
  }

  return { content: parts };
}

// ── Create the MCP server ──
const server = new Server(
  {
    name: "pylon",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ── List tools ──
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const capabilities = await getCapabilities();

  // Build tool list from capabilities
  const tools = capabilities.map(cap => ({
    name: `pylon_${cap.id.replace(/-/g, "_")}`,
    description: `[Pylon ${cap.cost}] ${cap.description}`,
    inputSchema: toJsonSchema(cap.inputSchema),
  }));

  // Add meta-tools
  tools.push({
    name: "pylon_do",
    description: "[Pylon] Execute any task using natural language. Pylon automatically matches to the right capability. Use this when you're not sure which specific tool to call.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language description of what you want to do" },
        budget: { type: "string", description: "Max budget (e.g. '$0.10'). Optional." },
      },
      required: ["task"],
    },
  });

  tools.push({
    name: "pylon_chain",
    description: "[Pylon] Execute a multi-step workflow. Describe a pipeline of actions and Pylon will plan and execute them sequentially, piping outputs between steps.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Multi-step task description (e.g. 'scrape https://example.com and convert to PDF')" },
        budget: { type: "string", description: "Max budget for the entire chain. Optional." },
        dryRun: { type: "boolean", description: "If true, returns the plan without executing. Good for cost preview." },
      },
      required: ["task"],
    },
  });

  tools.push({
    name: "pylon_discover",
    description: "[Pylon] Search for capabilities — both native and from the x402 bazaar. Use this to find out if Pylon can handle a specific type of task.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What capability are you looking for? (e.g. 'email sending', 'image generation')" },
      },
      required: ["query"],
    },
  });

  return { tools };
});

// ── Call tool ──
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Meta-tools
    if (name === "pylon_do") {
      const result = await callPylonNatural(args.task, args.budget);
      return formatResult(result);
    }

    if (name === "pylon_chain") {
      const result = await callPylonChain(args.task, args.budget, args.dryRun);
      return formatResult(result);
    }

    if (name === "pylon_discover") {
      const resp = await fetch(`${GATEWAY_URL}/discover?q=${encodeURIComponent(args.query)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const data = await resp.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // Specific capability tools: pylon_screenshot → screenshot
    if (name.startsWith("pylon_")) {
      const capId = name.replace("pylon_", "").replace(/_/g, "-");
      const result = await callPylon(capId, args);
      return formatResult(result);
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Pylon error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Resources: expose capabilities list ──
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "pylon://capabilities",
        name: "Pylon Capabilities",
        description: "List of all available Pylon capabilities with pricing and schemas",
        mimeType: "application/json",
      },
      {
        uri: "pylon://status",
        name: "Pylon Status",
        description: "Current status of all Pylon services including circuit breaker states",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "pylon://capabilities") {
    const caps = await getCapabilities();
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(caps, null, 2),
      }],
    };
  }

  if (uri === "pylon://status") {
    const resp = await fetch(`${GATEWAY_URL}/status`, { signal: AbortSignal.timeout(10_000) });
    const data = await resp.json();
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      }],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// ── Start ──
async function main() {
  // Pre-fetch capabilities
  const caps = await getCapabilities();
  console.error(`[pylon-mcp] Loaded ${caps.length} capabilities from ${GATEWAY_URL}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[pylon-mcp] Pylon MCP server running on stdio");
}

main().catch((err) => {
  console.error(`[pylon-mcp] Fatal: ${err.message}`);
  process.exit(1);
});
