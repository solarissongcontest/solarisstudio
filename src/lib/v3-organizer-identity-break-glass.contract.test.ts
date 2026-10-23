import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-identity.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-identity.ts", "utf8");

describe("V3 Organizer sealed-identity break-glass boundary", () => {
  it("does not reveal protected identity directly from the approved-window action", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("onClick={openRevealReview}");
    expect(route).toContain("setRevealReview({");
    expect(route).not.toContain("onClick={() => revealMutation.mutate()}");
  });

  it("requires explicit case-code confirmation for the frozen one-time Tier 4 disclosure", () => {
    expect(route).toContain("This is a Tier 4 break-glass disclosure");
    expect(route).toContain("confirmationText={reviewedRevealItem.case_code}");
    expect(route).toContain("Reveal sealed identity once");
    expect(route).toContain("Approved purpose:");
    expect(route).toContain("data-v3-organizer-identity-reveal-review");
    expect(route).toContain("The reviewed approval is frozen while this sheet is open");
    expect(route).toContain("The server remains authoritative for whether the window is actually usable");
    expect(route).toContain("confirmDisabled={!revealReview || !currentUserId || reviewedRevealItem.requested_by !== currentUserId || reviewedRevealExpiredByClock}");
  });

  it("turns approve and reject into explicit frozen second-person reviews", () => {
    expect(route).toContain("type IdentityDecisionReview");
    expect(route).toContain("openDecisionReview(true)");
    expect(route).toContain("openDecisionReview(false)");
    expect(route).toContain("decisionReason: reason");
    expect(route).toContain("fingerprint: identityDisclosureReviewFingerprint(item)");
    expect(route).toContain("data-v3-organizer-identity-decision-review");
    expect(route).not.toContain("decisionMutation.mutate(true)");
    expect(route).not.toContain("decisionMutation.mutate(false)");
  });

  it("re-reads the exact pending request before applying a second-person decision", () => {
    const mutationStart = route.indexOf("const decisionMutation = useMutation");
    const reRead = route.indexOf("await listIdentityDisclosureRequests()", mutationStart);
    const pendingGuard = route.indexOf('current.status !== "pending"', reRead);
    const fingerprintGuard = route.indexOf(
      "identityDisclosureReviewFingerprint(current) !== decisionReview.fingerprint",
      reRead,
    );
    const independenceGuard = route.indexOf("current.requested_by === currentUserId", reRead);
    const apply = route.indexOf("return decideSealedIdentityDisclosure(", reRead);

    expect(mutationStart).toBeGreaterThan(-1);
    expect(reRead).toBeGreaterThan(mutationStart);
    expect(pendingGuard).toBeGreaterThan(reRead);
    expect(fingerprintGuard).toBeGreaterThan(reRead);
    expect(independenceGuard).toBeGreaterThan(reRead);
    expect(apply).toBeGreaterThan(independenceGuard);
    expect(route).toContain(
      "This identity-access request changed while you were reviewing it. Refresh and review the decision again.",
    );
  });

  it("re-reads the exact approved request before one-time reveal", () => {
    const mutationStart = route.indexOf("const revealMutation = useMutation");
    const reRead = route.indexOf("await listIdentityDisclosureRequests()", mutationStart);
    const approvedGuard = route.indexOf('current.status !== "approved"', reRead);
    const fingerprintGuard = route.indexOf(
      "identityDisclosureReviewFingerprint(current) !== revealReview.fingerprint",
      reRead,
    );
    const requesterGuard = route.indexOf("current.requested_by !== currentUserId", reRead);
    const apply = route.indexOf("return revealSealedIdentity(revealReview.item.id)", reRead);

    expect(mutationStart).toBeGreaterThan(-1);
    expect(reRead).toBeGreaterThan(mutationStart);
    expect(approvedGuard).toBeGreaterThan(reRead);
    expect(fingerprintGuard).toBeGreaterThan(reRead);
    expect(requesterGuard).toBeGreaterThan(reRead);
    expect(apply).toBeGreaterThan(requesterGuard);
    expect(route).toContain(
      "This break-glass approval changed while you were reviewing it. Refresh and review the reveal again.",
    );
  });

  it("refreshes authoritative request state after success and refused or uncertain mutation failure", () => {
    expect(route.match(/await onChanged\(\);/g)?.length).toBeGreaterThanOrEqual(4);
    expect(route.match(/setDecisionReview\(null\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(route.match(/setRevealReview\(null\);/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves the requester, second-person approval, expiry and one-time server boundaries", () => {
    expect(route).toContain("A different organizer must approve or reject this request");
    expect(route).toContain("Only the organizer who created this approved request may use it");
    expect(route).toContain("This approval has expired and cannot be used");
    expect(api).toContain('"admin_request_sealed_identity_disclosure"');
    expect(api).toContain('"admin_decide_sealed_identity_disclosure"');
    expect(api).toContain('"admin_reveal_sealed_identity"');
  });

  it("does not pretend the legacy reveal RPC is already canonical V3 fresh-auth authority", () => {
    expect(api).not.toContain("studio2_require_fresh_auth");
    expect(api).not.toContain("studio2_claim_operation");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-identity-access",
    );
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });
});
