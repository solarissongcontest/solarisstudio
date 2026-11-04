import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  parseWorldDocumentDraftSnapshot,
  parseWorldDocumentIndex,
  parseWorldOperationReceipt,
  normalizeWorldDocumentSearch,
  worldDocumentDraftSignature,
  toWorldDocumentSlug,
  validateWorldDocumentDraft,
} from "./world-document-draft-model";

const OP = "11111111-1111-4111-8111-111111111111";
const command = "world.document.version.create";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  documentId: "document-id",
  slug: "guard-charter",
  title: "GUARD Charter",
  revision: 4,
  organization: {
    organizationId: "organization-id",
    slug: "guard",
    officialName: "Global Union for Allied Resilience and Defence",
  },
  allowedActions: { manage: true, publish: false },
  history: [{
    versionId: "version-id",
    versionNumber: 2,
    title: "GUARD Charter",
    publicationState: "published",
  }],
  version: {
    versionId: "version-id",
    versionNumber: 2,
    revision: 3,
    title: "GUARD Charter",
    plainText: "Article 1. Official text.",
    structuredContent: { introduction: "Official" },
    provisions: [],
    publicationState: "published",
    effectiveFrom: "2026-11-01T00:00:00Z",
  },
  ...overrides,
});

describe("TG4 governed institutional draft models", () => {
  it("validates a bounded permission-aware index with current published versions", () => {
    const rows = parseWorldDocumentIndex({
      documents: [{
        documentId: "doc", organizationId: "org", organizationSlug: "guard",
        slug: "charter", title: "Charter", documentType: "charter",
        visibility: "public", status: "active",
        currentVersion: { versionId: "v1", versionNumber: 1 },
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].currentVersion?.versionNumber).toBe(1);
  });

  it("refuses malformed, missing and over-budget indexes rather than claiming emptiness", () => {
    expect(() => parseWorldDocumentIndex(null)).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: null })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: [{}] })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: new Array(101).fill({}) })).toThrow();
  });

  it("requires authoritative version and document revision for managers", () => {
    expect(parseWorldDocumentDraftSnapshot(snapshot()).revision).toBe(4);
    expect(() => parseWorldDocumentDraftSnapshot(snapshot({ revision: null }))).toThrow();
    expect(() => parseWorldDocumentDraftSnapshot(snapshot({
      version: { ...snapshot().version, revision: null },
    }))).toThrow();
    expect(() => parseWorldDocumentDraftSnapshot(snapshot({ history: null }))).toThrow();
  });

  it("detects a pending draft even when the canonical current version is published", () => {
    const doc = parseWorldDocumentDraftSnapshot(snapshot({
      history: [
        { publicationState: "draft", versionId: "v2", versionNumber: 3, title: "Draft of GUARD Charter" },
        { publicationState: "published", versionId: "v1" },
      ],
    }));
    expect(doc.hasUnpublishedDraft).toBe(true);
    expect(doc.pendingDraft).toEqual({
      versionId: "v2", versionNumber: 3, title: "Draft of GUARD Charter",
    });
    expect(doc.version?.publicationState).toBe("published");
    expect(doc.version?.structuredContent).toEqual({ introduction: "Official" });
    expect(doc.version?.provisions).toEqual([]);
  });

  it("does not expose privileged revision requirements to public readers", () => {
    const doc = parseWorldDocumentDraftSnapshot(snapshot({
      allowedActions: { manage: false, publish: false },
      revision: null,
      history: [],
      version: { ...snapshot().version, revision: null },
    }));
    expect(doc.revision).toBeNull();
    expect(doc.hasUnpublishedDraft).toBe(false);
    expect(doc.pendingDraft).toBeNull();
  });

  it("never treats a receipt with a different operation or command as success", () => {
    const receipt = {
      command, operationId: OP, status: "succeeded",
      result: { ok: true, operationId: OP, versionId: "v3" },
    };
    expect(parseWorldOperationReceipt(receipt, OP, command).status).toBe("succeeded");
    expect(() => parseWorldOperationReceipt(receipt, "different-id", command)).toThrow();
    expect(() => parseWorldOperationReceipt(receipt, OP, "world.document.create")).toThrow();
    expect(() => parseWorldOperationReceipt({ ...receipt, result: { ok: true } }, OP, command)).toThrow();
  });

  it("keeps processing, failed and uncertain receipts distinct from success", () => {
    for (const status of ["processing", "uncertain", "failed"]) {
      expect(parseWorldOperationReceipt({
        command, operationId: OP, status, result: null,
      }, OP, command).status).toBe(status);
    }
    expect(() => parseWorldOperationReceipt({
      command, operationId: OP, status: "pending", result: null,
    }, OP, command)).toThrow();
  });

  it("validates legal-draft inputs and keeps stable ASCII slugs", () => {
    expect(toWorldDocumentSlug("Ålanti's  New  Charter")).toBe("alanti-s-new-charter");
    expect(validateWorldDocumentDraft({
      title: "Charter", slug: "guard-charter", kind: "charter", visibility: "public",
    })).toBeNull();
    expect(validateWorldDocumentDraft({
      title: "Charter", slug: "Guard/Charter",
    })).toMatch(/identifier/);
    expect(validateWorldDocumentDraft({
      title: "Charter", kind: "untrusted",
    })).toMatch(/type/);
    expect(validateWorldDocumentDraft({
      title: "Charter", plainText: " ",
    })).toMatch(/draft text/);
    expect(validateWorldDocumentDraft({
      title: "Charter", plainText: "", hasProvisions: true,
    })).toBeNull();
  });

  it("detects unsaved changes to legal text, stable identity and hierarchy", () => {
    const initial = {
      title: "GUARD Charter",
      plainText: "Founding clauses.",
      provisions: [{
        semanticKey: "membership.admission",
        parentSemanticKey: null,
        anchor: "membership-admission",
        displayLabel: "Article 1",
        heading: "Admission",
        bodyPlainText: "Conditions",
        bodyStructured: {},
        status: "active" as const,
      }],
    };
    const baseline = worldDocumentDraftSignature(initial);
    expect(worldDocumentDraftSignature({
      ...initial, provisions: initial.provisions.map((row) => ({ ...row })),
    })).toBe(baseline);
    expect(worldDocumentDraftSignature({
      ...initial, plainText: "Altered founding clauses.",
    })).not.toBe(baseline);
    expect(worldDocumentDraftSignature({
      ...initial, provisions: initial.provisions.map((row) => ({
        ...row, semanticKey: "membership.election",
      })),
    })).not.toBe(baseline);
    expect(worldDocumentDraftSignature({
      ...initial, provisions: initial.provisions.map((row) => ({
        ...row, parentSemanticKey: "preamble",
      })),
    })).not.toBe(baseline);
    expect(worldDocumentDraftSignature({
      ...initial, provisions: initial.provisions.map((row) => ({
        ...row, displayLabel: "Article 10",
      })),
    })).not.toBe(baseline);
  });

  it("normalizes the bounded server-authorized Work search", () => {
    expect(normalizeWorldDocumentSearch("  International   Charter  ")).toBe("International   Charter");
    expect(normalizeWorldDocumentSearch("x".repeat(500))).toHaveLength(120);
  });

  it("wires the authenticated Organizer route and never uses direct document DML", () => {
    const route = readFileSync("src/routes/_authenticated/admin/world-documents.tsx", "utf8");
    const screen = readFileSync("src/components/admin/AdminWorldDocumentDraftWorkspace.tsx", "utf8");
    expect(route).toContain('createFileRoute("/_authenticated/admin/world-documents")');
    expect(route).toContain("noindex, nofollow");
    expect(screen).toContain("world_create_document_v1");
    expect(screen).toContain("world_create_document_version_v1");
    expect(screen).toContain("studio2_reconcile_operation");
    expect(screen).toContain("p_expected_document_revision");
    expect(screen).toContain("hasUnpublishedDraft");
    expect(screen).toContain("world_get_document_v1");
    expect(screen).toContain("p_version_number: pendingDraft.versionNumber");
    expect(screen).toContain("toWorldProvisionCommandRows");
    expect(screen).toContain("worldDocumentDraftSignature");
    expect(screen).toContain("confirmDiscard()");
    expect(screen).toContain("beforeunload");
    expect(screen).toContain("hasUnsubmittedWork");
    expect(screen).toContain("Changing institution discards the current Work form");
    expect(screen).toContain("setCreateTitle(\"\")");
    expect(screen).toContain("setAppliedSearch(normalized)");
    expect(screen).toContain('const applySearch = (term: string): boolean =>');
    expect(screen).toContain('if (normalized === appliedSearch) return true;');
    expect(screen).toContain('if (!confirmDiscard()) return false;');
    expect(screen).toContain('if (applySearch("")) setSearchInput("");');
    expect(screen).not.toContain('if (!appliedSearch) setDocumentSlug("");');


    expect(screen).toContain("p_query: appliedSearch || null");
    expect(screen).toContain("disabled={authoringLocked} value={createSlug}");
    expect(screen).toContain("disabled={authoringLocked} onChange");
    expect(screen).toContain("value={kind} disabled={authoringLocked}");
    expect(screen).toContain("value={visibility} disabled={authoringLocked}");
    expect(screen).toContain("reviewedFullText");
    expect(screen).toContain("Inspect the complete outgoing legal draft");
    expect(screen).toContain("I have inspected the complete outgoing legal text");
    expect(screen).toContain("JSON.stringify(operation.review.args.p_structured_content");
    expect(screen).toContain("JSON.stringify(row.bodyStructured");

    expect(screen).toContain("p_structured_content: structuredContent");
    expect(screen).toContain("p_provisions: provisions");
    expect(screen).toContain('db.rpc("world_access_allowed"');
    expect(screen).toContain('p_capability: "world.document.manage"');
    expect(screen).toContain("if (!organization || createAccess.data !== true) return;");

    expect(screen).toContain('setDraftProvisions(provisions)');
    expect(screen).toContain("validateWorldDocumentProvisions(snapshot.data.version.provisions)");
    expect(screen).toContain("executing.current.has(review.operationId)");
    expect(screen).not.toContain("p_provisions: []");

    expect(screen).not.toContain("world_update_document_version_draft_v1");
    expect(screen).not.toMatch(/\.from\(["']world_document(?:s|_versions)["']\)/);
    expect(screen).not.toContain("world_publish_document_version_v1");
    expect(screen).not.toContain("service_role");
  });
});
