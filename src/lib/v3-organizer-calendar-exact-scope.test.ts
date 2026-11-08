import { describe, expect, it, vi } from "vitest";
import {
  loadExactOrganizerConfirmationCalendar,
  type OrganizerCalendarReadClient,
} from "@/integrations/confirmations/organizer-calendar-read";
import type { ConfirmationCalendarRow } from "@/integrations/confirmations/admin";

const row: ConfirmationCalendarRow = {
  id: "response-1", country: "Oland", participating: true,
  selection_method: "national_final", reveal_date_type: "exact",
  reveal_exact_date: "2026-11-08", reveal_approximate_text: null,
  nf_date_type: "exact", nf_exact_date: "2026-11-10",
  nf_approximate_text: null, nf_result_date_type: "unknown",
  nf_result_exact_date: null, nf_result_approximate_text: null,
  edition_id: "edition-1", round_id: "round-1", edition_name: "SSC 1",
  edition_number: 1, round_name: "Round 1", nf_name: "Oland NF",
};

function mockClient(data: unknown, error: { message?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc } as OrganizerCalendarReadClient & { rpc: typeof rpc };
}

describe("Organizer Delegation Calendar exact actor/edition/round read contract", () => {
  it("accepts a genuine empty scoped response with exact RPC arguments", async () => {
    const client = mockClient([]);
    expect(await loadExactOrganizerConfirmationCalendar({ editionId: "edition-1", roundId: "round-1" }, client)).toEqual([]);
    expect(client.rpc).toHaveBeenCalledWith("admin_confirmation_calendar", {
      _edition_id: "edition-1", _round_id: "round-1",
    });
  });

  it("returns a valid exact-scope event without mutating its source", async () => {
    const client = mockClient([row]);
    const result = await loadExactOrganizerConfirmationCalendar({ editionId: "edition-1" }, client);
    expect(result).toEqual([row]);
    expect(client.rpc).toHaveBeenCalledWith("admin_confirmation_calendar", {
      _edition_id: "edition-1", _round_id: null,
    });
  });

  it("refuses missing edition scope before requesting any data", async () => {
    const client = mockClient([]);
    await expect(loadExactOrganizerConfirmationCalendar({ editionId: "  " }, client)).rejects.toThrow(/explicit Organizer edition/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, false, "[]"])("rejects invalid root response %j", async (data) => {
    await expect(loadExactOrganizerConfirmationCalendar({ editionId: "edition-1" }, mockClient(data))).rejects.toThrow(/invalid projection/);
  });

  it.each([
    { data: { ...row, edition_id: "edition-2" }, scope: { editionId: "edition-1" } },
    { data: { ...row, round_id: "round-2" }, scope: { editionId: "edition-1", roundId: "round-1" } },
    { data: { ...row, participating: null }, scope: { editionId: "edition-1" } },
    { data: { ...row, id: "" }, scope: { editionId: "edition-1" } },
    { data: { ...row, country: "" }, scope: { editionId: "edition-1" } },
  ])("rejects malformed or foreign rows ($data.id)", async ({ data, scope }) => {
    await expect(loadExactOrganizerConfirmationCalendar(scope, mockClient([data]))).rejects.toThrow(/cross-scope data/);
  });

  it("rejects duplicates, missing rows, and backend errors instead of claiming zero events", async () => {
    await expect(loadExactOrganizerConfirmationCalendar({ editionId: "edition-1" }, mockClient([row,row]))).rejects.toThrow(/duplicate/);
    await expect(loadExactOrganizerConfirmationCalendar({ editionId: "edition-1" }, mockClient([null]))).rejects.toThrow(/malformed response row/);
    await expect(loadExactOrganizerConfirmationCalendar({ editionId: "edition-1" }, mockClient(null, { message: "Denied" }))).rejects.toMatchObject({ message: "Denied" });
  });
});
