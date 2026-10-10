import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 canonical edition authority", () => {
  it("keeps selected edition tab-scoped and explicitly non-authoritative", () => {
    const context = source("src/components/admin/AdminContext.tsx");
    const edition = source("src/lib/solaris-v6-edition-context.ts");

    expect(context).toContain("window.sessionStorage");
    expect(context).not.toContain("window.localStorage");
    expect(edition).toContain(
      "Edition selection is a navigation preference, never an authorization source.",
    );
    expect(edition).toContain(
      "Cross-tab communication is invalidation-only.",
    );
  });

  it("uses the governed v2 transition RPC instead of direct runtime-table writes", () => {
    const persistence = source("src/lib/studio2-persistence.ts");

    expect(persistence).toContain(
      "client.rpc('studio2_transition_edition_v2'",
    );
    expect(persistence).toContain(
      ".from('studio2_edition_runtime')\n        .select('*')",
    );
    expect(persistence).not.toContain(
      ".from('studio2_edition_runtime').update",
    );
    expect(persistence).not.toContain(
      ".from('studio2_edition_runtime').insert",
    );
  });

  it("keeps authenticated runtime-table access read-only", () => {
    const schema = source(
      "supabase/migrations/20260910220000_studio2_persistence_schema.sql",
    );

    expect(schema).toContain(
      "revoke all on table public.studio2_edition_runtime from public, anon, authenticated;",
    );
    expect(schema).toContain(
      "grant select on table public.studio2_edition_runtime to authenticated;",
    );
    expect(schema).not.toContain(
      "grant update on table public.studio2_edition_runtime to authenticated",
    );
    expect(schema).not.toContain(
      "grant insert on table public.studio2_edition_runtime to authenticated",
    );
  });

  it("authorizes transitions against the same edition identity and preserves critical approval safety", () => {
    const cutover = source(
      "supabase/migrations/20260916145441_permission_engine_v2_transition_approval_rpc_cutover.sql",
    );

    expect(cutover).toContain(
      "studio2_access_allowed(v_required_capability, p_edition_id, false)",
    );
    expect(cutover).toContain(
      "where edition_id = p_edition_id\n  for update;",
    );
    expect(cutover).toContain(
      "v_approval.edition_id <> p_edition_id",
    );
    expect(cutover).toContain(
      "v_approval.approved_by = v_actor",
    );
    expect(cutover).toContain(
      "Critical transition approval is missing, stale, mismatched, or already consumed",
    );
  });

  it("removes the pre-v2 browser-callable lifecycle mutation authority", () => {
    const retirement = source(
      "supabase/migrations/20261004103000_solaris_v6_retire_legacy_edition_transition_rpc.sql",
    );

    expect(retirement).toContain(
      "revoke all on function public.studio2_transition_edition(uuid, text, text, uuid)",
    );
    expect(retirement).toContain(
      "drop function if exists public.studio2_transition_edition(uuid, text, text, uuid);",
    );
  });
});
