import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rollout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/terra-world-public", () => ({
  fetchWorldPublicEnabled: mocks.rollout,
}));

import {
  getWorldCertifiedResolution,
  getWorldResolutionCandidate,
  listWorldCertifiedResolutions,
  materializeWorldCertifiedResolution,
  parseWorldCertifiedResolution,
  parseWorldCertifiedResolutionDetail,
  parseWorldResolutionCandidate,
  parseWorldResolutionReceipt,
} from "./world-certified-resolutions";

const org = "11111111-1111-4111-8111-111111111111";
const vote = "22222222-2222-4222-8222-222222222222";
const measure = "33333333-3333-4333-8333-333333333333";
const resolution = "44444444-4444-4444-8444-444444444444";
const version = "55555555-5555-4555-8555-555555555555";
const operation = "66666666-6666-4666-8666-666666666666";
const hash = "a".repeat(64);
const instant = "2026-11-07T12:00:00Z";
const listRow = {
  id: resolution, identifier: "GAG/SSC22/01/RES", title: "Official adoption",
  organizationSlug: "guard", organizationName: "GUARD", status: "adopted",
  adoptedAt: instant, voteId: vote, measureId: measure, resultHash: hash,
};
const detailRow = {
  ...listRow, measureId: undefined, text: "Official passed measure",
  effectiveAt: null, sourceMeasureId: measure,
  adoptedVersionId: version, sourceVersionHash: hash, revision: 1,
};
const candidate = {
  voteId: vote, measureId: measure, organizationId: org,
  identifier: listRow.identifier, title: listRow.title, text: detailRow.text,
  expectedMeasureRevision: 3, certifiedAt: instant, resultHash: hash,
};
const receipt = {
  ok: true, resolutionId: resolution, voteId: vote, sourceMeasureId: measure,
  identifier: listRow.identifier, status: "adopted",
  revision: 1, operationId: operation, replayed: false,
};
const receiptEnvelope = {
  status: "succeeded", command: "world.resolution.publish", operationId: operation,
  result: { ...receipt, replayed: undefined }, replayed: false,
};

describe("WORLD-06 TG9 certified resolutions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rollout.mockResolvedValue(true); });

  it("accepts only an official published result projection with a valid hash", () => {
    expect(parseWorldCertifiedResolution(listRow)).toEqual(listRow);
    expect(parseWorldCertifiedResolution({ ...listRow, resultHash: "not-a-hash" })).toBeNull();
    expect(parseWorldCertifiedResolution({ ...listRow, status: "pending" })).toBeNull();
  });

  it("keeps immutable source and certification identity in the detail parser", () => {
    expect(parseWorldCertifiedResolutionDetail(detailRow)?.sourceMeasureId).toBe(measure);
    expect(parseWorldCertifiedResolutionDetail({ ...detailRow, text: "" })).toBeNull();
    expect(parseWorldCertifiedResolutionDetail({ ...detailRow, adoptedVersionId: "bad-id" })).toBeNull();
  });

  it("rejects invented candidate outcomes and unauthenticated preview shape", () => {
    expect(parseWorldResolutionCandidate(candidate)).toEqual(candidate);
    expect(parseWorldResolutionCandidate({ ...candidate, expectedMeasureRevision: 0 })).toBeNull();
    expect(parseWorldResolutionCandidate({ ...candidate, resultHash: "no" })).toBeNull();
  });

  it("fails closed on dark World rollout before public query", async () => {
    mocks.rollout.mockResolvedValue(false);
    await expect(listWorldCertifiedResolutions("guard")).rejects.toThrow("not available");
    await expect(getWorldCertifiedResolution(resolution)).rejects.toThrow("not available");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses a bounded public list and does not read raw ballot or vote tables", async () => {
    mocks.rpc.mockResolvedValue({ data: [listRow], error: null });
    await expect(listWorldCertifiedResolutions("guard")).resolves.toEqual([listRow]);
    expect(mocks.rpc).toHaveBeenCalledWith("world_public_resolutions_v1", {
      p_organization_slug: "guard", p_limit: 20,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed official response instead of displaying partial content", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...listRow, measureId: null }], error: null })
      .mockResolvedValueOnce({ data: detailRow, error: null });
    await expect(listWorldCertifiedResolutions("guard")).rejects.toThrow("invalid");
    await expect(getWorldCertifiedResolution(resolution)).resolves.toMatchObject({
      sourceMeasureId: measure, adoptedVersionId: version,
    });
  });

  it("only shows a valid server-authorized frozen-source candidate", async () => {
    mocks.rpc.mockResolvedValue({ data: candidate, error: null });
    await expect(getWorldResolutionCandidate(vote)).resolves.toEqual(candidate);
    expect(mocks.rpc).toHaveBeenCalledWith("world_resolution_candidate_v1", { p_vote_id: vote });
  });

  it("requires an R2 receipt and verifies the same operation identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: receiptEnvelope, error: null })
      .mockResolvedValueOnce({ data: { ...receiptEnvelope, operationId: org }, error: null });
    const args = {
      voteId: vote, expectedMeasureRevision: 3,
      operationId: operation, idempotencyKey: "safe-retry-key-1",
    };
    await expect(materializeWorldCertifiedResolution(args)).resolves.toEqual(receipt);
    expect(mocks.rpc).toHaveBeenCalledWith("world_materialize_certified_resolution_v1", {
      p_vote_id: vote, p_expected_measure_revision: 3,
      p_operation_id: operation, p_idempotency_key: "safe-retry-key-1",
      p_correlation_id: operation,
    });
    await expect(materializeWorldCertifiedResolution(args)).rejects.toThrow("receipt");
    expect(parseWorldResolutionReceipt(receipt)).toBeNull();
    expect(parseWorldResolutionReceipt({ ...receiptEnvelope, status: "invented" })).toBeNull();
    expect(parseWorldResolutionReceipt({ ...receiptEnvelope, command: "world.vote.certify" })).toBeNull();
  });

  it("recovers only a succeeded, actor-owned S2 publication receipt after a lost response", async () => {
    const args = {
      voteId: vote, expectedMeasureRevision: 3,
      operationId: operation, idempotencyKey: "same-command-retry-key",
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Network interrupted" } })
      .mockResolvedValueOnce({ data: { ...receiptEnvelope, replayed: undefined }, error: null });
    await expect(materializeWorldCertifiedResolution(args)).resolves.toEqual({ ...receipt, replayed: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("studio2_reconcile_operation", {
      p_operation_id: operation,
    });
  });

  it("rejects unrelated or unresolved receipts and does not invent publication success", async () => {
    const args = {
      voteId: vote, expectedMeasureRevision: 3,
      operationId: operation, idempotencyKey: "same-command-retry-key",
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Network interrupted" } })
      .mockResolvedValueOnce({ data: { ...receiptEnvelope, command: "world.vote.certify" }, error: null });
    await expect(materializeWorldCertifiedResolution(args)).rejects.toThrow("Network interrupted");
  });

  it("registers one canonical certified vote -> immutable resolution path and excludes private data", () => {
    const sql = readFileSync(
      "supabase/migrations/20261107140000_v3_tg9_certified_resolutions.sql", "utf8");
    const ui = readFileSync("src/components/world/WorldCertifiedResolutions.tsx", "utf8");
    for (const term of [
      "create table public.world_resolutions",
      "source_measure_id uuid not null unique",
      "vote_id uuid not null unique",
      "certification_hash text not null",
      "world_resolution_immutable",
      "world.resolution.publish",
      "public.world_access_allowed(",
      "private.studio2_claim_operation(",
      "private.studio2_complete_operation(",
      "private.v3_emit_domain_event(",
      "'world.resolution.adopted'",
      "v_result.outcome<>'passed'",
      "v_result.quorum_met",
      "v_result.threshold_met",
      "v_vote.measure_version_id",
      "v_version.publication_state<>'published'",
      "v_measure.visibility<>'public'",
      "result.result_hash=r.certification_hash",
      "public.studio2_feature_enabled('terra_world_public',null)",
      "public.world_resolution_candidate_v1",
    ]) expect(sql).toContain(term);
    expect(sql).toContain("revoke all on public.world_resolutions from public,anon,authenticated,service_role");
    expect(sql).not.toMatch(/create table (?:public\.)?world_ballots/i);
    expect(sql).not.toContain("grant insert on public.world_resolutions to authenticated");
    expect(ui).not.toContain("onChange={(e) => setBody");
    expect(ui).toContain("The text below is locked");
    expect(ui).toContain("operationId: crypto.randomUUID()");
  });
});
