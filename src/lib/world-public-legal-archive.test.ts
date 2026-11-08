import { describe, expect, it } from "vitest";

import {
  WORLD_LEGAL_ARCHIVE_PAGE_SIZE,
  legalArchiveRequestArgs,
  parsePublicLegalArchive,
  parsePublicLegalDocuments,
} from "./world-public-legal-archive";

const version = (number: number) => ({
  versionId: "version-" + number,
  versionNumber: number,
  title: "Charter version " + number,
  publicationState: number === 4 ? "published" : "superseded",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveTo: number === 4 ? null : "2026-02-01T00:00:00Z",
  publishedAt: "2026-01-01T00:00:00Z",
  contentHash: "a".repeat(64),
  supersedesVersionId: number > 1 ? "version-" + (number - 1) : null,
});

const archive = (overrides: Record<string, unknown> = {}) => ({
  archiveOwner: "world_document_versions",
  organizationSlug: "guard",
  organizationName: "GUARD",
  documentId: "document-1",
  documentSlug: "charter",
  documentTitle: "GUARD Charter",
  documentType: "charter",
  documentStatus: "active",
  currentVersionId: "version-4",
  versions: [version(4), version(3)],
  hasMore: false,
  nextBeforeVersion: null,
  ...overrides,
});

describe("TG4 public legal archive", () => {
  it("parses an immutable, descending public version page", () => {
    const result = parsePublicLegalArchive(archive(), "guard", "charter");
    expect(result?.versions.map((item) => item.versionNumber)).toEqual([4, 3]);
  });

  it("rejects private authority, malformed hashes and misordered history", () => {
    expect(parsePublicLegalArchive(archive({ archiveOwner: "private" }), "guard", "charter")).toBeNull();
    expect(parsePublicLegalArchive(archive({ versions: [version(3), version(4)] }), "guard", "charter")).toBeNull();
    expect(parsePublicLegalArchive(archive({ versions: [{ ...version(4), contentHash: "bad" }] }), "guard", "charter")).toBeNull();
  });

  it("rejects cross-document responses and invalid cursors", () => {
    expect(parsePublicLegalArchive(archive({ documentSlug: "other" }), "guard", "charter")).toBeNull();
    expect(() => legalArchiveRequestArgs("../guard", "charter", null)).toThrow();
    expect(() => legalArchiveRequestArgs("guard", "charter", 1)).toThrow();
    expect(legalArchiveRequestArgs("guard", "charter", 3).p_limit).toBe(WORLD_LEGAL_ARCHIVE_PAGE_SIZE);
  });

  it("requires a continuation cursor exactly when the page is full", () => {
    const full = Array.from({ length: WORLD_LEGAL_ARCHIVE_PAGE_SIZE }, (_, index) => version(100 - index));
    expect(parsePublicLegalArchive(archive({
      versions: full,
      hasMore: true,
      nextBeforeVersion: 70,
    }), "guard", "charter")?.hasMore).toBe(true);
    expect(parsePublicLegalArchive(archive({ versions: full, hasMore: false }), "guard", "charter")).toBeNull();
  });

  it("accepts only bounded, published document directory identities", () => {
    expect(parsePublicLegalDocuments([{
      organizationSlug: "guard",
      organizationName: "GUARD",
      documentSlug: "charter",
      title: "GUARD Charter",
      documentType: "charter",
      documentStatus: "active",
      privateNotes: "removed",
    }])).toEqual([{
      organizationSlug: "guard",
      organizationName: "GUARD",
      documentSlug: "charter",
      title: "GUARD Charter",
      documentType: "charter",
      documentStatus: "active",
    }]);
    expect(parsePublicLegalDocuments([{ organizationSlug: "guard/private" }])).toBeNull();
  });
});
