import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderV42MaintenancePreview } from "@/lib/rules-v42-maintenance-preview";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const maintenancePage = readFileSync(new URL("./maintenance-page.ts", import.meta.url), "utf8");
const recoveryPage = readFileSync(new URL("../routes/maintenance/recovery.tsx", import.meta.url), "utf8");

describe("Public v4.2 reference during maintenance", () => {
  it("serves all 113 reference rules from a static, read-only document", () => {
    const html = renderV42MaintenancePreview();
    expect((html.match(/data-draft-rule=/g) ?? []).length).toBe(113);
    expect((html.match(/class="chapter"/g) ?? []).length).toBe(22);
    expect(html).toContain("REFERENCE COPY · NOT AUTHORITATIVE.");
    expect(html).toContain("SSC General Regulations v4.2");
    expect(html).toContain("Publication status and effective wording");
    expect(html).not.toContain("not ratified rules");
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("supabase.co");
  });

  it("does not call already-published v4.2 an unofficial draft on maintenance surfaces", () => {
    expect(maintenancePage).toContain("SSC Regulations v4.2 · reference copy");
    expect(maintenancePage).not.toContain("unofficial draft");
    expect(recoveryPage).toContain('current?.version === "4.2" && current.status === "published"');
    expect(recoveryPage).toContain('v42ImportStatus !== "eligible"');
    expect(recoveryPage).toContain("SSC Regulations v4.2 is published");
    expect(recoveryPage).not.toContain("An authorized organizer may now prepare the v4.2 draft below");
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
