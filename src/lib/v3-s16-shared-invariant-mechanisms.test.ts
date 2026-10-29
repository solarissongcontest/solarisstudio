import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proveInternalMechanisms } from './v3-s16-internal-mechanisms';
import type { V3S16CatalogEvidence } from './v3-s16-mutation-authority';

const observed: V3S16CatalogEvidence=JSON.parse(readFileSync('.github/fixtures/v3-shared-invariant-mechanisms-catalog.json','utf8'));
const sharedProof='.github/tests/v3-shared-invariant-mechanisms.sql';
const entryKey='entry:public.entries:studio2_platform_direct_write_guard';
const televoteKey='televote:public.televote_votes:studio2_platform_direct_write_guard';

describe('shared invariant mechanism boundaries',()=>{
 it('classifies the observed guard and bounded housekeeping implementations',()=>{
  const proof=proveInternalMechanisms(observed);
  expect(proof.classifications.filter(c=>c.proof===sharedProof)).toHaveLength(23);
  expect(proof.triggers.has(entryKey)).toBe(true);
  expect(proof.triggers.has(televoteKey)).toBe(true);
 });
 for(const drift of ['table','column','attachment'] as const) it(`does not reuse another domain's valid proof after ${drift} drift`,()=>{
  const catalog=structuredClone(observed);
  const table=catalog.tables.find(t=>t.table==='public.entries')!;
  if(drift==='table') table.dmlRoles=[...table.dmlRoles,'service_role'];
  if(drift==='column') table.columnDmlGrants=[...table.columnDmlGrants!,{role:'authenticated',privilege:'UPDATE',column:'artist'}];
  if(drift==='attachment') table.triggerDefinitions!.find(t=>t.name==='studio2_platform_direct_write_guard')!.functionOid='forged';
  const proof=proveInternalMechanisms(catalog);
  expect(proof.triggers.has(entryKey)).toBe(false);
  expect(proof.triggers.has(televoteKey)).toBe(true);
 });
 it('fails closed if server review revisions regain an external writer',()=>{
  const catalog=structuredClone(observed);
  const versions=catalog.tables.find(t=>t.table==='public.studio2_confirmation_review_versions')!;
  versions.dmlRoles=[...versions.dmlRoles,'service_role'];
  expect(proveInternalMechanisms(catalog).classifications.some(c=>c.signature==='private.studio2_touch_confirmation_review_version()')).toBe(false);
 });
});
