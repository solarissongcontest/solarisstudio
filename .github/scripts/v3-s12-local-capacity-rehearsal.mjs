#!/usr/bin/env node
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function fail(message) {
  console.error(`[v3-s12-capacity] FAIL: ${message}`);
  process.exit(1);
}

function positiveInteger(name) {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw) || Number(raw) < 1) {
    fail(`${name} must be an explicit positive integer; no synthetic load is guessed`);
  }
  return Number(raw);
}

function requiredText(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function allowedValue(name, allowed) {
  const value = requiredText(name);
  if (!allowed.includes(value)) {
    fail(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function assertLoopbackUrl(raw, label) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${label} is not a valid URL`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    fail(`${label} must be loopback/local; refusing ${parsed.hostname}`);
  }
  return parsed;
}

const LOAD_SHAPE_SOURCES = [
  "production-telemetry",
  "contest-participation-or-audience",
  "provider-constraint",
  "historical-peak",
  "approved-forecast",
  "explicit-rehearsal-plan",
  "exploratory",
];

const targetRaw = process.env.V3_CAPACITY_URL;
if (!targetRaw) fail("V3_CAPACITY_URL is required");
const target = assertLoopbackUrl(targetRaw, "V3_CAPACITY_URL");
const requestCount = positiveInteger("V3_CAPACITY_REQUESTS");
const concurrency = positiveInteger("V3_CAPACITY_CONCURRENCY");
if (concurrency > requestCount) {
  fail("V3_CAPACITY_CONCURRENCY cannot exceed V3_CAPACITY_REQUESTS");
}

const scenarioId = requiredText("V3_CAPACITY_SCENARIO_ID");
const commitSha = requiredText("V3_CAPACITY_COMMIT_SHA");
if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  fail("V3_CAPACITY_COMMIT_SHA must be an exact 40-character commit SHA");
}
const loadShapeSource = allowedValue("V3_CAPACITY_LOAD_SOURCE", LOAD_SHAPE_SOURCES);
const loadShapeRationale = requiredText("V3_CAPACITY_LOAD_RATIONALE");

const method = (process.env.V3_CAPACITY_METHOD ?? "GET").toUpperCase();
if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
  fail("V3_CAPACITY_METHOD must be GET, POST, PUT, PATCH or DELETE");
}

let headers = {};
if (process.env.V3_CAPACITY_HEADERS_JSON) {
  try {
    headers = JSON.parse(process.env.V3_CAPACITY_HEADERS_JSON);
  } catch {
    fail("V3_CAPACITY_HEADERS_JSON must be valid JSON");
  }
  if (!headers || Array.isArray(headers) || typeof headers !== "object") {
    fail("V3_CAPACITY_HEADERS_JSON must be a JSON object");
  }
}

const body = process.env.V3_CAPACITY_BODY;
const dbRaw = process.env.DB_URL;
if (dbRaw) assertLoopbackUrl(dbRaw, "DB_URL");
const dbSampleIntervalMs = dbRaw ? positiveInteger("V3_CAPACITY_DB_SAMPLE_MS") : null;

async function psqlScalar(query) {
  const { stdout } = await execFileAsync("psql", [dbRaw, "-Atq", "-c", query], {
    encoding: "utf8",
  });
  return stdout.trim();
}

async function dbSnapshot() {
  if (!dbRaw) return null;
  const statsQuery = `
    select concat_ws('|',
      xact_commit, xact_rollback, blks_read, blks_hit,
      tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
      numbackends
    )
    from pg_stat_database
    where datname = current_database();
  `;
  const pressureQuery = `
    select concat_ws('|',
      count(*) filter (where activity.state = 'active'),
      count(*) filter (where activity.wait_event_type = 'Lock'),
      coalesce((
        select count(*)
        from pg_locks lock_row
        where lock_row.database = (select oid from pg_database where datname = current_database())
          and not lock_row.granted
      ), 0)
    )
    from pg_stat_activity activity
    where activity.datname = current_database();
  `;
  const queueQuery = `
    select concat_ws('|',
      count(*) filter (where status = 'pending'),
      count(*) filter (where status = 'processing'),
      count(*) filter (where status = 'dead_letter'),
      count(*) filter (where attempt_count > 1),
      coalesce(sum(attempt_count), 0),
      coalesce(max(attempt_count), 0)
    )
    from private.v3_domain_event_outbox;
  `;

  const [statsRaw, pressureRaw, queueRaw] = await Promise.all([
    psqlScalar(statsQuery),
    psqlScalar(pressureQuery),
    psqlScalar(queueQuery),
  ]);
  const stats = statsRaw.split("|").map(Number);
  const pressure = pressureRaw.split("|").map(Number);
  const queue = queueRaw.split("|").map(Number);
  const keys = [
    "xactCommit",
    "xactRollback",
    "blocksRead",
    "blocksHit",
    "tuplesReturned",
    "tuplesFetched",
    "tuplesInserted",
    "tuplesUpdated",
    "tuplesDeleted",
    "connections",
  ];

  return {
    capturedAt: new Date().toISOString(),
    stats: Object.fromEntries(keys.map((key, index) => [key, stats[index] ?? 0])),
    pressure: {
      activeConnections: pressure[0] ?? 0,
      lockWaitingConnections: pressure[1] ?? 0,
      ungrantedDatabaseLocks: pressure[2] ?? 0,
    },
    queue: {
      pending: queue[0] ?? 0,
      processing: queue[1] ?? 0,
      deadLetter: queue[2] ?? 0,
      retrying: queue[3] ?? 0,
      totalAttempts: queue[4] ?? 0,
      maxAttempts: queue[5] ?? 0,
    },
  };
}

function createDatabasePeaks() {
  return {
    samples: 0,
    maxConnections: 0,
    maxActiveConnections: 0,
    maxLockWaitingConnections: 0,
    maxUngrantedDatabaseLocks: 0,
    maxQueueDepth: 0,
    maxRetryingDeliveries: 0,
    maxDeadLetterDeliveries: 0,
    maxAttemptsObserved: 0,
  };
}

function observeDatabasePressure(peaks, snapshot) {
  if (!snapshot) return;
  peaks.samples += 1;
  peaks.maxConnections = Math.max(peaks.maxConnections, snapshot.stats.connections);
  peaks.maxActiveConnections = Math.max(
    peaks.maxActiveConnections,
    snapshot.pressure.activeConnections,
  );
  peaks.maxLockWaitingConnections = Math.max(
    peaks.maxLockWaitingConnections,
    snapshot.pressure.lockWaitingConnections,
  );
  peaks.maxUngrantedDatabaseLocks = Math.max(
    peaks.maxUngrantedDatabaseLocks,
    snapshot.pressure.ungrantedDatabaseLocks,
  );
  peaks.maxQueueDepth = Math.max(
    peaks.maxQueueDepth,
    snapshot.queue.pending + snapshot.queue.processing,
  );
  peaks.maxRetryingDeliveries = Math.max(peaks.maxRetryingDeliveries, snapshot.queue.retrying);
  peaks.maxDeadLetterDeliveries = Math.max(
    peaks.maxDeadLetterDeliveries,
    snapshot.queue.deadLetter,
  );
  peaks.maxAttemptsObserved = Math.max(peaks.maxAttemptsObserved, snapshot.queue.maxAttempts);
}

function diffStats(before, after, peaks, sampleIntervalMs) {
  if (!before || !after) return null;
  const delta = {};
  for (const [key, value] of Object.entries(after.stats)) {
    delta[key] = value - (before.stats[key] ?? 0);
  }
  return {
    ...delta,
    sampling: {
      intervalMs: sampleIntervalMs,
      samples: peaks.samples,
      note: "periodic local PostgreSQL pressure samples plus before/after snapshots",
    },
    connectionPressure: {
      before: before.stats.connections,
      after: after.stats.connections,
      activeBefore: before.pressure.activeConnections,
      activeAfter: after.pressure.activeConnections,
      peakObservedConnections: peaks.maxConnections,
      peakObservedActiveConnections: peaks.maxActiveConnections,
    },
    lockContention: {
      waitingConnectionsBefore: before.pressure.lockWaitingConnections,
      waitingConnectionsAfter: after.pressure.lockWaitingConnections,
      ungrantedDatabaseLocksBefore: before.pressure.ungrantedDatabaseLocks,
      ungrantedDatabaseLocksAfter: after.pressure.ungrantedDatabaseLocks,
      peakObservedWaitingConnections: peaks.maxLockWaitingConnections,
      peakObservedUngrantedDatabaseLocks: peaks.maxUngrantedDatabaseLocks,
    },
    queueDepthBefore: before.queue.pending + before.queue.processing,
    queueDepthAfter: after.queue.pending + after.queue.processing,
    queueDepthDelta:
      after.queue.pending + after.queue.processing - (before.queue.pending + before.queue.processing),
    peakObservedQueueDepth: peaks.maxQueueDepth,
    queueStateBefore: before.queue,
    queueStateAfter: after.queue,
    retryPressure: {
      retryingBefore: before.queue.retrying,
      retryingAfter: after.queue.retrying,
      peakObservedRetrying: peaks.maxRetryingDeliveries,
      totalAttemptsDelta: after.queue.totalAttempts - before.queue.totalAttempts,
      maxAttemptsBefore: before.queue.maxAttempts,
      maxAttemptsAfter: after.queue.maxAttempts,
      maxAttemptsObserved: peaks.maxAttemptsObserved,
      deadLetterBefore: before.queue.deadLetter,
      deadLetterAfter: after.queue.deadLetter,
      peakObservedDeadLetter: peaks.maxDeadLetterDeliveries,
    },
    note: "local PostgreSQL evidence; not provider CPU, I/O, memory, connection-pool saturation or managed-service saturation telemetry",
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

const memoryBefore = memorySnapshot();
let peakMemory = { ...memoryBefore };
function sampleMemory() {
  const current = memorySnapshot();
  for (const key of Object.keys(peakMemory)) {
    peakMemory[key] = Math.max(peakMemory[key], current[key]);
  }
}

const latencies = [];
let nextIndex = 0;
let successes = 0;
let httpErrors = 0;
let transportErrors = 0;
let responseBytes = 0;
const statusCounts = new Map();

async function worker() {
  while (true) {
    const requestIndex = nextIndex++;
    if (requestIndex >= requestCount) return;

    const started = performance.now();
    try {
      const response = await fetch(target, {
        method,
        headers,
        body: method === "GET" || method === "DELETE" ? undefined : body,
        redirect: "manual",
      });
      const buffer = await response.arrayBuffer();
      responseBytes += buffer.byteLength;
      statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
      if (response.ok) successes += 1;
      else httpErrors += 1;
    } catch {
      transportErrors += 1;
    } finally {
      latencies.push(performance.now() - started);
      sampleMemory();
    }
  }
}

const databasePeaks = createDatabasePeaks();
let databaseBefore = null;
if (dbRaw) {
  try {
    databaseBefore = await dbSnapshot();
    observeDatabasePressure(databasePeaks, databaseBefore);
  } catch (error) {
    fail(`initial local database snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let dbSamplerTimer = null;
let dbSampleInFlight = null;
let dbSamplerError = null;
if (dbRaw) {
  dbSamplerTimer = setInterval(() => {
    if (dbSampleInFlight || dbSamplerError) return;
    dbSampleInFlight = dbSnapshot()
      .then((snapshot) => observeDatabasePressure(databasePeaks, snapshot))
      .catch((error) => {
        dbSamplerError = error;
      })
      .finally(() => {
        dbSampleInFlight = null;
      });
  }, dbSampleIntervalMs);
}

const startedAt = new Date().toISOString();
const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - start;
const endedAt = new Date().toISOString();

if (dbSamplerTimer) clearInterval(dbSamplerTimer);
if (dbSampleInFlight) await dbSampleInFlight;
if (dbSamplerError) {
  fail(`periodic local database sampling failed: ${dbSamplerError instanceof Error ? dbSamplerError.message : String(dbSamplerError)}`);
}

let databaseAfter = null;
if (dbRaw) {
  try {
    databaseAfter = await dbSnapshot();
    observeDatabasePressure(databasePeaks, databaseAfter);
  } catch (error) {
    fail(`final local database snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const memoryAfter = memorySnapshot();
sampleMemory();

latencies.sort((a, b) => a - b);
const errors = httpErrors + transportErrors;
const report = {
  schemaVersion: 3,
  scenarioId,
  evidenceIdentity: {
    commitSha,
    loadShapeSource,
    loadShapeRationale,
  },
  target: `${target.protocol}//${target.host}${target.pathname}`,
  method,
  requestedLoad: {
    requests: requestCount,
    concurrency,
    databaseSampleIntervalMs: dbSampleIntervalMs,
  },
  runtime: {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  startedAt,
  endedAt,
  durationMs: Math.round(elapsedMs * 1000) / 1000,
  requestThroughputPerSecond:
    elapsedMs > 0 ? Math.round((requestCount / (elapsedMs / 1000)) * 1000) / 1000 : null,
  latencyMs: {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.at(-1) ?? null,
  },
  outcomes: {
    successes,
    httpErrors,
    transportErrors,
    errorRate: requestCount === 0 ? null : errors / requestCount,
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort(([a], [b]) => a - b)),
  },
  egress: {
    observedResponseBytes: responseBytes,
    note: "local client-observed response bytes; not provider-billed egress",
  },
  clientMemory: {
    before: memoryBefore,
    after: memoryAfter,
    peakObserved: peakMemory,
    note: "capacity-harness process memory only; not browser, server, Supabase or Cloudflare provider memory",
  },
  databaseActivity: diffStats(
    databaseBefore,
    databaseAfter,
    databasePeaks,
    dbSampleIntervalMs,
  ),
  thresholds: null,
  note: "Measurement only. Promotion/capacity limits must come from explicit S10/S12 evidence and provider constraints, not harness defaults.",
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(serialized);
if (process.env.V3_CAPACITY_OUTPUT) {
  writeFileSync(process.env.V3_CAPACITY_OUTPUT, serialized, "utf8");
}

if (process.env.V3_CAPACITY_REQUIRE_ALL_SUCCESS === "1" && errors > 0) {
  fail(`${errors} requests failed while V3_CAPACITY_REQUIRE_ALL_SUCCESS=1`);
}
