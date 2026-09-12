import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const identityModel = read("src/lib/integrity.ts");
const anonymousUi = read("src/components/integrity/IntegrityCentre.tsx");
const protectedUi = read("src/components/integrity/TrustIntegrityHub.tsx");
const organizerCase = read("src/routes/_authenticated/admin/integrity-case.$caseId.tsx");
const privacyDoc = read("docs/integrity-anonymity-model.md");

const participantCopy = [identityModel, anonymousUi, protectedUi].join("\n").toLowerCase();
const allIdentityCopy = [participantCopy, organizerCase.toLowerCase(), privacyDoc.toLowerCase()].join("\n");

const FORBIDDEN_ABSOLUTE_PROMISES = [
  "impossible to identify",
  "impossible to trace",
  "fully untraceable",
  "completely untraceable",
  "totally untraceable",
  "no one can ever reveal",
  "nobody can ever reveal",
  "no one can identify you",
  "nobody can identify you",
  "your ip is anonymous",
  "ip anonymity guaranteed",
  "network anonymity guaranteed",
  "anonymous from infrastructure",
] as const;

describe("Trust & Integrity identity privacy copy", () => {
  it("never makes absolute identity or network-anonymity promises", () => {
    for (const phrase of FORBIDDEN_ABSOLUTE_PROMISES) {
      expect(allIdentityCopy, `Forbidden privacy promise found: ${phrase}`).not.toContain(phrase);
    }
  });

  it("describes Fully Anonymous as an application case-data guarantee, not network invisibility", () => {
    expect(identityModel).toContain('short: "No Solaris account is attached to the case record."');
    expect(identityModel).toContain("TSBC case reviewers do not receive a Solaris account identity from the case");
    expect(anonymousUi).toContain("does not store your Solaris account identity");
    expect(anonymousUi).toContain("No account ID stored");
    expect(privacyDoc).toContain("None of these modes claim network-level anonymity");
    expect(privacyDoc).toContain("Hosting, CDN, database or platform infrastructure may maintain logs");
    expect(privacyDoc).toContain("Report content itself can also identify a reporter");
  });

  it("describes Sealed Identity with the enforced two-person break-glass limits", () => {
    expect(identityModel).toContain("ordinary reviewers cannot reveal your identity");
    expect(identityModel).toContain("approval by a second different organizer");
    expect(identityModel).toContain("30-minute one-use approval");
    expect(identityModel).toContain("reporter-visible audit event");
    expect(organizerCase).toContain("A different organizer must approve or reject it; self-approval is not available.");
    expect(organizerCase).toContain("Reveal sealed identity once");
    expect(privacyDoc).toContain("Only the organiser who originally requested disclosure may use that approval");
  });

  it("describes Confidential Identity as explicit audited access rather than hidden forever", () => {
    expect(identityModel).toContain("Authorised TSBC reviewers may identify you when necessary.");
    expect(identityModel).toContain("Access requires an explicit organizer action which is written to the case audit trail.");
    expect(organizerCase).toContain("Identity is hidden by default. Explicit access is audit-logged.");
    expect(privacyDoc).toContain("Confidential is therefore less restrictive than Sealed Identity");
  });

  it("keeps protected and anonymous recovery promises distinct in participant UI", () => {
    expect(protectedUi).toContain("Sealed and confidential cases use your account for recovery");
    expect(protectedUi).toContain("For no account link at all, use Fully Anonymous instead.");
    expect(anonymousUi).toContain("Keep a recovery key to return and talk with TSBC");
    expect(anonymousUi).toContain("Use your case code and recovery key");
  });
});
