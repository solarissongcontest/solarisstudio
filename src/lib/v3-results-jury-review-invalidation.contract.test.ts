import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function migrationSource() {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const filename = readdirSync(dir)
    .filter((name) =>
      name.endsWith('_v3_results_jury_review_invalidation.sql'),
    )
    .sort()
    .at(-1);

  if (!filename) {
    throw new Error('Results Jury review invalidation migration not found');
  }

  return readFileSync(resolve(dir, filename), 'utf8');
}

const migration = migrationSource();

describe('V3 Results Jury review invalidation', () => {
  it('registers the forward-only migration contract', () => {
    expect(migration).toContain("'v3.results.jury-review-invalidation'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it('keeps explicit Results calculation as the only calculation-version authority', () => {
    expect(migration).not.toMatch(
      /calculation_version\s*=\s*(?:public\.studio2_result_operations\.)?calculation_version\s*\+\s*1/i,
    );

    expect(migration).toContain('perform public.sync_show_results_from_votes(v_show_id)');
    expect(migration).toContain('private.v3_result_input_revisions');
    expect(migration).toContain('v3_guard_stale_result_input_approval');
    expect(migration).toContain('v3_mark_result_input_calculated');
  });

  it('invalidates stale result approval after Jury input changes', () => {
    expect(migration).toContain('reviewed_version = null');
    expect(migration).toContain('locked_version = null');
    expect(migration).toContain('reveal_ready_version = null');
  });

  it('serializes Jury input invalidation with Results operations', () => {
    expect(migration).toContain('pg_advisory_xact_lock(');
    expect(migration).toContain(
      "'studio2-results:' || v_show_id::text",
    );
  });

  it('keeps published outcome truth protected', () => {
    expect(migration).toContain(
      'private.studio2_publication_has_outcomes(show_row.publication_config)',
    );
    expect(migration).toContain(
      'Make the published result layer private before changing a jury ballot lifecycle.',
    );
  });

  it('replaces the existing Jury review trigger function rather than creating a second writer', () => {
    expect(migration).toContain(
      'create or replace function private.studio2_sync_results_after_jury_ballot_review()',
    );

    expect(migration).not.toContain(
      'create trigger studio2_jury_ballot_review_results_sync',
    );
  });
});
