import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {proveInternalMechanisms} from './v3-s16-internal-mechanisms';
import type {V3S16CatalogEvidence} from './v3-s16-mutation-authority';
const observed=JSON.parse(readFileSync('.github/fixtures/v3-confirmation-restore-mechanisms.json','utf8')) as V3S16CatalogEvidence;
const proof=(c:V3S16CatalogEvidence)=>proveInternalMechanisms(c).classifications.filter(x=>x.signature.includes('admin_restore_confirmation_version_apply'));
describe('Confirmation restore implementation is internal to the governed command',()=>{
 it('closes both Confirmation and embedded Entry mutation paths with runtime evidence',()=>{expect(proof(observed).map(x=>x.domain).sort()).toEqual(['confirmation','entry']);});
 it('rejects external invocation of the old implementation',()=>{const c=structuredClone(observed);const f=c.functions.find(f=>f.name==='public.admin_restore_confirmation_version_apply')!;f.executeRoles=[...f.executeRoles,'service_role'];expect(proof(c)).toHaveLength(0);});
 it('rejects forged history through restored raw write privileges',()=>{const c=structuredClone(observed);const t=c.tables.find(t=>t.table==='public.submission_versions')!;t.dmlRoles=[...t.dmlRoles,'service_role'];expect(proof(c)).toHaveLength(0);});
 it('rejects a second caller of the private restore core',()=>{const c=structuredClone(observed);const f=c.functions.find(f=>f.name==='private.v3_restore_confirmation_version_core')!;f.callers=[...f.callers!,'unknown-peer'];expect(proof(c)).toHaveLength(0);});
});
