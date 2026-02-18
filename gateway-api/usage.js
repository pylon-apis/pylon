const Database = require("better-sqlite3");
const { join } = require("path");
const { mkdirSync } = require("fs");

const DB_PATH = join(__dirname, "data", "usage.db");

// Ensure data directory exists
mkdirSync(join(__dirname, "data"), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Auto-create table
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    cost_usd REAL NOT NULL,
    success INTEGER NOT NULL DEFAULT 1,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_usage_wallet ON usage_log(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp);
`);

// Prepared statements
const insertStmt = db.prepare(`
  INSERT INTO usage_log (wallet_address, capability_id, cost_usd, success, latency_ms, timestamp)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);

function logUsage(walletAddress, capabilityId, cost, success, latencyMs) {
  const costNum = typeof cost === "string" ? parseFloat(cost.replace("$", "")) : cost;
  insertStmt.run(walletAddress || "anonymous", capabilityId, costNum, success ? 1 : 0, Math.round(latencyMs));
}

function getUsage(walletAddress, { from, to } = {}) {
  let sql = `
    SELECT
      COUNT(*) as total_calls,
      SUM(cost_usd) as total_spend,
      AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
      AVG(latency_ms) as avg_latency_ms,
      MIN(timestamp) as first_call,
      MAX(timestamp) as last_call
    FROM usage_log WHERE wallet_address = ?
  `;
  const params = [walletAddress];
  if (from) { sql += " AND timestamp >= ?"; params.push(from); }
  if (to) { sql += " AND timestamp <= ?"; params.push(to + " 23:59:59"); }

  const row = db.prepare(sql).get(...params);
  return {
    totalCalls: row.total_calls || 0,
    totalSpend: Math.round((row.total_spend || 0) * 1e6) / 1e6,
    successRate: row.total_calls ? Math.round((row.success_rate || 0) * 10000) / 100 : 0,
    avgLatencyMs: Math.round(row.avg_latency_ms || 0),
    firstCall: row.first_call,
    lastCall: row.last_call,
  };
}

function getUsageByCapability(walletAddress, { from, to } = {}) {
  let sql = `
    SELECT
      capability_id,
      COUNT(*) as calls,
      SUM(cost_usd) as spend,
      AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
      AVG(latency_ms) as avg_latency_ms
    FROM usage_log WHERE wallet_address = ?
  `;
  const params = [walletAddress];
  if (from) { sql += " AND timestamp >= ?"; params.push(from); }
  if (to) { sql += " AND timestamp <= ?"; params.push(to + " 23:59:59"); }
  sql += " GROUP BY capability_id ORDER BY spend DESC";

  return db.prepare(sql).all(...params).map(r => ({
    capabilityId: r.capability_id,
    calls: r.calls,
    spend: Math.round((r.spend || 0) * 1e6) / 1e6,
    successRate: Math.round((r.success_rate || 0) * 10000) / 100,
    avgLatencyMs: Math.round(r.avg_latency_ms || 0),
  }));
}

function getSpendOverTime(walletAddress, { from, to } = {}) {
  let sql = `
    SELECT
      date(timestamp) as date,
      SUM(cost_usd) as spend,
      COUNT(*) as calls
    FROM usage_log WHERE wallet_address = ?
  `;
  const params = [walletAddress];
  if (from) { sql += " AND timestamp >= ?"; params.push(from); }
  if (to) { sql += " AND timestamp <= ?"; params.push(to + " 23:59:59"); }
  sql += " GROUP BY date(timestamp) ORDER BY date ASC";

  return db.prepare(sql).all(...params).map(r => ({
    date: r.date,
    spend: Math.round((r.spend || 0) * 1e6) / 1e6,
    calls: r.calls,
  }));
}

module.exports = { logUsage, getUsage, getUsageByCapability, getSpendOverTime };
