import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261005043000_pr450_review_blocker_repairs.sql",
);
const server = source("src/server.ts");

describe("PR #450 review-blocker repairs", () => {
  it("guards confirmation destination changes as well as inserts", () => {
    expect(migration).toContain(
      "before insert or update of country, edition_id on public.submissions",
    );
    expect(migration).toContain("studio2-confirmation-requirement:");
    expect(migration).toContain("for update;");
  });

  it("retains system-job truth and counts reviewed jury ballots as present", () => {
    expect(migration).toContain(
      "perform private.studio2_reconcile_system_job_tasks();",
    );
    expect(migration).toContain(
      "perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);",
    );
    expect(migration).toContain(
      "ballot.status in ('submitted', 'needs_review', 'valid')",
    );
  });

  it("invalidates result approvals and serializes publication on one show lock", () => {
    expect(migration.match(/studio2-results:/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain(
      "calculation_version = public.studio2_result_operations.calculation_version + 1",
    );
    expect(migration).toContain("reviewed_version = null");
    expect(migration).toContain("locked_version = null");
    expect(migration).toContain("reveal_ready_version = null");
    expect(migration).toContain("studio2_serialize_show_publication_with_results");
    expect(migration).toContain("private.studio2_result_release_ready(new.id)");
  });

  it("projects canonical editions without allowing Confirmations to clone them", () => {
    expect(migration).toContain("from public.editions e");
    expect(migration).toContain(
      "Confirmations cannot create canonical editions. Create the edition in Organizer edition management first.",
    );
  });

  it("aligns upload preparation with finalizer limits and Organizer authorization", () => {
    expect(migration).toContain("p_size > 5242880");
    expect(migration).toContain(
      "public.studio2_access_allowed('edition.manage', null, false)",
    );
    expect(migration).toContain("v_mime <> 'font/woff2'");
    expect(migration).not.toContain("p_size > 15728640");
    expect(migration).not.toContain("p_size > 8388608");
  });

  it("versions organizer push delivery dedupe keys when a task reopens", () => {
    expect(migration).toContain("activation_version bigint not null default 1");
    expect(migration).toContain(
      "new.activation_version := old.activation_version + 1",
    );
    expect(migration).toContain(":activation-");
    expect(migration).toContain("before insert on public.notification_deliveries");
  });

  it("requires database-enforced read-only state before production maintenance inspection", () => {
    expect(migration).toContain("public.solaris_maintenance_read_only_probe()");
    expect(server).toContain("maintenanceDatabaseIsReadOnly");
    expect(server).toContain("solaris_maintenance_read_only_probe");
    expect(server).toContain(
      "Maintenance inspection stays locked until the Solaris database is explicitly Read-only or in Maintenance.",
    );
    expect(server).toContain("const localE2EBypass = hasLocalE2EMaintenanceBypass(request)");
    expect(server).toContain(
      "maintenanceAdminBypass &&\n          isDocumentNavigation(request) &&\n          !(await maintenanceDatabaseIsReadOnly(env))",
    );
  });

  it("does not touch the protected Search implementation", () => {
    const protectedPaths = [
      "src/components/search/SolarisSearchField.tsx",
      "src/components/search/PublicCommandPalette.tsx",
    ];
    for (const path of protectedPaths) {
      expect(migration).not.toContain(path);
      expect(server).not.toContain(path);
    }
  });
});
