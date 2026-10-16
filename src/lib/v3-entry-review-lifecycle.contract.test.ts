import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("P13 Entry review and correction lifecycle", () => {
  it("keeps lifecycle status inside the V3 participant Entry route", () => {
    const gate = read("src/components/v3/V3EntryRouteGate.tsx");
    const panel = read("src/components/v3/V3EntryLifecyclePanel.tsx");

    expect(gate).toContain("V3EntryLifecyclePanel");
    expect(gate).toContain("projection={bundle.data.projection}");
    expect(panel).toContain("data-v3-entry-lifecycle");
    expect(panel).toContain("data-v3-entry-correction-reason");
    expect(panel).toContain("Organizer reason");
    expect(panel).toContain("Current version accepted");
    expect(panel).toContain("Current version needs review");
  });

  it("derives status only from canonical submission and immutable review-version evidence", () => {
    const lifecycle = read("src/lib/v3-entry.ts");

    expect(lifecycle).toContain("deriveV3EntryLifecycle");
    expect(lifecycle).toContain('reviewStatus === "declined" && candidate.reviewMatchesCurrentVersion');
    expect(lifecycle).toContain('reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion');
    expect(lifecycle).toContain("reviewedVersionId === input.currentVersionId");
    expect(lifecycle).not.toContain("Date.now(");
    expect(lifecycle).not.toContain("localStorage");
    expect(lifecycle).not.toContain("sessionStorage");
  });

  it("preserves the canonical Confirmation writer and server-selected edit authority", () => {
    const screen = read("src/components/v3/V3EntryScreen.tsx");
    const action = read("src/lib/v3-entry.actions.ts");
    const server = read("src/integrations/v3/entry-actions.server.ts");

    expect(screen).toContain("openCurrentV3EntryEditor");
    expect(action).toContain("noSelectorInput");
    expect(action).toContain("createCurrentV3EntryEditLink");
    expect(server).toContain('client.rpc("public_create_country_account_edit_token"');
    expect(server).toContain("No browser-provided user, country, edition, round or");
    expect(server).not.toContain("supabaseAdmin");
  });
});
