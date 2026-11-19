import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITED_PUBLIC_LAUNCH, limitedPublicLaunchAllows } from "./public-launch-availability";

const route = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
const gate = readFileSync("src/components/admin/OrganizerAccessGate.tsx", "utf8");

describe("restricted release Organizer denial redirect", () => {
  it("never redirects a denied Organizer to the closed MySolaris area", () => {
    expect(LIMITED_PUBLIC_LAUNCH).toBe(true);
    expect(limitedPublicLaunchAllows("/participate")).toBe(true);
    expect(limitedPublicLaunchAllows("/my-solaris")).toBe(false);
    for (const source of [route, gate]) {
      expect(source).toContain("if (LIMITED_PUBLIC_LAUNCH) {");
      expect(source).toContain('to: "/participate"');
      expect(source).toContain('to: "/my-solaris"');
      expect(source).toContain("replace: true");
      expect(source).toContain("hasSolarisOrganizerAccess");
    }
  });
});
