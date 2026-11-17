import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const cutover = read("supabase/migrations/20261117190000_v3_s16_jury_window_r2_single_writer_cutover.sql");
const denials = read(".github/tests/v3-s16-jury-window-r2-single-writer.sql");
const originalR2 = read("supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql");
const organizer = read("src/components/admin/JuryVotingWindowControl.tsx");

describe("S16 P08 Jury window R2 single writer", () => {
  it("retains the original R2 command, edition lock, CAS and receipted replay", () => {
    expect(originalR2).toContain("v_change := public.admin_set_jury_voting_status");
    expect(cutover).toContain("create or replace function public.studio2_apply_jury_voting_status");
    expect(cutover).toContain("private.studio2_claim_operation");
    expect(cutover).toContain("'replayed'");
    expect(cutover).toContain("studio2-jury-window:");
    expect(cutover).toContain("p_expected_version <> v_current_version");
    expect(cutover).toContain("private.studio2_complete_operation");
    expect(cutover).not.toContain("v_change := public.admin_set_jury_voting_status(p_show_id, p_status);");
  });

  it("physically retires the service-role second writer without CASCADE", () => {
    expect(cutover).toContain("drop function public.admin_set_jury_voting_status(uuid,text) restrict;");
    expect(cutover).not.toMatch(/drop function public\.admin_set_jury_voting_status[^;]*cascade/i);
    expect(cutover).toContain("on conflict (show_id) do update");
    expect(cutover).toContain("update public.jury_voting_windows");
    expect(cutover).toContain("insert into public.jury_voting_windows");
    expect(cutover).toContain("studio2_jury_window_touch_edition_version");
    expect(cutover).toContain("public.v3_register_migration_contract");
  });

  it("checks real API-role invocation and preserves canonical Organizer preview/apply", () => {
    expect(denials).toContain("set local role");
    expect(denials).toContain("'anon','authenticated','service_role'");
    expect(denials).toContain("when undefined_function");
    expect(denials).toContain("studio2_apply_jury_voting_status");
    expect(organizer).toContain('rpc("studio2_jury_window_change_preview"');
    expect(organizer).toContain('rpc("studio2_apply_jury_voting_status"');
    expect(organizer).not.toContain('rpc("admin_set_jury_voting_status"');
  });
});
