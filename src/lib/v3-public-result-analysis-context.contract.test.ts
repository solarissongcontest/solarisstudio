import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = source(
  'supabase/migrations/20261020063500_v3_public_result_analysis_context.sql',
);
const resultInvariants = source(
  'supabase/migrations/20261015155722_v3_s3_results_invariants.sql',
);
const publicationInvariants = source(
  'supabase/migrations/20261015164100_v3_s3_publication_invariants.sql',
);

describe('V3 publication-safe Result Analysis Context', () => {
  it('is an additive S13 forward-fix read contract', () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.public-result-analysis-context'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      'create or replace function public.v3_public_result_analysis_context(',
    );
    expect(migration).toContain('language plpgsql');
    expect(migration).toContain('stable');
    expect(migration).toContain('security definer');
  });

  it('derives identity only from canonical publication plus immutable Result Version evidence', () => {
    expect(migration).toContain('public.studio2_show_publication_controls');
    expect(migration).toContain('private.v3_result_versions');
    expect(migration).toContain('v_control.source_result_version');
    expect(migration).toContain('private.v3_publication_result_version_release_ready(');
    expect(migration).toContain("v_control.state <> 'public'");
    expect(migration).toContain("->> 'results'");

    expect(resultInvariants).toContain(
      'primary key (show_id, version)',
    );
    expect(resultInvariants).toContain(
      'raise exception \'Result version evidence is immutable\'',
    );
    expect(publicationInvariants).toContain(
      'studio2_show_publication_source_snapshot_v3_fk',
    );
  });

  it('does not derive version authority from mutable browser-visible timestamps or result rows', () => {
    const bodyStart = migration.indexOf(
      'create or replace function public.v3_public_result_analysis_context(',
    );
    const body = migration.slice(bodyStart);

    expect(body).not.toContain('from public.results');
    expect(body).not.toContain('results.updated_at');
    expect(body).not.toContain('show.updated_at::text');
    expect(body).not.toContain('md5(');
    expect(body).not.toContain('digest(');
  });

  it('fails closed with one generic unavailable shape for non-public or unversioned states', () => {
    expect(migration).toContain("'available', false");
    expect(migration).toContain("'editionId', null");
    expect(migration).toContain("'resultVersionId', null");
    expect(migration).toContain("'resultVersion', null");
    expect(migration).toContain("'publicationVersion', null");
    expect(migration).toContain("'isCurrentPublicVersion', false");
    expect(migration).toContain('v_control.source_result_version is null');
    expect(migration).toContain('not coalesce(v_edition.published, false)');
    expect(migration).toContain('not coalesce(v_show.published, false)');

    // Scheduled, hidden and draft all fail the same exact state predicate; the
    // function does not disclose the private current publication state.
    expect(migration.match(/v_control\.state <> 'public'/g)).toHaveLength(1);
    expect(migration).not.toContain("'publicationState', v_control.state");
  });

  it('returns a stable namespaced immutable version identity plus correction comparison', () => {
    expect(migration).toContain("'result-version:%s:%s'");
    expect(migration).toContain("'resultVersionId', v_version_id");
    expect(migration).toContain("'resultVersion', v_control.source_result_version");
    expect(migration).toContain("'publicationVersion', v_control.version");
    expect(migration).toContain("'isCurrentPublicVersion', true");
    expect(migration).toContain('p_result_version_id = v_version_id');
  });

  it('uses server time and gives anon/authenticated/service callers identical public semantics', () => {
    expect(migration).toContain('v_server_time timestamptz := now()');
    expect(migration).toContain("'serverTime', v_server_time");
    expect(migration).not.toContain('auth.uid()');
    expect(migration).not.toContain('studio2_access_allowed(');
    expect(migration).toContain(
      'grant execute on function public.v3_public_result_analysis_context(uuid, text)\n  to anon, authenticated, service_role;',
    );
  });

  it('never exposes immutable private result snapshot rows', () => {
    expect(migration).not.toContain("'resultRows'");
    expect(migration).not.toContain("'resultRowCount'");
    expect(migration).not.toContain('v_version.result_rows');
    expect(migration).not.toContain('v_version.created_by');
  });
});
