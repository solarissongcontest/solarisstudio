import { describe, expect, it } from "vitest";

import { SOLARIS_V6_DOMAINS, solarisV6Domain } from "@/lib/solaris-v6-domain-registry";
import { ORGANISATION_OS_V5_COUNTERPARTS } from "@/lib/organisation-os-v5-counterparts";
import {
  SOLARIS_V6_FEATURE_SURFACES,
  SOLARIS_V6_V5_COUNTERPART_IDS,
} from "@/lib/solaris-v6-surface-registry";

describe("Solaris Studio V6 canonical registries", () => {
  it("declares every minimum V6 canonical domain exactly once", () => {
    const required = [
      "edition",
      "delegation",
      "participation",
      "confirmation",
      "entry",
      "national-selection",
      "jury",
      "televote",
      "results",
      "publication",
      "notice",
      "acknowledgement",
      "task",
      "country-identity",
      "country-profile",
      "media",
      "rules",
      "integrity",
      "permissions",
      "live-show",
      "incident",
      "notification",
    ];

    const ids = SOLARIS_V6_DOMAINS.map((domain) => domain.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of required) expect(solarisV6Domain(id), id).not.toBeNull();
  });

  it("gives every domain one canonical write answer and explicit retirement criteria", () => {
    for (const domain of SOLARIS_V6_DOMAINS) {
      expect(domain.canonicalWriteModel.trim().length, domain.id).toBeGreaterThan(0);
      expect(domain.canonicalReadProjection.trim().length, domain.id).toBeGreaterThan(0);
      expect(domain.retirementCriteria.length, domain.id).toBeGreaterThan(0);
    }
  });

  it("does not leave an Organizer counterpart ambiguous", () => {
    for (const feature of SOLARIS_V6_FEATURE_SURFACES) {
      expect(solarisV6Domain(feature.canonicalDomain), feature.featureId).not.toBeNull();
      if (feature.organizerSurface === null) {
        expect(feature.noOrganizerCounterpartReason, feature.featureId).toBeTruthy();
      } else {
        expect(feature.noOrganizerCounterpartReason, feature.featureId).toBeNull();
      }
    }
  });

  it("keeps feature IDs unique and surfaces tied to canonical domains", () => {
    const ids = SOLARIS_V6_FEATURE_SURFACES.map((feature) => feature.featureId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of SOLARIS_V6_FEATURE_SURFACES) {
      expect(feature.sourceOfTruth).toBe(solarisV6Domain(feature.canonicalDomain)?.canonicalWriteModel);
    }
  });

  it("migrates every V5 counterpart obligation exactly once", () => {
    const expected = ORGANISATION_OS_V5_COUNTERPARTS.map((item) => item.id).sort();
    const mapped = SOLARIS_V6_FEATURE_SURFACES.flatMap((feature) => feature.v5CounterpartIds);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...SOLARIS_V6_V5_COUNTERPART_IDS].sort()).toEqual(expected);
  });
});
