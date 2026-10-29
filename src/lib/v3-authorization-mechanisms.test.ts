import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {proveInternalMechanisms} from './v3-s16-internal-mechanisms';
import type {V3S16CatalogEvidence} from './v3-s16-mutation-authority';
const observed=JSON.parse(readFileSync('.github/fixtures/v3-authorization-mechanisms-catalog.json','utf8')) as V3S16CatalogEvidence;
const classified=(c:V3S16CatalogEvidence)=>proveInternalMechanisms(c).classifications.filter(x=>x.domain==='authorization');
describe('Authorization internal-mechanism runtime proof',()=>{
 it('proves private primitives and attached consequences using observed implementation, topology and closed inputs',()=>{expect(classified(observed)).toHaveLength(5);});
 it('rejects an externally executable permission core',()=>{const c=structuredClone(observed);const f=c.functions.find(f=>f.name==='public.studio2_apply_permission_change')!; f.executeRoles=[...f.executeRoles,'service_role'];expect(classified(c).some(x=>x.signature.startsWith('public.studio2_apply_permission_change('))).toBe(false);});
 it('rejects version changes detached from their canonical role/grant source',()=>{const c=structuredClone(observed);c.tables.find(t=>t.table==='public.studio2_role_assignments')!.triggerDefinitions![0].functionOid='different';expect(classified(c).some(x=>x.signature.includes('touch_permission_subject_version'))).toBe(false);});
 it('rejects forged role projections through raw country-account writes',()=>{const c=structuredClone(observed);const t=c.tables.find(t=>t.table==='public.country_accounts')!;t.dmlRoles=[...t.dmlRoles,'service_role'];expect(classified(c).some(x=>x.signature.includes('country_account_hod_role'))).toBe(false);});
 it('rejects restored column DML on immutable operation evidence',()=>{const c=structuredClone(observed);const t=c.tables.find(t=>t.table==='public.studio2_operation_receipts')!;t.columnDmlGrants=[...t.columnDmlGrants!,{role:'service_role',column:'status',privilege:'UPDATE'}];expect(classified(c).some(x=>x.signature.startsWith('public.studio2_apply_permission_change('))).toBe(false);});
 it('rejects an unknown peer invoking the private permission core',()=>{const c=structuredClone(observed);const f=c.functions.find(f=>f.name==='public.studio2_apply_permission_change')!; f.callers=[...f.callers!,'unknown'];expect(classified(c).some(x=>x.signature.startsWith('public.studio2_apply_permission_change('))).toBe(false);});
 it('rejects ancestor capability/authorization implementation drift',()=>{const c=structuredClone(observed);c.functions.find(f=>f.signature!.includes('p_approval_request_id'))!.definitionHash='0'.repeat(32);expect(classified(c).some(x=>x.signature.startsWith('public.studio2_apply_permission_change('))).toBe(false);});
});
