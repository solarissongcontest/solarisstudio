// Local fixture reconstruction, never a production migration or deployment tool.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyGraph } from './check-v3-s02-baseline.mjs';

const evidence = 'docs/v3/recovery-candidates/evidence/';
const read = p => readFileSync(p, 'utf8');
const frozen = JSON.parse(read(evidence + 's06-hosted-catalog-digests-2026-11-10.json'));
const fingerprints = JSON.parse(read(evidence + 's02-hosted-727-routine-fingerprints-2026-11-09.json'));
export const dependencies = [
  { name: 'private.studio2_user_has_capability', args: 'uuid,text,uuid',
    identity: 'private.studio2_user_has_capability(p_user_id uuid, p_capability text, p_edition_id uuid)',
    source: 'supabase/migrations/20260918205750_permission_engine_v2_authoritative_cutover.sql' },
  { name: 'private.studio2_capability_allowed_in_platform_mode', args: 'text,text,text',
    identity: 'private.studio2_capability_allowed_in_platform_mode(p_capability text, p_access_level text, p_mode text)',
    source: 'supabase/migrations/20261017143000_confirmation_maintenance_hotfix.sql' },
  { name: 'private.studio2_touch_permission_subject_version', args: '',
    identity: 'private.studio2_touch_permission_subject_version()',
    source: 'supabase/migrations/20261003012000_organisation_os_v5_permission_operations.sql', placeholder: true },
  { name: 'private.studio2_normalize_legacy_edition_status', args: 'text',
    identity: 'private.studio2_normalize_legacy_edition_status(p_status text)',
    source: 'supabase/migrations/20260910220000_studio2_persistence_schema.sql' },
];

export function extractDefinition(source, name) {
  const start = new RegExp('create or replace function\\s+' + name.replaceAll('.', '\\.') + '\\s*\\(', 'gi');
  const matches = [...source.matchAll(start)];
  assert.equal(matches.length, 1, 'Ambiguous or absent source function: ' + name);
  const tail = source.slice(matches[0].index);
  const tag = /^as\s+(\$[a-z0-9_]*\$)/im.exec(tail);
  assert.ok(tag, 'Source dollar quote absent: ' + name);
  const bodyStart = tag.index + tag[0].length;
  const end = tail.indexOf(tag[1] + ';', bodyStart);
  assert.ok(end >= bodyStart, 'Unclosed source body: ' + name);
  return tail.slice(0, end + tag[1].length + 1);
}

const literal = x => "'" + String(x).replaceAll("'", "''") + "'";
export function expectedContract(item) {
  const metadata = frozen.routines.find(f => f.signature === item.identity);
  const definition = fingerprints.functions.find(f => f.id === item.identity);
  assert.ok(metadata && definition, 'Missing independently frozen contract: ' + item.identity);
  assert.equal(metadata.owner_name, 'postgres');
  assert.ok(Object.values(definition.exec).every(v => v === false), 'Unexpected external helper EXECUTE');
  return { ...metadata, definition_sha256: definition.sha256 };
}

export function reconstructionSql() {
  const guards = [], bodies = [], checks = [];
  for (const item of dependencies) {
    const signature = item.name + '(' + item.args + ')';
    const expected = expectedContract(item);
    const oid = 'to_regprocedure(' + literal(signature) + ')';
    if (item.placeholder) {
      // Replace ONLY the exact fail-closed local catalog placeholder, not an
      // unknown existing routine. Keep the function OID/trigger attachments.
      guards.push(`if not exists (select 1 from pg_proc p where p.oid=${oid}
        and pg_get_userbyid(p.proowner)='postgres' and not p.prosecdef
        and p.provolatile='i' and p.proconfig is null and p.proacl is null
        and p.prorettype='trigger'::regtype
        and btrim(p.prosrc)=${literal("BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END")})
        then raise exception 'Unreviewed authorization placeholder: ${signature}'; end if;`);
    } else {
      guards.push(`if ${oid} is not null then raise exception 'Authorization dependency already exists: ${signature}'; end if;`);
    }
    bodies.push(extractDefinition(read(item.source), item.name),
      `revoke all on function ${signature} from public, anon, authenticated, service_role;`);
    checks.push(`if not exists (select 1 from pg_proc p where p.oid=${oid}
      and pg_get_userbyid(p.proowner)=${literal(expected.owner_name)}
      and md5(pg_get_functiondef(p.oid))=${literal(expected.definition_md5)}
      and encode(pg_catalog.sha256(pg_catalog.convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=${literal(expected.definition_sha256)}
      and md5(coalesce(p.proacl::text,''))=${literal(expected.acl_md5)}
      and md5(coalesce(p.proconfig::text,''))=${literal(expected.settings_md5)}
      and p.prosecdef=${expected.security_definer} and p.proisstrict=${expected.strict}
      and p.proleakproof=${expected.leakproof} and p.provolatile=${literal(expected.volatility)}
      and p.proparallel=${literal(expected.parallel)})
      then raise exception 'Hosted authorization contract mismatch: ${signature}'; end if;
      if has_function_privilege('anon',${oid},'EXECUTE')
         or has_function_privilege('authenticated',${oid},'EXECUTE')
         or has_function_privilege('service_role',${oid},'EXECUTE')
      then raise exception 'External authorization helper EXECUTE: ${signature}'; end if;`);
  }
  return `-- GENERATED LOCAL-ONLY fixture, NOT a migration; source bodies unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $preflight$ begin\n${guards.join('\n')}\nend $preflight$;
${bodies.join('\n\n')}
do $postconditions$ begin\n${checks.join('\n')}\nend $postconditions$;
commit;
`;
}

export function recoveryManifest(catalog, candidateSha) {
  assert.match(candidateSha, /^[a-f0-9]{40}$/);
  assert.equal(catalog.serverVersionNum, 170011, 'Observed baseline must be PG17.11');
  assert.equal(catalog.baselineProfile, 'hosted-observed-recovery-subset', 'Do not mix source/hosted baselines');
  assert.equal(catalog.networkIsolation?.networkMode, 'none', 'Networkless runtime evidence required');
  assert.deepEqual(catalog.networkIsolation?.publishedPorts, [], 'Published ports are forbidden');
  assert.match(catalog.databaseImage || '', /^sha256:[a-f0-9]{64}$/);
  const graph = dependencyGraph(catalog, undefined,
    ['public.studio2_access_allowed', 'private.studio2_task_recipient_eligible']);
  const relevant = graph.nodes.filter(n => n.reachable);
  // OIDs change on replay. Keep only semantic identities in the emitted graph;
  // databaseIdentity separately records the actual runtime observation.
  const stableIds = new Map(graph.nodes.map(n => [n.id, n.kind + ':' + n.identity]));
  const nodes = relevant.map(n => ({ ...n, id: stableIds.get(n.id) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = graph.edges.map(e => ({ ...e, source: stableIds.get(e.source), target: stableIds.get(e.target) }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const reconstructed = dependencies.map(item => {
    const node = relevant.find(n => n.identity === item.identity);
    assert.equal(node?.hostedClassification, 'verified-equivalent', 'Reconstructed dependency drift: ' + item.identity);
    return { identity: item.identity, schema: 'private', sourceFile: item.source,
      sourceSha256: createHash('sha256').update(read(item.source)).digest('hex'),
      evidence: [evidence + 's02-hosted-727-routine-fingerprints-2026-11-09.json',
        evidence + 's06-hosted-catalog-digests-2026-11-10.json'],
      hostedObserved: true, sourceDefined: true, locallyReconstructed: true,
      owner: node.owner, securityDefiner: node.securityDefiner, settings: node.settings,
      privileges: node.privileges, verification: 'Actual PG17.11 metadata equality; separate runtime assertions',
      releaseRelevance: 'Archive task recipient/access authorization and permission revision consequence' };
  });
  return { schemaVersion: 1, candidateSha, profile: catalog.baselineProfile,
    databaseImage: catalog.databaseImage, networkIsolation: catalog.networkIsolation,
    observedEvidenceDate: '2026-11-09 / 2026-11-10; not a fresh hosted inspection',
    roots: ['public.studio2_access_allowed(text,uuid,boolean)', 'private.studio2_task_recipient_eligible(uuid,uuid)'],
    reconstructed, ...graph, nodes, edges,
    inspectionPolicy: { separatelyAuthorizedOperatorOnly: true, maxRoutineIdentitiesPerBatch: 20,
      collect: ['exact signature', 'sanitized pg_get_functiondef', 'owner', 'language/security flags', 'ACL and role membership', 'search_path', 'attached trigger/policy definitions'],
      prohibit: ['application rows', 'credentials', 'CI hosted queries', 'invented stubs'],
      dynamicAndUnqualifiedCalls: 'Resolve from reviewed definitions and bounded runtime cases before certifying closure' },
    blockedRuntime: [{ identity: 'private.studio2_require_strict_dual(text,uuid,text)',
      evidence: 'docs/v3/recovery-candidates/s02-source-defined-beta-contract.md',
      inspectionSpecification: 'docs/v3/recovery-candidates/s13-s14-authorization-runtime-inspection.md',
      requiredRuntimeWitness: 'Real edition seed trigger raises undefined_function; failed statement leaves no edition/runtime row',
      hostedAttributesObserved: true, hostedExecutableDefinitionAvailable: false, locallyReconstructed: false,
      sourceParity: 'The approved observation differs from both immutable source variants; do not substitute or stub',
      blocks: ['edition-scoped positive/negative runtime acceptance', 'complete hosted-equivalent recovery certification'],
      requiredInspection: 'Separately authorized, one-signature pg_catalog SELECT of sanitized pg_get_functiondef, owner, ACL, settings, version and effective role grants. No function invocation or application rows.' }],
    remainingInspection: relevant.filter(n => n.hostedClassification !== 'verified-equivalent').map(n => ({
      identity: n.identity, schema: n.schema, kind: n.kind,
      status: n.hostedClassification === 'verified-different' ? 'LOCALLY_DIFFERENT / BLOCKING' : 'UNKNOWN / BLOCKING',
      reason: n.resolution || n.evidence,
      requiredEvidence: n.kind === 'unresolved-reference'
        ? 'Review originating source and dynamic SQL first: this lexical reference may be a type, comment or string, not a callable object. Resolve an exact signature before any bounded metadata request.'
        : 'Bounded schema-only identity/definition/owner/ACL/settings/attachment metadata; no application rows',
    })),
    limitations: ['Conservative pg_depend/qualified-reference graph; dynamic SQL and unqualified/overloaded calls require independent review',
      'Relation/policy/trigger fingerprints do not establish data-shape or role-membership runtime equivalence',
      'Synthetic runtime probes are not production rows or complete workflow certification'],
    runtimeCoverage: { assertionSource: 'scripts/v3-s13-s14-authorization-runtime-local.sql',
      intendedAssertions: ['global actor capability', 'grant/role expiry and revocation', 'task recipient/resolution', 'platform-mode restrictions'],
      executionResult: 'NOT_ATTESTED_BY_THIS_METADATA_MANIFEST',
      editionScopedAcceptance: 'BLOCKED', fullTaskReconciliation: 'NOT_VERIFIED',
      note: 'Require the separate exact-head PostgreSQL job/assertion output; metadata alone cannot attest runtime success' },
    fullHostedEquivalenceCertified: false, productionRecoveryEligible: false, deploymentAuthorized: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 4 && process.argv[2] === '--sql') {
      writeFileSync(process.argv[3], reconstructionSql(), { flag: 'wx' });
      console.log(`Generated ${dependencies.length} local authorization dependencies; PG postconditions must verify hosted fingerprints.`);
    } else if (process.argv.length === 6 && process.argv[2] === '--manifest') {
      assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), process.argv[5], 'Candidate differs from checkout');
      assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '', 'Tracked source changed during proof');
      execFileSync('git', ['ls-files', '--error-unmatch', 'scripts/v3-s13-s14-authorization-dependencies.mjs', 'scripts/v3-s13-s14-authorization-runtime-local.sql']);
      const report = recoveryManifest(JSON.parse(read(process.argv[3])), process.argv[5]);
      writeFileSync(process.argv[4], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      console.log(`Verified ${dependencies.length} reconstructed authorization contracts; ${report.hostedUnknowns.length} unknown and ${report.hostedDifferences.length} differing reachable identities remain; NOT hosted-equivalent.`);
    } else throw Error('Usage: --sql output.sql OR --manifest local-catalog.json output.json exact-sha');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
