import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { systemErrorCodeFromUnknown } from "./system-error";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-unavailable-dependency-rehearsal.sh"),
  "utf8",
);
const dependencyFixture = readFileSync(
  resolve(process.cwd(), "scripts/v3-s11-loopback-dependency.mjs"),
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

describe("System V3 S11 real unavailable-dependency recovery", () => {
  it("keeps the dependency fixture and probe strictly loopback-only", () => {
    expect(dependencyFixture).toContain('server.listen(port, "127.0.0.1"');
    expect(dependencyFixture).toContain('host: "127.0.0.1"');
    expect(dependencyProbe).toContain('target.hostname !== "127.0.0.1"');
    expect(dependencyProbe).toContain('target.hostname !== "localhost"');
    expect(dependencyProbe).toContain("Refusing non-loopback dependency probe");
  });

  it("hard-refuses hosted Supabase/database rehearsal targets", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("http://127.0.0.1:");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("uses a real process outage and the canonical SystemError classifier", () => {
    expect(rehearsal).toContain('kill "$DEPENDENCY_PID"');
    expect(rehearsal).toContain('wait "$DEPENDENCY_PID"');
    expect(rehearsal).toContain("DEPENDENCY_ERROR_CODE=\"$(probe_dependency)\"");
    expect(rehearsal).toContain("instead of DEPENDENCY_FAILURE");
    expect(dependencyProbe).toContain("systemErrorCodeFromUnknown");
    expect(dependencyProbe).toContain("await fetch(target");
  });

  it("records and recovers through only the canonical S4 delivery boundaries", () => {
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries");
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("last_error_code");
    expect(rehearsal).toContain("pending:1:DEPENDENCY_FAILURE");
    expect(rehearsal).toContain("studio2_complete_domain_event_delivery");
  });

  it("restores the same endpoint and proves exactly-once convergence with failure history", () => {
    expect(rehearsal).toContain('DEPENDENCY_PORT="$ORIGINAL_DEPENDENCY_PORT"');
    expect(rehearsal).toContain("restored dependency did not bind the original port");
    expect(rehearsal).toContain("completed:2:DEPENDENCY_FAILURE");
    expect(rehearsal).toContain("preserve canonical attempt/error history");
    expect(rehearsal).toContain("exactly one immutable consumer receipt");
    expect(rehearsal).toContain("duplicate completion did not report replay");
    expect(rehearsal).toContain("duplicate recovery completion created another consumer receipt");
    expect(rehearsal).toContain("duplicate recovery completion rewrote the immutable receipt");
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
