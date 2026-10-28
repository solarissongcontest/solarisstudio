import { describe, expect, it } from "vitest";
import {
  auditV3S16CatalogAuthority,
  buildV3S16MutationAuthorityReport,
  scanV3S16StaticAuthority,
  type V3S16DomainDefinition,
} from "./v3-s16-mutation-authority";

const domain: V3S16DomainDefinition = {
  id: "jury",
  risk: "integrity_critical",
  canonicalTables: ["public.jury_votes"],
  canonicalOwner: "jury",
  canonicalCommands: ["studio2_submit_jury_ballot"],
  knownLegacyWriterPatterns: [{ id: "legacy-jury-save", pattern: /legacySaveJuryBallot\s*\(/ }],
};

const migration = {
  path: "supabase/migrations/20261027000000_jury.sql",
  source: `create or replace function public.studio2_submit_jury_ballot() returns void language plpgsql security definer set search_path = pg_catalog, public as $$ begin null; end $$;`,
};

describe("S16 canonical mutation authority", () => {
  it("catches an unauthorized direct application writer", () => {
    const findings = scanV3S16StaticAuthority([
      { path: "src/lib/bad.ts", source: `client.from("jury_votes").update({ score: 12 }).eq("id", id)` },
      migration,
    ], [domain]);
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "direct_application_writer", path: "src/lib/bad.ts" })]));
  });

  it("catches a competing legacy writer", () => {
    const findings = scanV3S16StaticAuthority([
      { path: "src/legacy/jury.ts", source: `export const save = () => legacySaveJuryBallot()` },
      migration,
    ], [domain]);
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "competing_legacy_writer", subject: "legacy-jury-save" })]));
  });

  it("accepts a governed canonical RPC caller and excludes pure reads", () => {
    const findings = scanV3S16StaticAuthority([
      { path: "src/integrations/jury.server.ts", source: `client.rpc("studio2_submit_jury_ballot", { p_round_id: roundId })` },
      { path: "src/integrations/jury-read.server.ts", source: `client.from("jury_votes").select("country_id,score")` },
      migration,
    ], [domain]);
    expect(findings).toEqual([]);
  });

  it("recognizes canonical commands outside public/private schemas", () => {
    const televoteDomain: V3S16DomainDefinition = {
      id: "televote",
      risk: "integrity_critical",
      canonicalTables: ["televoting.rounds"],
      canonicalOwner: "televote",
      canonicalCommands: ["televoting.v3_create_round"],
    };
    const findings = scanV3S16StaticAuthority([
      {
        path: "supabase/migrations/20261027190500_v3_s16_televote_round_authority.sql",
        source: `create or replace function televoting.v3_create_round() returns void language plpgsql security definer set search_path = pg_catalog, televoting as $$ begin null; end $$;`,
      },
    ], [televoteDomain]);
    expect(findings).toEqual([]);
  });

  it("does not let a same-named function in the wrong schema satisfy an explicit command", () => {
    const televoteDomain: V3S16DomainDefinition = {
      id: "televote",
      risk: "integrity_critical",
      canonicalTables: ["televoting.rounds"],
      canonicalOwner: "televote",
      canonicalCommands: ["televoting.v3_create_round"],
    };
    const findings = scanV3S16StaticAuthority([
      {
        path: "supabase/migrations/20261027190500_wrong_schema.sql",
        source: `create or replace function public.v3_create_round() returns void language plpgsql security definer set search_path = pg_catalog, public as $$ begin null; end $$;`,
      },
    ], [televoteDomain]);
    expect(findings).toEqual([
      expect.objectContaining({ kind: "missing_canonical_command_definition", subject: "televoting.v3_create_round" }),
    ]);
  });

  it("uses exact-SHA catalog evidence to reject direct role grants", () => {
    const sha = "a".repeat(40);
    const findings = auditV3S16CatalogAuthority({
      schemaVersion: 1,
      candidateSha: sha,
      tables: [{ table: "public.jury_votes", owner: "jury_owner", rlsEnabled: true, dmlRoles: ["authenticated"] }],
      functions: [{ name: "studio2_submit_jury_ballot", owner: "jury_writer", securityDefiner: true, searchPath: "pg_catalog, public", executeRoles: ["authenticated"] }],
    }, sha, [domain]);
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "unexpected_direct_dml_role" })]));
  });

  it("accepts only explicitly sanctioned hardened internal writers and write triggers", () => {
    const sha = "b".repeat(40);
    const governedDomain: V3S16DomainDefinition = {
      ...domain,
      sanctionedInternalWriters: ["private.studio2_touch_jury_vote"],
      sanctionedWriteTriggers: ["jury_guard"],
    };
    const findings = auditV3S16CatalogAuthority({
      schemaVersion: 1,
      candidateSha: sha,
      tables: [{
        table: "public.jury_votes",
        owner: "postgres",
        rlsEnabled: true,
        dmlRoles: [],
        columnDmlRoles: [],
        columnDmlGrants: [],
        writeTriggers: ["jury_guard"],
        updatableViews: [],
      }],
      functions: [
        {
          name: "public.studio2_submit_jury_ballot",
          owner: "postgres",
          securityDefiner: true,
          searchPath: "pg_catalog, public, private",
          executeRoles: ["authenticated"],
          writesTables: ["public.jury_votes"],
        },
        {
          name: "private.studio2_touch_jury_vote",
          owner: "postgres",
          securityDefiner: true,
          searchPath: "pg_catalog, public, private",
          executeRoles: [],
          writesTables: ["public.jury_votes"],
        },
      ],
    }, sha, [governedDomain]);
    expect(findings).toEqual([]);
  });

  it("still rejects an unclassified trigger beside a sanctioned one", () => {
    const sha = "c".repeat(40);
    const governedDomain: V3S16DomainDefinition = {
      ...domain,
      sanctionedWriteTriggers: ["jury_guard"],
    };
    const findings = auditV3S16CatalogAuthority({
      schemaVersion: 1,
      candidateSha: sha,
      tables: [{
        table: "public.jury_votes",
        owner: "postgres",
        rlsEnabled: true,
        dmlRoles: [],
        columnDmlRoles: [],
        writeTriggers: ["jury_guard", "rogue_writer"],
        updatableViews: [],
      }],
      functions: [{
        name: "public.studio2_submit_jury_ballot",
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public",
        executeRoles: ["authenticated"],
      }],
    }, sha, [governedDomain]);
    expect(findings).toEqual([
      expect.objectContaining({ kind: "unexpected_write_trigger", subject: "rogue_writer" }),
    ]);
  });

  it("keeps bounded cross-domain show writers visible as compatibility debt without making them peer authorities", () => {
    const showDomain: V3S16DomainDefinition = {
      id: "show-lifecycle",
      risk: "integrity_critical",
      canonicalTables: ["public.shows"],
      canonicalOwner: "live-show domain",
      canonicalCommands: ["public.v3_apply_show_runtime_change"],
      temporaryCompatibilityApplicationWriters: [{
        path: "src/routes/_authenticated/admin/design.$slug.tsx",
        table: "public.shows",
        ownerDomain: "design/broadcast-presentation",
        columns: ["theme_id", "broadcast_config"],
        reason: "presentation only",
        sunsetCondition: "presentation command cutover",
      }],
    };
    const files = [
      {
        path: "src/routes/_authenticated/admin/design.$slug.tsx",
        source: `client.from("shows").update({ theme_id, broadcast_config }).eq("id", showId)`,
      },
      {
        path: "supabase/migrations/20261027000001_show.sql",
        source: `create or replace function public.v3_apply_show_runtime_change() returns void language plpgsql security definer set search_path = pg_catalog, public as $$ begin null; end $$;`,
      },
    ];
    expect(scanV3S16StaticAuthority(files, [showDomain])).toEqual([]);
    const report = buildV3S16MutationAuthorityReport({
      candidateSha: "d".repeat(40),
      files,
      domains: [showDomain],
    });
    expect(report.compatibilityDebt).toEqual(showDomain.temporaryCompatibilityApplicationWriters);
  });

  it("still hard-fails an unregistered direct show writer beside bounded compatibility", () => {
    const showDomain: V3S16DomainDefinition = {
      id: "show-lifecycle",
      risk: "integrity_critical",
      canonicalTables: ["public.shows"],
      canonicalOwner: "live-show domain",
      canonicalCommands: ["public.v3_apply_show_runtime_change"],
      temporaryCompatibilityApplicationWriters: [{
        path: "src/routes/design.tsx",
        table: "public.shows",
        ownerDomain: "design",
        columns: ["theme_id"],
        reason: "presentation only",
        sunsetCondition: "design command cutover",
      }],
    };
    const findings = scanV3S16StaticAuthority([
      { path: "src/routes/design.tsx", source: `client.from("shows").update({ theme_id }).eq("id", id)` },
      { path: "src/routes/rogue.tsx", source: `client.from("shows").update({ status: "live" }).eq("id", id)` },
      {
        path: "supabase/migrations/20261027000001_show.sql",
        source: `create or replace function public.v3_apply_show_runtime_change() returns void language plpgsql security definer set search_path = pg_catalog, public as $$ begin null; end $$;`,
      },
    ], [showDomain]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "direct_application_writer", path: "src/routes/rogue.tsx" }),
    ]));
  });

  it("accepts only exact bounded column grants and rejects lifecycle/service-role drift", () => {
    const sha = "e".repeat(40);
    const showDomain: V3S16DomainDefinition = {
      id: "show-lifecycle",
      risk: "integrity_critical",
      canonicalTables: ["public.shows"],
      canonicalOwner: "live-show domain",
      canonicalCommands: ["public.v3_apply_show_runtime_change"],
      allowedColumnDmlGrants: [{
        table: "public.shows",
        role: "authenticated",
        privilege: "UPDATE",
        column: "theme_id",
        ownerDomain: "design",
        sunsetCondition: "design command cutover",
      }],
    };
    const base = {
      schemaVersion: 1 as const,
      candidateSha: sha,
      functions: [{
        name: "public.v3_apply_show_runtime_change",
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public, private",
        executeRoles: ["authenticated"],
        writesTables: ["public.shows"],
      }],
    };
    expect(auditV3S16CatalogAuthority({
      ...base,
      tables: [{
        table: "public.shows",
        owner: "postgres",
        rlsEnabled: true,
        dmlRoles: [],
        columnDmlRoles: ["authenticated"],
        columnDmlGrants: [{ role: "authenticated", privilege: "UPDATE", column: "theme_id" }],
      }],
    }, sha, [showDomain])).toEqual([]);

    const lifecycleDrift = auditV3S16CatalogAuthority({
      ...base,
      tables: [{
        table: "public.shows",
        owner: "postgres",
        rlsEnabled: true,
        dmlRoles: [],
        columnDmlRoles: ["authenticated", "service_role"],
        columnDmlGrants: [
          { role: "authenticated", privilege: "UPDATE", column: "theme_id" },
          { role: "service_role", privilege: "UPDATE", column: "status" },
        ],
      }],
    }, sha, [showDomain]);
    expect(lifecycleDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unexpected_column_dml_role", subject: "public.shows.status" }),
    ]));
  });

  it("fails closed if column-level DML cannot be proven down to exact columns", () => {
    const sha = "f".repeat(40);
    const showDomain: V3S16DomainDefinition = {
      id: "show-lifecycle",
      risk: "integrity_critical",
      canonicalTables: ["public.shows"],
      canonicalOwner: "live-show domain",
      canonicalCommands: ["public.v3_apply_show_runtime_change"],
      allowedColumnDmlGrants: [{
        table: "public.shows",
        role: "authenticated",
        privilege: "UPDATE",
        column: "theme_id",
        ownerDomain: "design",
        sunsetCondition: "design command cutover",
      }],
    };
    const findings = auditV3S16CatalogAuthority({
      schemaVersion: 1,
      candidateSha: sha,
      tables: [{
        table: "public.shows",
        owner: "postgres",
        rlsEnabled: true,
        dmlRoles: [],
        columnDmlRoles: ["authenticated"],
      }],
      functions: [{
        name: "public.v3_apply_show_runtime_change",
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public",
        executeRoles: ["authenticated"],
      }],
    }, sha, [showDomain]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "column_dml_scope_unproven", subject: "public.shows" }),
    ]));
  });
});
