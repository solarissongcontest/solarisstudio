import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const anniversary = source("src/routes/_authenticated/admin/anniversary.tsx");

describe("V3 Organizer Anniversary preview evidence", () => {
  it("reports the implemented companion surface as building without claiming milestone parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-anniversary-settings",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.targetDomain).toBe("engagement-editorial");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });

  it("keeps Storytelling as the editorial owner and dates as a separate historical authority", () => {
    expect(anniversary).toContain("Storytelling is the canonical editorial parent");
    expect(anniversary).toContain('to="/admin/storytelling"');
    expect(anniversary).toContain('to="/admin/anniversary-dates"');
    expect(anniversary).toContain("Anniversary belongs to Storytelling");
  });

  it("keeps preview states observational instead of inventing browser-owned milestone truth", () => {
    expect(anniversary).toContain("These URLs only change the current browser view");
    expect(anniversary).toContain("They do not publish or alter anniversary data");
    expect(anniversary).toContain("Manual milestones, scheduling and editorial publication must use governed Anniversary authority");
    expect(anniversary).not.toContain("useMutation(");
  });
});
