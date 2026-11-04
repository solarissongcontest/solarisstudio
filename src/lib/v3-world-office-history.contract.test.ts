import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261104105000_v3_tg3_public_office_history.sql"), "utf8");
const source = readFileSync(resolve(process.cwd(),
  "src/lib/v3-world-office-history.ts"), "utf8");
const route = readFileSync(resolve(process.cwd(),
  "src/routes/world/organizations/$slug_.office-history.tsx"), "utf8");
const screen = readFileSync(resolve(process.cwd(),
  "src/components/world/WorldOfficeHistory.tsx"), "utf8");
const rolloutMigration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261104105100_v3_tg3_public_world_rollout_flag.sql"), "utf8");
const rehearsal = readFileSync(resolve(process.cwd(),
  "scripts/rehearse-v3-world-office-history.sql"), "utf8");
const rehearsalRunner = readFileSync(resolve(process.cwd(),
  "scripts/rehearse-v3-world-office-history.sh"), "utf8");

describe("TG3 previous-leadership production boundary", () => {
  it("limits historical reads to publicly visible organizations and completed terms", () => {
    expect(migration).toContain("o.public_visibility = 'public'");
    expect(migration).toContain("t.status in ('ended', 'removed', 'resigned')");
    expect(migration).toContain("t.actual_end_at is not null");
    expect(migration).toContain("public.studio2_feature_enabled('terra_world_public', null) is not true");
    expect(rehearsal).toContain("TG3_HISTORY_DIRECT_RPC_ROLLOUT_BYPASS");
    expect(rehearsal).toContain("TG3_HISTORY_ENABLED_WORLD_RPC_UNAVAILABLE");
    expect(rehearsal).toContain("TG3_HISTORY_DIRECT_RPC_REMAINS_OPEN_AFTER_DISABLE");
    expect(migration).toContain("limit p_limit + 1");
    expect(migration).toContain("p_limit > 20");
    expect(migration).toContain("(t.started_at, t.id) < (p_cursor_started_at, p_cursor_term_id)");
    expect(migration).toContain("p_cursor_started_at is null");
    expect(migration).toContain("office.slug = lower(btrim(p_office_slug))");
    expect(migration).toContain("'hasMore'");
    expect(migration).toContain("'nextCursor'");
    expect(migration).toContain("limit 100");
    expect(migration).toContain("'officesTruncated'");
    expect(source).toContain("typeof root.officesTruncated");
    expect(migration).not.toMatch(/offset p_offset|p_offset > 1000/);
  });

  it("keeps concluded holder, office, and represented-country labels frozen", () => {
    expect(migration).toContain("holder_display_name_snapshot");
    expect(migration).toContain("office_title_snapshot");
    expect(migration).toContain("represented_country_name_snapshot");
    expect(migration).toContain("private.world_capture_closed_office_term_labels");
    expect(migration).toContain("new.holder_display_name_snapshot := old.holder_display_name_snapshot");
    expect(migration).toContain("new.office_title_snapshot := old.office_title_snapshot");
    expect(migration).toContain("new.represented_country_name_snapshot := old.represented_country_name_snapshot");
    expect(migration).toContain("before insert or update on public.world_office_terms");
    expect(migration).toContain("WORLD_CLOSED_OFFICE_TERM_IMMUTABLE");
    expect(migration).toContain("new.holder_user_id is not null");
    expect(migration).toContain("new.revision is distinct from old.revision");
    expect(migration).toContain("new.created_at is distinct from old.created_at");
    expect(rehearsal).toContain("TG3_HISTORY_REVISION_REWRITE_WAS_NOT_BLOCKED");
    expect(rehearsal).toContain("TG3_HISTORY_CREATION_REWRITE_WAS_NOT_BLOCKED");
    expect(migration).toContain("new.holder_user_id is distinct from old.holder_user_id");
    const updateGuard = migration.indexOf("if tg_op = 'UPDATE' then");
    const closedGuard = migration.indexOf("if old.status in ('ended', 'removed', 'resigned') then");
    const activeGuard = migration.indexOf("if new.status not in ('ended', 'removed', 'resigned')");
    expect(updateGuard >= 0 && closedGuard > updateGuard && activeGuard > closedGuard).toBe(true);
    expect(migration).not.toContain("tg_op = 'UPDATE' and old.status");
    for (const immutableField of [
      "new.status", "new.office_id", "new.holder_person_id",
      "new.represented_country_id", "new.start_edition_id",
      "new.end_edition_id", "new.started_at",
      "new.scheduled_end_at", "new.actual_end_at",
      "new.term_kind", "new.predecessor_term_id", "new.succession_reason",
    ]) {
      expect(migration).toContain(immutableField + " is distinct from old.");
    }
    expect(migration).toContain("'holderDisplayName', p.holder_name");
    expect(migration).toContain("'representedCountryName', p.represented_country_name");
    expect(screen).toContain("Represented country: {term.representedCountryName}");
  });

  it("never exposes login-linked office identities or private institutional grants", () => {
    expect(migration).toContain("holder.display_name");
    expect(migration).toContain("t.holder_display_name_snapshot as holder_name");
    expect(migration).toContain("t.office_title_snapshot as office_title");
    expect(migration).not.toContain("holder.display_name as holder_name");
    // The internal snapshot trigger may legitimately refer to login unlinking
    // in commentary. Only the exposed RPC definition defines the public shape.
    const rpcStart = migration.indexOf(
      "create or replace function public.world_public_office_history_v1("
    );
    const rpcEnd = migration.indexOf(
      "revoke all on function public.world_public_office_history_v1("
    );
    expect(rpcStart >= 0 && rpcEnd > rpcStart).toBe(true);
    const publicRpc = migration.slice(rpcStart, rpcEnd);
    expect(publicRpc).not.toContain("holder_user_id");
    expect(publicRpc).not.toContain("auth.users");
    expect(publicRpc).not.toContain("world_capability_grant_scopes");
    expect(publicRpc).not.toContain("'holderUserId'");
    expect(publicRpc).not.toContain("'userId'");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("to anon, authenticated, service_role");
  });

  it("uses historical edition labels only when those editions are published", () => {
    expect(migration).toContain("start_edition.published is true");
    expect(migration).toContain("end_edition.published is true");
    expect(source).toContain("historicalTermEditionLabel");
    expect(screen).not.toContain("holderUserId");
  });

  it("offers a rollback-only isolated migration rehearsal, never a hosted DB runner", () => {
    expect(rehearsal).toContain("begin;");
    expect(rehearsal).toContain("rollback;");
    expect(rehearsal).toContain("TG3_HISTORY_PRIVATE_ORG_LEAK");
    expect(rehearsal).toContain("TG3_HISTORY_FROZEN_LABELS_OR_FIRST_PAGE_FAILED");
    expect(rehearsal).toContain("TG3_HISTORY_KEYSET_OR_NULL_COUNTRY_FAILED");
    expect(rehearsal).toContain("TG3_HISTORY_UNBOUNDED_LIMIT_NOT_REJECTED");
    expect(rehearsal).toContain("TG3_HISTORY_REOPEN_WAS_NOT_BLOCKED");
    expect(rehearsal).toContain("TG3_HISTORY_COUNTRY_REWRITE_WAS_NOT_BLOCKED");
    expect(rehearsal).toContain("TG3_HISTORY_ACCOUNT_RELINK_WAS_NOT_BLOCKED");
    expect(rehearsal).toContain("WORLD_CLOSED_OFFICE_TERM_IMMUTABLE");
    expect(rehearsalRunner).toContain('V3_VERIFICATION_TARGET:-}');
    expect(rehearsalRunner).toContain("PGHOST=127.0.0.1");
    expect(rehearsalRunner).toContain("PGPORT=54322");
    expect(rehearsalRunner).not.toContain("SUPABASE_DB_URL");
  });

  it("registers the missing public World flag without erasing prior feature keys", () => {
    expect(rolloutMigration).toContain("pg_catalog.pg_get_expr");
    expect(rolloutMigration).toContain("studio2_feature_flags_key_check");
    expect(rolloutMigration).toContain("pg_catalog.strpos(v_predicate, 'terra_world_public')");
    expect(rolloutMigration).toContain("v_predicate,");
    expect(rolloutMigration).toContain("'terra_world_public', false, false");
    expect(rolloutMigration).toContain("on conflict (key) do nothing");
    expect(rolloutMigration).toContain("WORLD_PUBLIC_ROLLOUT_ALLOWLIST_CONSTRAINT_MISSING");
    expect(rolloutMigration).toContain("v3.tg3.public-world-rollout-flag");
    expect(rolloutMigration.indexOf("v3_register_migration_contract")
      < rolloutMigration.indexOf("drop constraint studio2_feature_flags_key_check")).toBe(true);
    expect(migration.indexOf("v3_register_migration_contract")
      < migration.indexOf("alter table public.world_office_terms")).toBe(true);
    expect(rolloutMigration).not.toContain("set enabled = true");
  });

  it("does not mount history reads before the same authoritative World rollout check", () => {
    expect(source).toContain('WORLD_HISTORY_ROLLOUT_KEY = "terra_world_public"');
    expect(source).toContain('client.rpc("studio2_feature_enabled"');
    expect(source).toContain("return data === true");
    expect(screen).toContain('queryKey: ["world", "public", "rollout"]');
    expect(screen).toContain("enabled: rollout.data === true");
    expect(screen).toContain("const visiblePages = rollout.data === true ? query.data?.pages : undefined");
    expect(screen).toContain("visiblePages?.flatMap");
    expect(screen).not.toContain("const items = query.data?.pages.flatMap");
    expect(screen).toContain("rollout.data !== true");
    expect(screen).toContain("World history is not yet available");
  });

  it("keeps its own TanStack leaf route and public-only query without touching existing directories", () => {
    expect(route).toContain('createFileRoute("/world/organizations/$slug/office-history")');
    expect(route).toContain("WorldOfficeHistory");
    expect(route).toContain("<WorldOfficeHistory key={slug} slug={slug} />");
    expect(source).toContain('"world_public_office_history_v1"');
    expect(screen).toContain("Load older terms");
    expect(screen).toContain("Filter by office");
    expect(screen).toContain("Showing the first 100 offices");
    expect(screen).toContain("lastPage?.nextCursor");
    expect(screen).toContain("isFetchNextPageError");
    expect(screen).toContain("Retry older terms");
    expect(screen).not.toContain("<main");
    expect(screen).toContain('<div className="mx-auto w-full max-w-5xl pb-12">');
    expect(source).toContain("p_cursor_term_id");
    expect(source).toContain("p_office_slug");
    expect(screen).toContain("No completed terms published");
    for (const mutation of [".from(", ".update(", ".insert(", ".delete("]) {
      expect(screen).not.toContain(mutation);
    }
  });
});
