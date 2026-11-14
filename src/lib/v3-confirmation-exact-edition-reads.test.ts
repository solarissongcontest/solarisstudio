import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/confirmations/client", () => ({
  confirmationsSupabase: { rpc },
}));

import {
  loadConfirmationResponsesForEdition,
  loadConfirmationResponseForEdition,
  loadConfirmationTechnicalForEdition,
  loadConfirmationRecoveryCodesForEdition,
} from "@/integrations/confirmations/scoped-admin-reads";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S = "33333333-3333-4333-8333-333333333333";

function page(editionId: string, items: unknown[] = []) {
  return {
    edition_id: editionId, items, total: items.length, limit: 100,
    offset: 0, has_more: false, server_time: "2026-11-14T12:00:00Z",
  };
}
beforeEach(() => { rpc.mockReset(); });

describe("Confirmation exact-edition RPC boundary", () => {
  it("never fetches a global response list", async () => {
    rpc.mockResolvedValue({ data: page(A, [{ id: S, editions: { id: A }, submission_rounds: { edition_id: A } }]), error: null });
    const result = await loadConfirmationResponsesForEdition(A);
    expect(result.items).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("admin_confirmation_responses_for_edition", {
      _edition_id: A, _limit: 100, _offset: 0,
    });
  });
  it("rejects a different edition's envelope", async () => {
    rpc.mockResolvedValue({ data: page(B), error: null });
    await expect(loadConfirmationResponsesForEdition(A)).rejects.toThrow(/different Organizer edition/);
  });
  it("rejects a cross-edition nested response or round", async () => {
    rpc.mockResolvedValue({ data: page(A, [{ id: S, editions: { id: B }, submission_rounds: { edition_id: A } }]), error: null });
    await expect(loadConfirmationResponsesForEdition(A)).rejects.toThrow(/outside the selected edition/);
  });
  it("refuses recovery codes accidentally included in a normal list", async () => {
    rpc.mockResolvedValue({ data: page(A, [{ id: S, editions: { id: A }, recovery_code: "secret" }]), error: null });
    await expect(loadConfirmationResponsesForEdition(A)).rejects.toThrow(/private recovery or technical data/);
  });
  it("rejects oversized or invalid pagination metadata", async () => {
    rpc.mockResolvedValue({ data: { ...page(A), limit: 1000 }, error: null });
    await expect(loadConfirmationResponsesForEdition(A)).rejects.toThrow(/incomplete projection metadata/);
  });
  it("enforces submission and edition on detail projection", async () => {
    rpc.mockResolvedValue({ data: { id: S, edition: { id: B } }, error: null });
    await expect(loadConfirmationResponseForEdition(A, S)).rejects.toThrow(/changed Organizer edition/);
    rpc.mockResolvedValue({ data: { id: B, edition: { id: A } }, error: null });
    await expect(loadConfirmationResponseForEdition(A, S)).rejects.toThrow(/changed Organizer edition/);
  });
  it("requests sensitive technical data separately and verifies submission scope", async () => {
    rpc.mockResolvedValue({ data: { edition_id: A, submission_id: B, ip_history: [], tokens: [] }, error: null });
    await expect(loadConfirmationTechnicalForEdition(A, S)).rejects.toThrow(/different Organizer edition/);
    expect(rpc).toHaveBeenCalledWith("admin_confirmation_technical_for_edition", {
      _edition_id: A, _submission_id: S,
    });
  });
  it("never treats an RPC permission error as an empty result", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("permission denied") });
    await expect(loadConfirmationResponsesForEdition(A)).rejects.toThrow("permission denied");
  });
  it("calls recovery projection only for an explicit edition", async () => {
    rpc.mockResolvedValue({ data: page(A), error: null });
    await loadConfirmationRecoveryCodesForEdition(A);
    expect(rpc).toHaveBeenCalledWith("admin_confirmation_recovery_codes_for_edition", {
      _edition_id: A, _limit: 100, _offset: 0,
    });
    await expect(loadConfirmationRecoveryCodesForEdition(" ")).rejects.toThrow(/explicit Organizer edition/);
  });
});
