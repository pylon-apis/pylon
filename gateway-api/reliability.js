const CircuitBreaker = require("opossum");

// Per-capability circuit breakers
const breakers = new Map();

// Per-capability stats
const stats = new Map();

function getStats(capId) {
  if (!stats.has(capId)) {
    stats.set(capId, { successes: 0, failures: 0, totalLatencyMs: 0, totalCalls: 0 });
  }
  return stats.get(capId);
}

const RETRY_DELAYS = [500, 1500, 4500];

function isRetryable(result) {
  if (result && result.error && result.status) {
    // Don't retry 4xx (client errors) or 402 (payment)
    if (result.status >= 400 && result.status < 500) return false;
    if (result.status >= 500) return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wraps a callFn with retry + circuit breaker.
 * Returns a function with same signature as callFn: (capability, params) => result
 */
function wrapWithReliability(capabilityId, callFn) {
  // Create circuit breaker for this capability
  const breaker = new CircuitBreaker(
    async (capability, params) => {
      let lastResult;
      let retries = 0;

      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          const result = await callFn(capability, params);

          // If backend returned a retryable error, treat as failure for retry logic
          if (isRetryable(result) && attempt < RETRY_DELAYS.length) {
            lastResult = result;
            retries = attempt + 1;
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }

          // Success or non-retryable error
          if (result.error) {
            // Non-retryable error — record failure, return as-is
            const s = getStats(capabilityId);
            s.failures++;
            s.totalCalls++;
            result._retries = retries;
            // Throw so circuit breaker counts it as failure
            const err = new Error("backend_error");
            err.result = result;
            err.result._retries = retries;
            throw err;
          }

          // Real success
          const s = getStats(capabilityId);
          s.successes++;
          s.totalCalls++;
          s.totalLatencyMs += result.durationMs || 0;
          result._retries = retries;
          return result;
        } catch (err) {
          // Network/timeout errors — retryable
          if (err.result) throw err; // already wrapped above
          if (attempt < RETRY_DELAYS.length) {
            lastResult = null;
            retries = attempt + 1;
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }
          // Exhausted retries
          const s = getStats(capabilityId);
          s.failures++;
          s.totalCalls++;
          err._retries = retries;
          throw err;
        }
      }

      // Exhausted retries with a retryable result
      const s = getStats(capabilityId);
      s.failures++;
      s.totalCalls++;
      if (lastResult) {
        const err = new Error("backend_error_after_retries");
        err.result = lastResult;
        err.result._retries = retries;
        throw err;
      }
    },
    {
      timeout: 60000, // 60s timeout per attempt (including retries)
      errorThresholdPercentage: 50,
      volumeThreshold: 5, // need at least 5 calls before tripping
      rollingCountTimeout: 300000, // 5 minutes
      resetTimeout: 30000, // half-open after 30s
    }
  );

  breakers.set(capabilityId, breaker);

  // Return wrapped function
  return async (capability, params) => {
    try {
      return await breaker.fire(capability, params);
    } catch (err) {
      // Circuit open
      if (err.message && err.message.includes("Breaker is open")) {
        return {
          error: "circuit_open",
          message: "This capability is temporarily unavailable, circuit breaker open",
          status: 503,
          _retries: 0,
        };
      }
      // Propagate the backend result if available
      if (err.result) return err.result;
      // Network error after retries
      throw err;
    }
  };
}

/** Get circuit state for a capability */
function getCircuitState(capabilityId) {
  const breaker = breakers.get(capabilityId);
  if (!breaker) return "closed";
  if (breaker.opened) return "open";
  if (breaker.halfOpen) return "half-open";
  return "closed";
}

/** Get status data for all capabilities */
function getStatusData(capabilityIds) {
  return capabilityIds.map(id => {
    const s = getStats(id);
    const avgLatency = s.totalCalls > 0 ? Math.round(s.totalLatencyMs / Math.max(s.successes, 1)) : 0;
    return {
      id,
      circuitState: getCircuitState(id),
      successes: s.successes,
      failures: s.failures,
      totalCalls: s.totalCalls,
      avgLatencyMs: avgLatency,
    };
  });
}

module.exports = { wrapWithReliability, getCircuitState, getStatusData };
