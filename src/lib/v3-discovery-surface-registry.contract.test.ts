import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";
import {
  V3_NOTIFICATION_CATEGORY_REGISTRY,
  V3_NOTIFICATION_PROVIDER_REGISTRY,
} from "./v3-notification-provider-registry";
import { V3_SEARCH_PROVIDER_REGISTRY } from "./v3-search-provider-registry";
import { v3SystemDomain } from "./v3-system-domain-registry";

const publicCapabilityIds = new Set(V3_PUBLIC_CAPABILITIES.map((item) => item.id));

function sourceEvidence(value: string) {
  const [path, token] = value.split("#", 2);
  if (!path.startsWith("src/") && !path.startsWith("supabase/") && !path.startsWith("public/")) {
    return null;
  }
  return { path, token: token || null };
}

describe("V3 non-route capability discovery", () => {
  it("attaches every search provider to a live domain and registered Public capability", () => {
    const ids = V3_SEARCH_PROVIDER_REGISTRY.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const provider of V3_SEARCH_PROVIDER_REGISTRY) {
      expect(v3SystemDomain(provider.ownerDomain), provider.id).not.toBeNull();
      expect(publicCapabilityIds.has(provider.capabilityId), provider.id).toBe(true);
      expect(provider.resultGroups.length, provider.id).toBeGreaterThan(0);
      expect(provider.evidence.length, provider.id).toBeGreaterThan(0);

      for (const item of provider.evidence) {
        const evidence = sourceEvidence(item);
        if (!evidence) continue;
        const file = resolve(process.cwd(), evidence.path);
        expect(existsSync(file), `${provider.id}: ${evidence.path}`).toBe(true);
        if (evidence.token) {
          expect(readFileSync(file, "utf8"), `${provider.id}: ${evidence.token}`).toContain(
            evidence.token,
          );
        }
      }
    }
  });

  it("keeps notification categories unique and domain-owned", () => {
    const categories = V3_NOTIFICATION_CATEGORY_REGISTRY.map((item) => item.category);
    expect(new Set(categories).size).toBe(categories.length);

    for (const category of V3_NOTIFICATION_CATEGORY_REGISTRY) {
      expect(v3SystemDomain(category.ownerDomain), category.category).not.toBeNull();
      expect(category.defaultRoute.startsWith("/"), category.category).toBe(true);
    }
  });

  it("keeps every notification provider category registered and source-backed", () => {
    const categories = new Set(V3_NOTIFICATION_CATEGORY_REGISTRY.map((item) => item.category));
    const providerIds = V3_NOTIFICATION_PROVIDER_REGISTRY.map((item) => item.id);
    expect(new Set(providerIds).size).toBe(providerIds.length);

    for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
      expect(v3SystemDomain(provider.ownerDomain), provider.id).not.toBeNull();
      for (const category of provider.categories) {
        expect(categories.has(category), `${provider.id}: ${category}`).toBe(true);
      }
      for (const sourcePath of provider.sourceFiles) {
        expect(existsSync(resolve(process.cwd(), sourcePath)), `${provider.id}: ${sourcePath}`).toBe(true);
      }
      for (const eventType of provider.eventTypes) {
        if (eventType.endsWith(".*")) continue;
        const found = provider.sourceFiles.some((sourcePath) =>
          readFileSync(resolve(process.cwd(), sourcePath), "utf8").includes(eventType),
        );
        expect(found, `${provider.id}: ${eventType}`).toBe(true);
      }
    }
  });

  it("keeps participant notification preference categories aligned with the database constraint", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260929214500_solaris_app_push_foundation.sql"),
      "utf8",
    );

    for (const category of V3_NOTIFICATION_CATEGORY_REGISTRY.filter(
      (item) => item.preferenceControlled,
    )) {
      expect(migration, category.category).toContain(`'${category.category}'`);
    }
    expect(migration).not.toContain("'organizer_tasks' = any(np.categories)");
  });

  it("keeps installed-app search tied to the canonical public search RPC", () => {
    const palette = readFileSync(
      resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
      "utf8",
    );
    expect(palette).toContain('rpc("solaris_public_search"');
    expect(
      V3_SEARCH_PROVIDER_REGISTRY.some(
        (provider) =>
          provider.id === "installed-app-public-search-rpc" && provider.mode === "remote-rpc",
      ),
    ).toBe(true);
  });
});
