import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017103000_v3_s5_preference_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-preference-consequences-rehearsal.sh",
);

describe("System V3 S5 personal preference consequences", () => {
  it("adds a server-owned monotonic follow revision", () => {
    expect(migration).toContain("add column if not exists revision bigint");
    expect(migration).toContain("new.revision := old.revision + 1");
    expect(migration).toContain("new.revision := old.revision");
    expect(migration).toContain("fan_follows_revision_check");
  });

  it("emits only meaningful follow preference transitions", () => {
    expect(migration).toContain("after insert or update or delete");
    expect(migration).toContain("old.notification_level is not distinct from new.notification_level");
    expect(migration).toContain("'preference.changed'");
    expect(migration).toContain("'preference.save'");
    expect(migration).toContain("'preference.remove'");
    expect(migration).toContain("v_revision := old.revision + 1");
  });

  it("binds each change to an R0 operation receipt and keeps user identity out of event payloads", () => {
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("'R0'");
    expect(migration).toContain("public.studio2_operation_receipts");
    expect(migration).toContain("'following', v_following");
    expect(migration).not.toContain("'profileId', v_profile_id,\n      'following'");
    expect(migration).not.toContain("'email'");
    expect(migration).not.toContain("'displayName'");
  });

  it("does not invent a background consumer for private follow state", () => {
    expect(migration).toContain("array[]::text[]");
    expect(v3DomainConsequence("preference.changed")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("preference.changed")?.notificationEffects).toEqual([]);
  });

  it("marks the canonical preference consequence event-backed", () => {
    expect(v3DomainConsequence("preference.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("preference.changed")?.ownerDomain).toBe("personal-preference");
  });

  it("rehearses follow, semantic update, no-op retry and removal locally", () => {
    expect(rehearsal).toContain("set_fan_follow");
    expect(rehearsal).toContain("follow insert did not emit preference.changed");
    expect(rehearsal).toContain("semantic no-op emitted a duplicate preference.changed");
    expect(rehearsal).toContain("unfollow did not emit preference.changed");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
