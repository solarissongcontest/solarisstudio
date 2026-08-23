import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("delegation colour overview", () => {
  it("uses the same four-state triage meaning as confirmation response cards", () => {
    const addon = source("src/components/confirmations/DelegationColourOverview.tsx");

    expect(addon).toContain('type CardState = "review" | "issue" | "ready" | "neutral"');
    expect(addon).toContain('name: "Red"');
    expect(addon).toContain('label: "Needs review"');
    expect(addon).toContain('name: "Yellow"');
    expect(addon).toContain('label: "Needs fixing"');
    expect(addon).toContain('name: "Green"');
    expect(addon).toContain('label: "Ready"');
    expect(addon).toContain('name: "No glow"');
    expect(addon).toContain('label: "Waiting"');
    expect(addon).toContain("Admin still needs to review at least one submitted song.");
    expect(addon).toContain("At least one song was declined or not accepted");
    expect(addon).toContain("The entry is accepted, or the NF songs are accepted and a winner has been selected.");
  });

  it("counts responses for the selected edition and decorates country cards", () => {
    const addon = source("src/components/confirmations/DelegationColourOverview.tsx");
    const frame = source("src/components/admin/AdminFrame.tsx");

    expect(addon).toContain('row.editions?.id === editionId');
    expect(addon).toContain("next[responseCardState(row)] += 1");
    expect(addon).toContain('card.dataset.delegationState = state');
    expect(addon).toContain('data-delegation-state="review"');
    expect(addon).toContain('data-delegation-state="issue"');
    expect(addon).toContain('data-delegation-state="ready"');
    expect(addon).toContain("Counts are individual confirmation responses in the selected edition");
    expect(frame).toContain('pathname === "/confirmations/admin/countries"');
    expect(frame).toContain("DelegationColourOverview");
  });
});
