import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020094500_v3_public_result_analysis_context.sql",
  ),
  "utf8",
);

function functionBody(signature: string, delimiter: string) {
  const start = migration.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return migration.slice(start, end + delimiter.length + 3);
}

describe("V3 Public Result Analysis Context", () => {
  it("is an additive S13 forward-fix contract with no hosted Supabase endpoint", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.public-result-analysis-context-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("derives a stable opaque identity from exact edition/show/version evidence", () => {
    const body = functionBody(
      "private.v3_public_result_version_identity(",
      "identity",
    );
    expect(body).toContain("p_edition_id::text");
    expect(body).toContain("p_show_id::text");
    expect(body).toContain("p_result_version::text");
    expect(body).toContain("extensions.digest(");
    expect(body).toContain("'sha256'");
    expect(body).toContain("'rv1_' || encode(");
  });

  it("requires exact show-to-edition scope and never falls back to active/latest edition", () => {
    const body = functionBody(
      "public.v3_public_result_analysis_context(",
      "context",
    );
    expect(body).toContain("show_row.id = p_show_id");
    expect(body).toContain("show_row.edition_id = p_edition_id");
    expect(body).toContain("'Result Analysis Context scope mismatch'");
    expect(body).not.toMatch(/active_edition|latest_edition|order by[^;]*year desc/i);
  });

  it("uses canonical publication controls and immutable Result Version evidence", () => {
    const body = functionBody(
      "public.v3_public_result_analysis_context(",
      "context",
    );
    expect(body).toContain("from public.studio2_show_publication_controls control");
    expect(body).toContain("join private.v3_result_versions version_row");
    expect(body).toContain("version_row.version = control.source_result_version");
    expect(body).toContain("control.state = 'public'");
    expect(body).toContain("control.source_result_version is not null");
    expect(body).toContain("control.frozen_config ->> 'results'");
  });

  it("makes hidden, scheduled, draft and missing-evidence states generically unavailable", () => {
    const body = functionBody(
      "public.v3_public_result_analysis_context(",
      "context",
    );
    expect(body).toContain("if v_source_version is null then");
    expect(body).toContain("'available', false");
    expect(body).toContain("'reason', 'results_unavailable'");
    expect(body).toContain("'currentPublic', false");
    expect(body).not.toContain("'hidden'");
    expect(body).not.toContain("'scheduled'");
    expect(body).not.toContain("'draft'");
  });

  it("compares only a previously seen opaque identity and never probes private historical versions", () => {
    const body = functionBody(
      "public.v3_public_result_analysis_context(",
      "context",
    );
    expect(body).toContain("v_seen !~ '^rv1_[0-9a-f]{64}$'");
    expect(body).toContain("'seenResultVersionIsCurrent'");
    expect(body).toContain("else v_seen = v_identity");
    expect(body.match(/join private\.v3_result_versions/g)).toHaveLength(1);
    expect(body).not.toContain("version_row.version = p_seen");
  });

  it("returns no private Result rows or actor-dependent semantics", () => {
    const body = functionBody(
      "public.v3_public_result_analysis_context(",
      "context",
    );
    expect(body).toContain("'resultVersion', v_source_version");
    expect(body).toContain("'resultVersionId', v_identity");
    expect(body).toContain("'resultRowCount', v_result_row_count");
    expect(body).not.toContain("result_rows");
    expect(body).not.toContain("auth.uid()");
    expect(body).not.toContain("studio2_access_allowed");
    expect(body).not.toContain("current_user");
  });

  it("grants the same read RPC to anonymous, authenticated and service-role consumers", () => {
    expect(migration).toContain(
      "grant execute on function public.v3_public_result_analysis_context(uuid, uuid, text)\n  to anon, authenticated, service_role",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
