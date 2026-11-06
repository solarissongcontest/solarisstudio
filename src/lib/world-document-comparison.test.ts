import { describe, expect, it } from "vitest";
import {
  comparePublicWorldVersions,
  parsePublicWorldAccessProof,
  parsePublicWorldArchive,
  parsePublicWorldDocumentVersion,
  validateComparisonPair,
  worldLegalSlug,
} from "./world-document-comparison";

const baseVersion = {
  versionId: "v1", versionNumber: 1, title: "First", publicationState: "superseded",
  publishedAt: "2026-01-01", effectiveFrom: null, contentHash: "old",
};
const nextVersion = {
  versionId: "v2", versionNumber: 2, title: "Second", publicationState: "published",
  publishedAt: "2026-02-01", effectiveFrom: null, contentHash: "new",
};
const makeProvision = (key: string, text: string, sortOrder: number) => ({
  semanticKey: key, displayLabel: key, heading: "Section " + key, bodyPlainText: text,
  status: "active", parentSemanticKey: null, sortOrder,
});
const document = (version: typeof baseVersion, provisions: unknown[]) => ({
  documentId: "doc-1", organization: { slug: "guard" }, slug: "charter",
  title: "Charter", visibility: "public",
  version: { ...version, provisions },
});

describe("public institutional legal text comparison", () => {
  it("validates slugs before making any RPC request", () => {
    expect(worldLegalSlug("guard")).toBe(true);
    expect(worldLegalSlug("guard-charter")).toBe(true);
    expect(worldLegalSlug("../private")).toBe(false);
    expect(worldLegalSlug("GUARD")).toBe(false);
  });

  it("requires canonical public visibility before accessing an archive", () => {
    const proof = {
      documentId: "doc-1", slug: "charter", organization: { slug: "guard" },
      visibility: "public",
    };
    expect(parsePublicWorldAccessProof(proof, "guard", "charter")).toBe("doc-1");
    expect(parsePublicWorldAccessProof(null, "guard", "charter")).toBeNull();
    expect(() => parsePublicWorldAccessProof(
      { ...proof, visibility: "members" }, "guard", "charter",
    )).toThrow(/not publicly accessible/);
    expect(() => parsePublicWorldAccessProof(
      { ...proof, visibility: "private" }, "guard", "charter",
    )).toThrow(/not publicly accessible/);
    expect(() => parsePublicWorldAccessProof(
      { ...proof, slug: "another-law" }, "guard", "charter",
    )).toThrow(/not publicly accessible/);
    expect(() => parsePublicWorldAccessProof(
      { ...proof, organization: { slug: "unity" } }, "guard", "charter",
    )).toThrow(/not publicly accessible/);
  });

  it("restricts the history selector to published/superseded/historical-source records", () => {
    const archive = parsePublicWorldArchive({
      documentId: "doc-1", organizationSlug: "guard", documentSlug: "charter",
      versions: [nextVersion, { ...nextVersion, versionNumber: 3, publicationState: "draft", sourceProvenance: { private: true } }, baseVersion],
    }, "guard", "charter");
    expect(archive?.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(JSON.stringify(archive)).not.toContain("sourceProvenance");
    expect(validateComparisonPair(archive!, 1, 2)).toBe(true);
    expect(validateComparisonPair(archive!, 2, 1)).toBe(false);
    expect(validateComparisonPair(archive!, 1, 3)).toBe(false);
  });

  it("fails closed on mismatched archive and duplicate version numbers", () => {
    expect(() => parsePublicWorldArchive({
      documentId: "doc-1", organizationSlug: "unity", documentSlug: "charter", versions: [],
    }, "guard", "charter")).toThrow(/identity mismatch/);
    expect(() => parsePublicWorldArchive({
      documentId: "doc-1", organizationSlug: "guard", documentSlug: "charter", versions: [nextVersion, nextVersion],
    }, "guard", "charter")).toThrow(/Duplicate/);
    expect(() => parsePublicWorldArchive({
      documentId: "doc-1", organizationSlug: "guard", documentSlug: "charter",
      versions: [{ ...nextVersion, versionNumber: 0 }],
    }, "guard", "charter")).toThrow(/Invalid published version/);
  });

  it("rejects a manager-visible unpublished version and cross-document response", () => {
    expect(() => parsePublicWorldDocumentVersion(
      document({ ...baseVersion, publicationState: "draft" }, []), "guard", "charter", 1, "doc-1",
    )).toThrow(/Unpublished/);
    expect(() => parsePublicWorldDocumentVersion(
      document(baseVersion, []), "guard", "charter", 1, "another-doc",
    )).toThrow(/identity mismatch/);
    expect(() => parsePublicWorldDocumentVersion(
      { ...document(baseVersion, []), visibility: "members" }, "guard", "charter", 1, "doc-1",
    )).toThrow(/Non-public/);
  });

  it("rejects stale version and duplicate semantic provision keys", () => {
    expect(() => parsePublicWorldDocumentVersion(document(nextVersion, []), "guard", "charter", 1, "doc-1")).toThrow(/changed/);
    expect(() => parsePublicWorldDocumentVersion(document(baseVersion, [
      makeProvision("intro", "Old", 1), makeProvision("intro", "Duplicate", 2),
    ]), "guard", "charter", 1, "doc-1")).toThrow(/Duplicate semantic/);
  });

  it("tracks amendments by stable semantic key and preserves exact official text", () => {
    const before = parsePublicWorldDocumentVersion(document(baseVersion, [
      makeProvision("retained", "No change", 1),
      makeProvision("amended", "Line one\n  Line two", 2),
      makeProvision("removed", "Retired", 3),
    ]), "guard", "charter", 1, "doc-1");
    const after = parsePublicWorldDocumentVersion(document(nextVersion, [
      makeProvision("retained", "No change", 1),
      makeProvision("amended", "Line one\nLine two", 2),
      makeProvision("added", "New text", 3),
    ]), "guard", "charter", 2, "doc-1");
    const changes = comparePublicWorldVersions(before, after);
    expect(Object.fromEntries(changes.map((c) => [c.key, c.kind]))).toEqual({
      retained: "unchanged", amended: "modified", added: "added", removed: "removed",
    });
    expect(changes.find((c) => c.key === "amended")?.before?.text).toBe("Line one\n  Line two");
  });

  it("compares legacy unstructured legal text without pretending it contains numbered provisions", () => {
    const previous = parsePublicWorldDocumentVersion({
      ...document(baseVersion, []),
      version: { ...baseVersion, plainText: "Old legal text\n  Paragraph two", provisions: [] },
    }, "guard", "charter", 1, "doc-1");
    const current = parsePublicWorldDocumentVersion({
      ...document(nextVersion, []),
      version: { ...nextVersion, plainText: "New legal text\n  Paragraph two", provisions: [] },
    }, "guard", "charter", 2, "doc-1");
    const diff = comparePublicWorldVersions(previous, current);
    expect(diff).toHaveLength(1);
    expect(diff[0].key).toBe("__document_plain_text__");
    expect(diff[0].kind).toBe("modified");
    expect(diff[0].before?.text).toBe("Old legal text\n  Paragraph two");
  });

  it("refuses to report a law unchanged when published source text is missing", () => {
    const before = parsePublicWorldDocumentVersion(document(baseVersion, []), "guard", "charter", 1, "doc-1");
    const after = parsePublicWorldDocumentVersion(document(nextVersion, []), "guard", "charter", 2, "doc-1");
    expect(() => comparePublicWorldVersions(before, after)).toThrow(/text is missing/);
  });

  it("classifies official provision renumbering/reordering as a change", () => {
    const earlier = parsePublicWorldDocumentVersion(document(baseVersion, [
      makeProvision("a", "Same", 1), makeProvision("b", "Also same", 2),
    ]), "guard", "charter", 1, "doc-1");
    const later = parsePublicWorldDocumentVersion(document(nextVersion, [
      makeProvision("a", "Same", 2), makeProvision("b", "Also same", 1),
    ]), "guard", "charter", 2, "doc-1");
    expect(comparePublicWorldVersions(earlier, later).map((entry) => entry.kind)).toEqual([
      "modified", "modified",
    ]);
  });

  it("rejects comparisons across documents or in reverse order", () => {
    const before = parsePublicWorldDocumentVersion(document(baseVersion, []), "guard", "charter", 1, "doc-1");
    const after = parsePublicWorldDocumentVersion(document(nextVersion, []), "guard", "charter", 2, "doc-1");
    expect(() => comparePublicWorldVersions(after, before)).toThrow(/chronological/);
    expect(() => comparePublicWorldVersions(before, { ...after, documentId: "different" })).toThrow(/same document/);
  });
});
