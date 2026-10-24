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
  it("keeps the dependency fixture and actual probe strictly loopback-only", () => {
    expect(dependencyFixture).toContain('server.listen(port, "127.0.0.1"');
    expect(dependencyFixture).toContain('host: "127.0.0.1"');
    expect(dependencyProbe).toContain('target.hostname !== "127.0.0.1"');
    expect(dependencyProbe).toContain('target.hostname !== "localhost"');
    expect(dependencyProbe).toContain("Refusing non-loopback dependency probe");
    expect(dependencyProbe).toContain('redirect: "error"');
  });

  it("hard-refuses hosted infrastructure and binds evidence to a clean exact SHA", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("V3_S11_DEPENDENCY_SHA");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("runs the probe under Node after bundling the production classifier", () => {
    expect(rehearsal).toContain("bun build scripts/v3-s11-probe-dependency.ts");
    expect(rehearsal).toContain("--target=node");
    expect(rehearsal).toContain('node "$PROBE_BUNDLE" "$DEPENDENCY_URL"');
    expect(rehearsal).not.toContain("bun run scripts/v3-s11-probe-dependency.ts");
    expect(dependencyProbe).toContain("systemErrorCodeFromUnknown");
  });

  it("uses real Jury command and consumer boundaries instead of a synthetic outbox consumer", () => {
    expect(rehearsal).toContain("studio2_apply_jury_voting_status");
    expect(rehearsal).toContain("event_row.event_type='jury.closed'");
    expect(rehearsal).toContain("delivery.consumer_key='jury.tasks'");
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries('jury.tasks'");
    expect(rehearsal).toContain("studio2_process_jury_domain_event");
    expect(rehearsal).toContain("jury-task-reconciliation");
    expect(rehearsal).not.toContain("private.v3_emit_domain_event(");
    expect(rehearsal).not.toContain("insert into public.studio2_operation_receipts");
    expect(rehearsal).not.toContain("recovery.s11.dependency");
  });

  it("stops a real process and persists only the observed SystemError classification", () => {
    expect(rehearsal).toContain('kill "$DEPENDENCY_PID"');
    expect(rehearsal).toContain('wait "$DEPENDENCY_PID"');
    expect(rehearsal).toContain('DEPENDENCY_ERROR_CODE="$(probe_dependency)"');
    expect(rehearsal).toContain("instead of DEPENDENCY_FAILURE");
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("'$DEPENDENCY_ERROR_CODE'");
    expect(rehearsal).toContain("real_connection_failure");
  });

  it("restores the same endpoint and proves exactly-once convergence while retaining failure history", () => {
    expect(rehearsal).toContain('DEPENDENCY_PORT="$ORIGINAL_DEPENDENCY_PORT"');
    expect(rehearsal).toContain("restored dependency did not bind the original port");
    expect(rehearsal).toContain("pending:1:DEPENDENCY_FAILURE");
    expect(rehearsal).toContain("completed:2:DEPENDENCY_FAILURE");
    expect(rehearsal).toContain("exactly one immutable consumer receipt");
    expect(rehearsal).toContain("duplicate Jury consumer processing did not report replay");
    expect(rehearsal).toContain('RECEIPT_AFTER_REPLAY" == "$RECEIPT_BEFORE_REPLAY');
  });

  it("classifies the Node-runtime connection refusal used by the rehearsal", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    const port = await listenLoopback(server);
    await closeServer(server);

    let observedError: unknown;
    try {
      await fetch(`http://127.0.0.1:${port}/health`, {
        redirect: "error",
        signal: AbortSignal.timeout(1_500),
      });
    } catch (error) {
      observedError = error;
    }

    expect(observedError).toBeDefined();
    expect(systemErrorCodeFromUnknown(observedError)).toBe("DEPENDENCY_FAILURE");
  });

  it("does not follow redirects away from the validated loopback request", async () => {
    let destinationHits = 0;
    const destination = createServer((_request, response) => {
      destinationHits += 1;
      response.writeHead(204);
      response.end();
    });
    const destinationPort = await listenLoopback(destination);

    const redirector = createServer((_request, response) => {
      response.writeHead(302, {
        location: `http://127.0.0.1:${destinationPort}/escaped`,
      });
      response.end();
    });
    const redirectorPort = await listenLoopback(redirector);

    try {
      await expect(
        fetch(`http://127.0.0.1:${redirectorPort}/health`, {
          redirect: "error",
          signal: AbortSignal.timeout(1_500),
        }),
      ).rejects.toBeDefined();
      expect(destinationHits).toBe(0);
    } finally {
      await closeServer(redirector);
      await closeServer(destination);
    }
  });

  it("emits only local exact-SHA evidence and never claims S11 certification", () => {
    expect(rehearsal).toContain('scenario: "unavailable_dependency"');
    expect(rehearsal).toContain('environment: "local-supabase"');
    expect(rehearsal).toContain("productionTrafficRequired: false");
    expect(rehearsal).toContain("certificationClaim: false");
    expect(rehearsal).toContain("V3_S11_DEPENDENCY_OUTPUT");
  });
});
