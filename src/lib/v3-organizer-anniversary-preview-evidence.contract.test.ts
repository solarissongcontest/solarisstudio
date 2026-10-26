import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const anniversary = source("src/routes/_authenticated/admin/anniversary.tsx");
const permissionRoutes = source("src/lib/permission-route-map.ts");
const storytelling = source("src/lib/studio2-storytelling.ts");
const storytellingMigration = source("supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql");

describe("V3 Organizer Anniversary settings cutover", () => {
  it("cuts over only the settings capability while historical date mutation remains separate", () => {
    const settings = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-anniversary-settings",
    );
    const dates = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-anniversary-dates",
    );

    expect(settings).toBeDefined();
    expect(settings?.migrationStatus).toBe("cutover");
    expect(settings?.targetDomain).toBe("engagement-editorial");
    expect(settings?.targetRoute).toBe("/admin/anniversary");
    expect(settings?.ownerCapability).toBe("story.read");

    expect(dates).toBeDefined();
    expect(dates?.migrationStatus).toBe("building");
    expect(dates?.ownerCapability).toBe("edition.read");
    expect(anniversary).toContain("System #633");
    expect(anniversary).toContain('to="/admin/anniversary-dates"');
    expect(permissionRoutes).toContain('rule(["/admin/anniversary-dates"], "edition.read")');
    expect(permissionRoutes).toContain('rule(["/admin/storytelling", "/admin/anniversary"], "story.read")');
  });

  it("consumes canonical Storytelling read and mutation authority instead of writing domain tables", () => {
    expect(anniversary).toContain("loadStudio2Storytelling");
    expect(anniversary).toContain("executeStudio2StoryOperation");
    expect(anniversary).toContain('action: "create_manual_item"');
    expect(anniversary).toContain('"publish_storyline"');
    expect(anniversary).toContain('"unpublish_storyline"');
    expect(anniversary).not.toContain('.from("editions")');
    expect(anniversary).not.toContain("supabase.from(");

    expect(storytelling).toContain("studio2_storytelling_snapshot");
    expect(storytelling).toContain("studio2_execute_story_operation");
    expect(storytelling).toContain("p_execution_id: executionId");
    expect(storytelling).toContain("p_expected_revision: input.expectedRevision ?? null");
    expect(storytelling).toContain("validateStoryOperationExecution");
  });

  it("keeps read discovery and mutation authorization at their canonical server boundaries", () => {
    expect(storytellingMigration).toContain("private.studio2_can_manage_storytelling");
    expect(storytellingMigration).toContain("'story.manage'");
    expect(storytellingMigration).toContain("'edition.manage'");
    expect(storytellingMigration).toContain("auth.uid()");
    expect(anniversary).toContain("You are not authorized to perform this Anniversary operation");
  });

  it("binds reviewed publication and edits to exact Organizer scope and authoritative revision", () => {
    expect(anniversary).toContain("useAdminContext");
    expect(anniversary).toContain("input.editionId !== editionId || input.contextVersion !== contextVersion");
    expect(anniversary).toContain("pendingPublication.editionId");
    expect(anniversary).toContain("reviewed.contextVersion !== contextVersion");
    expect(anniversary).toContain("expectedRevision: story.revision");
    expect(anniversary).toContain("Organizer context changed after publication review");

    expect(storytellingMigration).toContain("if p_expected_revision is null or p_expected_revision <> v_story.revision then");
    expect(storytellingMigration).toContain("Storyline changed since this action was loaded. Refresh before continuing.");
  });

  it("surfaces receipts, replay recovery and scoped canonical refetch without optimistic truth", () => {
    expect(anniversary).toContain("lastReceipt.idempotentReplay");
    expect(anniversary).toContain("lastReceipt.executionId");
    expect(anniversary).toContain('["studio2-storytelling", execution.editionId]');
    expect(anniversary).toContain('["studio2-anniversary-engine"]');
    expect(anniversary).toContain("No optimistic milestone is shown before server acknowledgement");

    expect(storytelling).toContain("pendingStoryExecutionIds");
    expect(storytelling).toContain("idempotentReplay");
    expect(storytellingMigration).toContain("return v_existing.payload || jsonb_build_object('idempotentReplay', true)");
  });

  it("keeps risky publication behind explicit review and does not invent a second Anniversary backend", () => {
    expect(anniversary).toContain("<AdminConfirmSheet");
    expect(anniversary).toContain("Publish reviewed revision");
    expect(anniversary).toContain("Unpublish reviewed revision");
    expect(anniversary).toContain("canonical Storytelling operation contract");
    expect(anniversary).toContain("Historical edition dates remain a separate governed authority");
  });
});
