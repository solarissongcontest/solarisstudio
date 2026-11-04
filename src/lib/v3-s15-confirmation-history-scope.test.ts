import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/confirmations/client", () => ({
  confirmationsSupabase: { rpc },
}));

import { loadConfirmationVersionSummariesForEdition } from "@/integrations/confirmations/v3-version-summary";

const A = "00000000-0000-4000-8000-00000000e731";
const B = "00000000-0000-4000-8000-00000000e732";
const S1 = "00000000-0000-4000-8000-00000000f731";
const S2 = "00000000-0000-4000-8000-00000000f732";
const summary = (editionId: string, rows: unknown[] = []) => ({
  schemaVersion: 1,
  editionId,
  rows,
  serverTime: "2026-11-04T10:00:00Z",
});
const result = (data: unknown) => ({ data, error: null });

beforeEach(() => rpc.mockReset());

describe("exact-edition Confirmation History version summaries", () => {
  it("sends only bounded ids and edition scope to the exact System function", async () => {
    rpc.mockResolvedValueOnce(result(summary(A, [{
      submission_id: S1,
      version_count: 3,
      latest_created_at: "2026-11-04T08:00:00Z",
    }])));
    const summaries = await loadConfirmationVersionSummariesForEdition(A, [S1, S2]);
    expect(summaries.get(S1)?.version_count).toBe(3);
    expect(summaries.has(S2)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("admin_confirmation_version_summary_v2", {
      p_edition_id: A,
      p_submission_ids: [S1, S2],
    });
  });

  it("never invokes RPC without a valid edition or valid per-edition submission identities", async () => {
    await expect(loadConfirmationVersionSummariesForEdition("", [S1])).rejects.toThrow("exact Organizer edition");
    await expect(loadConfirmationVersionSummariesForEdition(A, ["not-a-uuid"])).rejects.toThrow("Invalid bounded");
    await expect(loadConfirmationVersionSummariesForEdition(A, [S1, S1])).rejects.toThrow("Duplicate");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on another edition's envelope or leaked submission id", async () => {
    rpc.mockResolvedValueOnce(result(summary(B)));
    await expect(loadConfirmationVersionSummariesForEdition(A, [S1])).rejects.toThrow("edition boundary");

    rpc.mockResolvedValueOnce(result(summary(A, [{
      submission_id: S2,
      version_count: 1,
      latest_created_at: null,
    }])));
    await expect(loadConfirmationVersionSummariesForEdition(A, [S1])).rejects.toThrow("cross-edition");
  });

  it("fails closed on corrupt counts, duplicate summaries or invalid timestamps", async () => {
    rpc.mockResolvedValueOnce(result(summary(A, [{
      submission_id: S1,
      version_count: -1,
      latest_created_at: "2026-11-04T08:00:00Z",
    }])));
    await expect(loadConfirmationVersionSummariesForEdition(A, [S1])).rejects.toThrow("Invalid or cross-edition");

    rpc.mockResolvedValueOnce(result(summary(A, [{
      submission_id: S1,
      version_count: 1,
      latest_created_at: "not-a-time",
    }])));
    await expect(loadConfirmationVersionSummariesForEdition(A, [S1])).rejects.toThrow("Invalid or cross-edition");
  });

  it("splits at 200 ids, with no unbounded server request or global fallback", async () => {
    const ids = Array.from({ length: 201 }, (_, index) =>
      `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    );
    rpc.mockResolvedValueOnce(result(summary(A))).mockResolvedValueOnce(result(summary(A)));
    const all = await loadConfirmationVersionSummariesForEdition(A, ids);
    expect(all.size).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_submission_ids).toHaveLength(200);
    expect(rpc.mock.calls[1][1].p_submission_ids).toHaveLength(1);

    rpc.mockClear();
    const tooMany = Array.from({ length: 5001 }, (_, index) =>
      `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    );
    await expect(loadConfirmationVersionSummariesForEdition(A, tooMany)).rejects.toThrow("Invalid bounded");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an empty index without extra network traffic when there are no submissions", async () => {
    expect((await loadConfirmationVersionSummariesForEdition(A, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
