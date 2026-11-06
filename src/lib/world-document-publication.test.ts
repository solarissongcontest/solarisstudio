import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import type { WorldDocumentDraftSnapshot } from "./world-document-draft-model";
import {
  EFFECTIVE_DATE_COMMAND,
  PUBLISH_DOCUMENT_COMMAND,
  assertPublicationResultIdentity,
  isPublicationReady,
  parseUtcEffectiveMinute,
} from "./world-document-publication";

const document = (overrides: Partial<WorldDocumentDraftSnapshot> = {}): WorldDocumentDraftSnapshot => ({
  documentId: "doc-1",
  slug: "guard-charter",
  title: "GUARD Charter",
  revision: 7,
  organization: { organizationId: "guard-1", slug: "guard", officialName: "GUARD" },
  allowedActions: { manage: true, publish: true },
  hasUnpublishedDraft: true,
  pendingDraft: { versionId: "version-2", versionNumber: 2, title: "Charter v2" },
  version: null,
  ...overrides,
});
const pending = (overrides: Partial<WorldDocumentDraftSnapshot> = {}) => document({
  version: {
    versionId: "version-2", versionNumber: 2, revision: 3,
    title: "Charter v2", plainText: "The full canonical legal text",
    structuredContent: { articles: 10 }, provisions: [],
    publicationState: "draft", effectiveFrom: "2026-11-06T12:00:00.000Z",
  },
  ...overrides,
});

describe("TG4 governed publication lifecycle", () => {
  it("parses strict UTC minutes, rejecting impossible calendar dates and local-zone ambiguity", () => {
    expect(parseUtcEffectiveMinute("2026-11-07T00:20")).toBe("2026-11-07T00:20:00.000Z");
    expect(parseUtcEffectiveMinute("2026-02-30T00:00")).toBeNull();
    expect(parseUtcEffectiveMinute("2026-13-01T09:00")).toBeNull();
    expect(parseUtcEffectiveMinute("2026-11-07T24:00")).toBeNull();
    expect(parseUtcEffectiveMinute("2026-11-07T10:70")).toBeNull();
    expect(parseUtcEffectiveMinute("2026-11-07T10:00+02:00")).toBeNull();
    expect(parseUtcEffectiveMinute("2026-11-07T10:00Z")).toBeNull();
  });

  it("requires exact document/version identity, canonical capability and revisions", () => {
    const now = Date.parse("2026-11-07T00:30:00Z");
    expect(isPublicationReady({ document: document(), pending: pending(), now })).toBe(true);
    expect(isPublicationReady({ document: document({ revision: null }), pending: pending(), now })).toBe(false);
    expect(isPublicationReady({
      document: document({ allowedActions: { manage: true, publish: false } }),
      pending: pending(), now,
    })).toBe(false);
    expect(isPublicationReady({
      document: document({ allowedActions: { manage: false, publish: true } }),
      pending: pending(), now,
    })).toBe(false);
    expect(isPublicationReady({
      document: document(),
      pending: pending({ documentId: "different-country-document" }), now,
    })).toBe(false);
    expect(isPublicationReady({
      document: document(),
      pending: pending({ organization: {
        organizationId: "other-organization", slug: "other", officialName: "Other",
      } }), now,
    })).toBe(false);
    expect(isPublicationReady({
      document: document({ pendingDraft: {
        versionId: "older-draft", versionNumber: 2, title: "Other",
      } }), pending: pending(), now,
    })).toBe(false);
    expect(isPublicationReady({ document: document(), pending: null, now })).toBe(false);
  });

  it("blocks future, undated, already-published and empty versions", () => {
    const now = Date.parse("2026-11-07T00:30:00Z");
    const legalVersion = pending().version!;
    for (const effectiveFrom of [null, "2026-11-08T00:00:00Z", "invalid"]) {
      expect(isPublicationReady({
        document: document(),
        pending: pending({ version: { ...legalVersion, effectiveFrom } }), now,
      })).toBe(false);
    }
    expect(isPublicationReady({
      document: document(),
      pending: pending({ version: { ...legalVersion, publicationState: "published" } }), now,
    })).toBe(false);
    expect(isPublicationReady({
      document: document(),
      pending: pending({ version: { ...legalVersion, plainText: "   ", provisions: [] } }), now,
    })).toBe(false);
  });

  it("refuses receipts from another legal version or without canonical content hash", () => {
    const result = { documentId: "doc-1", versionId: "version-2", contentHash: "a".repeat(64) };
    expect(() => assertPublicationResultIdentity(result, "doc-1", "version-2")).not.toThrow();
    expect(() => assertPublicationResultIdentity(result, "doc-2", "version-2")).toThrow();
    expect(() => assertPublicationResultIdentity(result, "doc-1", "version-3")).toThrow();
    expect(() => assertPublicationResultIdentity({ ...result, contentHash: "not-verified" },
      "doc-1", "version-2")).toThrow();
    expect(() => assertPublicationResultIdentity(null, "doc-1", "version-2")).toThrow();
  });

  it("keeps real canonical R2 and R3 RPCs separate, restricted and receipted", () => {
    const sql = readFileSync(
      "supabase/migrations/20261103171200_v3_tg4_world_document_effective_date.sql", "utf8",
    );
    const screen = readFileSync(
      "src/components/admin/AdminWorldDocumentPublicationWorkspace.tsx", "utf8",
    );
    const route = readFileSync(
      "src/routes/_authenticated/admin/world-document-publication.tsx", "utf8",
    );
    const drafting = readFileSync(
      "src/components/admin/AdminWorldDocumentDraftWorkspace.tsx", "utf8",
    );
    expect(EFFECTIVE_DATE_COMMAND).not.toBe(PUBLISH_DOCUMENT_COMMAND);
    expect(sql).toContain("world_set_document_draft_effective_date_v1");
    expect(sql).toContain("'world.document.manage'");
    expect(sql).toContain("'world.document.version.effective_date.set'");
    expect(sql).toContain("'R2'");
    expect(sql).toContain("private.studio2_claim_operation");
    expect(sql).toContain("private.studio2_complete_operation");
    expect(sql).toContain("world_document_actor_person_v1");
    expect(sql).toContain("for update");
    expect(sql).toContain("p_expected_version_revision");
    expect(sql).toContain("v_version.publication_state <> 'draft'");
    expect(sql).toContain("EFFECTIVE_DATE_NOT_AFTER_CURRENT_VERSION");
    expect(sql).not.toMatch(/set\s+plain_text\s*=/i);
    expect(sql).not.toMatch(/set\s+source_provenance\s*=/i);
    expect(sql).not.toMatch(/set\s+structured_content\s*=/i);
    expect(sql).not.toMatch(/set\s+current_version_id\s*=/i);
    expect(sql).toContain("to authenticated;");
    expect(route).toContain("noindex, nofollow");
    expect(route).toContain('createFileRoute("/_authenticated/admin/world-document-publication")');
    expect(screen).toContain("world_set_document_draft_effective_date_v1");
    expect(screen).toContain("world_publish_document_version_v1");
    expect(screen).toContain("world_get_document_v1");
    expect(screen).toContain("p_version_number: pending.versionNumber");
    expect(screen).toContain("world_get_document_index_v1");
    expect(screen).toContain("studio2_reconcile_operation");
    expect(screen).toContain("p_expected_document_revision");
    expect(screen).toContain("p_expected_version_revision");
    expect(screen).toContain("legalTextRead");
    expect(screen).toContain("typedTitle !== action.title");
    expect(screen).toContain("JSON.stringify(draft.provisions");
    expect(screen).not.toMatch(/\.from\(["']world_document(?:s|_versions)["']\)/);
    expect(drafting).toContain('href="/admin/world-document-publication"');
  });
});
