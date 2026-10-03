import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ORGANISATION_OS_V5_COUNTERPARTS } from "./organisation-os-v5-counterparts";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Organisation OS V5 feature counterparts", () => {
  it("keeps every declared participant-facing feature paired with an organizer surface", () => {
    expect(ORGANISATION_OS_V5_COUNTERPARTS.length).toBeGreaterThanOrEqual(9);
    for (const item of ORGANISATION_OS_V5_COUNTERPARTS) {
      expect(item.participantSurface, item.id).toMatch(/^\//);
      expect(item.organizerSurface, item.id).toMatch(/^\/admin\//);
      expect(item.rationale.trim().length, item.id).toBeGreaterThan(20);
    }
  });

  it("ships dedicated organizer routes for the new V5 operational counterparts", () => {
    for (const path of [
      "src/routes/_authenticated/admin/tasks.tsx",
      "src/routes/_authenticated/admin/next-in-line.tsx",
      "src/routes/_authenticated/admin/system-operations.tsx",
      "src/routes/_authenticated/admin/community-moderation.tsx",
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
