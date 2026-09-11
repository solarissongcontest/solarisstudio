import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'scripts/confirmations-entry-uniqueness-internal-upsert.sql'),
  'utf8',
);
const rls = readFileSync(
  resolve(process.cwd(), 'scripts/confirmations-submission-version-rls-performance.sql'),
  'utf8',
);

describe('Confirmations internal entry uniqueness trigger', () => {
  it('excludes the same submission during internal-entry upserts', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'internal_entries'");
    expect(sql).toContain('i.submission_id = current_submission_id');
    expect(sql).not.toContain("TG_TABLE_NAME = 'internal_entries' and i.id = NEW.id");
  });

  it('keeps cross-table and cross-submission duplicate protection', () => {
    expect(sql).toContain('from public.national_final_entries e');
    expect(sql).toContain('s.id <> current_submission_id');
    expect(sql).toContain("raise exception 'duplicate_song'");
    expect(sql).toContain("raise exception 'duplicate_artist'");
  });

  it('uses an initplan-safe auth uid lookup in the version-history RLS policy', () => {
    expect(rls).toContain('public.has_role((select auth.uid())');
    expect(rls).not.toContain('public.has_role(auth.uid()');
  });
});
