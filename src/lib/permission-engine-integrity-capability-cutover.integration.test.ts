import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_integrity_capability_cutover.sql"),
);
if (!migrationName) throw new Error("Integrity capability cutover migration missing");

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

describe("Integrity and Rules capability cutover", () => {
  it("maps protected work to explicit integrity and rules capabilities", () => {
    for (const capability of [
      "integrity.read",
      "integrity.manage",
      "integrity.sanction",
      "rules.read",
      "rules.edit",
      "rules.publish",
    ]) {
      expect(migration).toContain(`'${capability}'`);
    }
  });

  it("requires capability-qualified reviewers instead of legacy Organizer rows", () => {
    expect(migration).toContain(
      "private.studio2_user_has_capability(_user_id, 'integrity.manage', null)",
    );
    expect(migration).toContain(
      "private.studio2_user_has_capability(_user_id, 'integrity.sanction', null)",
    );
    expect(migration).not.toContain("Reviewer must be an organizer");
    expect(migration).not.toContain("Appeal reviewer must be an organizer");
  });

  it("retires the shared Integrity Organizer helper", () => {
    expect(migration).toContain("drop function public.integrity_is_organizer();");
    expect(migration).toContain("Live integrity Organizer helper references remain");
  });
});
