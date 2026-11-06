import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rollout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/terra-world-public", () => ({
  fetchWorldPublicEnabled: mocks.rollout,
}));
import {
  getWorldProceduralDecisionHistory,
  issueWorldProceduralDecision,
  listWorldProceduralDecisions,
  parseWorldProceduralDecision,
  parseWorldProceduralDecisionHistory,
} from "./world-procedural-decisions";

const decision = {
  id: "decision-1", identifier: "guard/EXEC/decision-1",
  organizationSlug: "guard",
  decisionKind: "procedural",
  publishedAt: "2026-11-07T02:00:00Z",
  effectiveAt: null,
  revision: 2,
  title: "Executive procedure",
  excerpt: "A correction was issued.",
  corrected: true,
};
const history = {
  id: "decision-1", identifier: "guard/EXEC/decision-1",
  organizationSlug: "guard",
  decisionKind: "procedural",
  publishedAt: "2026-11-07T02:00:00Z",
  effectiveAt: null,
  revision: 2,
  versions: [
    { id: "version-2", revision: 2, title: "Corrected procedure", body: "Revised body",
      correctionReason: "Corrected procedural date", publishedAt: "2026-11-07T03:00:00Z" },
    { id: "version-1", revision: 1, title: "Original procedure", body: "Original body",
      correctionReason: null, publishedAt: "2026-11-07T02:00:00Z" },
  ],
};

describe("TG9 procedural decisions: canonical authority and correction fidelity", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rollout.mockResolvedValue(true); });

  it("accepts only procedurally scoped public projections", () => {
    expect(parseWorldProceduralDecision(decision)).toEqual(decision);
    expect(parseWorldProceduralDecision({ ...decision, decisionKind: "appointment" })).toBeNull();
    expect(parseWorldProceduralDecision({ ...decision, corrected: false })).toBeNull();
    expect(parseWorldProceduralDecision({ ...decision, publishedAt: "" })).toBeNull();
  });

  it("requires every immutable correction version to be present in historical order", () => {
    expect(parseWorldProceduralDecisionHistory(history)?.versions.length).toBe(2);
    expect(parseWorldProceduralDecisionHistory({ ...history, versions: [history.versions[0]] })).toBeNull();
    expect(parseWorldProceduralDecisionHistory({
      ...history, versions: [...history.versions].reverse(),
    })).toBeNull();
  });

  it("does not fetch decisions when World rollout is disabled", async () => {
    mocks.rollout.mockResolvedValue(false);
    await expect(listWorldProceduralDecisions("guard")).rejects.toThrow("not available");
    await expect(getWorldProceduralDecisionHistory("decision-1")).rejects.toThrow("not available");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("limits list projections to 30 excerpts and rejects malformed rows", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [decision], error: null })
      .mockResolvedValueOnce({ data: [{ ...decision, decisionKind: "judgment" }], error: null });
    await expect(listWorldProceduralDecisions("guard", 50)).resolves.toEqual([decision]);
    expect(mocks.rpc).toHaveBeenCalledWith("world_public_executive_decisions_v1", {
      p_organization_slug: "guard", p_limit: 30,
    });
    await expect(listWorldProceduralDecisions("guard")).rejects.toThrow("Invalid");
  });

  it("shows no record for not-found and rejects partial historical responses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...history, versions: [] }, error: null });
    await expect(getWorldProceduralDecisionHistory("decision-1")).resolves.toBeNull();
    await expect(getWorldProceduralDecisionHistory("decision-1")).rejects.toThrow("incomplete");
  });

  it("rejects fake appointment decisions and corrections without a reason before RPC", async () => {
    const base = {
      organizationId: "org-1",
      decisionId: null,
      issuingOfficeId: "office-1",
      kind: "procedural" as const,
      title: "Executive procedure",
      body: "Official procedural decision",
      effectiveAt: null,
      correctionReason: null,
      expectedRevision: 0,
      operationId: "op-1", idempotencyKey: "key-1",
    };
    await expect(issueWorldProceduralDecision({ ...base, kind: "appointment" as any }))
      .rejects.toThrow("supplied");
    await expect(issueWorldProceduralDecision({ ...base, decisionId: "d-1",
      expectedRevision: 1, correctionReason: "" }))
      .rejects.toThrow("supplied");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a canonical S2 succeeded envelope, never a fabricated success", async () => {
    const input = {
      organizationId: "org-1", decisionId: null,
      issuingOfficeId: "office-1", kind: "scheduling" as const,
      title: "Executive schedule", body: "Publish event schedule",
      effectiveAt: "2026-11-08T12:00:00.000Z", correctionReason: null,
      expectedRevision: 0, operationId: "op-1", idempotencyKey: "key-1",
    };
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "succeeded", replayed: false,
        result: { ok: true, identifier: "guard/EXEC/1",
          decisionId: "d-1", versionId: "v-1",
          revision: 1, operationId: "op-1" } },
      error: null,
    }).mockResolvedValueOnce({ data: { status: "pending", replayed: true, result: {} }, error: null });
    await expect(issueWorldProceduralDecision(input)).resolves.toMatchObject({
      ok: true, identifier: "guard/EXEC/1", revision: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("world_issue_executive_decision_v1",
      expect.objectContaining({ p_operation_id: "op-1", p_idempotency_key: "key-1",
        p_expected_revision: 0, p_issuing_office_id: "office-1" }));
    await expect(issueWorldProceduralDecision(input)).rejects.toThrow("receipt");
  });

  it("retains one canonical executive-only writer, public RLS, history and rollout", () => {
    const sql = readFileSync(
      "supabase/migrations/20261107111000_v3_tg9_formal_procedural_decisions.sql", "utf8",
    );
    for (const token of [
      "create table public.world_decisions",
      "create table public.world_decision_versions",
      "world_executive_decision_no_assembly_origin check(organ_id is null)",
      "private.studio2_claim_operation(",
      "private.studio2_complete_operation(",
      "private.v3_emit_domain_event(",
      "public.world_access_allowed(",
      "term.started_at<=now() and term.actual_end_at is null",
      "world_decision_versions_immutable before update or delete",
      "world_decisions_public_read",
      "world_decision_versions_public_read",
      "limit least(greatest(coalesce(p_limit,20),1),30)",
      "left(v.body,320)",
      "revoke all on public.world_decisions,public.world_decision_versions",
    ]) expect(sql).toContain(token);
    expect(sql.split("public.studio2_feature_enabled('terra_world_public',null)")).toHaveLength(5);
    expect(sql).not.toMatch(/grant all on public.world_decisions/i);
    expect(sql).not.toMatch(/create table (?:public\.)?world_tasks\b/i);
    expect(sql).toContain("for share of term,office_row");
    expect(sql).toContain("from public.world_organizations where id=p_organization_id");
    const rehearsal = readFileSync("scripts/rehearse-v3-world-procedural-decisions.sql","utf8");
    const runner = readFileSync("scripts/rehearse-v3-world-procedural-decisions.sh","utf8");
    for (const marker of ["TG9_DECISION_DIRECT_WRITER_PRESENT","TG9_DECISION_DARK_ROLLOUT_LEAK",
      "TG9_DECISION_SILENT_HISTORY_REWRITE","rollback;"]) {
      expect(rehearsal).toContain(marker);
    }
    expect(runner).toContain("Refusing hosted API");
    expect(runner).toContain("Refusing non-loopback database");
  });
});
