import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117215000_v3_integrity_appeal_revision_readback.sql"), "utf8");

describe("Integrity appeal CAS readback parity", () => {
  it("returns guarded appeal versions from both existing organizer projections", () => {
    expect(source).toContain("function public.admin_integrity_case_resolution(_case_id uuid)");
    expect(source).toContain("function public.admin_integrity_appeals()");
    expect(source.match(/'version', a\.version/g)).toHaveLength(2);
    expect(source.match(/public\.integrity_is_organizer\(\)/g)).toHaveLength(2);
    expect(source).not.toContain("grant execute on function public.admin_integrity_appeals() to anon");
    expect(source).not.toContain("grant execute on function public.admin_integrity_case_resolution(uuid) to anon");
  });
});
