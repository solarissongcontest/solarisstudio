import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/$slug.tsx"),
  "utf8",
);

describe("V3 Organizer Contest overview context and readiness", () => {
  it("binds edition-scoped Contest reads to shell-owned OrganizerContext", () => {
    expect(route).toContain('import { useAdminContext } from "@/components/admin/AdminContext"');
    expect(route).toContain(
      "const { editionId: organizerEditionId, editionLabel: organizerEditionLabel } = useAdminContext()",
    );
    expect(route).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).not.toContain("useShows(edition?.id)");
    expect(route).not.toContain("useParticipants(edition?.id)");
  });

  it("fails closed when the route edition and OrganizerContext are absent or different", () => {
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("if (organizerEditionId !== edition.id)");
    expect(route).toContain("Contest data stays blocked until the route and Organizer context match.");
  });

  it("uses explicit structure factors instead of a locally invented readiness percentage", () => {
    expect(route).toContain('label: "Shows configured"');
    expect(route).toContain('label: "Line-ups assigned"');
    expect(route).toContain('label: "Final stage configured"');
    expect(route).toContain("This is only a structure checklist");
    expect(route).toContain("Voting, publication and broadcast readiness stay in their authoritative workspaces.");
    expect(route).not.toContain("AdminProgress");
    expect(route).not.toContain("resolveAutomaticEditionStatus");
    expect(route).not.toMatch(/readiness\s*=\s*Math\.round/);
  });

  it("does not recommend running-order work while the final stage is still missing", () => {
    const noShows = route.indexOf("const nextAction = !shows.length");
    const missingFinal = route.indexOf(": !hasGrandFinal", noShows);
    const missingLineups = route.indexOf(": showsWithoutEntries > 0", noShows);

    expect(noShows).toBeGreaterThanOrEqual(0);
    expect(missingFinal).toBeGreaterThan(noShows);
    expect(missingLineups).toBeGreaterThan(missingFinal);
    expect(route).toContain('title: "Configure the final stage"');
  });

  it("keeps the critical Contest capability honestly at building", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "current-edition-contest",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
  });
});
