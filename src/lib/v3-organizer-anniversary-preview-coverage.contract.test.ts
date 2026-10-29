import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/anniversary.tsx"),
  "utf8",
);

describe("Organizer Anniversary Preview coverage contract", () => {
  it("renders the shared preview model instead of maintaining a second route list", () => {
    expect(route).toContain('import { ORGANIZER_ANNIVERSARY_PREVIEWS } from "@/lib/v3-organizer-anniversary-preview"');
    expect(route).toContain("ORGANIZER_ANNIVERSARY_PREVIEWS.map");
    expect(route).not.toContain("const PREVIEWS = [");
  });

  it("keeps the preview private and observational", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(route).not.toContain("@/integrations/supabase/client");
    expect(route).not.toContain("useMutation(");
    expect(route).not.toContain(".rpc(");
  });

  it("does not overclaim parity for the broader Anniversary editorial lifecycle", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-anniversary-settings",
    );
    expect(capability).toBeDefined();
    expect(capability?.classification).toEqual("contextualize");
    expect(capability?.migrationStatus).toEqual("building");
  });
});
