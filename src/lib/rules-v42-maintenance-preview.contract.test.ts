import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderV42MaintenancePreview } from "@/lib/rules-v42-maintenance-preview";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const maintenancePage = readFileSync(new URL("./maintenance-page.ts", import.meta.url), "utf8");

describe("Public v4.2 proposal during maintenance", () => {
  it("serves all 113 proposed rules from a static, read-only document", () => {
    const html = renderV42MaintenancePreview();
    expect((html.match(/data-draft-rule=/g) ?? []).length).toBe(113);
    expect((html.match(/class="chapter"/g) ?? []).length).toBe(22);
    expect(html).toContain("DRAFT · NOT OFFICIAL");
    expect(html).toContain("SSC General Regulations v4.2");
    expect(html).toContain("YouTube video priority");
    expect(html).toContain("bonus-point penalties");
    expect(html).toContain("negative final scores");
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("supabase.co");
  });

  it("allows only the static GET/HEAD path during global maintenance", () => {
    expect(server).toContain('url.pathname === "/rules/v4-2-preview"');
    expect(server).toContain('(request.method === "GET" || request.method === "HEAD")');
    expect(server).toContain("renderV42MaintenancePreview()");
    expect(server).toContain('request.method === "HEAD" ? null : renderV42MaintenancePreview()');
    expect(server).toContain("x-robots-tag");
    expect(server).toContain("default-src 'none'");
    expect(maintenancePage).toContain('href="/rules/v4-2-preview"');
  });
});
