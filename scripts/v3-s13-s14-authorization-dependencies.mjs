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
  { name: 'private.studio2_require_strict_dual', args: 'text,uuid,text',
    identity: 'private.studio2_require_strict_dual(p_capability text, p_edition_id uuid, p_action text)',
    source: 'supabase/migrations/20260914174742_permission_engine_v2_core_rls_cutover.sql',
    sourceFormat: 'hosted-observed-core-cutover-20261113' },
  { name: 'private.studio2_permission_engine_authoritative', args: '',
    identity: 'private.studio2_permission_engine_authoritative()',
    source: 'supabase/migrations/20260914174742_permission_engine_v2_core_rls_cutover.sql' },
  { name: 'private.studio2_guard_feature_flag_strict_dual', args: '',
    identity: 'private.studio2_guard_feature_flag_strict_dual()',
    source: 'supabase/migrations/20260914140500_permission_engine_v2_strict_dual_guards.sql',
    placeholder: true },
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


// The separately authorized 2026-11-13 one-signature catalog inspection proved
// the hosted PL/pgSQL body differs from the later immutable source ONLY by
// formatting. Derive the exact bytes from source. No hosted raw body is stored,
// copied into the repository or acquired by CI.
export function sourceDerivedStrictDualDefinition(item) {
  assert.equal(item.sourceFormat, 'hosted-observed-core-cutover-20261113');
  const definition = extractDefinition(read(item.source), item.name);
  const quoted = /\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1;/i.exec(definition);
  assert.ok(quoted, 'Strict-dual source body missing');
  const sourceBody = quoted[2];
  assert.equal(createHash('md5').update(sourceBody).digest('hex'),
    '96000d67d401cd29345528a5adb4d5a9', 'Strict-dual immutable source changed');

  const normalized = sourceBody
    .replace(/\n[ \t]*\n/g, '\n')
    .replace(/(if private\.studio2_request_is_service_role\(\) then)\s+return;\s+end if;/g,
      '$1 return; end if;')
    .replace(/private\.studio2_user_has_capability\(\s*v_actor,\s*p_capability,\s*p_edition_id\s*\)/g,
      'private.studio2_user_has_capability(v_actor, p_capability, p_edition_id)')
    .replace(/public\.studio2_check_capability_shadow\(\s*p_capability,\s*p_edition_id,\s*p_action,\s*null\s*\)/g,
      'public.studio2_check_capability_shadow(p_capability, p_edition_id, p_action, null)')
    .replace(/(raise exception 'Strict dual authorization requires Organizer role and capability: %',)\s*p_capability\s*using errcode/g,
      '$1 p_capability using errcode');
  assert.equal(createHash('md5').update(normalized).digest('hex'),
    '294d562ce20e3de09ea864b3359b97d6',
    'Strict-dual source-derived body differs from authorized hosted prosrc');
  assert.ok(!/--/.test(normalized), 'Strict-dual hosted body must not inherit source comments');
  return definition.replace(sourceBody, normalized);
}


// auth.role() is a standard Supabase platform helper absent from the bounded
// catalog-only PG17.11 fixture. The existing hosted-observed auth.uid() fixture
// shares its exact documented claim resolution shape. Derive the provider
// counterpart from that immutable source, never a permissive JWT mock.
export function sourceDerivedAuthRoleDefinition() {
  const uid = extractDefinition(
    read('docs/v3/recovery-candidates/evidence/s02-hosted-s14-archive-54-table-schema-fixture.sql'),
    'auth.uid');
  const pgDefinition = source => source.replace(/;$/, '') + '\n';
  assert.equal(createHash('sha256').update(pgDefinition(uid)).digest('hex'),
    '7c1ff2ecbe653c9358b3115a2607db9573f88a2944ae4eca9e296a89cc5186a7',
    'Frozen auth.uid source shape changed');
  const role = uid.replace('auth.uid()', 'auth.role()')
    .replace('RETURNS uuid', 'RETURNS text')
    .replace('claim.sub', 'claim.role')
    .replace("'sub'", "'role'")
    .replace('::uuid\n', '::text\n');
  assert.notEqual(role, uid);
  assert.equal(createHash('sha256').update(pgDefinition(role)).digest('hex'),
    'c96a9358b02089b03f3962fd85c5f83c9d64f32240481915c0efe74398dc761b',
    'Source-derived auth.role differs from frozen hosted SQL');
  return role;
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
  // The hosted function calls auth.role() during variable initialization,
  // including privileged no-JWT edition seeds. Recreate the verified Supabase
  // platform helper with its exact owner/ACL/definition and fail closed.
  const authOid = "to_regprocedure('auth.role()')";
  const authFrozen = frozen.routines.find(f => f.signature === 'auth.role()');
  const authFingerprint = fingerprints.functions.find(f => f.id === 'auth.role()');
  assert.ok(authFrozen && authFingerprint);
  assert.equal(authFrozen.owner_name, 'supabase_auth_admin');
  assert.deepEqual(authFingerprint.exec, { anon: true, service_role: true, authenticated: true });
  guards.push("if " + authOid + " is not null then raise exception 'Authorization dependency already exists: auth.role()'; end if;");
  bodies.push(sourceDerivedAuthRoleDefinition(), [
    "do $local_dashboard_role$ begin if not exists (select 1 from pg_roles where rolname='dashboard_user') then create role dashboard_user nologin; end if; end $local_dashboard_role$;",
    "alter function auth.role() owner to supabase_auth_admin;",
    "set role supabase_auth_admin;",
    "grant execute on function auth.role() to dashboard_user;",
    "reset role;"
  ].join('\n'));
  checks.push("if not exists (select 1 from pg_proc p where p.oid=" + authOid
    + " and pg_get_userbyid(p.proowner)='supabase_auth_admin'"
    + " and md5(pg_get_functiondef(p.oid))='8a3e05459e07e0633d43c6fba2a2cdf4'"
    + " and encode(pg_catalog.sha256(pg_catalog.convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='c96a9358b02089b03f3962fd85c5f83c9d64f32240481915c0efe74398dc761b'"
    + " and md5(coalesce(p.proacl::text,''))='879a0ead5da3e8d4e349768dff681d4d'"
    + " and md5(coalesce(p.proconfig::text,''))='d41d8cd98f00b204e9800998ecf8427e'"
    + " and not p.prosecdef and not p.proisstrict and not p.proleakproof"
    + " and p.provolatile='s' and p.proparallel='u' and p.prorettype='text'::regtype)"
    + " then raise exception 'Hosted auth role helper contract mismatch'; end if;"
    + " if not has_function_privilege('anon'," + authOid + ",'EXECUTE')"
    + " or not has_function_privilege('authenticated'," + authOid + ",'EXECUTE')"
    + " or not has_function_privilege('service_role'," + authOid + ",'EXECUTE')"
    + " then raise exception 'Hosted auth role grants differ'; end if;");
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
    bodies.push(item.sourceFormat ? sourceDerivedStrictDualDefinition(item) : extractDefinition(read(item.source), item.name),
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
  // This historical RPC name is misleading: the final immutable migration
  // replaced legacy shadow comparison with authoritative capability telemetry.
  // Never restore the older role-based fallback or bypass its event ledger.
  const shadowSignature = 'public.studio2_check_capability_shadow(text,uuid,text,text)';
  const shadowIdentity = 'public.studio2_check_capability_shadow(p_capability text, p_edition_id uuid, p_action text, p_route text)';
  const shadowFrozen = frozen.routines.find(f => f.signature === shadowIdentity);
  const shadowFingerprint = fingerprints.functions.find(f => f.id === shadowIdentity);
  assert.ok(shadowFrozen && shadowFingerprint, 'Missing frozen authoritative shadow-RPC contract');
  assert.equal(shadowFrozen.owner_name, 'postgres');
  assert.equal(shadowFrozen.definition_md5, '128ba5a80ec97062250c7cb0f7f69bc8');
  assert.equal(shadowFingerprint.sha256, '08b88c99394101d4c53534a37a8280607447a607a6226fd3ce4ad51b945ac9bf');
  assert.deepEqual(shadowFingerprint.exec, { anon: false, service_role: true, authenticated: true });
  const shadowOid = 'to_regprocedure(' + literal(shadowSignature) + ')';
  guards.push("if " + shadowOid + " is not null then raise exception 'Authorization dependency already exists: " + shadowSignature + "'; end if;");
  const shadowSource = 'supabase/migrations/20260918205750_permission_engine_v2_authoritative_cutover.sql';
  const shadowDefinition = extractDefinition(read(shadowSource), 'public.studio2_check_capability_shadow');
  assert.match(shadowDefinition, /'mode', 'authoritative'/);
  assert.doesNotMatch(shadowDefinition, /v_legacy_allowed|public\.has_role/);
  bodies.push(shadowDefinition,
    'revoke all on function ' + shadowSignature + ' from public, anon, authenticated, service_role;',
    'grant execute on function ' + shadowSignature + ' to authenticated, service_role;');
  checks.push("if not exists (select 1 from pg_proc p where p.oid=" + shadowOid
    + " and pg_get_userbyid(p.proowner)='postgres'"
    + " and md5(pg_get_functiondef(p.oid))='128ba5a80ec97062250c7cb0f7f69bc8'"
    + " and encode(pg_catalog.sha256(pg_catalog.convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='08b88c99394101d4c53534a37a8280607447a607a6226fd3ce4ad51b945ac9bf'"
    + " and md5(coalesce(p.proacl::text,''))='d1707186c8e5f1577bde2338d7541aec'"
    + " and md5(coalesce(p.proconfig::text,''))='f4d108644d77d4da19cf67dcdd506153'"
    + " and p.prosecdef and not p.proisstrict and not p.proleakproof"
    + " and p.provolatile='v' and p.proparallel='u' and p.prorettype='jsonb'::regtype)"
    + " then raise exception 'Hosted authoritative shadow RPC contract mismatch'; end if;"
    + " if has_function_privilege('anon'," + shadowOid + ",'EXECUTE')"
    + " or not has_function_privilege('authenticated'," + shadowOid + ",'EXECUTE')"
    + " or not has_function_privilege('service_role'," + shadowOid + ",'EXECUTE')"
    + " then raise exception 'Hosted authoritative shadow RPC EXECUTE drift'; end if;");
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
    extensionEvidence: { local: catalog.extensions ?? null, hosted: null, status: 'UNKNOWN / BLOCKING',
      requirement: 'Separately approved pg_extension name/version/schema/owner metadata; image identity alone is not hosted extension parity' },
    observedEvidenceDate: '2026-11-09 / 2026-11-10; separately approved one-signature read-only inspection 2026-11-13',
    roots: ['public.studio2_access_allowed(text,uuid,boolean)', 'private.studio2_task_recipient_eligible(uuid,uuid)'],
    reconstructed, ...graph, nodes, edges,
    platformAuthHelper: {
      identity: 'auth.role()', owner: 'supabase_auth_admin', source: 'existing immutable auth.uid() hosted-observed fixture',
      exactDefinitionSha256: 'c96a9358b02089b03f3962fd85c5f83c9d64f32240481915c0efe74398dc761b',
      provenance: 'source-derived provider role claim; PG17.11 ACL/owner/definition verified separately from seven private helpers',
      rawHostedBodyCommitted: false
    },
    inspectionPolicy: { separatelyAuthorizedOperatorOnly: true, maxRoutineIdentitiesPerBatch: 20,
      collect: ['exact signature', 'sanitized pg_get_functiondef', 'owner', 'language/security flags', 'ACL and role membership', 'search_path', 'attached trigger/policy definitions'],
      prohibit: ['application rows', 'credentials', 'CI hosted queries', 'invented stubs'],
      dynamicAndUnqualifiedCalls: 'Resolve from reviewed definitions and bounded runtime cases before certifying closure' },
    verifiedRuntimeBody: [{
      identity: 'private.studio2_require_strict_dual(text,uuid,text)',
      hostedExecutableDefinitionAvailableToAuthorizedOperator: true,
      rawHostedDefinitionCommitted: false,
      sourceVariant: '20260914174742_permission_engine_v2_core_rls_cutover.sql',
      transformation: 'deterministic whitespace-only normalization; original source prosrc MD5 and hosted prosrc MD5 both pinned',
      exactHostedDefinitionSha256: 'fd29f6aa3d37caf0c4052305ef6fbf45c99b6aefc9e87ec6a84fb848822d1b11',
      executableAndSecurityParity: 'PG17.11 postcondition must pass; not attested by metadata manifest alone',
      nextNestedDependencies: ['private.studio2_permission_engine_authoritative() (PG17.11 verified)', 'public.studio2_check_capability_shadow (separately pinned source candidate)'],
      runtimeActorPathCertification: 'ONLY isolated authoritative and legacy-mode flag paths; not full hosted parity'
    }],
    authoritativeTelemetryRpc: {
      identity: 'public.studio2_check_capability_shadow(text,uuid,text,text)',
      sourceFile: 'supabase/migrations/20260918205750_permission_engine_v2_authoritative_cutover.sql',
      sourceBehavior: 'Despite its legacy name, final source reports both decisions from capability and mode=authoritative',
      expectedHostedSha256: '08b88c99394101d4c53534a37a8280607447a607a6226fd3ce4ad51b945ac9bf',
      expectedApiExecute: { anon: false, authenticated: true, service_role: true },
      verification: 'Exact PG17.11 definition, ACL, owner, security flags, and runtime telemetry required',
      legacyOrganizerFallbackRestored: false,
      productionDeploymentAuthorized: false
    },
    blockedRuntime: [],
    remainingReleaseBlocks: [
      '215 hosted-observed table names, only 159 additional full digests; original 56 scoped',
      '727 hosted routine identities remain incompletely reconstructed, source/runtime parity incomplete',
      'Hosted extension/role/data/history parity and observable full contest workflows unverified',
      'Supabase Preview remote/local migration-version mismatch remains unresolved'
    ],
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
      intendedAssertions: ['global actor capability', 'grant/role expiry and revocation', 'task recipient/resolution', 'platform-mode restrictions', 'edition-scoped authoritative actor allow/deny', 'authoritative telemetry RPC rejects anon and audits actor', 'flag-off capability/strict-dual acceptance without reviving legacy role fallback'],
      executionResult: 'NOT_ATTESTED_BY_THIS_METADATA_MANIFEST',
      editionScopedAcceptance: 'PENDING_EXACT_HEAD_LOCAL_RUNTIME_LOG', fullTaskReconciliation: 'NOT_VERIFIED',
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
