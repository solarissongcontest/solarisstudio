import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/next-in-line.tsx", "utf8");
const screen = readFileSync("src/components/NextInLineCompetition.tsx", "utf8");
const shell = readFileSync("src/components/ParticipationServiceShell.tsx", "utf8");
const source = readFileSync("src/lib/confirmation-next-in-line.functions.ts", "utf8");

describe("V3 Public Next in Line parity", () => {
  it("keeps the canonical participant route in the Participate task family", () => {
    expect(route).toContain('createFileRoute("/next-in-line")');
    expect(route).toContain("NextInLineCompetition");
    expect(shell).toContain('service: ParticipationService');
    expect(shell).toContain('"next-in-line"');
    expect(shell).toContain('data-v3-participation-task-route={service}');
  });

  it("loads edition eligibility and saved submission state from server functions", () => {
    expect(screen).toContain("getNextInLineCountries");
    expect(screen).toContain("getNextInLineCountry");
    expect(screen).toContain("result.editing_open === true");
    expect(screen).toContain("result.existing_submission ?? null");
    expect(screen).toContain("This list comes from your authenticated delegation scope");
  });

  it("keeps closed state non-actionable and does not manufacture a browser override", () => {
    expect(screen).toContain("Editing is closed. This submission remains visible, but Solaris will not offer a browser-only override.");
    expect(screen).toContain("disabled={submitting || checkingDuplicate || !editingOpen}");
    expect(screen).toContain("Solaris checks delegation authority, the active server window and song eligibility again when you save.");
  });

  it("preserves canonical receipt and reconciliation evidence after submit", () => {
    expect(screen).toContain("revision: evidence.revision ?? null");
    expect(screen).toContain("receiptId: evidence.receiptId ?? evidence.operationId ?? null");
    expect(screen).toContain("replayed: evidence.replayed === true");
    expect(screen).toContain("reconciled: evidence.reconciled === true");
    expect(screen).toContain("no duplicate submission was created");
  });

  it("uses the protected server contract rather than a client-owned queue", () => {
    expect(source).toContain("submitNextInLine");
    expect(source).toContain("getNextInLineCountries");
    expect(source).not.toContain("localStorage");
    expect(screen).not.toContain("position");
    expect(screen).toContain("Next in Line does not give countries an SSC place");
  });
});
