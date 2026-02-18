/**
 * Pylon Gateway Orchestrator — multi-step task decomposition & execution
 * Uses Claude Haiku to plan, then executes steps sequentially.
 */

const MAX_STEPS = 5;
const MAX_BUDGET = 0.50;
const STEP_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 120_000;

/**
 * Safe dot-notation resolver for inputMapping.
 * e.g. "steps[0].result.content" resolves against stepResults array.
 */
function resolvePath(path, stepResults) {
  const match = path.match(/^steps\[(\d+)\]\.(.+)$/);
  if (!match) return undefined;
  const stepIdx = parseInt(match[1]);
  const rest = match[2];
  let obj = stepResults[stepIdx];
  if (!obj) return undefined;
  for (const key of rest.split(".")) {
    if (obj == null || typeof obj !== "object") return undefined;
    obj = obj[key];
  }
  return obj;
}

/**
 * Detect if a task likely needs multi-step orchestration.
 */
function looksLikeChain(task) {
  if (!task) return false;
  const t = task.toLowerCase();
  const multiSignals = [
    /\bthen\b/, /\band then\b/, /\bafter that\b/, /\bnext\b/,
    /\bconvert\b.*\bto\b/, /\bpipe\b/, /\bchain\b/,
  ];
  let hits = 0;
  for (const re of multiSignals) {
    if (re.test(t)) hits++;
  }
  // Count action verbs
  const verbs = ["scrape", "screenshot", "extract", "convert", "generate", "search", "resize", "parse", "shorten", "validate", "lookup", "upload", "format"];
  let verbCount = 0;
  for (const v of verbs) {
    if (t.includes(v)) verbCount++;
  }
  return hits >= 1 || verbCount >= 2;
}

/**
 * Call Claude Haiku to decompose a task into steps.
 */
async function planSteps(task, capabilities, budget) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured — orchestrator cannot plan");

  const capSummary = capabilities.map(c => ({
    id: c.id, name: c.name, description: c.description,
    cost: c.cost, inputSchema: c.inputSchema, outputType: c.outputType,
  }));

  const systemPrompt = `You are a task planner for an API gateway. Given a user's task, decompose it into sequential API calls using ONLY the available capabilities below.

Available capabilities:
${JSON.stringify(capSummary, null, 2)}

Rules:
- Max ${MAX_STEPS} steps
- Only use capability IDs from the list above
- Each step has: capabilityId, params (concrete values you can extract), inputMapping (references to previous step outputs using "steps[N].result.field" dot notation)
- For inputMapping, the result object contains whatever the API returns as "data" in the gateway response
- Estimate total cost by summing capability costs
- If the task can be done in 1 step, return 1 step
- Return ONLY valid JSON, no explanation

Output schema:
{
  "steps": [
    {"capabilityId": "...", "params": {...}, "inputMapping": {...}}
  ],
  "estimatedCost": "$X.XX"
}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: task }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Planner API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Planner returned no valid JSON");

  const plan = JSON.parse(jsonMatch[0]);

  // Validate
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("Planner returned empty steps");
  }
  if (plan.steps.length > MAX_STEPS) {
    throw new Error(`Plan has ${plan.steps.length} steps (max ${MAX_STEPS})`);
  }

  const capIds = new Set(capabilities.map(c => c.id));
  for (const step of plan.steps) {
    if (!capIds.has(step.capabilityId)) {
      throw new Error(`Invalid capability "${step.capabilityId}" in plan`);
    }
  }

  // Calculate actual cost
  let totalCost = 0;
  for (const step of plan.steps) {
    const cap = capabilities.find(c => c.id === step.capabilityId);
    totalCost += parseFloat(cap.cost.replace("$", ""));
  }

  if (budget !== undefined && totalCost > budget) {
    throw new Error(`Estimated cost $${totalCost.toFixed(3)} exceeds budget $${budget.toFixed(3)}`);
  }
  if (totalCost > MAX_BUDGET) {
    throw new Error(`Estimated cost $${totalCost.toFixed(3)} exceeds max budget $${MAX_BUDGET.toFixed(2)}`);
  }

  plan.estimatedCost = `$${totalCost.toFixed(3)}`;
  return plan;
}

/**
 * Execute a plan sequentially, piping outputs via inputMapping.
 */
async function executePlan(plan, capabilities, callBackend) {
  const stepResults = [];
  const costBreakdown = [];
  const totalStart = Date.now();

  for (let i = 0; i < plan.steps.length; i++) {
    if (Date.now() - totalStart > TOTAL_TIMEOUT_MS) {
      return {
        success: false,
        error: "total_timeout",
        message: `Chain exceeded ${TOTAL_TIMEOUT_MS / 1000}s total timeout at step ${i}`,
        completedSteps: i,
        stepResults,
        costBreakdown,
      };
    }

    const step = plan.steps[i];
    const cap = capabilities.find(c => c.id === step.capabilityId);

    // Build params: start with explicit params, then overlay inputMapping
    const params = { ...(step.params || {}) };
    if (step.inputMapping) {
      for (const [key, path] of Object.entries(step.inputMapping)) {
        const val = resolvePath(path, stepResults);
        if (val !== undefined) params[key] = val;
      }
    }

    // Apply defaults
    for (const [key, schema] of Object.entries(cap.inputSchema)) {
      if (params[key] === undefined && schema.default !== undefined) {
        params[key] = schema.default;
      }
    }

    const stepStart = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

      const result = await callBackend(cap, params);
      clearTimeout(timeout);

      const durationMs = Date.now() - stepStart;

      if (result.error) {
        return {
          success: false,
          error: "step_failed",
          message: `Step ${i} (${step.capabilityId}) failed: ${result.message}`,
          failedStep: i,
          stepResults,
          costBreakdown,
        };
      }

      stepResults.push({ result: result.data, contentType: result.contentType, durationMs });
      costBreakdown.push({ step: i, capabilityId: step.capabilityId, cost: cap.cost, durationMs });
    } catch (err) {
      return {
        success: false,
        error: "step_error",
        message: `Step ${i} (${step.capabilityId}) threw: ${err.message}`,
        failedStep: i,
        stepResults,
        costBreakdown,
      };
    }
  }

  const totalDurationMs = Date.now() - totalStart;
  const totalCost = costBreakdown.reduce((sum, s) => sum + parseFloat(s.cost.replace("$", "")), 0);

  return {
    success: true,
    finalResult: stepResults[stepResults.length - 1],
    allSteps: stepResults,
    costBreakdown,
    totalCost: `$${totalCost.toFixed(3)}`,
    totalDurationMs,
  };
}

/**
 * Mount orchestrator routes on an Express app.
 */
function mountOrchestrator(app, capabilities, callBackend, x402PaymentCheck) {
  // POST /do/chain — explicit multi-step orchestration
  app.post("/do/chain", async (req, res) => {
    const { task, budget, dryRun } = req.body;

    if (!task) {
      return res.status(400).json({
        error: "missing_task",
        message: 'Provide a "task" describing what you want done.',
        example: { task: "scrape https://example.com and convert to PDF" },
      });
    }

    const budgetNum = budget ? parseFloat(String(budget).replace("$", "")) : MAX_BUDGET;

    try {
      // Plan
      const plan = await planSteps(task, capabilities, budgetNum);

      // Dry run — return plan without executing
      if (dryRun) {
        return res.json({
          success: true,
          dryRun: true,
          plan,
          message: "Plan generated. Send again without dryRun to execute.",
        });
      }

      // Set estimated cost for payment middleware
      req._estimatedCost = plan.estimatedCost;

      // Payment check
      x402PaymentCheck(req, res, async () => {
        // Execute
        const result = await executePlan(plan, capabilities, callBackend);

        res.json({
          ...result,
          plan,
          meta: {
            gateway: "pylon",
            version: "1.0",
            endpoint: "/do/chain",
            stepsPlanned: plan.steps.length,
          },
        });
      });
    } catch (err) {
      console.error("Chain orchestration error:", err);
      res.status(400).json({
        error: "orchestration_failed",
        message: err.message,
      });
    }
  });
}

module.exports = { mountOrchestrator, looksLikeChain };
