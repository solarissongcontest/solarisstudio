import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_S7_PUBLICATION_AUTHORIZATION_EVIDENCE } from "./v3-s7-publication-authorization-evidence";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
  ),
  "utf8",
);

function previewBody() {
  const start = migration.indexOf(
    "create or replace function public.studio2_show_publication_change_preview(",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(
    "revoke all on function public.studio2_show_publication_change_preview",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S7 Publication authorization evidence", () => {
  it("declares exactly the three canonical Publication commands", () => {
    expect(V3_S7_PUBLICATION_AUTHORIZATION_EVIDENCE.map((item) => item.command)).toEqual([
      "publication.schedule",
      "publication.publish",
      "publication.hide",
    ]);
  });

  it("maps schedule and publish to release authority and hide to management authority", () => {
    const byCommand = Object.fromEntries(
      V3_S7_PUBLICATION_AUTHORIZATION_EVIDENCE.map((item) => [item.command, item]),
    );
    expect(byCommand["publication.schedule"]?.requiredCapability).toBe("publishing.publish");
    expect(byCommand["publication.publish"]?.requiredCapability).toBe("publishing.publish");
    expect(byCommand["publication.hide"]?.requiredCapability).toBe("publishing.manage");
  });

  it("proves the shared preview resolves show edition before target-sensitive capability checks", () => {
    const preview = previewBody();
    const showRead = preview.indexOf("from public.shows");
    const unknownShow = preview.indexOf("Show not found", showRead);
    const targetCheck = preview.indexOf("v_target not in ('draft', 'scheduled', 'public', 'hidden')");
    const publishBranch = preview.indexOf("if v_target in ('public', 'scheduled') then", targetCheck);
    const releaseCapability = preview.indexOf(
      "studio2_access_allowed('publishing.publish', v_show.edition_id, false)",
      publishBranch,
    );
    const manageCapability = preview.indexOf(
      "studio2_access_allowed('publishing.manage', v_show.edition_id, false)",
      releaseCapability,
    );

    expect(showRead).toBeGreaterThanOrEqual(0);
    expect(unknownShow).toBeGreaterThan(showRead);
    expect(targetCheck).toBeGreaterThan(unknownShow);
    expect(publishBranch).toBeGreaterThan(targetCheck);
    expect(releaseCapability).toBeGreaterThan(publishBranch);
    expect(manageCapability).toBeGreaterThan(releaseCapability);
  });

  it("keeps direct browser writes blocked so the capability branch cannot be bypassed", () => {
    expect(migration).toContain("studio2_guard_direct_show_publication_write");
    expect(migration).toContain("Show publication must use the Organisation OS V5 publication operation contract.");
    expect(migration).toContain("using errcode = '42501'");
  });

  it("requires negative-path and evidence coverage for every command", () => {
    for (const item of V3_S7_PUBLICATION_AUTHORIZATION_EVIDENCE) {
      expect(item.scope).toBe("show");
      expect(item.objectResolution).toBe("show -> edition");
      expect(item.serverBoundary).toBe("public.studio2_apply_show_publication_change");
      expect(item.negativePaths.length).toBeGreaterThanOrEqual(4);
      expect(item.evidence).toContain(
        "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
      );
    }
  });
});
