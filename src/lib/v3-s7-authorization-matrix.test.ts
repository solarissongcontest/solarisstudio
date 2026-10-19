import { describe, expect, it } from "vitest";

import { capabilityForOrganizerPath } from "./permission-route-map";
import {
  hasCapability,
  SOLARIS_CAPABILITIES,
  type CapabilityGrant,
  type SolarisCapability,
} from "./permissions-v2";
import { SOLARIS_ROLE_PRESETS } from "./role-presets";
import {
  authorizationPolicyForCapability,
  V3_S7_AUTHORIZATION_MATRIX,
} from "./v3-s7-authorization-matrix";

const EDITION_A = "00000000-0000-4000-8000-00000000e001";
const EDITION_B = "00000000-0000-4000-8000-00000000e002";
const NOW = new Date("2026-10-19T21:30:00.000Z");

function grant(
  capability: SolarisCapability,
  editionId?: string | null,
  expiresAt?: string | null,
): CapabilityGrant {
  return { capability, editionId, expiresAt };
}

describe("V3 S7 generated authorization matrix", () => {
  it("covers every canonical capability exactly once and nothing else", () => {
    const catalog = [...SOLARIS_CAPABILITIES].sort();
    const matrix = V3_S7_AUTHORIZATION_MATRIX.map((row) => row.capability).sort();

    expect(matrix).toEqual(catalog);
    expect(new Set(matrix).size).toBe(catalog.length);
  });

  it("fails closed through lookup if a capability policy is absent", () => {
    for (const capability of SOLARIS_CAPABILITIES) {
      expect(authorizationPolicyForCapability(capability).capability).toBe(capability);
    }

    expect(() =>
      authorizationPolicyForCapability("future.unknown" as SolarisCapability),
    ).toThrow("Missing S7 authorization policy");
  });

  it("declares object scope and separate domain safeguards for every capability", () => {
    for (const row of V3_S7_AUTHORIZATION_MATRIX) {
      expect(row.domain.length).toBeGreaterThan(0);
      expect(row.objectTypes.length).toBeGreaterThan(0);
      expect(row.domainSafeguards.length).toBeGreaterThan(0);
      expect(["global", "edition", "either"]).toContain(row.operationScope);
    }
  });

  it("marks every mutating capability as requiring a server-authoritative mutation boundary", () => {
    for (const row of V3_S7_AUTHORIZATION_MATRIX) {
      expect(row.serverAuthoritativeMutationRequired).toBe(row.effect !== "read");
    }
  });

  it("keeps consequential publish, sanction and platform-admin operations at tier 4", () => {
    for (const capability of [
      "edition.archive",
      "results.publish",
      "integrity.sanction",
      "publishing.publish",
      "system.manage",
      "permissions.manage",
    ] as const) {
      const row = authorizationPolicyForCapability(capability);
      expect(row.riskTier).toBe(4);
      expect(row.serverAuthoritativeMutationRequired).toBe(true);
    }
  });

  it("generates exact-edition grant behavior for every edition-scoped capability", () => {
    for (const row of V3_S7_AUTHORIZATION_MATRIX.filter(
      (candidate) => candidate.operationScope === "edition",
    )) {
      const globalGrant = grant(row.capability);
      const matchingGrant = grant(row.capability, EDITION_A);
      const wrongEditionGrant = grant(row.capability, EDITION_B);
      const expiredGrant = grant(
        row.capability,
        EDITION_A,
        "2026-10-19T21:29:59.000Z",
      );

      expect(hasCapability([globalGrant], row.capability, { editionId: EDITION_A, now: NOW })).toBe(
        true,
      );
      expect(
        hasCapability([matchingGrant], row.capability, { editionId: EDITION_A, now: NOW }),
      ).toBe(true);
      expect(
        hasCapability([wrongEditionGrant], row.capability, { editionId: EDITION_A, now: NOW }),
      ).toBe(false);
      expect(
        hasCapability([expiredGrant], row.capability, { editionId: EDITION_A, now: NOW }),
      ).toBe(false);
      expect(hasCapability([matchingGrant], row.capability, { now: NOW })).toBe(false);
    }
  });

  it("does not let an edition-scoped grant silently become a global authorization", () => {
    for (const row of V3_S7_AUTHORIZATION_MATRIX.filter(
      (candidate) => candidate.operationScope === "global",
    )) {
      const globalGrant = grant(row.capability);
      const scopedGrant = grant(row.capability, EDITION_A);

      expect(hasCapability([globalGrant], row.capability, { now: NOW })).toBe(true);
      expect(hasCapability([scopedGrant], row.capability, { now: NOW })).toBe(false);
    }
  });

  it("supports intentionally dual-scope capabilities without widening scoped grants", () => {
    for (const row of V3_S7_AUTHORIZATION_MATRIX.filter(
      (candidate) => candidate.operationScope === "either",
    )) {
      const globalGrant = grant(row.capability);
      const scopedGrant = grant(row.capability, EDITION_A);

      expect(hasCapability([globalGrant], row.capability, { now: NOW })).toBe(true);
      expect(hasCapability([globalGrant], row.capability, { editionId: EDITION_A, now: NOW })).toBe(
        true,
      );
      expect(hasCapability([scopedGrant], row.capability, { now: NOW })).toBe(false);
      expect(
        hasCapability([scopedGrant], row.capability, { editionId: EDITION_A, now: NOW }),
      ).toBe(true);
      expect(
        hasCapability([scopedGrant], row.capability, { editionId: EDITION_B, now: NOW }),
      ).toBe(false);
    }
  });

  it("keeps every role-preset capability inside the canonical S7 matrix", () => {
    const matrixCapabilities = new Set(
      V3_S7_AUTHORIZATION_MATRIX.map((row) => row.capability),
    );

    for (const capabilities of Object.values(SOLARIS_ROLE_PRESETS)) {
      for (const capability of capabilities) {
        expect(matrixCapabilities.has(capability)).toBe(true);
      }
    }
  });

  it.each([
    ["/admin/access-permissions", "permissions.read"],
    ["/admin/feature-rollout", "rollout.read"],
    ["/admin/communications", "communications.read"],
    ["/admin/rules-manager", "rules.read"],
    ["/admin/integrity-evidence", "integrity.read"],
    ["/admin/results-reveal", "results.preview"],
    ["/admin/jury/ssc-21", "voting.read"],
    ["/admin/broadcast-rundown", "broadcast.read"],
    ["/admin/storytelling", "story.read"],
    ["/admin/media-assets", "publishing.read"],
    ["/admin/hosts", "host.read"],
    ["/admin/entries/ssc-21", "entry.read_private"],
    ["/admin/delegations", "confirmation.read"],
    ["/admin/countries", "delegation.read"],
    ["/admin/operations", "edition.read"],
  ] as const)("maps Organizer route %s into an S7-covered capability", (path, expected) => {
    const capability = capabilityForOrganizerPath(path);
    expect(capability).toBe(expected);
    expect(capability && authorizationPolicyForCapability(capability).capability).toBe(expected);
  });
});
