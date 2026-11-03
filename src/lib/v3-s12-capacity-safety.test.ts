import { spawn } from "node:child_process";
import { createServer, type RequestListener } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), ".github/scripts/v3-s12-local-capacity-rehearsal.mjs");

const safeEnv = {
  // These tests exercise only an ephemeral loopback HTTP server, never hosted Supabase.
  DB_URL: "",
  V3_CAPACITY_URL: "http://127.0.0.1:1/",
  V3_CAPACITY_SCENARIO_ID: "show-start-live-refresh",
  V3_CAPACITY_REQUESTS: "1",
  V3_CAPACITY_CONCURRENCY: "1",
  V3_CAPACITY_SAFETY_MAX_REQUESTS: "2",
  V3_CAPACITY_SAFETY_MAX_CONCURRENCY: "2",
  V3_CAPACITY_REQUEST_TIMEOUT_MS: "1000",
  V3_CAPACITY_MAX_RESPONSE_BYTES: "256",
  V3_CAPACITY_COMMIT_SHA: "a".repeat(40),
  V3_CAPACITY_LOAD_SOURCE: "exploratory",
  V3_CAPACITY_LOAD_RATIONALE: "bounded isolated harness regression",
};

type HarnessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runHarness(overrides: Record<string, string> = {}): Promise<HarnessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...safeEnv,
        ...overrides,
        // A production Supabase environment must never be inherited as a test target.
        DB_URL: "",
      },
    });
    let stdout = "";
    let stderr = "";
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 8000);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(watchdog);
      resolveResult({ code, stdout, stderr });
    });
  });
}

async function withLocalServer(
  handler: RequestListener,
  callback: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", res);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected local TCP port");
  try {
    await callback(`http://127.0.0.1:${address.port}/`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((res) => server.close(() => res()));
  }
}

describe("S12 local capacity harness resource safety", () => {
  it("rejects an unsafe request integer before allocating workers or sending traffic", async () => {
    const result = await runHarness({ V3_CAPACITY_REQUESTS: "9007199254740992" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("V3_CAPACITY_REQUESTS must be an explicit positive safe integer");
  });

  it("fails closed when a requested load exceeds the independently declared safety envelope", async () => {
    const tooManyRequests = await runHarness({
      V3_CAPACITY_REQUESTS: "3",
    });
    expect(tooManyRequests.code).not.toBe(0);
    expect(tooManyRequests.stderr).toContain("exceeds explicit V3_CAPACITY_SAFETY_MAX_REQUESTS");

    const tooMuchConcurrency = await runHarness({
      V3_CAPACITY_REQUESTS: "2",
      V3_CAPACITY_CONCURRENCY: "2",
      V3_CAPACITY_SAFETY_MAX_CONCURRENCY: "1",
    });
    expect(tooMuchConcurrency.code).not.toBe(0);
    expect(tooMuchConcurrency.stderr).toContain("exceeds explicit V3_CAPACITY_SAFETY_MAX_CONCURRENCY");
  });

  it("rejects an oversized Content-Length without buffering that payload", async () => {
    await withLocalServer((_request, response) => {
      response.setHeader("Content-Length", "2048");
      response.end("x".repeat(2048));
    }, async (url) => {
      const result = await runHarness({
        V3_CAPACITY_URL: url,
        V3_CAPACITY_MAX_RESPONSE_BYTES: "64",
      });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Content-Length exceeds V3_CAPACITY_MAX_RESPONSE_BYTES");
    });
  });

  it("caps streamed responses without a Content-Length header", async () => {
    await withLocalServer((_request, response) => {
      response.write("x".repeat(128));
      response.end("y".repeat(128));
    }, async (url) => {
      const result = await runHarness({
        V3_CAPACITY_URL: url,
        V3_CAPACITY_MAX_RESPONSE_BYTES: "64",
      });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("response exceeded V3_CAPACITY_MAX_RESPONSE_BYTES");
    });
  });

  it("times out stalled loopback requests and reports them as transport errors", async () => {
    await withLocalServer(() => {
      // Intentionally never respond; the explicit request deadline must abort.
    }, async (url) => {
      const result = await runHarness({
        V3_CAPACITY_URL: url,
        V3_CAPACITY_REQUEST_TIMEOUT_MS: "100",
      });
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.outcomes.transportErrors).toBe(1);
      expect(report.outcomes.errorRate).toBe(1);
      expect(report.requestedLoad.requestTimeoutMs).toBe(100);
    });
  });

  it("preserves accurate bounded response bytes and load provenance", async () => {
    await withLocalServer((_request, response) => response.end("OK"), async (url) => {
      const result = await runHarness({ V3_CAPACITY_URL: url });
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.outcomes.successes).toBe(1);
      expect(report.egress.observedResponseBytes).toBe(2);
      expect(report.requestedLoad.safetyMaxRequests).toBe(2);
      expect(report.requestedLoad.maxResponseBytes).toBe(256);
      expect(report.thresholds).toBeNull();
      expect(report.databaseActivity).toBeNull();
    });
  });
});
