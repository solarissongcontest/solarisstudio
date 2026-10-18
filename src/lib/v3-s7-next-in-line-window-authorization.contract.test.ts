import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3AuthorizationRequirement } from "./v3-authorization-requirement-registry";

const runtime = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003183000_organisation_os_v5_next_in_line_runtime.sql",
  ),
  "utf8",
);
const runtimeContract = readFileSync(
  resolve(process.cwd(), "src/lib/organisation-v5-next-in-line-runtime.test.ts"),
  "utf8",
);

function applyBody() {
  const marker = "create or replace function public.studio2_apply_next_in_line_window_change(";
  const start = runtime.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = runtime.indexOf(
    "\nrevoke all on function public.studio2_apply_next_in_line_window_change(",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return runtime.slice(start, end);
}

function previewBody() {
  const marker = "create or replace function public.studio2_next_in_line_window_change_preview(";
  const start = runtime.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = runtime.indexOf(
    "\nrevoke all on function public.studio2_next_in_line_window_change_preview(",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return runtime.slice(start, end);
}

describe("System V3 S7 Next in Line window authorization", () => {
  it("verifies open and close against one edition-scoped capability boundary", () => {
    for (const command of ["next_in_line.open", "next_in_line.close"]) {
      expect(v3AuthorizationRequirement(command)).toMatchObject({
        ownerDomain: "next-in-line",
        state: "verified",
        authorizationModel: "capability",
        requiredCapability: "next_in_line.manage",
        scope: "edition",
        objectResolution: "edition -> one versioned Next in Line window",
        serverBoundary: "public.studio2_apply_next_in_line_window_change",
        serviceRoleAllowed: true,
      });
    }
  });

  it("keeps review declared until its own mutation boundary has evidence", () => {
    expect(v3AuthorizationRequirement("next_in_line.review")).toMatchObject({
      ownerDomain: "next-in-line",
      state: "declared",
      authorizationModel: null,
      requiredCapability: null,
      serverBoundary: null,
    });
  });

  it("checks next_in_line.manage and edition existence at the preview boundary", () => {
    const preview = previewBody();
    const capability = preview.indexOf(
      "studio2_access_allowed('next_in_line.manage', p_edition_id, false)",
    );
    const edition = preview.indexOf(
      "not exists (select 1 from public.editions where id = p_edition_id)",
    );

    expect(capability).toBeGreaterThanOrEqual(0);
    expect(edition).toBeGreaterThan(capability);
    expect(preview).toContain("Missing Solaris capability: next_in_line.manage");
    expect(preview).toContain("Edition not found");
    expect(preview).toContain("Unknown Next in Line window state");
  });

  it("fails closed on invalid transitions and invalid time windows", () => {
    const preview = previewBody();
    expect(preview).toContain("private.studio2_next_in_line_transition_allowed");
    expect(preview).toContain("Invalid Next in Line transition:");
    expect(preview).toContain("Next in Line closing time must be after opening time");
    expect(preview).toContain("Scheduled Next in Line requires an opening time");
    expect(preview).toContain("Cannot open Next in Line with an expired closing time");
  });

  it("locks the exact edition window and rejects stale versions before mutation", () => {
    const apply = applyBody();
    const loadWindow = apply.indexOf("from public.studio2_next_in_line_windows");
    const editionPredicate = apply.indexOf("where edition_id = p_edition_id", loadWindow);
    const lock = apply.indexOf("for update;", editionPredicate);
    const versionConflict = apply.indexOf(
      "coalesce(v_window.version, 0) is distinct from p_expected_version",
      lock,
    );

    expect(loadWindow).toBeGreaterThanOrEqual(0);
    expect(editionPredicate).toBeGreaterThan(loadWindow);
    expect(lock).toBeGreaterThan(editionPredicate);
    expect(versionConflict).toBeGreaterThan(lock);
    expect(apply).toContain(
      "Next in Line state changed since this preview was loaded. Refresh before continuing.",
    );
  });

  it("requires an operator reason and binds idempotency to the edition transition", () => {
    const apply = applyBody();
    expect(apply).toContain("length(v_reason) < 5");
    expect(apply).toContain("A Next in Line change reason of at least 5 characters is required");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'next_in_line.window.' || v_target");
    expect(apply).toContain("'editionId', p_edition_id");
    expect(apply).toContain("'fromStatus', v_current_status");
    expect(apply).toContain("'toStatus', v_target");
    expect(apply).toContain("'expectedVersion', p_expected_version");
  });

  it("writes only the edition-keyed canonical window and audits the change", () => {
    const apply = applyBody();
    expect(apply).toContain("insert into public.studio2_next_in_line_windows (");
    expect(apply).toContain("update public.studio2_next_in_line_windows");
    expect(apply).toContain("where edition_id = p_edition_id");
    expect(apply).toContain("insert into public.admin_audit_log (");
    expect(apply).toContain("'next_in_line_window_changed'");
    expect(apply).toContain("return private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("denies anonymous execution and keeps trusted authenticated/service callers explicit", () => {
    expect(runtime).toContain(
      "revoke all on function public.studio2_apply_next_in_line_window_change(\n  uuid, text, boolean, timestamptz, timestamptz, text, uuid, text, bigint\n) from public, anon;",
    );
    expect(runtime).toContain(
      "grant execute on function public.studio2_apply_next_in_line_window_change(\n  uuid, text, boolean, timestamptz, timestamptz, text, uuid, text, bigint\n) to authenticated, service_role;",
    );
  });

  it("retains the existing state-machine and Organizer wiring regression evidence", () => {
    expect(runtimeContract).toContain("defines one server-authoritative window state machine");
    expect(runtimeContract).toContain("previews and applies version-bound idempotent Organizer mutations");
    expect(runtimeContract).toContain('prepareWindowChange(\"open\")');
    expect(runtimeContract).toContain('prepareWindowChange(\"closed\")');
    expect(runtimeContract).toContain("expectedVersion: preview.expectedVersion");
  });
});
