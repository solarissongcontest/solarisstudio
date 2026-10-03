import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { mySolarisNavigationItems } from "./my-solaris-navigation";
import { ORGANISATION_OS_V5_COUNTERPARTS } from "./organisation-os-v5-counterparts";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Organisation OS V5 feature counterparts", () => {
  it("audits every MySolaris navigation section instead of relying on a hand-picked subset", () => {
    const audited = new Set(
      ORGANISATION_OS_V5_COUNTERPARTS
        .filter((item) => item.id.startsWith("mysolaris."))
        .map((item) => item.id.replace(/^mysolaris\./, "")),
    );
    const navigation = mySolarisNavigationItems();

    expect([...audited].sort()).toEqual(navigation.map((item) => item.id).sort());

    for (const item of navigation) {
      const audit = ORGANISATION_OS_V5_COUNTERPARTS.find(
        (candidate) => candidate.id === `mysolaris.${item.id}`,
      );
      expect(audit?.participantSurface, item.id).toBe(item.to);
    }
  });

  it("requires every audited participant/public feature to declare a counterpart or deliberate none", () => {
    expect(ORGANISATION_OS_V5_COUNTERPARTS.length).toBeGreaterThanOrEqual(24);

    const ids = new Set<string>();
    for (const item of ORGANISATION_OS_V5_COUNTERPARTS) {
      expect(ids.has(item.id), `duplicate counterpart id: ${item.id}`).toBe(false);
      ids.add(item.id);

      expect(item.participantSurface, item.id).toMatch(/^\//);
      expect(item.rationale.trim().length, item.id).toBeGreaterThan(30);

      if (item.kind === "none") {
        expect(item.organizerSurface, item.id).toBeNull();
      } else {
        expect(item.organizerSurface, item.id).not.toBeNull();
        expect(item.organizerSurface!, item.id).toMatch(
          /^\/(admin|confirmations\/admin|televoting\/admin)/,
        );
      }
    }

    expect(
      ORGANISATION_OS_V5_COUNTERPARTS.filter((item) => item.kind === "none").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("covers every critical participation workflow with an explicit Organizer counterpart", () => {
    const expected = [
      "participation.confirmations",
      "participation.jury",
      "participation.televoting",
      "participation.next-in-line",
      "participation.integrity-report",
    ];

    for (const id of expected) {
      const item = ORGANISATION_OS_V5_COUNTERPARTS.find((candidate) => candidate.id === id);
      expect(item, id).toBeTruthy();
      expect(item?.kind, id).not.toBe("none");
      expect(item?.organizerSurface, id).toBeTruthy();
    }
  });

  it("ships dedicated Organizer routes for the new V5 operational counterparts", () => {
    for (const path of [
      "src/routes/_authenticated/admin/tasks.tsx",
      "src/routes/_authenticated/admin/next-in-line.tsx",
      "src/routes/_authenticated/admin/system-operations.tsx",
      "src/routes/_authenticated/admin/community-moderation.tsx",
      "src/routes/_authenticated/admin/access-permissions.tsx",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
    }
  });

  it("keeps delegation participant/profile/appearance counterparts inside the country cockpit", () => {
    const country = source("src/routes/_authenticated/admin/countries.$countryId.tsx");
    for (const tab of [
      '"participant-view"',
      '"public-profile"',
      '"appearance"',
      '"next-in-line"',
    ]) {
      expect(country).toContain(tab);
    }
    expect(country).toContain("Read-only organizer inspection");
    expect(country).toContain("without impersonating the country account");
  });

  it("keeps privacy-safe system and fan moderation boundaries explicit", () => {
    const diagnostics = source(
      "supabase/migrations/20261002193000_organisation_os_v5_system_diagnostics.sql",
    );
    const moderation = source(
      "supabase/migrations/20261002200000_organisation_os_v5_community_moderation.sql",
    );

    expect(diagnostics).toContain("admin_system_runtime_health");
    expect(diagnostics).not.toContain("'endpoint'");
    expect(diagnostics).not.toContain("'p256dh'");
    expect(diagnostics).not.toContain("'auth_secret'");

    expect(moderation).toContain("moderation_hidden_at");
    expect(moderation).toContain("profile.moderation_hidden_at is null");
    expect(moderation).toContain("hide_fan_profile_identity");
    expect(moderation).not.toContain("update public.prediction_scores");
  });
});
