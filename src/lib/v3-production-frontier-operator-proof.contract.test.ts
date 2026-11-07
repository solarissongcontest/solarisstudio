import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PRODUCTION_BOOTSTRAP_CUTOVER } from "./v3-production-migration-frontier";

const doc = readFileSync(resolve(process.cwd(), "docs/v3/production-frontier-preflight.md"), "utf8");
const cut = doc.split("## Dependency-ordered System-owner triage: the 36 post-cutover gaps");
if (cut.length !== 2) throw new Error("Production frontier operator triage boundary missing");
const inventory = cut[1].split("### Forward-only adoption gates, not permissions to deploy")[0];

describe("S13 production-frontier operator evidence: no fictional adoption", () => {
  it("keeps the immutable migration bootstrap boundary and declares the snapshot exact source", () => {
    expect(V3_PRODUCTION_BOOTSTRAP_CUTOVER).toBe("20261014020000");
    expect(doc).toContain("At independently inspected repository source SHA `e570fa68943845aa7ccca834581d7a45518772f1`");
    expect(doc).toContain("Hosted migration records: **497**");
    expect(doc).toContain("Repository SQL migration files: **494**");
    expect(doc).toContain("**36** repository SQL versions strictly after the cutoff");
    expect(doc).toContain("**32** repository SQL versions newer than the hosted tip");
    expect(doc).toContain("**0** hosted-only migrations after the cutoff");
  });

  it("lists all 36 postcutover history holes exactly once, with reviewed source files present", () => {
    const names = [...inventory.matchAll(/^- `(\\d{14}_[A-Za-z0-9_\\-]+\\.sql)`$/gm)].map((match) => match[1]);
    expect(names.length).toBe(36);
    expect(new Set(names).size).toBe(36);
    for (const filename of names) {
      expect(filename.slice(0, 14) > V3_PRODUCTION_BOOTSTRAP_CUTOVER, filename).toBe(true);
      expect(filename.slice(0, 14) <= "20261101181812", filename).toBe(true);
      expect(existsSync(resolve(process.cwd(), "supabase/migrations", filename)), filename).toBe(true);
    }
    const groups = [...inventory.matchAll(/^### [^\\n]+ \\((\\d+)\\)$/gm)].map((match) => Number(match[1]));
    expect(groups).toEqual([3, 9, 2, 7, 12, 3]);
    expect(groups.reduce((sum, count) => sum + count, 0)).toBe(36);
  });

  it("never treats history-only evidence, clean-local replay or already merged hotfixes as deployment authorization", () => {
    expect(doc).toContain("**not a runnable deployment sequence**".replace("**", ""));
    expect(doc).toContain("hosted-head-equivalent");
    expect(doc).toContain("The earlier 2026-11-04 read-only observations");
    expect(doc).toContain("**Do not reapply them or open a second historical adoption.**");
    expect(doc).toContain("Only the System owner may then revise production migration push pins");
    expect(doc).toContain("separate explicit owner approval");
    expect(doc).toContain("**NO-GO for hosted V3 migrations and production release.**");
    expect(doc).not.toContain("Repository migration files: 473");
    expect(doc).not.toContain("**14** repository migrations are newer");
    expect(doc).not.toContain("**3** hosted migrations newer than the bootstrap boundary");
  });
});
