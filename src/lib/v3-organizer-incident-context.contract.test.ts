import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const incidents = readFileSync(
  "src/routes/_authenticated/admin/incidents.tsx",
  "utf8",
);
const registry = readFileSync(
  "src/lib/v3-organizer-capability-registry.ts",
  "utf8",
);

describe("V3 Organizer Incident Command context isolation", () => {
  it("requires the exact Organizer edition and never substitutes newest/global state", () => {
    expect(incidents).toContain("selectOrganizerEdition(editions, editionId)");
    expect(incidents).not.toContain(
      "[...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]",
    );
    expect(incidents).toContain(
      "Solaris will not substitute the newest or globally active edition.",
    );
  });

  it("remounts local command state when the Organizer edition changes", () => {
    expect(incidents).toContain("component: IncidentCommandRoute");
    expect(incidents).toContain("function IncidentCommandRoute()");
    expect(incidents).toContain("<IncidentCommandPage key={editionId || 'unscoped'} />");
  });

  it("still verifies selected incident ownership immediately before mutation", () => {
    expect(incidents).toContain("incident.editionId !== editionId");
    expect(incidents).toContain("Edition context changed before the incident command");
  });

  it("records Incident Command as building while the System operation envelope remains external", () => {
    expect(registry).toContain('id === "operations-incidents"');
  });
});
