import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-evidence.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-evidence.ts", "utf8");
const lifecycle = readFileSync(
  "supabase/functions/integrity-evidence-lifecycle/index.ts",
  "utf8",
);

describe("V3 Organizer evidence deletion confirmation", () => {
  it("does not permanently delete case evidence through window.confirm", () => {
    const dueCard = route.slice(
      route.indexOf("function DueEvidenceCard"),
      route.indexOf("function ExpiredUploadCard"),
    );
    expect(dueCard).toContain("AdminConfirmSheet");
    expect(dueCard).toContain("onClick={() => setConfirmOpen(true)}");
    expect(dueCard).not.toContain("window.confirm");
    expect(dueCard).not.toContain("onClick={() => mutation.mutate()}");
  });

  it("requires typed case confirmation and explains the irreversible consequence", () => {
    expect(route).toContain("This is a Tier 4 irreversible evidence action");
    expect(route).toContain("confirmationText={item.case_code}");
    expect(route).toContain("Delete private evidence permanently");
    expect(route).toContain("Scheduled reason:");
    expect(route).toContain("Retention ended:");
    expect(route).toContain("The audit trail remains after deletion");
  });

  it("keeps abandoned-upload cleanup separate from case evidence deletion", () => {
    const expiredCard = route.slice(route.indexOf("function ExpiredUploadCard"));
    expect(expiredCard).toContain("cleanExpiredEvidenceUpload(item)");
    expect(expiredCard).toContain("Clean expired upload");
  });

  it("does not misrepresent the current lifecycle edge function as canonical Tier 4 command authority", () => {
    expect(api).toContain('supabase.functions.invoke("integrity-evidence-lifecycle"');
    expect(lifecycle).toContain("service.storage");
    expect(lifecycle).toContain('"admin_finalize_integrity_evidence_deletion"');
    expect(lifecycle).not.toContain("studio2_require_fresh_auth");
    expect(lifecycle).not.toContain("studio2_claim_operation");
  });
});
