import { describe, expect, it } from "vitest";
import { auditV3S16CatalogAuthority, scanV3S16StaticAuthority, type V3S16DomainDefinition } from "./v3-s16-mutation-authority";

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
});
