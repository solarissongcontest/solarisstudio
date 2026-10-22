import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const syncSource = readFileSync(
  resolve(repoRoot, "src/integrations/confirmations/sync.functions.ts"),
  "utf8",
);
const migrationSql = readdirSync(resolve(repoRoot, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(resolve(repoRoot, "supabase/migrations", name), "utf8"))
  .join("\n");

describe("S14 canonical Confirmation publication sync boundary", () => {
  it("keeps immediate reveal on the real Confirmation -> Solaris sync path", () => {
    expect(syncSource).toContain('revealType === "immediately"');
    expect(syncSource).toContain('confirmationPublication.status === "published"');
    expect(syncSource).toContain('db.rpc("emit_entry_published_event"');
  });

  it("restores service-role EXECUTE authority for the publication event RPC on fresh replay", () => {
    expect(migrationSql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.emit_entry_published_event\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to\s+service_role\s*;/i,
    );
  });

  it("does not report synced after a publication-event RPC error", () => {
    const publicationCall = syncSource.match(
      /(?:const|let)\s+\{\s*error\s*:\s*([A-Za-z_$][\w$]*)\s*\}\s*=\s*await\s+db\.rpc\(\s*["']emit_entry_published_event["'][\s\S]{0,500}?\);/,
    );
    expect(publicationCall).not.toBeNull();

    const errorName = publicationCall?.[1];
    expect(errorName).toBeTruthy();
    if (!errorName) return;

    const callEnd = (publicationCall?.index ?? 0) + (publicationCall?.[0].length ?? 0);
    const followingSource = syncSource.slice(callEnd, callEnd + 1_500);
    const errorGuardIndex = followingSource.search(
      new RegExp(`if\\s*\\(\\s*${errorName}\\s*\\)`),
    );
    expect(errorGuardIndex).toBeGreaterThanOrEqual(0);

    const guardedSource = followingSource.slice(errorGuardIndex);
    const failureStatusIndex = guardedSource.indexOf('status: "publication_event_failed"');
    expect(failureStatusIndex).toBeGreaterThanOrEqual(0);

    const terminalIndex = guardedSource.slice(failureStatusIndex).search(/\b(?:throw|return)\b/);
    expect(terminalIndex).toBeGreaterThanOrEqual(0);

    const absoluteTerminalIndex = failureStatusIndex + terminalIndex;
    const syncedStatusIndex = guardedSource.indexOf('status: "synced"');
    if (syncedStatusIndex >= 0) {
      expect(absoluteTerminalIndex).toBeLessThan(syncedStatusIndex);
    }
  });
});
