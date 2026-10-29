import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { V3_DOMAIN_CONSEQUENCE_REGISTRY, isResolvedV3DomainConsequence } from './v3-domain-consequence-registry';
const sql=readFileSync('supabase/migrations/20261029105007_v3_integrity_durable_consequences.sql','utf8');
describe('durable Integrity consequences',()=>{
 it('observes immutable canonical history without introducing adjudication authority',()=>{
  expect(sql).toContain('after insert on public.integrity_adjudication_history');
  expect(sql).toContain("'integrity.history.observe'");
  expect(sql).toContain("h.operation_id");
  for(const table of ['integrity_cases','integrity_case_appeals','integrity_case_sanctions']) expect(sql.toLowerCase()).not.toContain(`update public.${table}`);
 });
 it('commits a stable S4 fact and delivery identity with canonical history',()=>{
  expect(sql).toContain('private.v3_emit_domain_event(h.event_type');
  expect(sql).toContain("array['integrity.workflow']");
  expect(sql).toContain('on conflict(operation_id) do nothing');
  expect(sql).toContain('request_fingerprint is distinct from fingerprint');
 });
 it('derives tasks from current truth and completes an immutable receipt atomically',()=>{
  expect(sql).toContain('for share'); expect(sql).toContain('for update of o skip locked');
  expect(sql).toContain('private.v3_integrity_consequence_applications');
  expect(sql).toContain("status='pending'"); expect(sql).toContain('INTEGRITY_CONSEQUENCE_FAILED');
  expect(sql).toContain('sanctionStateHash');
 });
 it('provides bounded owner-only scheduled recovery and scoped human readback',()=>{
  expect(sql).toContain('p_limit not between 1 and 500');
  expect(sql).toContain("cron.schedule('v3-integrity-consequences'");
  expect(sql).toContain('private.v3_require_active_auth_session()');
  expect(sql).toContain("studio2_user_has_capability(auth.uid(),'integrity.manage',null)");
  expect(sql).toContain('from public,anon,authenticated,service_role');
 });
 for(const eventType of ['integrity.case_changed','integrity.appeal_changed']) it(`${eventType} has executable event-backed ownership`,()=>{
  const c=V3_DOMAIN_CONSEQUENCE_REGISTRY.find(c=>c.eventType===eventType)!;
  expect(c.implementationState).toBe('event-backed'); expect(isResolvedV3DomainConsequence(c)).toBe(true);
  expect(c.taskEffects.map(t=>t.taskType)).toEqual(['integrity.case.review','integrity.appeal.review']);
  expect(c.evidence).toContain('.github/tests/v3-integrity-durable-consequences.sql');
 });
});
