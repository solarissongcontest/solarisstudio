import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/shows/$slug.tsx");
const adapter = source("src/lib/show-runtime-command.ts");
const migration = source("supabase/migrations/20261027211500_v3_show_runtime_authority.sql");

describe("V3 Organizer Show Mode production review", () => {
  it("reviews Show Mode changes instead of mutating directly from the editor button", () => {
    expect(route).toContain("PendingShowModeReview");
    expect(route).toContain("reviewShowMode");
    expect(route).toContain('onClick={reviewShowMode}');
    expect(route).toContain('confirmationText={pendingShowModeReview?.showName}');
    expect(route).not.toContain('onClick={() => void saveShowMode()}');
  });

  it("captures exact edition/show identity, runtime revision and before-after production state", () => {
    expect(route).toContain("editionId: edition.id");
    expect(route).toContain("showId: showModeTarget.id");
    expect(route).toContain("showName: showModeTarget.name");
    expect(route).toContain("const revision = showRuntimeRevision(showModeTarget.broadcast_config)");
    expect(route).toContain("before: showModeSnapshot(current, revision)");
    expect(route).toContain("after: showModeSnapshot(next, revision)");
  });

  it("re-reads exact show state then commits through server CAS authority", () => {
    expect(route).toContain('.select("id,edition_id,name,broadcast_config")');
    expect(route).toContain('.eq("id", review.showId)');
    expect(route).toContain("showRuntimeRevision(raw)");
    expect(route).toContain("sameShowMode(showModeSnapshot(current, currentRevision), review.before)");
    expect(route).toContain("Show Mode changed while this review was open. Nothing was applied.");
    expect(route).toContain("await applyShowRuntimeChange({");
    expect(route).toContain("expectedRevision: review.before.revision");
    expect(route).not.toContain('.update({\n          broadcast_config:');
  });

  it("provides idempotent lost-response recovery and atomic show.changed evidence", () => {
    expect(adapter).toContain('client.rpc("v3_apply_show_runtime_change", args)');
    expect(adapter).toContain("response = await client.rpc(\"v3_apply_show_runtime_change\", args)");
    expect(adapter).toContain("p_idempotency_key: `show-runtime:${operationId}`");
    expect(adapter).toContain("p_expected_status: expectedStatus");
    expect(migration).toContain("'show.transition'");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("'lifecycle_transitioned'");
    expect(migration).toContain("using errcode = '40001', message = 'STATE_CHANGED'");
    expect(migration).toContain("message = 'ILLEGAL_SHOW_TRANSITION'");
    expect(migration).toContain("create trigger v3_guard_show_runtime_authority");
  });
});
