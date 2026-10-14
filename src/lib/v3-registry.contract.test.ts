import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_FEATURE_FLAGS } from "./feature-flags";
import { SOLARIS_V6_DOMAINS } from "./solaris-v6-domain-registry";
import { SOLARIS_V6_FEATURE_SURFACES } from "./solaris-v6-surface-registry";
import {
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CLASSIFICATION_BY_ID,
  V3_ORGANIZER_DISCOVERED_IDS,
  V3_ORGANIZER_FEATURE_FLAGS,
} from "./v3-organizer-capability-registry";
import {
  V3_PUBLIC_CAPABILITY_REGISTRY,
  V3_PUBLIC_FEATURE_FLAGS,
  V3_PUBLIC_SOURCE_SURFACE_IDS,
} from "./v3-public-capability-registry";
import {
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
  v3SystemDomain,
} from "./v3-system-domain-registry";

function unique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function routeMatches(pattern: string, route: string) {
  if (pattern === route) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(route);
}

describe("Solaris V3 migration registries", () => {
  it("classifies every existing V6 cross-surface product capability exactly once", () => {
    const discovered = SOLARIS_V6_FEATURE_SURFACES.map((item) => item.featureId).sort();
    const mapped = [...V3_PUBLIC_SOURCE_SURFACE_IDS].sort();
    expect(mapped).toEqual(discovered);
    expect(mapped.length).toBe(new Set(mapped).size);
  });

  it("classifies every Organizer specialist-directory capability exactly once", () => {
    const discovered = [...V3_ORGANIZER_DISCOVERED_IDS].sort();
    const classified = Object.keys(V3_ORGANIZER_CLASSIFICATION_BY_ID).sort();
    const registered = V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => item.legacyId).sort();

    expect(classified).toEqual(discovered);
    expect(registered).toEqual(discovered);
    expect(unique(registered)).toEqual(registered);
  });

  it("maps every V3 feature flag to Public or Organizer ownership", () => {
    const expected = SOLARIS_FEATURE_FLAGS.filter((flag) => flag.startsWith("solaris_app_v3")).sort();
    const mapped = unique([
      ...V3_PUBLIC_FEATURE_FLAGS,
      ...V3_ORGANIZER_FEATURE_FLAGS,
    ]);
    expect(mapped).toEqual(expected);
  });

  it("keeps PWA shortcuts inside explicitly registered Public capabilities", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/site.webmanifest"), "utf8"),
    ) as { shortcuts?: Array<{ url?: string }> };
    const registeredRoutes = V3_PUBLIC_CAPABILITY_REGISTRY.flatMap((item) => [
      ...item.legacyRoutes,
      item.targetRoute,
    ]);

    for (const shortcut of manifest.shortcuts ?? []) {
      expect(shortcut.url, "PWA shortcut is missing a URL").toBeTruthy();
      expect(
        registeredRoutes.some((pattern) => routeMatches(pattern, shortcut.url!)),
        `Unregistered PWA shortcut: ${shortcut.url}`,
      ).toBe(true);
    }
  });

  it("preserves every V6 canonical domain in the V3 System ownership registry", () => {
    const expected = SOLARIS_V6_DOMAINS.map((domain) => domain.id).sort();
    const registered = new Set(V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain));
    for (const id of expected) expect(registered.has(id), id).toBe(true);
  });

  it("gives every required System V3 concept exactly one live domain owner", () => {
    expect(Object.keys(V3_SYSTEM_CONCEPT_OWNER).sort()).toEqual(
      [...V3_REQUIRED_SYSTEM_CONCEPTS].sort(),
    );
    for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) {
      const owner = V3_SYSTEM_CONCEPT_OWNER[concept];
      expect(owner, concept).toBeTruthy();
      expect(v3SystemDomain(owner), `${concept} -> ${owner}`).not.toBeNull();
    }
  });

  it("keeps System domain IDs unique and never disguises an unaudited physical store as verified", () => {
    const ids = V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain);
    expect(new Set(ids).size).toBe(ids.length);

    for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
      expect(domain.canonicalStore.trim(), domain.domain).not.toBe("");
      expect(domain.authoritativeService.trim(), domain.domain).not.toBe("");
      if (domain.physicalAuditStatus === "verified") {
        expect(domain.primaryTables.length, domain.domain).toBeGreaterThan(0);
      }
    }
  });

  it("contains no implicit UNKNOWN migration outcome", () => {
    for (const item of V3_PUBLIC_CAPABILITY_REGISTRY) {
      expect(["redesign", "merge", "contextualize", "restrict", "retire"]).toContain(
        item.classification,
      );
      expect(item.targetRoute.trim(), item.id).not.toBe("");
      expect(item.acceptanceScenarioId.trim(), item.id).not.toBe("");
    }
    for (const item of V3_ORGANIZER_CAPABILITY_REGISTRY) {
      expect(["redesign", "merge", "contextualize", "restrict", "retire"]).toContain(
        item.classification,
      );
      expect(item.targetRoute.trim(), item.legacyId).not.toBe("");
      expect(item.ownerCapability.trim(), item.legacyId).not.toBe("");
    }
  });
});
