import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const BROWSER_SOURCE_ROOT = join(process.cwd(), "src");

/**
 * These tables carry contest lifecycle, official participation/line-up,
 * official outcome, or voting identity state. New browser writes to them must
 * use canonical System commands instead of growing the legacy direct-CRUD
 * surface.
 */
const CRITICAL_CANONICAL_TABLES = new Set([
  "editions",
  "shows",
  "participants",
  "results",
  "voters",
  "jury_votes",
  "jury_ballot_statuses",
  "jury_ballot_submissions",
  "televote_votes",
]);

/**
 * Existing debt is tolerated only so this guard can land before all consumer
 * cutovers. Entries may disappear without updating this list. Adding a new
 * file/table pair is forbidden: move that mutation behind canonical command
 * authority instead.
 *
 * This baseline is intentionally file + table specific and reflects literal
 * current-main debt at restack time. It is not permission to add another
 * critical mutation to one of these files.
 */
const KNOWN_DIRECT_WRITE_DEBT: Readonly<Record<string, readonly string[]>> = {
  "src/components/EditionPublicDesignPanel.tsx": ["editions"],
  "src/components/admin/HeatProgressionSyncPanel.tsx": ["participants"],
  "src/components/admin/ShowLineupWorkspace.tsx": ["participants", "shows"],
  "src/components/studio/EditionArtworkControl.tsx": ["editions"],
  "src/lib/visual-theme.ts": ["editions"],
  "src/routes/_authenticated/admin/anniversary-dates.tsx": ["editions"],
  "src/routes/_authenticated/admin/design.$slug.tsx": ["editions", "shows"],
  "src/routes/_authenticated/admin/editions.tsx": ["editions"],
  "src/routes/_authenticated/admin/jury/$slug.tsx": ["voters"],
  "src/routes/_authenticated/admin/shows/$slug.tsx": ["shows"],
  "src/routes/_authenticated/admin/televote/$slug.tsx": ["televote_votes"],
  "src/routes/_authenticated/admin/voting-system/$slug.tsx": ["results", "shows"],
};

type DirectWrite = {
  file: string;
  table: string;
  method: "insert" | "update" | "delete" | "upsert";
  line: number;
};

function normalizedRepoPath(path: string) {
  return relative(process.cwd(), path).split(sep).join("/");
}

function isBrowserCapableSource(path: string) {
  const repoPath = normalizedRepoPath(path);
  if (!/\.tsx?$/.test(repoPath)) return false;
  if (/\.(?:test|spec)\.tsx?$/.test(repoPath)) return false;
  if (/\.(?:server|functions)\.tsx?$/.test(repoPath)) return false;
  if (repoPath.endsWith("/routeTree.gen.ts")) return false;
  return true;
}

function browserSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return browserSourceFiles(path);
    return isBrowserCapableSource(path) ? [path] : [];
  });
}

function directCriticalWrites(path: string): DirectWrite[] {
  const source = readFileSync(path, "utf8");
  const writes: DirectWrite[] = [];
  const fromPattern = /\.from\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;

  for (const match of source.matchAll(fromPattern)) {
    const table = match[1];
    if (!CRITICAL_CANONICAL_TABLES.has(table)) continue;

    const afterFrom = (match.index ?? 0) + match[0].length;
    const remaining = source.slice(afterFrom);
    const nextFromOffset = remaining.search(/\.from\(\s*["']/);
    const chain = nextFromOffset >= 0 ? remaining.slice(0, nextFromOffset) : remaining;
    const mutation = chain.match(/\.(insert|update|delete|upsert)\s*\(/);
    if (!mutation) continue;

    const method = mutation[1] as DirectWrite["method"];
    const mutationOffset = afterFrom + (mutation.index ?? 0);
    const line = source.slice(0, mutationOffset).split("\n").length;

    writes.push({
      file: normalizedRepoPath(path),
      table,
      method,
      line,
    });
  }

  return writes;
}

function isKnownDebt(write: DirectWrite) {
  return KNOWN_DIRECT_WRITE_DEBT[write.file]?.includes(write.table) === true;
}

describe("V3 critical browser-mutation regression guard", () => {
  it("does not allow new browser-owned writes to canonical lifecycle/voting tables", () => {
    const writes = browserSourceFiles(BROWSER_SOURCE_ROOT).flatMap(directCriticalWrites);
    const newDebt = writes.filter((write) => !isKnownDebt(write));

    expect(
      newDebt,
      newDebt.length
        ? [
            "New direct browser authority was introduced for canonical Solaris state.",
            "Use/reuse a server-authoritative V3 command instead of expanding the debt allowlist.",
            ...newDebt.map(
              (write) =>
                `${write.file}:${write.line} -> ${write.table}.${write.method}()`,
            ),
          ].join("\n")
        : undefined,
    ).toEqual([]);
  });

  it("keeps the allowlist file-and-table-specific", () => {
    for (const [file, tables] of Object.entries(KNOWN_DIRECT_WRITE_DEBT)) {
      expect(file.startsWith("src/")).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(CRITICAL_CANONICAL_TABLES.has(table)).toBe(true);
      }
    }
  });

  it("covers browser-capable helpers outside route/component directories", () => {
    const files = browserSourceFiles(BROWSER_SOURCE_ROOT).map(normalizedRepoPath);

    expect(files).toContain("src/lib/visual-theme.ts");
    expect(files).not.toContain("src/integrations/televoting/results-sync.server.ts");
    expect(files).not.toContain("src/lib/public.functions.ts");
  });

  it("does not bless currently clean official Jury mutation tables", () => {
    const allowedTables = new Set(Object.values(KNOWN_DIRECT_WRITE_DEBT).flat());

    expect(allowedTables.has("jury_votes")).toBe(false);
    expect(allowedTables.has("jury_ballot_statuses")).toBe(false);
    expect(allowedTables.has("jury_ballot_submissions")).toBe(false);
  });
});
