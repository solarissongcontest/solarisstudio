import { describe, expect, it } from "vitest";
import { matchingWorldProvisions, parseWorldDocumentIndex, parseWorldDocumentReader } from "./v3-world-public-documents";

const current = {
  versionNumber: 2, title: "GUARD Charter", publicationState: "published",
  publishedAt: "2026-11-01T00:00:00Z", effectiveFrom: "2026-11-01T00:00:00Z",
  effectiveTo: null, contentHash: "a".repeat(64),
  provisions: [
    { semanticKey: "membership.admission", parentSemanticKey: null, displayLabel: "Article 4", heading: "Admission", bodyPlainText: "An application requires review.", sortOrder: 2, status: "active" },
    { semanticKey: "purpose", parentSemanticKey: null, displayLabel: "Article 1", heading: "Purpose", bodyPlainText: "Our common purpose.", sortOrder: 1, status: "active" },
  ],
};
const source = {
  organization: { slug: "guard", officialName: "Global Union", shortName: "GUARD" },
  slug: "charter", title: "GUARD Charter", visibility: "public", version: current,
  history: [
    { versionNumber: 2, title: "GUARD Charter", publicationState: "published", publishedAt: current.publishedAt },
    { versionNumber: 1, title: "Original Charter", publicationState: "superseded", publishedAt: "2026-09-01T00:00:00Z" },
    { versionNumber: 3, title: "Private draft", publicationState: "draft", publishedAt: null },
  ],
};

describe("public Terra Solaris legal-document reader", () => {
  it("includes only public documents with an actual published current version", () => {
    const base = { documentId: "doc-1", organizationSlug: "guard", slug: "charter", documentType: "charter", title: "GUARD Charter", status: "active", visibility: "public", currentVersion: { versionNumber: 2, publishedAt: current.publishedAt, effectiveFrom: current.effectiveFrom } };
    expect(parseWorldDocumentIndex({ documents: [base, { ...base, documentId: "doc-2", slug: "private", visibility: "members" }, { ...base, slug: "draft", currentVersion: null }] }, "guard").map((i) => i.slug)).toEqual(["charter"]);
  });
  it("fails closed on cross-organization records rather than misattributing legal text", () => {
    const item = { documentId: "doc", organizationSlug: "unity", slug: "rules", title: "Rules", documentType: "rulebook", visibility: "public", currentVersion: { versionNumber: 1 } };
    expect(() => parseWorldDocumentIndex({ documents: [item] }, "guard")).toThrow(/Cross-organization/);
    expect(() => parseWorldDocumentReader(source, "unity", "charter")).toThrow(/Cross-institution/);
  });
  it("never displays drafts even to a privileged viewer", () => {
    expect(parseWorldDocumentReader({ ...source, version: { ...current, publicationState: "draft" } }, "guard", "charter")).toBeNull();
    expect(parseWorldDocumentReader({ ...source, visibility: "members" }, "guard", "charter")).toBeNull();
    expect(parseWorldDocumentReader(null, "guard", "charter")).toBeNull();
  });
  it("preserves stable semantic provision identities across visible numbering", () => {
    const result = parseWorldDocumentReader(source, "guard", "charter", 2)!;
    expect(result.version.provisions.map((p) => p.semanticKey)).toEqual(["purpose", "membership.admission"]);
    expect(result.history.map((h) => h.number)).toEqual([2, 1]);
    expect(matchingWorldProvisions(result.version.provisions, "review")[0]?.semanticKey).toBe("membership.admission");
  });
  it("rejects stale-version responses and duplicate or invalid provision keys", () => {
    expect(() => parseWorldDocumentReader(source, "guard", "charter", 1)).toThrow(/version scope/);
    expect(() => parseWorldDocumentReader({ ...source, version: { ...current, provisions: [current.provisions[0], current.provisions[0]] } }, "guard", "charter")).toThrow(/duplicate/);
    expect(() => parseWorldDocumentReader(source, "guard", "../admin")).toThrow(/Invalid document route/);
  });
});
