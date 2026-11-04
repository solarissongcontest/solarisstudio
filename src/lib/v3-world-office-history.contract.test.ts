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

describe("TG3 previous-leadership production boundary", () => {
  it("limits historical reads to publicly visible organizations and completed terms", () => {
    expect(migration).toContain("o.public_visibility = 'public'");
    expect(migration).toContain("t.status in ('ended', 'removed', 'resigned')");
    expect(migration).toContain("t.actual_end_at is not null");
    expect(migration).toContain("limit p_limit + 1");
    expect(migration).toContain("p_limit > 20");
    expect(migration).toContain("(t.started_at, t.id) < (p_cursor_started_at, p_cursor_term_id)");
    expect(migration).toContain("p_cursor_started_at is null");
    expect(migration).toContain("office.slug = lower(btrim(p_office_slug))");
    expect(migration).toContain("'hasMore'");
    expect(migration).toContain("'nextCursor'");
    expect(migration).not.toMatch(/offset p_offset|p_offset > 1000/);
  });

  it("never exposes login-linked office identities or private institutional grants", () => {
    expect(migration).toContain("holder.display_name");
    expect(migration).not.toContain("holder_user_id");
    expect(migration).not.toContain("auth.users");
    expect(migration).not.toContain("world_capability_grant_scopes");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("to anon, authenticated, service_role");
  });

  it("uses historical edition labels only when those editions are published", () => {
    expect(migration).toContain("start_edition.published is true");
    expect(migration).toContain("end_edition.published is true");
    expect(source).toContain("historicalTermEditionLabel");
    expect(screen).not.toContain("holderUserId");
  });

  it("keeps its own TanStack leaf route and public-only query without touching existing directories", () => {
    expect(route).toContain('createFileRoute("/world/organizations/$slug/office-history")');
    expect(route).toContain("WorldOfficeHistory");
    expect(source).toContain('"world_public_office_history_v1"');
    expect(screen).toContain("Load older terms");
    expect(screen).toContain("Filter by office");
    expect(screen).toContain("lastPage?.nextCursor");
    expect(screen).toContain("isFetchNextPageError");
    expect(screen).toContain("Retry older terms");
    expect(screen).not.toContain("<main");
    expect(screen).toContain('<div className="mx-auto w-full max-w-5xl pb-12">');
    expect(source).toContain("p_cursor_term_id");
    expect(source).toContain("p_office_slug");
    expect(screen).toContain("No completed terms published");
    expect(screen).not.toMatch(/\\.from\\(|\\.update\\(|\\.insert\\(|\\.delete\\(/);
  });
});
