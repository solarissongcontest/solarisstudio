import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import {
  TERRA_GOVERNANCE_DOMAIN_REGISTRY,
  TERRA_GOVERNANCE_TG4_EVENT_TYPES,
  TERRA_GOVERNANCE_TG4_MIGRATIONS,
} from "./terra-governance-domain-registry";
import { authorizationPolicyForCapability } from "./v3-s7-authorization-matrix";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const stateMigration = source(`supabase/migrations/${TERRA_GOVERNANCE_TG4_MIGRATIONS[0]}`);

describe("Terra Solaris Governance TG4 document state", () => {
  it("models one generic Work/Version/Provision/Artifact substrate", () => {
    expect(stateMigration).toContain("create table public.world_documents");
    expect(stateMigration).toContain("create table public.world_document_versions");
    expect(stateMigration).toContain("create table public.world_document_provisions");
    expect(stateMigration).toContain("create table public.world_document_version_provisions");
    expect(stateMigration).toContain("create table public.world_document_artifacts");
    expect(stateMigration).not.toMatch(/create table public\.(guard|unity)_/i);
    expect(stateMigration).not.toMatch(/create table public\.world_archive/i);
  });

  it("keeps document identity organization-scoped and generic across legal types", () => {
    expect(stateMigration).toContain("unique (organization_id, slug)");
    for (const type of [
      "charter",
      "rulebook",
      "annex",
      "treaty",
      "protocol",
      "procedural_rules",
      "report",
      "minutes",
      "communique",
      "other",
    ]) {
      expect(stateMigration).toContain(`'${type}'`);
    }
  });

  it("enforces version sequencing and explicit current-version authority", () => {
    expect(stateMigration).toContain("unique (document_id, version_number)");
    expect(stateMigration).toContain("current_version_id uuid");
    expect(stateMigration).toContain("world_documents_current_version_guard");
    expect(stateMigration).toContain("CURRENT_VERSION_MISMATCH");
    expect(stateMigration).not.toMatch(/max\(version_number\).*current/i);
  });

  it("preserves published legal history and rejects destructive mutation", () => {
    expect(stateMigration).toContain("world_document_versions_immutability_guard");
    expect(stateMigration).toContain("PUBLISHED_DOCUMENT_VERSION_IMMUTABLE");
    expect(stateMigration).toContain("publication_state in ('superseded','historical_source')");
    expect(stateMigration).toContain("record_class in ('working','official','permanent')");
  });

  it("prevents contradictory effective periods for published legal text", () => {
    expect(stateMigration).toContain("world_document_versions_effective_period_guard");
    expect(stateMigration).toContain("DOCUMENT_EFFECTIVE_PERIOD_OVERLAP");
    expect(stateMigration).toContain("tstzrange(other_row.effective_from, other_row.effective_to, '[)')");
  });

  it("keeps stable semantic provision identity separate from version numbering", () => {
    expect(stateMigration).toContain("semantic_key text not null");
    expect(stateMigration).toContain("unique (document_id, semantic_key)");
    expect(stateMigration).toContain("display_label text");
    expect(stateMigration).toContain("document_version_id uuid not null");
    expect(stateMigration).toContain("provision_id uuid not null");
    expect(stateMigration).toContain("parent_provision_id uuid");
    expect(stateMigration).toContain("unique (document_version_id, provision_id)");
  });

  it("binds version provisions to the same document at database level", () => {
    expect(stateMigration).toContain("foreign key (document_version_id, document_id)");
    expect(stateMigration).toContain("references public.world_document_versions(id, document_id)");
    expect(stateMigration).toContain("foreign key (provision_id, document_id)");
    expect(stateMigration).toContain("references public.world_document_provisions(id, document_id)");
  });

  it("keeps artifacts subordinate to versions rather than legal authority", () => {
    expect(stateMigration).toContain(
      "document_version_id uuid not null references public.world_document_versions(id) on delete restrict",
    );
    expect(stateMigration).toContain("world_document_artifacts_one_ready_format_uidx");
    expect(stateMigration).not.toMatch(/current_artifact_id/i);
  });

  it("registers only the bounded TG4 document capability pair", () => {
    expect(SOLARIS_CAPABILITIES).toContain("world.document.manage");
    expect(SOLARIS_CAPABILITIES).toContain("world.document.publish");
    const tg4 = TERRA_GOVERNANCE_DOMAIN_REGISTRY.find((domain) => domain.wave === "TG4");
    expect(tg4?.capabilities).toEqual(["world.document.manage", "world.document.publish"]);
  });

  it("classifies publication as critical server-authoritative world authorization", () => {
    const policy = authorizationPolicyForCapability("world.document.publish");
    expect(policy.domain).toBe("world");
    expect(policy.objectTypes).toContain("world_document");
    expect(policy.effect).toBe("publish");
    expect(policy.riskTier).toBe(4);
    expect(policy.serverAuthoritativeMutationRequired).toBe(true);
  });

  it("fails closed for browser mutation and separates anonymous/member/manager reads", () => {
    expect(stateMigration).toContain("alter table public.world_documents enable row level security");
    expect(stateMigration).toContain("alter table public.world_document_versions enable row level security");
    expect(stateMigration).toContain("alter table public.world_document_provisions enable row level security");
    expect(stateMigration).toContain("alter table public.world_document_version_provisions enable row level security");
    expect(stateMigration).toContain("alter table public.world_document_artifacts enable row level security");
    expect(stateMigration).toContain("revoke all on table public.world_documents");
    expect(stateMigration).toContain("world_documents_anon_read");
    expect(stateMigration).toContain("world_document_member_allowed_v1");
    expect(stateMigration).toContain("world.document.manage");
    expect(stateMigration).not.toMatch(/grant (insert|update|delete|all).* to (anon|authenticated)/i);
  });

  it("does not leak draft versions or unpublished artifacts through public policies", () => {
    expect(stateMigration).toContain(
      "publication_state in ('published','superseded','historical_source')",
    );
    expect(stateMigration).toContain("status = 'ready'");
    expect(stateMigration).not.toMatch(/world_document_versions_anon_read[\s\S]{0,500}publication_state = 'draft'/);
  });

  it("registers migration adoption in the migration that creates the state", () => {
    expect(stateMigration).toContain("public.v3_register_migration_contract");
    expect(stateMigration).toContain("'v3.tg4.world-document-state'");
    expect(stateMigration).toContain("'forward_fix_only'");
  });

  it("declares the canonical document event vocabulary before command implementation", () => {
    expect(TERRA_GOVERNANCE_TG4_EVENT_TYPES).toEqual([
      "world.document.created",
      "world.document.version_created",
      "world.document.version_published",
      "world.document.version_superseded",
    ]);
  });
});
