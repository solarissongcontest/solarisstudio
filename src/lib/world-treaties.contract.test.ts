import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  parsePublishedTreaties,
  validateTreatyRegistration,
} from "./world-treaties";
import {
  TERRA_GOVERNANCE_TG4_EVENT_TYPES,
  TERRA_GOVERNANCE_TG4_MIGRATIONS,
  terraGovernanceDomain,
} from "./terra-governance-domain-registry";
import { TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS } from "./terra-governance-document-event-registry";

const treaty = {
  treatyId: "t1",
  documentId: "doc-1",
  organizationSlug: "guard",
  organizationName: "GUARD",
  documentSlug: "founding-protocol",
  title: "Founding protocol",
  treatyType: "multilateral",
  status: "registered",
  openedAt: "2026-11-07T12:00:00Z",
  effectiveAt: null,
  terminatedAt: null,
  versionNumber: 1,
  contentHash: "a".repeat(64),
  documentEffectiveFrom: "2026-11-06T00:00:00Z",
  parties: [
    { countryId: "country-a", countryName: "Oland", countryCode: "OL",
      role: "invited", status: "invited",
      signedAt: null, ratifiedAt: null, withdrewAt: null },
  ],
};

describe("TG4 treaty registration and publication-safe index", () => {
  it("parses a verified published legal Work without asserting party consent", () => {
    expect(parsePublishedTreaties({ treaties: [treaty] })).toEqual([treaty]);
    expect(parsePublishedTreaties({ treaties: [] })).toEqual([]);
  });

  it("fails closed on malformed, duplicate, unpublished or forged treaty party projections", () => {
    expect(() => parsePublishedTreaties(null)).toThrow();
    expect(() => parsePublishedTreaties({ treaties: new Array(101).fill(treaty) })).toThrow();
    expect(() => parsePublishedTreaties({ treaties: [treaty, treaty] })).toThrow();
    expect(() => parsePublishedTreaties({ treaties: [{ ...treaty, contentHash: null }] })).toThrow();
    expect(() => parsePublishedTreaties({ treaties: [{ ...treaty, versionNumber: 0 }] })).toThrow();
    expect(() => parsePublishedTreaties({ treaties: [{ ...treaty, parties: [
      { ...treaty.parties[0], signedAt: "2026-11-07T12:00:00Z" },
    ] }] })).toThrow();
    expect(() => parsePublishedTreaties({ treaties: [{ ...treaty, parties: [
      treaty.parties[0], treaty.parties[0],
    ] }] })).toThrow();
  });

  it("requires 1–100 distinct listed countries and known treaty kinds", () => {
    expect(validateTreatyRegistration({
      treatyType: "multilateral", partyIds: ["country-a","country-b"],
    })).toBeNull();
    expect(validateTreatyRegistration({ treatyType: "fake", partyIds: ["country-a"] })).not.toBeNull();
    expect(validateTreatyRegistration({ treatyType: "bilateral", partyIds: [] })).not.toBeNull();
    expect(validateTreatyRegistration({ treatyType: "bilateral", partyIds: ["a","a"] })).not.toBeNull();
    expect(validateTreatyRegistration({
      treatyType: "bilateral", partyIds: new Array(101).fill("x"),
    })).not.toBeNull();
  });

  it("prevents direct client treaty DML and reuses one legal Work and R2 operation authority", () => {
    const sql = readFileSync("supabase/migrations/20261103172000_v3_tg4_treaty_register.sql","utf8");
    const admin = readFileSync("src/routes/_authenticated/admin/world-treaties.tsx","utf8");
    const publicRoute = readFileSync("src/routes/world/treaties/index.tsx","utf8");

    expect(sql).toContain("create table public.world_treaties");
    expect(sql).toContain("create table public.world_treaty_parties");
    expect(sql).toContain("references public.world_documents(id) on delete restrict");
    expect(sql).toContain("references public.countries(id) on delete restrict");
    expect(sql).toContain("unique (treaty_id,country_id)");
    expect(sql).toContain("alter table public.world_treaties enable row level security");
    expect(sql).toContain("revoke all on public.world_treaties from service_role");
    expect(sql).toContain("revoke all on public.world_treaty_parties from service_role");
    expect(sql).toContain("private.studio2_claim_operation");
    expect(sql).toContain("'world.treaty.register','R2'");
    expect(sql).toContain("private.studio2_require_fresh_auth(300)");
    expect(sql).toContain("'world.document.manage'");
    expect(sql).toContain("private.world_document_actor_person_v1");
    expect(sql).toContain("p_expected_document_revision");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_document.revision is distinct from p_expected_document_revision");
    expect(sql).toContain("private.studio2_complete_operation");
    expect(sql).toContain("'world.treaty.registered'");
    expect(sql).toContain("'world.documents.projection'");
    expect(sql).toContain("world_get_published_treaties_v1");
    expect(sql).toContain("ver.publication_state='published'");
    expect(sql).toContain("doc.visibility='public'");
    expect(sql).toContain("org.public_visibility='public'");
    expect(sql).toContain("world_get_treaty_manager_v1");
    expect(sql).toContain("world_access_allowed");
    expect(sql).toContain("v3.tg4.world-treaty-register");
    expect(admin).toContain("world_get_document_index_v1");
    expect(admin).toContain("world_get_document_v1");
    expect(admin).toContain("world_get_treaty_manager_v1");
    expect(admin).toContain("world_register_treaty_v1");
    expect(admin).toContain("studio2_reconcile_operation");
    expect(admin).toContain("parseWorldOperationReceipt");
    expect(admin).toContain("readAndConfirmed");
    expect(admin).toContain("Listed countries");
    expect(admin).not.toMatch(/\.from\(["']world_treaties["']\)/);
    expect(publicRoute).toContain("world_get_published_treaties_v1");
    expect(publicRoute).toContain("Listed · no signature");
    expect(publicRoute).toContain("No unpublished or cached fallback");
  });

  it("tracks treaty contracts and their projections in the canonical TG4 owner", () => {
    const domain=terraGovernanceDomain("world-documents");
    expect(domain?.commands).toContain("world.treaty.register");
    expect(domain?.canonicalTables).toContain("public.world_treaties");
    expect(domain?.canonicalTables).toContain("public.world_treaty_parties");
    expect(domain?.projections).toContain("public.world_get_published_treaties_v1");
    expect(domain?.eventTypes).toContain("world.treaty.registered");
    expect(TERRA_GOVERNANCE_TG4_EVENT_TYPES).toContain("world.treaty.registered");
    expect(TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS["world.treaty.registered"])
      .toContain("world.documents.projection");
    expect(TERRA_GOVERNANCE_TG4_MIGRATIONS)
      .toContain("20261103172000_v3_tg4_treaty_register.sql");
  });
});
