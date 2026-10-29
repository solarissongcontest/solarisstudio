import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/delegations.tsx", "utf8");
const model = readFileSync(
  "src/lib/v3-organizer-confirmation-requirement-attention.ts",
  "utf8",
);
const permissionMap = readFileSync("src/lib/permission-route-map.ts", "utf8");
const adminDomains = readFileSync("src/components/admin/admin-domains.ts", "utf8");

describe("Organizer O4 Delegations attention boundary", () => {
  it("fails closed without explicit Organizer edition context", () => {
    expect(route).toContain("enabled: Boolean(resolvedEditionId)");
    expect(route).toContain("loadConfirmationRequirements(resolvedEditionId)");
    expect(route).toContain("Solaris will not substitute another edition");
  });

  it("uses canonical Confirmation requirements rather than entry-review state for attention", () => {
    expect(route).toContain("summarizeConfirmationRequirementAttention");
    expect(route).not.toContain("review_status");
    expect(route).not.toContain("selection_method");
    expect(model).toContain('case "required"');
    expect(model).toContain('case "invalidated"');
  });

  it("keeps invalidated obligations visible but non-actionable", () => {
    expect(route).toContain("Superseded requirements remain observable");
    expect(route).toContain("excluded from actionable counts");
    expect(model).toContain("totalEffective: needsAttention.length + satisfied.length + waived.length");
  });

  it("keeps mutation authority in existing Confirmation workspaces", () => {
    expect(route).toContain("The overview stays read-only");
    expect(route).toContain('to="/confirmations/admin/requirements"');
    expect(route).toContain('to="/confirmations/admin/responses"');
    expect(route).toContain('to="/confirmations/admin/rounds"');
    expect(route).not.toContain(".rpc(");
    expect(route).not.toContain("useMutation");
  });

  it("binds the canonical Delegations route to Confirmation read authority", () => {
    expect(permissionMap).toContain(
      'rule(["/admin/delegations", "/confirmations/admin"], "confirmation.read")',
    );
  });

  it("makes the canonical O4 workspace the permanent Delegations root", () => {
    expect(adminDomains).toContain('path.startsWith("/admin/delegations")');
    expect(adminDomains).toContain('to: "/admin/delegations"');
    expect(adminDomains).toContain('path.startsWith("/admin/countries")');
    expect(adminDomains).toContain('path.startsWith("/confirmations/admin")');
  });

  it("keeps sync/settings diagnostics out of the canonical O4 workspace", () => {
    expect(route).toContain("Sync and low-level Confirmation settings intentionally remain on legacy/advanced routes");
    expect(route).not.toContain('to="/confirmations/admin/sync"');
    expect(route).not.toContain('to="/confirmations/admin/settings"');
  });
});
