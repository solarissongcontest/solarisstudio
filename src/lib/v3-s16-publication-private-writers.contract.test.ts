import { describe, expect, it } from "vitest";
import {
  auditV3S16CatalogAuthority,
  V3_S16_CRITICAL_DOMAINS,
  type V3S16CatalogEvidence,
} from "./v3-s16-mutation-authority";

const domain = V3_S16_CRITICAL_DOMAINS.find((candidate) => candidate.id === "publication")!;
const sha = "a".repeat(40);
const privateWriters = [
  "private.studio2_create_show_publication_control()",
  "private.studio2_ensure_show_publication_control(uuid)",
];
const functionName = (identity: string) => identity.slice(0, identity.indexOf("("));

function fixture(): V3S16CatalogEvidence {
  return {
    schemaVersion: 2,
    collection: "effective-postgresql-catalog-v2",
    candidateSha: sha,
    uncertainties: [],
    roles: { roles: [{ name: "anon" }, { name: "authenticated" }, { name: "service_role" }] },
    negativeTests: { candidateSha: sha, passed: true, domains: ["publication"] },
    tables: domain.canonicalTables.map((table) => ({
      table, owner: "postgres", rlsEnabled: true,
      dmlRoles: [], columnDmlRoles: [],
      writeTriggers: table === "public.studio2_show_publication_controls"
        ? ["v3_guard_archived_edition_workflow_write"] : [],
      triggerDetails: table === "public.studio2_show_publication_controls"
        ? [{
            name: "v3_guard_archived_edition_workflow_write",
            enabled: "O", type: 31,
            function: "private.v3_guard_archived_edition_workflow_write()",
            definition: "CREATE TRIGGER v3_guard_archived_edition_workflow_write BEFORE INSERT OR DELETE OR UPDATE ON public.studio2_show_publication_controls FOR EACH ROW EXECUTE FUNCTION private.v3_guard_archived_edition_workflow_write()",
          }] : [],
      updatableViews: [],
    })),
    functions: [
      {
        identity: "private.v3_guard_archived_edition_workflow_write()",
        name: "private.v3_guard_archived_edition_workflow_write",
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public, private",
        executeRoles: ["postgres"],
      },
      ...domain.canonicalCommands.map((name) => ({
        name: name.startsWith("public.") ? name : `public.${name}`,
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public, private",
        executeRoles: ["authenticated"],
        writesTables: ["public.studio2_show_publication_controls"],
      })),
      ...privateWriters.map((identity) => ({
        identity,
        name: functionName(identity),
        owner: "postgres",
        securityDefiner: true,
        searchPath: "pg_catalog, public, private",
        executeRoles: ["postgres", "supabase_admin"],
        writesTables: ["public.studio2_show_publication_controls"],
      })),
    ],
  };
}

describe("S16 publication private writer authority", () => {
  it("records exact private identities rather than invented public RPCs", () => {
    expect(domain.sanctionedInternalWriters).toEqual(privateWriters);
    expect(domain.directRpcDeniedInternalWriters).toEqual(privateWriters);
    expect(auditV3S16CatalogAuthority(fixture(), sha, [domain])).toEqual([]);
  });

  it.each(["anon", "authenticated", "PUBLIC"] as const)(
    "fails hard when an internal writer becomes directly executable by %s", (role) => {
      const catalog = fixture();
      const functions = catalog.functions.map((fn) =>
        fn.identity === privateWriters[1] ? { ...fn, executeRoles: [...fn.executeRoles, role] } : fn,
      );
      const findings = auditV3S16CatalogAuthority({ ...catalog, functions }, sha, [domain]);
      expect(findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          domain: "publication",
          kind: role === "PUBLIC" ? "canonical_function_public_execute" : "internal_writer_user_execute",
          releaseRisk: "hard_blocker",
        }),
      ]));
    },
  );

  it("keeps a missing exact helper signature a hard blocker", () => {
    const catalog = fixture();
    const findings = auditV3S16CatalogAuthority({
      ...catalog,
      functions: catalog.functions.filter((fn) => fn.identity !== privateWriters[0]),
    }, sha, [domain]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "canonical_function_missing",
        subject: privateWriters[0],
        releaseRisk: "hard_blocker",
      }),
    ]));
  });

  it("rejects unclassified writers even when they are private", () => {
    const catalog = fixture();
    const functions = [...catalog.functions, {
      identity: "private.unsafe_publication_peer(uuid)",
      name: "private.unsafe_publication_peer",
      owner: "postgres",
      securityDefiner: true,
      searchPath: "pg_catalog, public, private",
      executeRoles: ["postgres"],
      writesTables: ["public.studio2_show_publication_controls"],
    }];
    const findings = auditV3S16CatalogAuthority({ ...catalog, functions }, sha, [domain]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "competing_legacy_writer",
        subject: "private.unsafe_publication_peer",
        releaseRisk: "hard_blocker",
      }),
    ]));
  });
});
