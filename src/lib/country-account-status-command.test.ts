import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { executeCountryAccountStatus, type CountryAccountStatusCommand } from "./country-account-status-command";

const command: CountryAccountStatusCommand = {
  userId: "owner", countryId: "country", status: "suspended", reason: "Reviewed",
  expectedUpdatedAt: "2026-11-05T12:00:00.123456Z", operationId: "operation", idempotencyKey: "intent",
};
const receipt = { ok: true, userId: "owner", countryId: "country", status: "suspended", updatedAt: "2026-11-05T12:00:01.123457Z", operationId: "operation", receiptId: "operation", replayed: false };

beforeEach(() => rpc.mockReset());
describe("country account status command", () => {
  it("preserves the reviewed microsecond version and operation identity", async () => {
    rpc.mockResolvedValue({ data: receipt, error: null });
    await expect(executeCountryAccountStatus(command)).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith("v3_set_country_account_status", {
      p_user_id: "owner", p_status: "suspended", p_reason: "Reviewed", p_expected_updated_at: command.expectedUpdatedAt,
      p_operation_id: "operation", p_idempotency_key: "intent",
    });
  });
  it("retries an uncertain transport response with the identical operation and accepts replay", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } })
      .mockResolvedValueOnce({ data: { ...receipt, replayed: true }, error: null });
    await expect(executeCountryAccountStatus(command)).resolves.toMatchObject({ replayed: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
  it.each(["42501", "40001", "PGRST301"])("does not retry a definitive %s rejection", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Denied" } });
    await expect(executeCountryAccountStatus(command)).rejects.toMatchObject({ code });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { userId: "different" }, { countryId: "different" }, { status: "active" },
    { operationId: "different" }, { receiptId: "different" }, { replayed: null }, { updatedAt: "invalid" },
  ])("rejects a receipt that does not confirm the reviewed operation: %j", async (change) => {
    rpc.mockResolvedValue({ data: { ...receipt, ...change }, error: null });
    await expect(executeCountryAccountStatus(command)).rejects.toThrow("no confirmed receipt");
  });
  it("fails before submitting an invalid review version", async () => {
    await expect(executeCountryAccountStatus({ ...command, expectedUpdatedAt: "invalid" })).rejects.toThrow("Reload the account");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds ambiguous retries without inventing a replacement operation", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await expect(executeCountryAccountStatus(command)).rejects.toThrow("Failed to fetch");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
});
