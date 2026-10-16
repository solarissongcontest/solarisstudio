import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const incidents = readFileSync(
  "src/routes/_authenticated/admin/incidents.tsx",
  "utf8",
);

describe("V3 Organizer Incident Command context isolation", () => {
  it("remounts local command state when the Organizer edition changes", () => {
    expect(incidents).toContain("component: IncidentCommandRoute");
    expect(incidents).toContain("function IncidentCommandRoute()");
    expect(incidents).toContain("<IncidentCommandPage key={editionId || 'unscoped'} />");
  });

  it("still verifies selected incident ownership immediately before mutation", () => {
    expect(incidents).toContain("incident.editionId !== editionId");
    expect(incidents).toContain("Edition context changed before the incident command");
  });
});
