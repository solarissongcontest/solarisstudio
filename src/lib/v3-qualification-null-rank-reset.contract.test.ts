import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = 'supabase/migrations';

const migrationName = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_v3_qualification_null_rank_reset.sql'))
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error('v3 qualification null-rank reset migration not found');
}

const migration = readFileSync(
  join(migrationsDir, migrationName),
  'utf8',
);

describe('V3 qualification null-rank reset', () => {
  it('registers a forward-only migration contract', () => {
    expect(migration).toContain(
      "'v3.results.qualification-null-rank-reset'",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it('derives outcomes from semifinal participant identities', () => {
    expect(migration).toContain('from public.participants participant');
    expect(migration).toContain("show_row.kind = 'semi-final'");
    expect(migration).toContain('left join public.results result_row');
  });

  it('treats missing or null final rank as not qualified', () => {
    expect(migration).toContain('coalesce(');
    expect(migration).toContain('bool_or(');
    expect(migration).toContain(
      'final_rank between 1 and cutoff',
    );

    expect(migration).not.toContain(
      'and result_row.final_rank is not null',
    );
  });

  it('updates every participant projection for the semifinal identity', () => {
    expect(migration).toContain(
      'update public.participants participant',
    );
    expect(migration).toContain(
      'participant.qualified is distinct from outcome.qualified',
    );
  });

  it('does not manufacture direct-finalist outcomes', () => {
    expect(migration).toContain(
      'join public.shows show_row',
    );
    expect(migration).toContain(
      "show_row.kind = 'semi-final'",
    );
  });

  it('preserves the hardened execution boundary', () => {
    expect(migration).toMatch(
      /revoke all on function public\.refresh_edition_qualifications\(uuid\)[\s\S]*from public, anon, authenticated;/,
    );

    expect(migration).toMatch(
      /grant execute on function public\.refresh_edition_qualifications\(uuid\)[\s\S]*to service_role;/,
    );
  });
});
