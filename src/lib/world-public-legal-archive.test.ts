import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  legalArchiveRequestArgs,
  parsePublicLegalArchive,
} from "./world-public-legal-archive";

const hash = "c".repeat(64);
const version = (number: number, overrides: Record<string, unknown> = {}) => ({
  versionId: "id-" + number,
  versionNumber: number,
  title: "GUARD Charter historical v" + number,
  publicationState: number === 4 ? "published" : "superseded",
  effectiveFrom: "2026-11-01T00:00:00Z",
  effectiveTo: number === 4 ? null : "2026-11-03T00:00:00Z",
  publishedAt: "2026-11-01T00:00:00Z",
  contentHash: hash,
  recordClass: number === 4 ? "official" : "permanent",
  supersedesVersionId: number === 1 ? null : "id-" + (number - 1),
  supersededByVersionId: number === 4 ? null : "id-" + (number + 1),
  fullTextAvailable: true,
  ...overrides,
});
const archive = (overrides: Record<string, unknown> = {}) => ({
  archiveOwner: "world_document_versions+domain_events",
  documentId: "doc-1",
  organizationId: "org-guard",
  organizationSlug: "guard",
  organizationName: "GUARD",
  documentSlug: "charter",
  documentTitle: "GUARD Charter",
  documentType: "charter",
  documentStatus: "active",
  currentVersionId: "id-4",
  serverTime: "2026-11-07T00:00:00Z",
  versions: [version(4), version(3)],
  hasMore: true,
  nextBeforeVersion: 3,
  ...overrides,
});

describe("TG4 official legal Archive public projection", () => {
  it("accepts only canonical ordered published history with exact identity", () => {
    const data = parsePublicLegalArchive(archive(), "guard", "charter", null, 30);
    expect(data?.versions.map((row) => row.versionNumber)).toEqual([4, 3]);
    expect(data?.versions[0].publicationState).toBe("published");
    expect(data?.versions[1].recordClass).toBe("permanent");
    expect(data?.nextBeforeVersion).toBe(3);
    expect(data?.documentStatus).toBe("active");
    expect(data?.currentVersionId).toBe("id-4");
    expect(parsePublicLegalArchive(null, "guard", "charter", null, 30)).toBeNull();
    expect(parsePublicLegalArchive(archive({
      versions: [version(2, { publicationState: "historical_source" })],
      hasMore: false, nextBeforeVersion: null,
    }), "guard", "charter", 3, 30)?.versions[0].publicationState).toBe("historical_source");
  });

  it("fails closed for draft, unclassified and unverified versions", () => {
    const bad = [
      version(4, { publicationState: "draft" }),
      version(4, { recordClass: "working" }),
      version(4, { contentHash: "invalid" }),
      version(4, { sourceProvenance: { confidential: true } }),
      version(4, { sourceDescription: "privileged source" }),
      version(4, { plainText: "should not be serialized" }),
      version(4, { fullTextAvailable: "yes" }),
    ];
    for (const row of bad) {
      expect(() => parsePublicLegalArchive(archive({
        versions: [row], hasMore: false, nextBeforeVersion: null,
      }), "guard", "charter", null, 30)).toThrow();
    }
  });

  it("rejects cross-organization, cross-document and inconsistent paged history", () => {
    for (const candidate of [
      archive({ documentSlug: "private-treaty" }),
      archive({ organizationSlug: "unity" }),
      archive({ archiveOwner: "untrusted-archive" }),
      archive({ versions: [version(4), version(4)] }),
      archive({ versions: [version(2), version(3)] }),
      archive({ versions: [version(4)], nextBeforeVersion: 2 }),
      archive({ hasMore: false, nextBeforeVersion: 3 }),
      archive({ hasMore: true, versions: [], nextBeforeVersion: null }),
      archive({ versions: new Array(31).fill(version(4)) }),
    ]) {
      expect(() => parsePublicLegalArchive(candidate, "guard", "charter", null, 30)).toThrow();
    }
    expect(() => parsePublicLegalArchive(archive({
      versions: [version(4), version(3)],
    }), "guard", "charter", 4, 30)).toThrow();
  });

  it("rejects unbounded or malformed paging requests before network access", () => {
    expect(legalArchiveRequestArgs("guard", "charter", null)).toEqual({
      p_organization_slug: "guard", p_document_slug: "charter",
      p_before_version: null, p_limit: 30,
    });
    expect(legalArchiveRequestArgs("guard", "charter", 3, 10).p_before_version).toBe(3);
    expect(() => legalArchiveRequestArgs("guard", "bad/name", null)).toThrow();
    expect(() => legalArchiveRequestArgs("../guard", "charter", null)).toThrow();
    expect(() => legalArchiveRequestArgs("guard", "charter", -1)).toThrow();
    expect(() => legalArchiveRequestArgs("guard", "charter", 0)).toThrow();
    expect(() => legalArchiveRequestArgs("guard", "charter", null, 101)).toThrow();
  });

  it("keeps browser and database public-only, with one Archive truth and no raw DML", () => {
    const sql = readFileSync(
      "supabase/migrations/20261103173000_v3_tg4_public_legal_archive.sql", "utf8",
    );
    const transport = readFileSync("src/lib/world-public-legal-archive.ts", "utf8");
    const screen = readFileSync("src/components/world/WorldPublicLegalArchive.tsx", "utf8");
    const route = readFileSync(
      "src/routes/world/documents/$organization/$document_/archive.tsx", "utf8",
    );
    const reader = readFileSync("src/components/v3/V3WorldDocumentLibrary.tsx", "utf8");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain("organization_row.public_visibility = 'public'");
    expect(sql).toContain("document_row.visibility = 'public'");
    expect(sql).toContain("version_row.publication_state in ('published','superseded','historical_source')");
    expect(sql).toContain("version_row.version_number < p_before_version");
    expect(sql).toContain("limit p_limit + 1");
    expect(sql).toContain("to anon, authenticated;");
    expect(sql).not.toMatch(/create table\s/i);
    expect(sql).not.toMatch(/grant (?:all|insert|update|delete) on\s+table/i);
    expect(sql).not.toContain("source_provenance");
    expect(sql).not.toContain("source_description");
    expect(transport).toContain("anonymousWorldRpcRequest(key, args, signal)");
    expect(transport).toContain("world_get_public_legal_archive_v1");
    expect(transport).toContain("anonymousWorldRpcRequest");
    expect(screen).toContain("WorldPublicGate verifyOnMount");
    expect(screen).toContain("Full text unavailable");
    expect(screen).toContain("No draft or cached fallback");
    expect(screen).toContain("Older versions");
    expect(screen).toContain("Current document reader");
    expect(route).toContain('createFileRoute("/world/documents/$organization/$document_/archive")');
    expect(reader).toContain('to="/world/documents/$organization/$document/archive"');
  });
});
