import { describe, expect, it, vi } from "vitest";
import {
  loadPublicResultAnalysisContext,
  type PublicResultAnalysisContextRpcClient,
} from "./v3-public-result-analysis-context";

function clientWith(data: unknown): PublicResultAnalysisContextRpcClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("V3 Public Result Analysis Context adapter", () => {
  it("loads one exact edition/show context and normalizes a seen version id", async () => {
    const versionId = `rv1_${"a".repeat(64)}`;
    const client = clientWith({
      schemaVersion: 1,
      available: true,
      editionId: "edition-22",
      showId: "final",
      resultVersion: 4,
      resultVersionId: versionId,
      resultRowCount: 66,
      currentPublic: true,
      seenResultVersionIsCurrent: true,
      serverTime: "2026-10-20T06:45:00Z",
    });

    await expect(
      loadPublicResultAnalysisContext(
        {
          editionId: "edition-22",
          showId: "final",
          seenResultVersionId: versionId.toUpperCase(),
        },
        client,
      ),
    ).resolves.toMatchObject({
      available: true,
      resultVersion: 4,
      resultVersionId: versionId,
      seenResultVersionIsCurrent: true,
    });

    expect(client.rpc).toHaveBeenCalledWith("v3_public_result_analysis_context", {
      p_edition_id: "edition-22",
      p_show_id: "final",
      p_seen_result_version_id: versionId,
    });
  });

  it("preserves generic unavailable semantics after withdrawal or unpublished state", async () => {
    const client = clientWith({
      schemaVersion: 1,
      available: false,
      editionId: "edition-22",
      showId: "final",
      reason: "results_unavailable",
      currentPublic: false,
      seenResultVersionIsCurrent: false,
      serverTime: "2026-10-20T06:46:00Z",
    });

    await expect(
      loadPublicResultAnalysisContext(
        {
          editionId: "edition-22",
          showId: "final",
          seenResultVersionId: `rv1_${"b".repeat(64)}`,
        },
        client,
      ),
    ).resolves.toEqual({
      schemaVersion: 1,
      available: false,
      editionId: "edition-22",
      showId: "final",
      reason: "results_unavailable",
      currentPublic: false,
      seenResultVersionIsCurrent: false,
      serverTime: "2026-10-20T06:46:00Z",
    });
  });

  it("fails closed when caller scope is missing or the returned scope drifts", async () => {
    await expect(
      loadPublicResultAnalysisContext(
        { editionId: "", showId: "final" },
        clientWith(null),
      ),
    ).rejects.toThrow("requires exact edition and show ids");

    await expect(
      loadPublicResultAnalysisContext(
        { editionId: "edition-22", showId: "final" },
        clientWith({
          schemaVersion: 1,
          available: false,
          editionId: "edition-21",
          showId: "final",
          reason: "results_unavailable",
          currentPublic: false,
          seenResultVersionIsCurrent: null,
          serverTime: "2026-10-20T06:47:00Z",
        }),
      ),
    ).rejects.toThrow("response scope does not match");
  });

  it("rejects malformed opaque version identities before or after transport", async () => {
    await expect(
      loadPublicResultAnalysisContext(
        {
          editionId: "edition-22",
          showId: "final",
          seenResultVersionId: "result-4",
        },
        clientWith(null),
      ),
    ).rejects.toThrow("invalid seen Result Version identity");

    await expect(
      loadPublicResultAnalysisContext(
        { editionId: "edition-22", showId: "final" },
        clientWith({
          schemaVersion: 1,
          available: true,
          editionId: "edition-22",
          showId: "final",
          resultVersion: 4,
          resultVersionId: "not-opaque",
          resultRowCount: 66,
          currentPublic: true,
          seenResultVersionIsCurrent: null,
          serverTime: "2026-10-20T06:48:00Z",
        }),
      ),
    ).rejects.toThrow("resultVersionId is invalid");
  });

  it("rejects impossible available/unavailable state combinations", async () => {
    await expect(
      loadPublicResultAnalysisContext(
        { editionId: "edition-22", showId: "final" },
        clientWith({
          schemaVersion: 1,
          available: true,
          editionId: "edition-22",
          showId: "final",
          resultVersion: 4,
          resultVersionId: `rv1_${"c".repeat(64)}`,
          resultRowCount: 66,
          currentPublic: false,
          seenResultVersionIsCurrent: null,
          serverTime: "2026-10-20T06:49:00Z",
        }),
      ),
    ).rejects.toThrow("Available Result Analysis Context must be public");

    await expect(
      loadPublicResultAnalysisContext(
        { editionId: "edition-22", showId: "final" },
        clientWith({
          schemaVersion: 1,
          available: false,
          editionId: "edition-22",
          showId: "final",
          reason: "results_unavailable",
          currentPublic: true,
          seenResultVersionIsCurrent: null,
          serverTime: "2026-10-20T06:49:00Z",
        }),
      ),
    ).rejects.toThrow("Unavailable Result Analysis Context cannot be public");
  });
});
