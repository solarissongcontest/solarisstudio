import { describe, expect, it } from "vitest";
import {
  isSensitiveVotingAuditField,
  redactVotingAuditPayload,
  REDACTED_VOTING_AUDIT_VALUE,
} from "./v3-voting-audit-redaction";
import { readFileSync } from "node:fs";

describe("Voting audit read-projection redaction", () => {
  it("masks nested credential fields in history without changing ordinary evidence", () => {
    const old = {
      action: "round_recalculated",
      actor: "test-organizer",
      old_values: {
        status: "draft",
        points: [12, 10, 8],
        access_token: "should-not-leave-server",
        child: [{ refreshToken: "refresh-secret", reason: "manual correction" }],
      },
      new_values: { service_role_key: "server-secret", source_id: "test-source" },
    };
    const safe = redactVotingAuditPayload(old);
    expect(safe).toEqual({
      action: "round_recalculated",
      actor: "test-organizer",
      old_values: {
        status: "draft",
        points: [12, 10, 8],
        access_token: REDACTED_VOTING_AUDIT_VALUE,
        child: [{ refreshToken: REDACTED_VOTING_AUDIT_VALUE, reason: "manual correction" }],
      },
      new_values: { service_role_key: REDACTED_VOTING_AUDIT_VALUE, source_id: "test-source" },
    });
    expect(old.old_values.access_token).toBe("should-not-leave-server");
  });

  it("does not mask benign, similarly named audit evidence", () => {
    expect(isSensitiveVotingAuditField("secretary_name")).toBe(false);
    expect(isSensitiveVotingAuditField("point_total")).toBe(false);
    expect(isSensitiveVotingAuditField("Authorization")).toBe(true);
    expect(isSensitiveVotingAuditField("clientSecret")).toBe(true);
    expect(isSensitiveVotingAuditField("session_token")).toBe(true);
    expect(redactVotingAuditPayload(null)).toBeNull();
    expect(redactVotingAuditPayload([1, "known", true])).toEqual([1, "known", true]);
  });

  it("fails closed on excessively nested input", () => {
    let nested: unknown = "deep secret";
    for (let i = 0; i < 40; i++) nested = { child: nested };
    const text = JSON.stringify(redactVotingAuditPayload(nested as never));
    expect(text).not.toContain("deep secret");
    expect(text).toContain(REDACTED_VOTING_AUDIT_VALUE);
  });

  it("redacts both old and new payloads on the SERVER before returning audit rows", () => {
    const server = readFileSync("src/integrations/televoting/audit.server.ts", "utf8");
    expect(server).toContain('import { redactVotingAuditPayload } from "@/lib/v3-voting-audit-redaction"');
    expect(server).toContain("old_values: redactVotingAuditPayload(");
    expect(server).toContain("new_values: redactVotingAuditPayload(");
    expect(server).toContain('requireSolarisCapabilityServer("voting.read", null)');
  });
});
