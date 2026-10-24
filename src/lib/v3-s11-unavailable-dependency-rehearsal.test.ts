import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";
import { systemErrorCodeFromUnknown } from "./system-error";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-unavailable-dependency-rehearsal.sh"),
  "utf8",
);
const dependencyProbe = readFileSync(
  resolve(process.cwd(), "scripts/v3-s11-probe-dependency.ts"),
  "utf8",
);

function listenLoopback(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not expose a TCP port"));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolveClose, reject) => {
    server.once("error", reject);
    server.close(() => resolveClose());
  });
}

describe("System V3 S11 unavailable-dependency recovery rehearsal", () => {
  it("hard-refuses hosted Supabase and binds evidence to a clean exact SHA", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("V3_S11_DEPENDENCY_SHA");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
  });

  it("uses a real loopback TCP/HTTP dependency rather than a synthetic outage flag", () => {
    expect(rehearsal).toContain('python3 -m http.server "$DEPENDENCY_PORT"');
    expect(rehearsal).toContain("--bind 127.0.0.1");
    expect(rehearsal).toContain('kill "$DEPENDENCY_PID"');
    expect(rehearsal).not.toContain("V3_FAKE_DEPENDENCY_OUTAGE");
  });

  it("creates the delivery through a governed R2 operation instead of direct outbox insertion", () => {
    expect(rehearsal).toContain("studio2_apply_jury_voting_status");
    expect(rehearsal).toContain("event_type='jury.closed'");
    expect(rehearsal).not.toContain("insert into private.v3_domain_event_outbox");
    expect(rehearsal).not.toContain("update private.v3_domain_event_outbox");
  });

  it("derives the persisted dependency failure from the actual failed request through the production classifier", () => {
    expect(rehearsal).toContain('DEPENDENCY_ERROR_CODE="$(probe_dependency)"');
    expect(rehearsal).toContain("real dependency outage classified as");
    expect(rehearsal).toContain("'$DEPENDENCY_ERROR_CODE'");
    expect(rehearsal).toContain("last_error_metadata->>'observedErrorCode'='DEPENDENCY_FAILURE'");
    expect(dependencyProbe).toContain("systemErrorCodeFromUnknown");
    expect(dependencyProbe).toContain("await fetch(target");
    expect(dependencyProbe).toContain("Refusing non-loopback dependency probe");
  });

  it("classifies the observed outage through the canonical retry contract", () => {
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries");
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("last_error_code='DEPENDENCY_FAILURE'");
    expect(rehearsal).toContain("consumer receipt appeared even though the dependency was unavailable");
  });

  it("restores the same dependency and proves one canonical converged effect", () => {
    expect(rehearsal).toContain("Restoring the same dependency endpoint");
    expect(rehearsal).toContain("studio2_process_jury_domain_event");
    expect(rehearsal).toContain("attempt_count=2");
    expect(rehearsal).toContain("exactly one immutable receipt");
    expect(rehearsal).toContain("recovery duplicated or lost the canonical DomainEvent");
    expect(rehearsal).toContain("restored dependency classifier probe did not observe a healthy dependency");
  });

  it("marks the scenario rehearsal-ready, not rehearsed, until exact-SHA execution evidence is retained", () => {
    const dependency = V3_FAILURE_INJECTION_COVERAGE.find(
      (entry) => entry.scenario === "unavailable_dependency",
    );
    expect(dependency?.state).toBe("rehearsal_ready");
    expect(dependency?.remainingGap).toContain("exact-SHA local execution evidence");
    expect(dependency?.productionTrafficRequired).toBe(false);
  });

  it("classifies an actual loopback connection refusal as DEPENDENCY_FAILURE", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    const port = await listenLoopback(server);
    await closeServer(server);

    let observedError: unknown;
    try {
      await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_500),
      });
    } catch (error) {
      observedError = error;
    }

    expect(observedError).toBeDefined();
    expect(systemErrorCodeFromUnknown(observedError)).toBe("DEPENDENCY_FAILURE");
  });
});
