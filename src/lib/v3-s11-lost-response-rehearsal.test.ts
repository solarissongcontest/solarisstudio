import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-lost-response-rehearsal.sh"),
  "utf8",
);
const proxy = readFileSync(
  resolve(process.cwd(), "scripts/v3-drop-upstream-response-proxy.mjs"),
  "utf8",
);

describe("System V3 S11 lost-response recovery rehearsal", () => {
  it("hard-refuses hosted targets on both the rehearsal and response-drop proxy", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(proxy).toContain("refusing non-loopback upstream");
    expect(proxy).toContain('server.listen(listenPort, "127.0.0.1"');
  });

  it("uses a real governed R2 Jury-window mutation rather than a synthetic receipt-only claim", () => {
    expect(rehearsal).toContain("studio2_apply_jury_voting_status");
    expect(rehearsal).toContain("p_expected_version");
    expect(rehearsal).toContain("command='jury.window.closed'");
    expect(rehearsal).toContain("event_type='jury.closed'");
  });

  it("drops only the downstream client response after fully consuming upstream success", () => {
    expect(proxy).toContain('upstreamResponse.on("end"');
    expect(proxy).toContain("responseBody");
    expect(proxy).toContain("clientResponse.socket?.destroy()");
    expect(proxy).toContain("Deliberately do not forward the committed upstream response");
    expect(rehearsal).toContain("client unexpectedly received a normal response instead of a transport failure");
    expect(rehearsal).toContain("upstreamStatus");
  });

  it("verifies durable commit before retry and exact idempotent convergence after retry", () => {
    expect(rehearsal).toContain("committed R2 operation receipt missing after response loss");
    expect(rehearsal).toContain("canonical Jury window version did not advance exactly once");
    expect(rehearsal).toContain("committed Jury close did not emit exactly one canonical DomainEvent");
    expect(rehearsal).toContain("exact retry duplicated the canonical operation receipt");
    expect(rehearsal).toContain("exact retry re-executed the Jury mutation");
    expect(rehearsal).toContain("exact retry duplicated the canonical Jury DomainEvent");
  });

  it("marks the new real transport-failure and lost-response paths rehearsal-ready pending retained run evidence", () => {
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "lost_response_after_commit")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "transient_rpc_failure")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog")?.state,
    ).toBe("contract_only");
  });
});
