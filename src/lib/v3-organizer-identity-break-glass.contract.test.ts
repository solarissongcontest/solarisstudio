import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-identity.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-identity.ts", "utf8");

describe("V3 Organizer sealed-identity break-glass boundary", () => {
  it("does not reveal protected identity directly from the approved-window action", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("onClick={() => setRevealConfirmOpen(true)}");
    expect(route).not.toContain("onClick={() => revealMutation.mutate()}");
  });

  it("requires explicit case-code confirmation for the one-time Tier 4 disclosure", () => {
    expect(route).toContain("This is a Tier 4 break-glass disclosure");
    expect(route).toContain("confirmationText={item.case_code}");
    expect(route).toContain("Reveal sealed identity once");
    expect(route).toContain("Approved purpose:");
    expect(route).toContain("the reporter can see that identity access occurred");
    expect(route).toContain("Use the identity only for the approved case purpose");
    expect(route).toContain("confirmDisabled={!isRequester || expiredByClock}");
  });

  it("preserves the existing requester, second-person approval, expiry and one-time server boundaries", () => {
    expect(route).toContain("A different organizer must approve or reject this request");
    expect(route).toContain("Only the organizer who created the request may use it");
    expect(route).toContain("This approval has expired and cannot be used");
    expect(api).toContain('"admin_request_sealed_identity_disclosure"');
    expect(api).toContain('"admin_decide_sealed_identity_disclosure"');
    expect(api).toContain('"admin_reveal_sealed_identity"');
  });

  it("does not pretend the legacy reveal RPC is already canonical V3 fresh-auth authority", () => {
    expect(api).not.toContain("studio2_require_fresh_auth");
    expect(api).not.toContain("studio2_claim_operation");
  });
});
