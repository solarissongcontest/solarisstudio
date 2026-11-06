import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ConfirmationCalendarRow } from "@/integrations/confirmations/admin";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import {
  assertConfirmationCalendarRowsInScope,
  confirmationCalendarScopeKey,
} from "./v3-organizer-confirmation-calendar";

function calendarRow(
  overrides: Partial<ConfirmationCalendarRow> = {},
): ConfirmationCalendarRow {
  return {
    id: "response-1",
    country: "Oland",
    participating: true,
    selection_method: "internal",
    reveal_date_type: "exact",
    reveal_exact_date: "2026-10-31",
    reveal_approximate_text: null,
    nf_date_type: null,
    nf_exact_date: null,
    nf_approximate_text: null,
    nf_result_date_type: null,
    nf_result_exact_date: null,
    nf_result_approximate_text: null,
    edition_id: "edition-22",
    round_id: "round-1",
    edition_name: "Solaris Song Contest 22",
    edition_number: 22,
    round_name: "Confirmation",
    nf_name: null,
    ...overrides,
  };
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Organizer Delegation Calendar scope", () => {
  it("accepts only rows belonging to the exact reviewed edition and optional round", () => {
    const rows = [calendarRow()];

    expect(
      assertConfirmationCalendarRowsInScope(rows, {
        editionId: "edition-22",
        roundId: "round-1",
      }),
    ).toEqual(rows);

    expect(() =>
      assertConfirmationCalendarRowsInScope(rows, {
        editionId: "edition-23",
      }),
    ).toThrow(/returned data for edition edition-22/i);

    expect(() =>
      assertConfirmationCalendarRowsInScope(rows, {
        editionId: "edition-22",
        roundId: "round-2",
      }),
    ).toThrow(/returned data for round round-1/i);
  });

  it("refuses an implicit/global edition scope", () => {
    expect(() => confirmationCalendarScopeKey({ editionId: "   " })).toThrow(
      /requires an explicit Organizer edition scope/i,
    );
  });

  it("prevents superseded async calendar loads from committing route state", () => {
    const route = source("src/routes/confirmations/admin/calendar.tsx");

    expect(route).toContain("const scopeRequestRef = useRef(0)");
    expect(route).toContain("const requestId = ++scopeRequestRef.current");
    expect(route).toContain("if (scopeRequestRef.current !== requestId) return;");
    expect(route).toContain("assertConfirmationCalendarRowsInScope(");
    expect(route).toContain("confirmationCalendarScopeKey(scope)");
    expect(route).not.toContain(
      "setRows(await loadConfirmationCalendar(nextEditionId, nextRoundId || undefined))",
    );
  });

  it("keeps Delegation Calendar below parity while O4 still has unfinished acceptance work", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "delegation-calendar",
    );

    expect(capability?.migrationStatus).toBe("building");
  });
});
