import { describe, expect, it } from "vitest";
import { renderMaintenanceHodPortal } from "./maintenance-hod-portal";

describe("maintenance HOD portal contrast", () => {
  it("keeps portal text readable against the dark Confirmation surface", () => {
    const rendered = renderMaintenanceHodPortal({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "test-key",
    });

    expect(rendered).toContain("color: #f5fbff;");
    expect(rendered).toContain("--muted: rgba(232,245,250,.88);");
    expect(rendered).toContain("--muted-soft: rgba(210,228,238,.80);");
  });
});
