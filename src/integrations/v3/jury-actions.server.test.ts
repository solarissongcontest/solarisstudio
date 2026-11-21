import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/integrations/supabase/organizer.server", () => ({
  getSolarisAccessTokenServer: () => "isolated-token",
  createSolarisAuthenticatedClientServer: () => ({
    auth: { getUser: mock.getUser }, rpc: mock.rpc,
  }),
}));
import {
  lookupV3JuryReceiptServer,
  reconcileV3JurySubmissionServer,
  submitV3JuryBallotServer,
} from "./jury-actions.server";

const showId = "synthetic-semi-one";
const operationId = "synthetic-operation";
const receipt = {
  authority: "authoritative_server", operation_id: operationId,
  receipt_id: "synthetic-receipt", ballot_submission_id: "synthetic-ballot",
  show_id: showId, voter_country_id: "synthetic-country",
  request_hash: "synthetic-hash", state_version: 1,
  accepted_at: "2026-11-21T00:00:00Z", server_time: "2026-11-21T00:00:00Z",
  replayed: false,
};
const submit = () => submitV3JuryBallotServer({
  showId, operationId, entries: [], preflightId: "synthetic-preflight",
});
beforeEach(() => {
  mock.rpc.mockReset();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: "synthetic-actor" } }, error: null });
});
describe("Jury authoritative receipt response scope (isolated RPC mock)", () => {
  it("accepts submission and replay with the original scoped receipt", async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, receipt }, error: null });
    expect((await submit()).receipt?.showId).toBe(showId);
    mock.rpc.mockResolvedValue({ data: { ok: true, found: true, receipt: { ...receipt, replayed: true } }, error: null });
    expect((await reconcileV3JurySubmissionServer(operationId)).receipt?.operationId).toBe(operationId);
    expect((await lookupV3JuryReceiptServer(showId)).receipt?.replayed).toBe(true);
  });
  it.each(["show_id", "operation_id"])("rejects a submission receipt with mismatched %s", async (field) => {
    mock.rpc.mockResolvedValue({ data: { ok: true, receipt: { ...receipt, [field]: "foreign" } }, error: null });
    await expect(submit()).rejects.toThrow(/different show or operation/);
  });
  it("rejects reconciliation of a different operation after a lost response", async () => {
    mock.rpc.mockResolvedValue({ data: { found: true, receipt: { ...receipt, operation_id: "foreign" } }, error: null });
    await expect(reconcileV3JurySubmissionServer(operationId)).rejects.toThrow(/different show or operation/);
  });
  it("rejects receipt readback from a different show", async () => {
    mock.rpc.mockResolvedValue({ data: { found: true, receipt: { ...receipt, show_id: "synthetic-semi-two" } }, error: null });
    await expect(lookupV3JuryReceiptServer(showId)).rejects.toThrow(/different show or operation/);
  });
  it("preserves non-enumerating missing reconciliation and legacy receipt states", async () => {
    mock.rpc.mockResolvedValue({ data: { found: false }, error: null });
    expect(await reconcileV3JurySubmissionServer(operationId)).toEqual({ found: false });
    mock.rpc.mockResolvedValue({ data: { found: false, submitted: true, legacy: true }, error: null });
    expect(await lookupV3JuryReceiptServer(showId)).toMatchObject({ found: false, submitted: true, legacy: true, receipt: undefined });
  });
  it("denies unauthenticated calls before dispatching an RPC", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(submit()).rejects.toThrow("Not authenticated");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
