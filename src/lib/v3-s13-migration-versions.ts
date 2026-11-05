/**
 * Supabase identifies a migration by its leading 14-digit version, not by the
 * descriptive suffix. A duplicate version can cause clean replay and an
 * already-applied database upgrade to select different migration histories.
 *
 * Audit the ENTIRE SQL migration directory, not only post-S13 migrations:
 * an older version may collide with a new backdated migration. This module is
 * pure and does not connect to Supabase or any database.
 */
export type V3S13MigrationVersionIssue = {
  filename: string;
  reason: "invalid_migration_filename" | "duplicate_migration_version";
  version?: string;
  firstFilename?: string;
};

export type V3S13MigrationVersionReport = {
  filesChecked: number;
  clean: boolean;
  issues: readonly V3S13MigrationVersionIssue[];
};

const MIGRATION_FILENAME = /^(\d{14})_[a-z0-9][a-z0-9_.-]*\.sql$/;

export function auditV3S13MigrationVersions(
  sqlFilenames: readonly string[],
): V3S13MigrationVersionReport {
  const firstByVersion = new Map<string, string>();
  const issues: V3S13MigrationVersionIssue[] = [];

  // Sorting makes the first conflicting file stable across filesystems/CI.
  for (const filename of [...sqlFilenames].sort()) {
    const match = MIGRATION_FILENAME.exec(filename);
    if (!match) {
      issues.push({ filename, reason: "invalid_migration_filename" });
      continue;
    }

    const version = match[1];
    const firstFilename = firstByVersion.get(version);
    if (firstFilename) {
      issues.push({
        filename,
        reason: "duplicate_migration_version",
        version,
        firstFilename,
      });
      continue;
    }
    firstByVersion.set(version, filename);
  }

  return { filesChecked: sqlFilenames.length, clean: issues.length === 0, issues };
}
