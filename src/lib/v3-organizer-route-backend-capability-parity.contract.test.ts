import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { capabilityForOrganizerPath } from "./permission-route-map";

const migration = (filename: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", filename), "utf8");

describe("Organizer route visibility matches authoritative read capability", () => {
  it("requires Next in Line management authority because the admin snapshot is capability-gated", () => {
    const sql = migration("20261003183000_organisation_os_v5_next_in_line_runtime.sql");

    expect(sql).toContain("create or replace function public.studio2_next_in_line_admin_snapshot");
    expect(sql).toContain("studio2_access_allowed('next_in_line.manage', p_edition_id, false)");
    expect(capabilityForOrganizerPath("/admin/next-in-line")).toBe("next_in_line.manage");
  });

  it("requires delegation management authority because Country Accounts cannot even list under delegation.read", () => {
    const sql = migration("20260916033414_permission_engine_v2_country_admin_rpc_cutover.sql");

    expect(sql).toContain("create or replace function public.admin_country_accounts()");
    expect(sql).toContain("studio2_access_allowed('delegation.manage', null, false)");
    expect(capabilityForOrganizerPath("/admin/country-accounts")).toBe("delegation.manage");
  });
});
