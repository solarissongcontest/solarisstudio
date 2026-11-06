import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));
vi.mock("@/lib/world-session-public", () => ({
  listWorldOrganizationOptions: vi.fn(async () => []),
}));
import {
  getWorldMeasureDetail, isWorldUuid, listWorldMeasures,
  parseWorldMeasureDetail, parseWorldMeasureListItem, parseWorldMeasureManager,
  parseWorldMeasureReceipt, submitWorldMeasure, validateWorldMeasureSubmit,
} from "./world-measure-commands";

const id = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const organizationId = "44444444-4444-4444-8444-444444444444";
const organId = "55555555-5555-4555-8555-555555555555";
const countryId = "66666666-6666-4666-8666-666666666666";

const published = {
  id, organizationSlug: "guard", organName: "General Assembly of GUARD",
  identifier: "GAG.2026.1.OL.TOPIC.Short Title", shortTitle: "Short Title",
  measureType: "proposal", title: "Test proposal", summary: "Published summary",
  state: "registered", sponsorCountryCode: "OL", categoryCode: "TOPIC",
  submittedAt: "2026-11-06T11:00:00Z",
  registeredAt: "2026-11-06T12:00:00Z", revision: 2,
};
const publishedVersion = {
  id: versionId, number: 1, title: "Test proposal", text: "Formal measure body.",
  summary: "Published summary", contentHash: "a".repeat(64),
  createdAt: "2026-11-06T11:00:00Z",
};
const publicDetail = {
  id: published.id, organizationSlug: published.organizationSlug, organName: published.organName,
  identifier: published.identifier, shortTitle: published.shortTitle,
  measureType: published.measureType, state: published.state, categoryCode: published.categoryCode,
  categoryLabel: "Example", sponsorCountryCode: published.sponsorCountryCode,
  registeredAt: published.registeredAt, revision: published.revision,
  currentVersion: publishedVersion,
  publishedHistory: [{ id: versionId, number: 1, title: "Test proposal",
    createdAt: publishedVersion.createdAt, contentHash: publishedVersion.contentHash }],
};
const privateManager = {
  id, organizationId, organId, sponsorCountryId: countryId,
  state: "needs_correction", visibility: "members", identifier: null,
  proceduralNote: "Clarify the sponsor's text.", revision: 3,
  versions: [{ id: versionId, number: 1, title: "Test proposal",
    text: "Original private proposal body", summary: null,
    publicationState: "draft", createdAt: "2026-11-06T11:00:00Z" }],
  versionsTruncated: false,
  reviews: [{ action: "correction_requested", note: "Clarify the sponsor's text.",
    revision: 3, createdAt: "2026-11-06T11:05:00Z" }],
  reviewsTruncated: false,
};

describe("WORLD-05 TG7 actual RPC consumers", () => {
  beforeEach(() => rpcMock.mockReset());

  it("rejects missing, duplicate or corrupt public identities rather than displaying guessed records", () => {
    expect(parseWorldMeasureListItem(published).identifier).toBe(published.identifier);
    expect(() => parseWorldMeasureListItem({ ...published, id: "not-a-uuid" })).toThrow();
    expect(() => parseWorldMeasureListItem({ ...published, state: "draft" })).toThrow();
    expect(() => parseWorldMeasureListItem({ ...published, registeredAt: undefined })).toThrow();
    expect(isWorldUuid(id)).toBe(true);
    expect(isWorldUuid("unpublished")).toBe(false);
  });

  it("parses the actual TG7 detail RPC envelope without inventing missing submittedAt", () => {
    const detail = parseWorldMeasureDetail(publicDetail);
    expect(detail?.submittedAt).toBeNull();
    expect(detail?.currentVersion.text).toBe("Formal measure body.");
    expect(detail?.summary).toBe("Published summary");
    expect(detail?.publishedHistory).toHaveLength(1);
    expect(parseWorldMeasureDetail(null)).toBeNull();
    expect(() => parseWorldMeasureDetail({
      ...publicDetail, currentVersion: { ...publishedVersion, text: null },
    })).toThrow();
    expect(() => parseWorldMeasureDetail({
      ...publicDetail, publishedHistory: [{ ...publicDetail.publishedHistory[0], id: "bad" }],
    })).toThrow();
  });

  it("keeps private procedural text behind the manager RPC projection", () => {
    const result = parseWorldMeasureManager(privateManager);
    expect(result.versions[0].text).toBe("Original private proposal body");
    expect(result.reviews[0].note).toContain("Clarify");
    expect(() => parseWorldMeasureManager({ ...privateManager, versionsTruncated: null })).toThrow();
    expect(() => parseWorldMeasureManager({
      ...privateManager, versions: Array.from({ length: 21 }, () => privateManager.versions[0]),
    })).toThrow();
  });

  it("validates receipts against exact operation IDs and revision", () => {
    const valid = { ok: true, measureId: id, operationId, revision: 1,
      state: "submitted", replayed: false };
    expect(parseWorldMeasureReceipt(valid, operationId)).toEqual(valid);
    expect(() => parseWorldMeasureReceipt(valid, "77777777-7777-4777-8777-777777777777")).toThrow();
    expect(() => parseWorldMeasureReceipt({ ...valid, replayed: null }, operationId)).toThrow();
  });

  it("fetches a bounded public projection only through the publication-safe RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: [published], error: null });
    const results = await listWorldMeasures(null);
    expect(results).toHaveLength(1);
    expect(rpcMock).toHaveBeenCalledWith("world_measure_public_list_v1",
      { p_organization_slug: null, p_limit: 50 });
    rpcMock.mockResolvedValueOnce({ data: Array(51).fill(published), error: null });
    await expect(listWorldMeasures(null)).rejects.toThrow(/collection/);
  });

  it("uses the server's publication decision for direct measure links", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getWorldMeasureDetail(id)).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith("world_measure_public_detail_v1", { p_measure_id: id });
    rpcMock.mockReset();
    expect(await getWorldMeasureDetail("bad")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses malformed formal text and operation context", () => {
    const valid = { organizationId, organId, sponsorCountryId: countryId,
      measureType: "proposal", title: "Qualified text", fullText: "Formal body",
      summary: "", categoryCode: null, operationId };
    expect(validateWorldMeasureSubmit(valid)).toBeNull();
    expect(validateWorldMeasureSubmit({ ...valid, organizationId: "" })).not.toBeNull();
    expect(validateWorldMeasureSubmit({ ...valid, fullText: "" })).not.toBeNull();
    expect(validateWorldMeasureSubmit({ ...valid, fullText: "x".repeat(25001) })).not.toBeNull();
    expect(validateWorldMeasureSubmit({ ...valid, summary: "x".repeat(2001) })).not.toBeNull();
    expect(validateWorldMeasureSubmit({ ...valid, measureType: "invented" })).not.toBeNull();
  });

  it("submits with a durable server receipt and stable matching idempotency key", async () => {
    const valid = { organizationId, organId, sponsorCountryId: countryId,
      measureType: "proposal", title: "New proposal", fullText: "Formal body",
      summary: "", categoryCode: null, operationId };
    rpcMock.mockResolvedValueOnce({ data: {
      ok: true, measureId: id, operationId, revision: 1,
      state: "submitted", replayed: false,
    }, error: null });
    const result = await submitWorldMeasure(valid);
    expect(result.measureId).toBe(id);
    expect(rpcMock).toHaveBeenCalledWith("world_measure_submit_v1", expect.objectContaining({
      p_organization_id: organizationId, p_organ_id: organId,
      p_sponsor_country_id: countryId, p_operation_id: operationId,
      p_idempotency_key: "world.measure.submit:" + operationId,
    }));
  });

  it("never bypasses existing mutation/RLS authority and keeps public rollout gating", () => {
    const service = readFileSync(resolve(process.cwd(), "src/lib/world-measure-commands.ts"), "utf8");
    expect(service).not.toMatch(/\.from\(["']world_measures["']\)/);
    expect(service).not.toMatch(/\.from\(["']world_measure_versions["']\)/);
    expect(service).not.toMatch(/\.from\(["']world_measure_procedural_reviews["']\)/);
    for (const route of [
      "src/routes/world/measures/index.tsx",
      "src/routes/world/measures/new.tsx",
      "src/routes/world/measures/$measureId/index.tsx",
      "src/routes/world/measures/$measureId/manage.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), route), "utf8");
      expect(source).toMatch(/<WorldPublicGate verifyOnMount>/);
      expect(source).toMatch(/<AppShell>/);
    }
  });
});
