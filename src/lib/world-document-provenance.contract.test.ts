import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorldDocumentDraftSnapshot } from "./world-document-draft-model";

const managerVersion = {
  documentId: "document-id",
  slug: "guard-charter",
  title: "GUARD Charter",
  revision: 8,
  organization: {
    organizationId: "guard-id", slug: "guard", officialName: "GUARD",
  },
  allowedActions: { manage: true, publish: false },
  history: [{
    versionId: "draft-version", versionNumber: 3,
    title: "Charter amendment", publicationState: "draft",
  }],
  version: {
    versionId: "draft-version",
    versionNumber: 3,
    revision: 2,
    title: "Charter amendment",
    plainText: "Historical and canonical legal text.",
    structuredContent: { legislature: { title: "Assembly" } },
    provisions: [],
    publicationState: "draft",
    effectiveFrom: "2026-11-07T12:00:00Z",
    effectiveTo: null,
    sourceDescription: "Historical source attribution",
    sourceProvenance: { origin: "guard-archive", sourceVersion: "original" },
  },
};

describe("TG4 lossless draft update and provenance gates", () => {
  it("retains manager-only source metadata and effective dates for draft roundtrip", () => {
    const parsed = parseWorldDocumentDraftSnapshot(managerVersion);
    expect(parsed.version?.structuredContent).toEqual({ legislature: { title: "Assembly" } });
    expect(parsed.version?.sourceDescription).toBe("Historical source attribution");
    expect(parsed.version?.sourceProvenance).toEqual({
      origin: "guard-archive", sourceVersion: "original",
    });
    expect(parsed.version?.effectiveFrom).toBe("2026-11-07T12:00:00Z");
    expect(parsed.version?.effectiveTo).toBeNull();
    expect(parsed.version?.revision).toBe(2);
  });

  it("never lets source provenance pass through a public/non-manager projection", () => {
    const value = parseWorldDocumentDraftSnapshot({
      ...managerVersion,
      revision: null,
      allowedActions: { manage: false, publish: false },
      history: [],
      version: {
        ...managerVersion.version,
        revision: null,
        sourceDescription: null,
        sourceProvenance: null,
        publicationState: "published",
      },
    });
    expect(value.version?.sourceDescription).toBeNull();
    expect(value.version?.sourceProvenance).toBeNull();

    const sql = readFileSync(
      "supabase/migrations/20261103171400_v3_tg4_document_manager_provenance_projection.sql",
      "utf8",
    );
    expect(sql).toContain("when v_can_manage then v_version.source_provenance else null end");
    expect(sql).toContain("when v_can_manage then v_version.source_description else null end");
    expect(sql).toContain("private.world_document_can_read_v1");
    expect(sql).toContain("v_version.publication_state = 'draft'");
    expect(sql).toContain("not v_can_manage");
    expect(sql).not.toContain("grant select on public.world_document_versions");
  });

  it("uses only the existing TG4 authority, with fresh authentication and CAS", () => {
    const sql = readFileSync(
      "supabase/migrations/20261103171600_v3_tg4_draft_updater_rowtype_fix.sql",
      "utf8",
    );
    const editor = readFileSync(
      "src/components/admin/AdminWorldDocumentDraftWorkspace.tsx", "utf8",
    );
    expect(sql).toContain("create or replace function public.world_update_document_version_draft_v1");
    expect(sql).toContain("select version_row.* into v_version");
    expect(sql).not.toContain("select version_row.*, document_row.organization_id");
    expect(sql).toContain("private.studio2_require_fresh_auth(300)");
    expect(sql).toContain("private.studio2_claim_operation");
    expect(sql).toContain("v_version.revision is distinct from p_expected_version_revision");
    expect(sql).toContain("v_version.publication_state <> 'draft'");
    expect(sql).toContain("world_access_allowed(");
    expect(sql).toContain("private.world_document_replace_draft_provisions");
    expect(sql).toContain("private.studio2_complete_operation");
    expect(editor).toContain('openReview("world.document.version.update_draft"');
    expect(editor).toContain("p_structured_content: version.structuredContent");
    expect(editor).toContain("p_source_description: version.sourceDescription");
    expect(editor).toContain("p_source_provenance: version.sourceProvenance");
    expect(editor).toContain("p_effective_from: version.effectiveFrom");
    expect(editor).toContain("p_effective_to: version.effectiveTo");
    expect(editor).toContain("p_expected_version_revision: version.revision");
    expect(editor).toContain("Inspect the complete outgoing legal draft");
    expect(editor).toContain("originalDraft.current");
    expect(editor).not.toMatch(/\.from\(["']world_document(?:s|_versions)["']\)/);
    expect(editor).not.toContain("world_publish_document_version_v1");
  });
});
