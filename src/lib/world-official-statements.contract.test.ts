import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = source("supabase/migrations/20261104150000_v3_tg9_world_official_statements.sql");
const api = source("src/lib/world-official-statements-client.ts");
const model = source("src/lib/world-official-statements.ts");
const ui = source("src/components/world/WorldOfficialStatements.tsx");
const directoryRoute = source("src/routes/world/organizations/$slug_.statements.tsx");
const detailRoute = source("src/routes/world/organizations/$slug_.statements.$statementId.tsx");

describe("TG9 governed official statements", () => {
  it("reuses TG2 organization, office and permission authority", () => {
    expect(sql).toContain("references public.world_organizations(id)");
    expect(sql).toContain("references public.world_organization_offices(id)");
    expect(sql).toContain("references public.delegation_people(id)");
    expect(sql).toContain("insert into public.studio2_capabilities");
    expect(sql).toContain("'world.statement.publish'");
    expect(sql).toContain("insert into public.world_office_capabilities");
    expect(sql).toContain("public.world_access_allowed(");
    expect(sql).not.toMatch(/create table public\.(?:world_)?(?:users|capability_grants)/);
  });

  it("protects cross-organization office attribution and actor impersonation", () => {
    expect(sql).toContain("world_statements_issuer_organization_fkey");
    expect(sql).toContain("foreign key(issuing_office_id,organization_id)");
    expect(sql).toContain("holder_user_id=auth.uid()");
    expect(sql).toContain("v_person_id");
    expect(sql).not.toMatch(/p_issuing_person_id/);
    expect(sql).toContain("and org.public_visibility='public'");
  });

  it("never gives anonymous or browser actors direct statement table access", () => {
    expect(sql).toContain("alter table public.world_statements enable row level security");
    expect(sql).toContain("alter table public.world_statement_versions enable row level security");
    expect(sql).toMatch(/revoke all on table public\.world_statements,public\.world_statement_versions[\s\S]*?from public,anon,authenticated,service_role/);
    expect(sql).not.toMatch(/create policy .*world_statements/i);
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete) on (?:table )?public\.world_statements/i);
    expect(api).not.toMatch(/\.from\(["']world_(?:statements|statement_versions)["']\)/);
    expect(api).toContain('call("world_statement_feed_v1"');
    expect(api).toContain('call("world_statement_detail_v1"');
    expect(api).toContain('call("world_statement_history_v1"');
  });

  it("checks institution and statement visibility independently for every public projection", () => {
    expect(sql).toContain("org.public_visibility='public'");
    expect(sql).toContain("statement_row.visibility='public'");
    expect(sql).toContain("s.visibility='public'");
    expect(sql).toContain("s.current_version_id is not null");
    expect(model).toContain('value.visibility !== "public"');
    expect(model).toContain('value.organizationVisibility !== "public"');
  });

  it("enforces finite, deterministic pages and explicit correction history reads", () => {
    expect(sql).toContain("p_limit>24");
    expect(sql).toContain("p_offset>1000");
    expect(sql).toContain("limit p_limit+1 offset p_offset");
    expect(sql).toContain("order by statement_row.published_at desc,statement_row.id desc");
    expect(sql).toContain("order by v.version_number desc");
    expect(sql).toContain("p_version_number integer default null");
    expect(sql).toContain("v.version_number=coalesce(p_version_number,s.revision)");
    expect(model).toContain("WORLD_STATEMENT_PAGE_SIZE = 12");
    expect(ui).toContain("Version history");
  });

  it("makes historical versions structurally immutable while retaining author deletion", () => {
    expect(sql).toContain("unique(statement_id,version_number)");
    expect(sql).toContain("world_statements_current_version_fkey");
    expect(sql).toContain("world_statement_versions_immutable_trg");
    expect(sql).toContain("before update or delete on public.world_statement_versions");
    expect(sql).toContain("old.published_by_user_id is not null");
    expect(sql).toContain("new.published_by_user_id is null");
    expect(sql).toContain("IMMUTABLE_STATEMENT_VERSION");
    expect(sql).toContain("on delete set null");
  });

  it("routes all mutations through V3 receipts and revision-bound server commands", () => {
    expect(sql).toContain("private.studio2_claim_operation");
    expect(sql).toContain("private.studio2_complete_operation");
    expect(sql).toContain("public.studio2_reconcile_operation");
    expect(sql).toContain("private.v3_emit_domain_event");
    expect(sql).toContain("'world.statement.published'");
    expect(sql).toContain("'world.statement.corrected'");
    expect(sql).toContain("v_statement.revision<>p_expected_revision");
    expect(sql).toContain("VERSION_CONFLICT");
    expect(sql).toContain("world_statement_versions(");
    expect(sql).toContain("term_row.actual_end_at is null");
    expect(sql).not.toContain("term_row.ends_at");
    expect(sql).not.toContain("update public.world_statement_versions");
    expect(sql).not.toContain("delete from public.world_statement_versions");
  });

  it("provides a real publication UI without private table reads or unsafe HTML", () => {
    expect(directoryRoute).toContain('createFileRoute("/world/organizations/$slug/statements")');
    expect(detailRoute).toContain('createFileRoute("/world/organizations/$slug/statements/$statementId")');
    expect(ui).toContain("readWorldStatementPublishingContext(slug)");
    expect(ui).toContain("publishWorldOfficialStatement(");
    expect(ui).toContain("correctWorldOfficialStatement(");
    expect(ui).toContain("createWorldStatementOperation()");
    expect(ui).toContain("Retry same operation");
    expect(ui).toContain("whitespace-pre-wrap");
    expect(ui).not.toContain("dangerouslySetInnerHTML");
    expect(ui).not.toContain("window.location");
    expect(ui).not.toMatch(/https?:\/\/[^\s]*supabase\.co/);
  });

  it("registers forward-fix-only S13 migration evidence without production test traffic", () => {
    expect(sql).toContain("'v3.tg9.world-statement-publication'");
    expect(sql).toContain("'forward_fix_only'");
    expect(sql).toContain("notify pgrst,'reload schema'");
    expect(api).not.toContain("service_role");
    expect(api).not.toMatch(/fetch\(["']https?:\/\//);
  });
});
