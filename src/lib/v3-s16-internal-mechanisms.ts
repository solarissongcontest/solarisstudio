import type { V3S16CatalogEvidence, V3S16CatalogFunctionEvidence } from './v3-s16-mutation-authority';
import { V3_INTERNAL_MECHANISM_CONTRACTS, V3_INTERNAL_CALLER_CONTRACTS } from './v3-s16-internal-mechanism-contracts';

export type InternalMechanismContract = {
  domain: string;
  signature: string;
  definitionHash: string;
  category: 'guard' | 'housekeeping' | 'projection' | 'primitive';
  reason: string;
  securityDefiner: boolean;
  inputTables: readonly string[];
  attachments: readonly { table: string; type: number }[];
  callerSignatures: readonly string[];
  proof: string;
};
export type InternalCallerContract = {
  signature: string;
  definitionHash: string;
  executeRoles: readonly string[];
  securityDefiner: boolean;
  root: boolean;
  callerSignatures: readonly string[];
};
const contracts: readonly InternalMechanismContract[] = V3_INTERNAL_MECHANISM_CONTRACTS;
const callers: readonly InternalCallerContract[] = V3_INTERNAL_CALLER_CONTRACTS;
export const V3_S16_MECHANISM_TABLES = [...new Set(contracts.flatMap(c => c.inputTables))];

function safePath(path: string | null) {
  if (!path) return false;
  const parts=path.toLowerCase().split(',').map(s=>s.trim().replaceAll('"',''));
  // An empty path resolves only pg_catalog; those reviewed callers fully qualify
  // relations. Otherwise pg_catalog must be first and pg_temp explicitly last.
  return path === '""' || (parts[0] === 'pg_catalog' && !parts.includes('$user') && parts.at(-1)==='pg_temp');
}
function roleSet(roles: readonly string[]) { return [...roles].map(r=>r.toLowerCase()).sort().join(','); }
function pinned(fn: V3S16CatalogFunctionEvidence, contract: { definitionHash: string; securityDefiner: boolean }) {
  return fn.owner==='postgres' && fn.definitionHash===contract.definitionHash && fn.securityDefiner===contract.securityDefiner && safePath(fn.searchPath);
}

/** A mechanism is evidence, not a name exception. Any code, ACL, attachment,
 * caller or raw-input privilege drift reintroduces the original S16 finding. */
export function proveInternalMechanisms(catalog: V3S16CatalogEvidence) {
  const triggers=new Set<string>(); const writers=new Set<string>();
  const classifications: { domain: string; signature: string; category: string; reason: string; proof: string }[]=[];
  const functions=new Map(catalog.functions.map(f=>[f.signature,f]));
  const byOid=new Map(catalog.functions.map(f=>[f.oid,f]));
  const tables=new Map(catalog.tables.map(t=>[t.table,t]));
  const verified=new Map<string,boolean>();
  function node(signature: string, visiting = new Set<string>()): boolean {
    if (verified.has(signature)) return verified.get(signature)!;
    if (visiting.has(signature)) return false;
    const fn=functions.get(signature);
    const mechanism=contracts.find(c=>c.signature===signature);
    const caller=callers.find(c=>c.signature===signature);
    const expected=mechanism??caller;
    if (!fn?.oid || !expected || !pinned(fn,expected) || !fn.callers) return false;
    if (mechanism) {
      if (roleSet(fn.executeRoles)!=='postgres') return false;
      if (mechanism.inputTables.some(name=>{
        const t=tables.get(name);
        return !t || t.owner!=='postgres' || !t.columnDmlGrants || t.dmlRoles.some(r=>r.toLowerCase()!=='postgres') || (t.columnDmlRoles??[]).some(r=>r.toLowerCase()!=='postgres') || t.columnDmlGrants.some(g=>g.role.toLowerCase()!=='postgres') || (t.updatableViews??[]).length>0;
      })) return false;
      if (mechanism.attachments.length && (fn.returnType!=='trigger' || mechanism.attachments.some(a=>
        !tables.get(a.table)?.triggerDefinitions?.some(t=>t.functionOid===fn.oid && t.functionSignature===fn.signature && t.type===a.type && t.enabled==='O')
      ))) return false;
    } else if (!caller || roleSet(fn.executeRoles)!==roleSet(caller.executeRoles)) return false;
    // Reviewed public entrypoints still perform active-session and capability
    // checks themselves. Calling them indirectly cannot bypass that authority.
    if (!mechanism && caller!.root && fn.executeRoles.some(r=>r.toLowerCase()==='authenticated')) {
      if (fn.executeRoles.some(r=>['public','anon','service_role'].includes(r.toLowerCase()))) return false;
      verified.set(signature,true); return true;
    }
    const actual=fn.callers.map(oid=>byOid.get(oid));
    if (actual.some(f=>!f?.signature) || roleSet(actual.map(f=>f!.signature!))!==roleSet(expected.callerSignatures)) return false;
    const next=new Set(visiting).add(signature);
    const result=actual.every(f=>node(f!.signature!,next));
    verified.set(signature,result); return result;
  }
  for (const c of contracts) {
    if (!node(c.signature)) continue;
    const fn=functions.get(c.signature)!;
    // A shared trigger function can serve multiple domains. The recursive
    // function proof is cached, but every domain's input/attachment boundary
    // must pass independently; one protected attachment cannot sanction a
    // different table with a restored raw grant or a changed trigger binding.
    if (!pinned(fn,c) || c.inputTables.some(name=>{
      const t=tables.get(name);
      return !t || t.owner!=='postgres' || !t.columnDmlGrants || t.dmlRoles.some(r=>r.toLowerCase()!=='postgres') || (t.columnDmlRoles??[]).some(r=>r.toLowerCase()!=='postgres') || t.columnDmlGrants.some(g=>g.role.toLowerCase()!=='postgres') || (t.updatableViews??[]).length>0;
    }) || c.attachments.some(a=>!tables.get(a.table)?.triggerDefinitions?.some(t=>t.functionOid===fn.oid && t.functionSignature===fn.signature && t.type===a.type && t.enabled==='O'))) continue;
    for (const a of c.attachments) {
      const table=tables.get(a.table)!;
      for (const t of table.triggerDefinitions??[]) {
        if (t.functionOid===fn.oid && t.functionSignature===fn.signature && t.type===a.type && t.enabled==='O' && table.writeTriggers?.includes(t.name)) triggers.add(`${c.domain}:${a.table}:${t.name}`);
      }
    }
    writers.add(`${c.domain}:${fn.oid}`);
    classifications.push({domain:c.domain,signature:c.signature,category:c.category,reason:c.reason,proof:c.proof});
  }
  return {triggers,writers,classifications};
}
