import { describe, expect, it } from "vitest";

import {
  assertWorldSlug,
  normalizeWorldSearch,
  parseWorldDocumentDetail,
  parseWorldDocumentIndex,
} from "./world-public-documents";

const indexRow = {
  documentId: "document-1",
  organizationSlug: "guard",
  organizationName: "Global Union for Allied Resilience and Defence",
  slug: "charter",
  documentType: "charter",
  title: "GUARD Charter",
  status: "active",
  visibility: "public",
  currentVersion: {
    versionId: "version-2",
    versionNumber: 2,
    title: "Charter revision",
    publishedAt: "2026-11-02T00:00:00Z",
    effectiveFrom: "2026-11-04T00:00:00Z",
  },
};

const document = {
  documentId: "document-1",
  organization: {
    slug: "guard",
    officialName: "Global Union for Allied Resilience and Defence",
    shortName: "GUARD",
  },
  slug: "charter",
  documentType: "charter",
  title: "GUARD Charter",
  visibility: "public",
  version: {
    versionId: "version-2",
    versionNumber: 2,
    title: "Revised Charter",
    publicationState: "published",
    plainText: "Preamble",
    publishedAt: "2026-11-02T00:00:00Z",
    effectiveFrom: "2026-11-04T00:00:00Z",
    effectiveTo: null,
    provisions: [{
      provisionId: "provision-1",
      semanticKey: "article-one",
      parentSemanticKey: null,
      displayLabel: "Article I",
      heading: "Scope",
      bodyPlainText: "Public rules apply.",
      anchor: "article-one",
    }],
  },
  history: [
    {
      versionNumber: 2,
      title: "Revised Charter",
      publicationState: "published",
      publishedAt: "2026-11-02T00:00:00Z",
    },
    {
      versionNumber: 1,
      title: "Original Charter",
      publicationState: "superseded",
      publishedAt: "2026-10-01T00:00:00Z",
    },
  ],
  allowedActions: { manage: true, publish: true },
};

describe("TG4 public institutional document library", () => {
  it("keeps only public rows backed by an actual published current Version", () => {
    const parsed = parseWorldDocumentIndex({
      documents: [
        indexRow,
        { ...indexRow, documentId: "draft-only", slug: "draft", currentVersion: null },
        { ...indexRow, documentId: "members", slug: "members", visibility: "members" },
        { ...indexRow, documentId: "private", slug: "private", visibility: "private" },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].slug).toBe("charter");
    expect(parsed[0].currentVersion.versionNumber).toBe(2);
    expect(Object.keys(parsed[0])).not.toContain("visibility");
  });

  it("rejects malformed identifiers and duplicate canonical rows", () => {
    expect(() => assertWorldSlug("../private")).toThrow();
    expect(() => assertWorldSlug("GUARD")).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: [indexRow, indexRow] })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: [{}] })).not.toThrow();
    expect(() => parseWorldDocumentIndex({ documents: "not an array" })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: Array(101).fill(indexRow) })).toThrow();
  });

  it("rejects partial or invalid published Version metadata", () => {
    expect(() => parseWorldDocumentIndex({
      documents: [{ ...indexRow, currentVersion: { versionNumber: 0 } }],
    })).toThrow();
    expect(() => parseWorldDocumentIndex({
      documents: [{ ...indexRow, slug: "unsafe/path" }],
    })).toThrow();
  });

  it("removes capability and provenance metadata from the public reader model", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      sourceProvenance: "private provenance",
      version: { ...document.version, revision: 123, sourceDescription: "private notes" },
    });
    expect(result?.version.title).toBe("Revised Charter");
    expect(result).not.toHaveProperty("allowedActions");
    expect(result).not.toHaveProperty("sourceProvenance");
    expect(result?.version).not.toHaveProperty("revision");
    expect(result?.version).not.toHaveProperty("sourceDescription");
  });

  it("never exposes member/private documents or manager draft versions on Public", () => {
    expect(parseWorldDocumentDetail({ ...document, visibility: "private" })).toBeNull();
    expect(parseWorldDocumentDetail({ ...document, visibility: "members" })).toBeNull();
    expect(() => parseWorldDocumentDetail({
      ...document,
      version: { ...document.version, publicationState: "draft" },
    })).toThrow("not public");
  });

  it("preserves historical published/superseded versions but excludes draft history", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      history: [...document.history, {
        versionNumber: 3,
        title: "Confidential draft",
        publicationState: "draft",
      }],
    });
    expect(result?.history.map((item) => item.versionNumber)).toEqual([2, 1]);
    expect(result?.history.map((item) => item.publicationState)).toEqual(["published", "superseded"]);
  });

  it("never interprets stored text as markup and discards unsafe/duplicate TOC anchors", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [
          { ...document.version.provisions[0], bodyPlainText: "<script>alert('x')</script>" },
          { ...document.version.provisions[0], provisionId: "two", anchor: "article-one" },
          { ...document.version.provisions[0], provisionId: "three", anchor: "../unsafe" },
        ],
      },
    });
    expect(result?.version.provisions[0].bodyPlainText).toBe("<script>alert('x')</script>");
    expect(result?.version.provisions.map((item) => item.anchor)).toEqual([
      "article-one", null, null,
    ]);
  });

  it("bounds search input without making additional requests or inventing results", () => {
    expect(normalizeWorldSearch("  official charter  ")).toBe("official charter");
    expect(normalizeWorldSearch("x".repeat(200))).toHaveLength(100);
  });
});
