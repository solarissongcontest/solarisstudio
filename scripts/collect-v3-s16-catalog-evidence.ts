import { requireS16NetworklessFixture } from "../src/lib/v3-s16-catalog-transport";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveS16CandidateSha, requireS16CleanTree } from "../src/lib/v3-s16-candidate-sha";
import { requireV3S16CatalogTableCoverage } from "../src/lib/v3-s16-catalog-coverage";
import {
  V3_S16_CRITICAL_DOMAINS,
  type V3S16CatalogEvidence,
  type V3S16CatalogFunctionEvidence,
} from "../src/lib/v3-s16-mutation-authority";
import {
  requireS16LocalDatabase,
  S16_FUNCTION_CATALOG_SQL,
  S16_ROLE_AND_DEFAULT_CATALOG_SQL,
  s16TableCatalogSql,
  potentialS16Write,
  s16PsqlEnvironment,
} from "../src/lib/v3-s16-catalog";

const sha = resolveS16CandidateSha(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }),
  process.env.V3_CANDIDATE_SHA,
  process.env.GITHUB_SHA,
);
requireS16CleanTree(
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }),
);
const container = process.env.V3_S16_DOCKER_CONTAINER;
const localUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
if (container && localUrl) throw new Error("Choose exactly one explicit local S16 transport");
const fixture = container
  ? requireS16NetworklessFixture({
      container,
      database: process.env.V3_S16_DOCKER_DATABASE ?? "",
      fixtureSourceSha: process.env.V3_S16_FIXTURE_SOURCE_SHA ?? "",
      inspect: execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
    })
  : null;
const db = fixture ? null : requireS16LocalDatabase(localUrl);
function query<T>(sql: string): T {
  // Ignore psql rc files and session defaults. No DDL or write queries are run.
  const command = fixture ? "docker" : "psql";
  const connection = fixture
    ? ["exec", "-i", fixture.container, "psql", "-U", "postgres", "-d", fixture.database]
    : [db!];
  const text = execFileSync(
    command,
    [
      ...connection,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
      "-c",
      `begin read only; set local statement_timeout='10s'; set local lock_timeout='2s'; set local search_path=pg_catalog; ${sql} commit;`,
    ],
    { encoding: "utf8", env: s16PsqlEnvironment(process.env), maxBuffer: 64 * 1024 * 1024 },
  ).trim();
  if (!text) throw new Error("S16 catalog query returned no evidence");
  return JSON.parse(text) as T;
}
const provenance = query<{
  database: string;
  sessionUser: string;
  currentUser: string;
  postgresVersion: string;
  serverVersionNum: number;
  operatorSuperuser: boolean;
  readOnly: boolean;
}>(
  `select jsonb_build_object('database',current_database(),'sessionUser',session_user,'currentUser',current_user,'postgresVersion',version(),'serverVersionNum',current_setting('server_version_num')::integer,'operatorSuperuser',(select rolsuper from pg_roles where rolname=current_user),'readOnly',current_setting('transaction_read_only')::boolean)::text;`,
);
if (
  fixture &&
  (provenance.serverVersionNum !== 170011 ||
    provenance.operatorSuperuser ||
    provenance.sessionUser !== "postgres" ||
    !provenance.readOnly)
)
  throw new Error(
    "S16 recovery fixture requires actual PG17.11 NOSUPERUSER postgres read-only session",
  );
const criticalTables = [
  ...new Set(V3_S16_CRITICAL_DOMAINS.flatMap((d) => d.canonicalTables)),
].sort();
const tableRows = criticalTables.map((table) =>
  query<V3S16CatalogEvidence["tables"][number] | null>(s16TableCatalogSql(table)),
);
// Missing catalog rows are blockers, not optional values to silently drop.
const tables = requireV3S16CatalogTableCoverage(criticalTables, tableRows);
const roles = query<{
  roles: { name: string }[];
  memberships: unknown[];
  functionDefaults: unknown[];
}>(S16_ROLE_AND_DEFAULT_CATALOG_SQL);
for (const role of ["anon", "authenticated", "service_role"]) {
  if (!roles.roles.some((r) => r.name === role))
    throw new Error(`Disposable Supabase role ${role} is missing; refusing incomplete evidence`);
}
const inventory =
  query<(V3S16CatalogFunctionEvidence & { definition: string })[]>(S16_FUNCTION_CATALOG_SQL);
const functions = inventory.map(({ definition, ...fn }) => ({
  ...fn,
  writesTables: criticalTables.filter((t) => potentialS16Write(definition, t, fn.searchPath)),
  dynamicSqlUnresolved: /\bexecute\s+(?!function\b|procedure\b)/i.test(definition),
  definition,
}));
// Propagate possible writes through statically visible calls. Overloaded calls
// remain conservative: all matching overloads are considered, never just first.
for (let changed = true; changed; ) {
  changed = false;
  for (const fn of functions)
    for (const callee of functions) {
      const escaped = callee.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bare = escaped.split("\\.").at(-1)!;
      if (!new RegExp(`(?:${escaped}|(?<![\\w.])${bare})\\s*\\(`, "i").test(fn.definition))
        continue;
      for (const table of callee.writesTables)
        if (!fn.writesTables.includes(table)) {
          fn.writesTables.push(table);
          changed = true;
        }
      if (callee.dynamicSqlUnresolved && !fn.dynamicSqlUnresolved) {
        fn.dynamicSqlUnresolved = true;
        changed = true;
      }
    }
}
const evidence: V3S16CatalogEvidence = {
  schemaVersion: 2,
  candidateSha: sha,
  collectedAt: new Date().toISOString(),
  collection: "effective-postgresql-catalog-v2",
  roles,
  tables,
  functions: functions.map(({ definition, ...fn }) => ({ ...fn, definition })),
  uncertainties: functions
    .filter((fn) => fn.dynamicSqlUnresolved)
    .map((fn) => `${fn.identity ?? fn.name}: dynamic SQL needs execution/owner review`),
};
const output = resolve(
  process.argv.find((v) => v.startsWith("--out="))?.slice(6) ||
    process.env.V3_S16_CATALOG_OUT?.trim() ||
    "v3-release-preflight/s16/catalog-evidence.json",
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
writeFileSync(
  output + ".provenance.json",
  JSON.stringify(
    {
      candidateSha: sha,
      fixtureSourceSha: fixture?.fixtureSourceSha ?? null,
      transport: fixture ? "networkless-docker-exec" : "loopback-psql",
      database: provenance,
      hostedEquivalenceCertified: false,
      productionTarget: false,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `S16 catalog ${sha}: ${tables.length}/${criticalTables.length} tables, ${functions.length} function signatures; ${evidence.uncertainties?.length} unresolved SQL paths. No execution-authority certification is inferred.\n`,
);
