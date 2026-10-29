import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261029075134_v3_televote_calculation_dml_cutover.sql','utf8');
describe('Televote calculation raw privilege cutover', () => {
 it('removes table and individual column DML for every external role while preserving reads', () => {
  expect(sql).toContain("array['rounds','round_results','round_influence_results']");
  expect(sql).toContain("array['public','anon','authenticated','service_role']");
  expect(sql).toContain('revoke insert,update,delete,truncate');
  expect(sql).toContain('revoke insert(%I),update(%I)');
  expect(sql).toContain('is distinct from before_select');
  expect(sql).not.toContain('revoke select');
 });
 it('fails closed if the canonical command loses ownership or its helper becomes exposed', () => {
  expect(sql).toContain('select prosecdef');
  expect(sql).toContain('Internal conversion implementation exposed');
 });
});
