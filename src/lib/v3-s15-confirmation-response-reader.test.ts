import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/confirmations/client", () => ({
  confirmationsSupabase: { rpc },
}));

import {
  loadConfirmationResponsesPage,
  loadAllConfirmationResponsesForEdition,
} from "@/integrations/confirmations/v3-projections";

const A = "00000000-0000-4000-8000-00000000e731";
const B = "00000000-0000-4000-8000-00000000e732";
const S1 = "00000000-0000-4000-8000-00000000f731";
const S2 = "00000000-0000-4000-8000-00000000f732";

type Row = {
  id: string;
  editions: { id: string };
};

function envelope(editionId: string, rows: Row[], options: {
  stateVersion?: string | null;
  hasMore?: boolean;
  nextCursor?: { submittedAt: string; submissionId: string } | null;
  totalCount?: number;
} = {}) {
  return {
    schemaVersion: 1,
    editionId,
    rows,
    totalCount: options.totalCount ?? rows.length,
    stateVersion: options.stateVersion === undefined ? "revision-1" : options.stateVersion,
    serverTime: "2026-11-04T10:00:00Z",
    page: {
      limit: 1,
      hasMore: options.hasMore ?? false,
      nextCursor: options.nextCursor ?? null,
    },
  };
}

function respond(body: unknown) {
  rpc.mockResolvedValueOnce({ data: body, error: null });
}

beforeEach(() => rpc.mockReset());

describe("V3 Organizer exact-edition Confirmation page client", () => {
  it("fails closed without an explicit edition before sending an RPC", async () => {
    await expect(loadConfirmationResponsesPage<Row>("")).rejects.toThrow("exact Organizer edition");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls only the bounded V2 server projection with exact edition scope", async () => {
    respond(envelope(A, [{ id: S1, editions: { id: A } }]));
    const page = await loadConfirmationResponsesPage<Row>(A);
    expect(page.rows).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("admin_confirmation_responses_v2", {
      p_edition_id: A,
      p_limit: 100,
      p_before_submitted_at: null,
      p_before_submission_id: null,
    });
  });

  it("rejects a server envelope or row from the wrong edition", async () => {
    respond(envelope(B, [{ id: S2, editions: { id: B } }]));
    await expect(loadConfirmationResponsesPage<Row>(A)).rejects.toThrow("different Organizer edition");
    respond(envelope(A, [{ id: S2, editions: { id: B } }]));
    await expect(loadConfirmationResponsesPage<Row>(A)).rejects.toThrow("crossed the selected edition");
  });

  it("keeps the next cursor bound to the requested edition and state version", async () => {
    respond(envelope(A, [{ id: S1, editions: { id: A } }], {
      hasMore: true,
      totalCount: 2,
      nextCursor: { submittedAt: "2026-11-04T09:00:00Z", submissionId: S1 },
    }));
    const first = await loadConfirmationResponsesPage<Row>(A, null, 1);
    expect(first.page.nextCursor).toEqual({
      submittedAt: "2026-11-04T09:00:00Z",
      submissionId: S1,
      editionId: A,
      stateVersion: "revision-1",
    });
    respond(envelope(A, [{ id: S2, editions: { id: A } }], {
      stateVersion: "revision-1",
      totalCount: 2,
    }));
    const second = await loadConfirmationResponsesPage<Row>(A, first.page.nextCursor, 1);
    expect(second.rows[0].id).toBe(S2);
    expect(rpc).toHaveBeenLastCalledWith("admin_confirmation_responses_v2", {
      p_edition_id: A,
      p_limit: 1,
      p_before_submitted_at: "2026-11-04T09:00:00Z",
      p_before_submission_id: S1,
    });
  });

  it("rejects stale snapshots and a cursor from another edition before leaking data", async () => {
    respond(envelope(A, [{ id: S1, editions: { id: A } }], {
      hasMore: true,
      nextCursor: { submittedAt: "2026-11-04T09:00:00Z", submissionId: S1 },
      totalCount: 2,
    }));
    const first = await loadConfirmationResponsesPage<Row>(A);
    await expect(loadConfirmationResponsesPage<Row>(B, first.page.nextCursor)).rejects.toThrow(
      "does not belong",
    );
    expect(rpc).toHaveBeenCalledTimes(1);

    respond(envelope(A, [{ id: S2, editions: { id: A } }], {
      stateVersion: "revision-2",
      totalCount: 2,
    }));
    await expect(
      loadConfirmationResponsesPage<Row>(A, first.page.nextCursor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("does not allow an unversioned continuation cursor or missing server pagination state", async () => {
    await expect(loadConfirmationResponsesPage<Row>(A, {
      submittedAt: "2026-11-04T09:00:00Z",
      submissionId: S1,
      editionId: A,
      stateVersion: "",
    })).rejects.toThrow("snapshot");
    expect(rpc).not.toHaveBeenCalled();
    respond(envelope(A, [{ id: S1, editions: { id: A } }], {
      stateVersion: null,
      hasMore: true,
      nextCursor: { submittedAt: "2026-11-04T09:00:00Z", submissionId: S1 },
    }));
    await expect(loadConfirmationResponsesPage<Row>(A)).rejects.toThrow("state version");
  });

  it("bounds multi-page operational reads and fails when the canonical count changes", async () => {
    respond(envelope(A, [{ id: S1, editions: { id: A } }], {
      hasMore: true,
      nextCursor: { submittedAt: "2026-11-04T09:00:00Z", submissionId: S1 },
      totalCount: 3,
    }));
    respond(envelope(A, [{ id: S2, editions: { id: A } }], {
      totalCount: 3,
    }));
    await expect(loadAllConfirmationResponsesForEdition<Row>(A, 2)).rejects.toMatchObject({
      status: 409,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
