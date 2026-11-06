import { describe, expect, it } from "vitest";
import { buildAdminNavigation } from "../components/admin/admin-navigation";

const workspace = buildAdminNavigation("ssc22").flatMap((group) => group.items);
const get = (label: string) => {
  const item = workspace.find((entry) => entry.label === label);
  if (!item) throw new Error("Missing navigation item: " + label);
  return item;
};

describe("Organizer System workspace selection", () => {
  it("does not activate System settings while inspecting Delivery and jobs", () => {
    expect(get("Delivery & jobs").active("/admin/system-operations")).toBe(true);
    expect(get("System settings").active("/admin/system-operations")).toBe(false);
    expect(get("System settings").active("/admin/system-operations/job")).toBe(false);
  });

  it("allows System settings and Sync health to remain independent", () => {
    expect(get("System settings").active("/admin/system")).toBe(true);
    expect(get("System settings").active("/admin/system/")).toBe(true);
    expect(get("Delivery & jobs").active("/admin/system")).toBe(false);
    expect(get("System health").active("/admin/sync-health")).toBe(true);
    expect(get("System settings").active("/admin/sync-health")).toBe(false);
    expect(get("System settings").active("/admin/system-adjacent")).toBe(false);
  });
});
