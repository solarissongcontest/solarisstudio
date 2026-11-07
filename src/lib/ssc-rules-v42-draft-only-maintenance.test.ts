import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { prepareGovernedV42Draft } from "@/lib/ssc-rules/v42-governed-import";
import { buildV42GovernedDraftChanges } from "@/lib/ssc-rules/v42-governed-draft";
import type { RulebookRelease } from "@/lib/rules-governance";

const current = [{ id: "official", version: "4.1", is_current: true, status: "published" }] as unknown as RulebookRelease[];
const text = (path: string) => readFileSync(path, "utf8");

describe("Governed maintenance v4.2 draft-only import", () => {
  it("creates one unpublished release and preserves all 113 snapshots through existing admin RPCs", async () => {
    const actions: { name: string; args: Record<string, unknown> }[] = [];
    const progress: number[] = [];
    const result = await prepareGovernedV42Draft({
      releases: current,
      rpc: async (name, args) => {
        actions.push({ name, args });
        return name === "admin_create_rulebook_release" ? { id: "draft-42" } : {};
      },
      onProgress: ({ imported }) => progress.push(imported),
    });
    expect(result).toEqual({ id: "draft-42", imported: 113, unchanged: 0, total: 113 });
    expect(actions).toHaveLength(114);
    expect(actions[0].name).toBe("admin_create_rulebook_release");
    expect(actions[0].args).toMatchObject({ _version: "4.2", _base_version: "4.1" });
    expect(actions.slice(1).every((action) => action.name === "admin_upsert_rulebook_change")).toBe(true);
    expect(new Set(actions.slice(1).map((action) => action.args._rule_id)).size).toBe(113);
    expect(actions.every((action) => action.name !== "admin_publish_rulebook_release")).toBe(true);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(113);
  });

  it("does not overwrite existing organizer edits on resumable partial import", async () => {
    const all = buildV42GovernedDraftChanges();
    const edited = all[0].rule_id;
    const releases = [
      ...current,
      { id: "old-draft", version: "4.2", title: "Plain-English SSC General Regulations", status: "draft", changes: [{ rule_id: edited }] },
    ] as unknown as RulebookRelease[];
    const actions: string[] = [];
    const result = await prepareGovernedV42Draft({
      releases,
      rpc: async (name, args) => {
        expect(args._rule_id).not.toBe(edited);
        actions.push(name);
        return {};
      },
    });
    expect(result).toEqual({ id: "old-draft", imported: 112, unchanged: 1, total: 113 });
    expect(actions).toHaveLength(112);
    expect(actions.every((name) => name === "admin_upsert_rulebook_change")).toBe(true);
  });

  it("fails closed on a stale official base, duplicate published release or unknown draft", async () => {
    let mutations = 0;
    const rpc = async () => { mutations += 1; return {}; };
    await expect(prepareGovernedV42Draft({
      releases: [{ ...current[0], version: "4.3" }],
      rpc,
    })).rejects.toThrow("current published rulebook changed");
    await expect(prepareGovernedV42Draft({
      releases: [...current, { version: "4.2", status: "published" } as RulebookRelease],
      rpc,
    })).rejects.toThrow("already published");
    await expect(prepareGovernedV42Draft({
      releases: [...current, { version: "4.2", status: "draft", title: "Unrelated release" } as RulebookRelease],
      rpc,
    })).rejects.toThrow("Another v4.2 draft");
    expect(mutations).toBe(0);
  });

  it("stops safely if the organizer session changes before a database mutation", async () => {
    let writes = 0;
    await expect(prepareGovernedV42Draft({
      releases: current,
      assertActor: async () => {
        if (writes >= 5) throw new Error("account changed");
      },
      rpc: async (name) => {
        writes += 1;
        return name === "admin_create_rulebook_release" ? { id: "draft" } : {};
      },
    })).rejects.toThrow("account changed");
    expect(writes).toBe(5);
  });

  it("makes the maintenance UI available only after Degraded state and never publishes", () => {
    const recovery = text("src/routes/maintenance/recovery.tsx");
    const manager = text("src/routes/_authenticated/admin/rules-manager.tsx");
    const maintenance = text("src/lib/maintenance.ts");
    const server = text("src/server.ts");
    expect(recovery).toContain('snapshot?.mode === "degraded"');
    expect(recovery).toContain('state.mode !== "degraded"');
    expect(recovery).toContain("fetchAdminRulebookReleases()");
    expect(recovery).toContain("prepareGovernedV42Draft({");
    expect(recovery).toContain("assertActor");
    expect(recovery).toContain('onClick={() => void prepareV42Draft()}');
    expect(recovery).toContain("Each write uses the standard rules.edit authorization");
    expect(recovery).not.toContain("admin_publish_rulebook_release");
    expect(recovery).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(recovery).not.toContain("supabaseAdmin");
    expect(manager).toContain("prepareGovernedV42Draft({");
    expect(maintenance).toContain("GLOBAL_MAINTENANCE_MODE = true");
    expect(server).toContain("!recoveryRouteAllowed");
    expect(server).toContain('request.method !== "GET"');
  });
});
