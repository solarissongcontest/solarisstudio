import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { applyEditionMetadataChange } from "./edition-authority";
const input = { editionId: "edition-a", expectedRevision: 4, patch: { event_date: "2026-09-16" }, reason: "Reviewed historical date" };
const receipt = { ok: true, operationId: "27184517-0000-4000-8000-000000000101", replayed: false, edition: { id: "edition-a", data_revision: 5 } };
describe("governed edition metadata transport", () => {
  beforeEach(() => rpc.mockReset());
  it("uses identical semantic arguments after an ambiguous response", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "Network failed" }, data: null }).mockResolvedValueOnce({ error: null, data: { ...receipt, replayed: true } });
    expect((await applyEditionMetadataChange(input)).replayed).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("does not retry stale or unauthorized commands", async () => {
    const error = { code: "PT409", message: "STATE_CHANGED" };
    rpc.mockResolvedValue({ error, data: null });
    await expect(applyEditionMetadataChange(input)).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects receipts for another edition or a non-advancing version", async () => {
    for (const edition of [{ id: "edition-b", data_revision: 5 }, { id: "edition-a", data_revision: 4 }]) {
      rpc.mockResolvedValue({ error: null, data: { ...receipt, edition } });
      await expect(applyEditionMetadataChange(input)).rejects.toThrow("confirmed canonical receipt");
    }
  });
  it("fails closed before sending an unsafe revision", async () => {
    for (const expectedRevision of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(applyEditionMetadataChange({ ...input, expectedRevision })).rejects.toThrow("Reload");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
