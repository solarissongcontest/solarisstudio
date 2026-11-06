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
  reason: "invalid_migration_filename" | "invalid_migration_calendar_version" | "duplicate_migration_version";
  version?: string;
  firstFilename?: string;
};

export type V3S13MigrationVersionReport = {
  filesChecked: number;
  clean: boolean;
  issues: readonly V3S13MigrationVersionIssue[];
};

const MIGRATION_FILENAME = /^(\d{14})_[a-z0-9][a-z0-9_.-]*\.sql$/;

/**
 * Five older, potentially already-applied migrations used synthetic timestamp
 * values. Never rename deployed history. From Nov 2026, enforce real calendar
 * instants as well as global uniqueness for newly introduced migrations.
 */
const STRICT_CALENDAR_VERSION_FROM = "20261101000000";

function isValidCalendarVersion(version: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(version);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}


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
    if (version >= STRICT_CALENDAR_VERSION_FROM && !isValidCalendarVersion(version)) {
      issues.push({
        filename,
        reason: "invalid_migration_calendar_version",
        version,
      });
    }
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
