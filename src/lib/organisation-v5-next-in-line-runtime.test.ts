import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 Next in Line runtime", () => {
  const migration = source(
    "supabase/migrations/20261003183000_organisation_os_v5_next_in_line_runtime.sql",
  );
  const route = source("src/routes/_authenticated/admin/next-in-line.tsx");

  it("defines one server-authoritative window state machine", () => {
    expect(migration).toContain("studio2_next_in_line_windows");
    expect(migration).toContain(
      "check (status in ('draft', 'scheduled', 'open', 'closed', 'cancelled'))",
    );
    expect(migration).toContain("studio2_next_in_line_transition_allowed");
    expect(migration).toContain(
      "when p_from = 'draft' then p_to in ('scheduled', 'open', 'cancelled')",
    );
    expect(migration).toContain(
      "when p_from = 'open' then p_to in ('closed', 'cancelled')",
    );
    expect(migration).toContain(
      "when p_from = 'cancelled' then p_to = 'draft'",
    );
  });

  it("previews and applies version-bound idempotent Organizer mutations", () => {
    expect(migration).toContain("studio2_next_in_line_window_change_preview");
    expect(migration).toContain("studio2_apply_next_in_line_window_change");
    expect(migration).toContain("'expectedVersion', v_version");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("'next_in_line.window.' || v_target");
  });

  it("keeps the public runtime closed unless the canonical window is effectively open", () => {
    expect(migration).toContain("private.studio2_next_in_line_window_is_open");
    expect(migration).toContain("and nil_window.status = 'open'");
    expect(migration).toContain(
      "and (nil_window.opens_at is null or nil_window.opens_at <= now())",
    );
    expect(migration).toContain(
      "and (nil_window.closes_at is null or nil_window.closes_at > now())",
    );
    expect(migration).toContain("raise exception 'Next in Line is closed'");
  });

  it("derives participant eligibility from accepted canonical selection state", () => {
    expect(migration).toContain("private.studio2_next_in_line_source_eligible");
    expect(migration).toContain("entry.review_status = 'accepted'");
    expect(migration).toContain("winner.review_status = 'accepted'");
    expect(migration).toContain("coalesce(winner.removed, false) = false");
    expect(migration).toContain("entry.id is distinct from nf.winning_entry_id");
  });

  it("exposes window controls through the Organizer mobile surface", () => {
    expect(route).toContain("studio2_next_in_line_admin_snapshot");
    expect(route).toContain("studio2_next_in_line_window_change_preview");
    expect(route).toContain("studio2_apply_next_in_line_window_change");
    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain('prepareWindowChange("scheduled")');
    expect(route).toContain('prepareWindowChange("open")');
    expect(route).toContain('prepareWindowChange("closed")');
    expect(route).toContain('prepareWindowChange("cancelled")');
    expect(route).toContain("Operator reason");
    expect(route).toContain("expectedVersion: preview.expectedVersion");
  });

  it("does not conflate Next in Line with SSC confirmation requirements", () => {
    expect(route).toContain(
      "A Next in Line response never creates a second confirmation requirement.",
    );
    expect(migration).not.toContain("studio2_confirmation_requirements");
  });
});
