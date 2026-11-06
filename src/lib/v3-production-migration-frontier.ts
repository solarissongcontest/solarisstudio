/**
 * Reconcile the repository's canonical SQL timestamps with hosted migration
 * metadata. This is an offline, read-only audit. It never connects to Supabase.
 *
 * Production was bootstrapped in October 2026: old repository migrations and
 * hosted bootstrap entries have different identities. That exception ends at
 * the immutable October 14 cutover, NOT at the latest hosted migration head.
 */
export const V3_PRODUCTION_BOOTSTRAP_CUTOVER = "20261014020000";

export type HostedMigration = { version: string; name?: string };
export type RepoMigration = { version: string; name: string; filename: string };

export type ProductionMigrationFrontier = {
  bootstrapCutover: string;
  hostedHead: string | null;
  repositoryHead: string | null;
  repositoryCount: number;
  hostedCount: number;
  historicalRepoOnlyCount: number;
  historicalHostedOnlyCount: number;
  appliedPostCutoverCount: number;
  holesBeforeHostedHead: RepoMigration[];
  pendingAfterHostedHead: RepoMigration[];
  unknownHostedPostCutover: HostedMigration[];
  nameMismatches: { version: string; repositoryName: string; hostedName: string }[];
  errors: string[];
  historyReconciled: boolean;
};

const validVersion = (value: string): boolean => /^\d{14}$/.test(value);

export function auditV3ProductionMigrationFrontier(
  repositoryFilenames: readonly string[],
  hostedMigrations: readonly HostedMigration[],
  cutover = V3_PRODUCTION_BOOTSTRAP_CUTOVER,
): ProductionMigrationFrontier {
  const errors: string[] = [];
  if (!validVersion(cutover)) errors.push("Bootstrap cutover is not a 14-digit migration version");
  if (!repositoryFilenames.length) errors.push("Repository migration inventory is empty");
  if (!hostedMigrations.length) errors.push("Hosted migration inventory is empty");

  const repository = new Map<string, RepoMigration>();
  for (const filename of repositoryFilenames) {
    if (!filename.endsWith(".sql")) continue;
    const match = /^(\d{14})_(.+)\.sql$/.exec(filename);
    if (!match) {
      errors.push(`Invalid repository migration filename: ${filename}`);
      continue;
    }
    const [, version, name] = match;
    if (repository.has(version)) errors.push(`Duplicate repository migration version: ${version}`);
    repository.set(version, { version, name, filename });
  }

  const hosted = new Map<string, HostedMigration>();
  for (const migration of hostedMigrations) {
    if (!migration || typeof migration.version !== "string" || !validVersion(migration.version)) {
      errors.push("Hosted migration history contains an invalid version");
      continue;
    }
    if (hosted.has(migration.version)) errors.push(`Duplicate hosted migration version: ${migration.version}`);
    if (migration.name !== undefined && typeof migration.name !== "string") {
      errors.push(`Hosted migration ${migration.version} has a non-string name`);
    }
    if (migration.version > cutover && (!migration.name || typeof migration.name !== "string")) {
      errors.push(`Hosted post-cutover migration ${migration.version} lacks name evidence`);
    }
    hosted.set(migration.version, migration);
  }

  const hostedHead = [...hosted.keys()].sort().at(-1) ?? null;
  const repositoryHead = [...repository.keys()].sort().at(-1) ?? null;
  if (hostedHead !== null && hostedHead < cutover) {
    errors.push(`Hosted migration head ${hostedHead} predates the documented bootstrap cutover`);
  }

  const holesBeforeHostedHead: RepoMigration[] = [];
  const pendingAfterHostedHead: RepoMigration[] = [];
  const unknownHostedPostCutover: HostedMigration[] = [];
  const nameMismatches: ProductionMigrationFrontier["nameMismatches"] = [];
  let historicalRepoOnlyCount = 0;
  let historicalHostedOnlyCount = 0;
  let appliedPostCutoverCount = 0;

  for (const migration of repository.values()) {
    const remote = hosted.get(migration.version);
    if (remote) {
      if (migration.version > cutover) {
        appliedPostCutoverCount++;
        if (remote.name && remote.name !== migration.name) {
          nameMismatches.push({
            version: migration.version,
            repositoryName: migration.name,
            hostedName: remote.name,
          });
        }
      }
      continue;
    }
    if (migration.version <= cutover) historicalRepoOnlyCount++;
    else if (hostedHead !== null && migration.version <= hostedHead) holesBeforeHostedHead.push(migration);
    else pendingAfterHostedHead.push(migration);
  }

  for (const migration of hosted.values()) {
    if (repository.has(migration.version)) continue;
    if (migration.version <= cutover) historicalHostedOnlyCount++;
    else unknownHostedPostCutover.push(migration);
  }

  holesBeforeHostedHead.sort((a, b) => a.version.localeCompare(b.version));
  pendingAfterHostedHead.sort((a, b) => a.version.localeCompare(b.version));
  unknownHostedPostCutover.sort((a, b) => a.version.localeCompare(b.version));
  nameMismatches.sort((a, b) => a.version.localeCompare(b.version));

  return {
    bootstrapCutover: cutover,
    hostedHead,
    repositoryHead,
    repositoryCount: repository.size,
    hostedCount: hosted.size,
    historicalRepoOnlyCount,
    historicalHostedOnlyCount,
    appliedPostCutoverCount,
    holesBeforeHostedHead,
    pendingAfterHostedHead,
    unknownHostedPostCutover,
    nameMismatches,
    errors,
    historyReconciled:
      errors.length === 0 &&
      holesBeforeHostedHead.length === 0 &&
      unknownHostedPostCutover.length === 0 &&
      nameMismatches.length === 0,
  };
}
