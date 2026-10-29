import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261029073213_v3_round_conversion_authority.sql', 'utf8');
const server = readFileSync('src/integrations/televoting/conversion.server.ts', 'utf8');
describe('governed round conversion', () => {
 it('extends the existing round command for all three mutation paths', () => {
  for (const action of ['conversion_config','conversion_calculation','conversion_status']) {
   expect(sql).toContain(action); expect(server).toContain(`"${action}"`);
  }
  expect(server).toContain('.rpc("v3_configure_round"');
  for(const verb of ['.insert(', '.delete(', '.update(', '.upsert(']) expect(server).not.toContain(verb);
 });
 it('authorizes live actor before replay, replays before CAS and protects final state', () => {
  const command = sql.split('as $command$')[1];
  expect(command.indexOf('v3_require_active_auth_session')).toBeLessThan(command.indexOf('studio2_claim_operation'));
  expect(command.indexOf('studio2_user_has_capability')).toBeLessThan(command.indexOf('studio2_claim_operation'));
  expect(command.indexOf("claim->>'replayed'")).toBeLessThan(command.indexOf('v is distinct from p_expected_round_version'));
  expect(command).toContain("r.results_status='published'");
  expect(command).toContain("p_action='conversion_status' and p_payload->>'status'='published'");
  expect(command).toContain('is_archived');
 });
 it('binds the calculation to current inputs and owns all persistence', () => {
  expect(sql).toContain("p_payload->>'inputHash' is distinct from private.v3_conversion_input_hash(r.id)");
  expect(sql).toContain('calc:=r.calculation_version+1');
  expect(sql).toContain("'calculation_version',calc");
  expect(sql).toContain('Calculation coverage/total/engine mismatch');
  expect(sql).toContain('studio2_complete_operation');
  expect(sql.split('as $command$')[1].split('end $command$')[0]).not.toContain('exception when');
 });
 it('recovery re-enters the command with the original fingerprint and live authority', () => {
  expect(sql).toContain("receipt.scope->'payload'");
  expect(sql).toContain('p_expected_round_version,p_operation_id,receipt.idempotency_key');
  expect(server.indexOf('v3_recover_conversion_calculation')).toBeLessThan(server.indexOf('const calculation = round.televote_engine_version'));
 });
});
