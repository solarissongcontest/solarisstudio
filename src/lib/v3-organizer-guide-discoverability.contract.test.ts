import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/guide.tsx"),
  "utf8",
);

describe("Organizer Guide discoverability", () => {
  it("supports recognition-first local search with an accessible result state", () => {
    expect(route).toContain('type="search"');
    expect(route).toContain("filterOrganizerGuideSections(SECTIONS, query)");
    expect(route).toContain('aria-live="polite"');
    expect(route).toContain('aria-label="Clear guide search"');
    expect(route).toContain("No guide answers match");
  });

  it("keeps the private help surface out of crawler discovery", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("remains a read-only contextual guide instead of inventing another Organizer authority", () => {
    expect(route).not.toContain("@/integrations/supabase/client");
    expect(route).not.toContain(".from(");
    expect(route).not.toContain(".rpc(");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-organizer-guide",
    );
    expect(capability).toBeDefined();
    expect(capability?.classification).toEqual("contextualize");
    expect(capability?.migrationStatus).toEqual("cutover");
    expect(capability?.migrationEvidence).toContain("v3-organizer-observational-acceptance.test.tsx");
  });
});
