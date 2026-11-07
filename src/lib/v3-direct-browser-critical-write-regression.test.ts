import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";
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
type DirectWriteMethod = "insert" | "update" | "delete" | "upsert";
type MethodBudget = Partial<Record<DirectWriteMethod, number>>;

// Maximum existing call sites per file, table AND mutation method.
// This does not bless additional writes in an already-debted file.
const KNOWN_DIRECT_WRITE_DEBT: Readonly<Record<string, Readonly<Record<string, Readonly<MethodBudget>>>>> = {
  "src/components/EditionPublicDesignPanel.tsx": { editions: { update: 1 } },
  "src/components/admin/HeatProgressionSyncPanel.tsx": { participants: { insert: 1 } },
  "src/components/admin/ShowLineupWorkspace.tsx": {
    participants: { insert: 2, update: 3, delete: 1 }, shows: { update: 1 },
  },
  "src/components/studio/EditionArtworkControl.tsx": { editions: { update: 1 } },
  "src/lib/visual-theme.ts": { editions: { update: 1 } },
  "src/routes/_authenticated/admin/design.$slug.tsx": {
    editions: { update: 1 }, shows: { update: 3 },
  },
  "src/routes/_authenticated/admin/editions.tsx": {
    editions: { insert: 1, update: 1, delete: 1 },
  },
  "src/routes/_authenticated/admin/jury/$slug.tsx": {
    voters: { insert: 2, update: 3, delete: 1 },
  },
  "src/routes/_authenticated/admin/shows/$slug.tsx": {
    shows: { update: 2, insert: 1, delete: 1 },
  },
  "src/routes/_authenticated/admin/televote/$slug.tsx": {
    televote_votes: { update: 1, insert: 1 },
  },
  "src/routes/_authenticated/admin/voting-system/$slug.tsx": {
    results: { update: 1 }, shows: { update: 1 },
  },
};

type DirectWrite = {
  file: string;
  table: string;
  method: DirectWriteMethod;
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


/**
 * Read only the actual call chain. Text searching until the next .from()
 * wrongly attributes an unrelated later update() to an earlier SELECT.
 * A syntax tree also handles multiline and nested calls without crossing
 * statement boundaries.
 */
function tableInMutationReceiver(expression: ts.Expression): string | null {
  let receiver = expression;
  while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
    const invoked = receiver.expression;
    if (
      invoked.name.text === "from" &&
      receiver.arguments.length === 1 &&
      ts.isStringLiteral(receiver.arguments[0])
    ) {
      return receiver.arguments[0].text;
    }
    receiver = invoked.expression;
  }
  return null;
}

function directCriticalWritesInSource(source: string, file: string): DirectWrite[] {
  const ast = ts.createSourceFile(
    file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const writes: DirectWrite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "insert" || method === "update" || method === "delete" || method === "upsert") {
        const table = tableInMutationReceiver(node.expression.expression);
        if (table && CRITICAL_CANONICAL_TABLES.has(table)) {
          writes.push({
            file,
            table,
            method,
            line: ast.getLineAndCharacterOfPosition(node.expression.name.getStart(ast)).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(ast);
  return writes;
}

function directCriticalWrites(path: string): DirectWrite[] {
  return directCriticalWritesInSource(readFileSync(path, "utf8"), normalizedRepoPath(path));
}

function newlyIntroducedCriticalWrites(writes: readonly DirectWrite[]): DirectWrite[] {
  const observed = new Map<string, number>();
  return writes.filter((write) => {
    const key = [write.file, write.table, write.method].join("\u0000");
    const count = (observed.get(key) ?? 0) + 1;
    observed.set(key, count);
    const baselineLimit = KNOWN_DIRECT_WRITE_DEBT[write.file]?.[write.table]?.[write.method] ?? 0;
    return count > baselineLimit;
  });
}

describe("V3 critical browser-mutation regression guard", () => {
  it("does not allow new browser-owned writes to canonical lifecycle/voting tables", () => {
    const writes = browserSourceFiles(BROWSER_SOURCE_ROOT).flatMap(directCriticalWrites);
    const newDebt = newlyIntroducedCriticalWrites(writes);

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


  it("attributes mutations only to their actual AST chain, not later unrelated calls", () => {
    const source = [
      "const readonly = await db.from('editions').select('id');",
      "unrelated.update({ status: 'not a database update' });",
      "const showWrite = db.from('shows')",
      "  .update({ status: 'live' })",
      "  .eq('id', showId);",
      "const voteWrite = db.schema('public').from('televote_votes').insert([{ id: voteId }]);",
      "db.from('jury_votes').delete().eq('id', juryId);",
    ].join("\n");
    const writes = directCriticalWritesInSource(source, "src/contract.ts");
    expect(writes.map((write) => [write.table, write.method, write.line])).toEqual([
      ["shows", "update", 4],
      ["televote_votes", "insert", 6],
      ["jury_votes", "delete", 7],
    ]);
    // No baseline exists for new files, including now-clean official Jury tables.
    expect(newlyIntroducedCriticalWrites(writes)).toEqual(writes);
  });

  it("rejects additional mutations even inside an existing debt file/table", () => {
    const example: DirectWrite = {
      file: "src/components/EditionPublicDesignPanel.tsx",
      table: "editions", method: "update", line: 218,
    };
    expect(newlyIntroducedCriticalWrites([example])).toEqual([]);
    expect(newlyIntroducedCriticalWrites([example, { ...example, line: 219 }]))
      .toEqual([{ ...example, line: 219 }]);
    expect(newlyIntroducedCriticalWrites([{ ...example, method: "insert" }]))
      .toEqual([{ ...example, method: "insert" }]);
  });

  it("keeps the baseline bounded by file, table, method, and a positive call count", () => {
    for (const [file, tables] of Object.entries(KNOWN_DIRECT_WRITE_DEBT)) {
      expect(file.startsWith("src/")).toBe(true);
      expect(Object.keys(tables).length).toBeGreaterThan(0);
      for (const [table, methods] of Object.entries(tables)) {
        expect(CRITICAL_CANONICAL_TABLES.has(table)).toBe(true);
        for (const [method, count] of Object.entries(methods)) {
          expect(["insert", "update", "delete", "upsert"]).toContain(method);
          expect(Number.isSafeInteger(count) && count > 0).toBe(true);
        }
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
    const allowedTables = new Set(
      Object.values(KNOWN_DIRECT_WRITE_DEBT).flatMap((tables) => Object.keys(tables)),
    );

    expect(allowedTables.has("jury_votes")).toBe(false);
    expect(allowedTables.has("jury_ballot_statuses")).toBe(false);
    expect(allowedTables.has("jury_ballot_submissions")).toBe(false);
  });
});
