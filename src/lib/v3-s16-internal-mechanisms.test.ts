import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proveInternalMechanisms } from './v3-s16-internal-mechanisms';
import { V3_INTERNAL_MECHANISM_CONTRACTS as contracts } from './v3-s16-internal-mechanism-contracts';
import type { V3S16CatalogEvidence } from './v3-s16-mutation-authority';
const fixture=JSON.parse(readFileSync('.github/fixtures/v3-televote-mechanisms-catalog.json','utf8'));
const clone=(): any=>structuredClone(fixture);
const projection=contracts.find(c=>c.signature.startsWith('private.v3_apply_published_televote_projection('))!;
describe('runtime evidence for internal mechanisms',()=>{
 it('classifies observed Televote mechanisms by body, ACL, input closure, caller chain and trigger type',()=>{
  const proof=proveInternalMechanisms(fixture as V3S16CatalogEvidence);
  expect(proof.classifications).toHaveLength(26);
  expect(proof.triggers.size).toBe(32);
  for(const c of contracts) expect(existsSync(c.proof)).toBe(true);
 });
 for(const [label,change] of Object.entries({
  'body drift':(f:any)=>{f.definitionHash='0'.repeat(32);},
  'owner drift':(f:any)=>{f.owner='authenticated';},
  'definer drift':(f:any)=>{f.securityDefiner=false;},
  'PUBLIC execute':(f:any)=>{f.executeRoles.push('PUBLIC');},
  'service execute':(f:any)=>{f.executeRoles.push('service_role');},
  'unknown inherited role execute':(f:any)=>{f.executeRoles.push('peer_rpc_role');},
  'unsafe path':(f:any)=>{f.searchPath='public, $user';},
  'missing call graph':(f:any)=>{delete f.callers;},
 })) it(`fails closed for ${label}`,()=>{
  const c=clone();change(c.functions.find((f:any)=>f.signature===projection.signature));
  expect(proveInternalMechanisms(c).classifications.some(x=>x.signature===projection.signature)).toBe(false);
 });
 it('rejects new peer callers even when the helper remains private',()=>{
  const c=clone();c.functions.find((f:any)=>f.signature===projection.signature).callers.push('forged');
  expect(proveInternalMechanisms(c).classifications.some(x=>x.signature===projection.signature)).toBe(false);
 });
 it('rejects an ancestor becoming externally executable',()=>{
  const c=clone();const f=c.functions.find((f:any)=>f.name==='private.v3_sync_published_televote_round');f.executeRoles.push('authenticated');
  expect(proveInternalMechanisms(c).classifications.some(x=>x.signature===projection.signature)).toBe(false);
 });
 for(const kind of ['table','column','missing-column-proof']) it(`rejects ${kind} input privilege drift`,()=>{
  const c=clone();const t=c.tables.find((t:any)=>t.table==='televoting.rounds');
  if(kind==='table') t.dmlRoles.push('service_role');
  if(kind==='column') t.columnDmlGrants.push({role:'authenticated',column:'name',privilege:'UPDATE'});
  if(kind==='missing-column-proof') delete t.columnDmlGrants;
  expect(proveInternalMechanisms(c).classifications.some(x=>x.signature===projection.signature)).toBe(false);
 });
 it('does not classify a same-named trigger bound to a different function or timing',()=>{
  const c=clone();const t=c.tables.find((t:any)=>t.table==='televoting.rounds');
  const a=t.triggerDefinitions.find((t:any)=>t.name==='televoting_rounds_updated_at');a.functionOid='forged';
  expect(proveInternalMechanisms(c).triggers.has('televote:televoting.rounds:televoting_rounds_updated_at')).toBe(false);
 });
});
