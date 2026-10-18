import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Organizer N13 context safety", () => {
  it("keeps exact edition authority and refuses newest-edition fallback", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const resolver = source("src/components/admin/admin-edition-context.ts");

    expect(chrome).toContain("resolveAdminEditionContext(editions, editionId)");
    expect(chrome).not.toContain("edition_number ?? -1");
    expect(resolver).toContain("if (!editionId) return null");
    expect(resolver).toContain("editions.find((edition) => edition.id === editionId) ?? null");
  });

  it("keeps edition-scoped memory disabled until authority exists", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    expect(chrome).toContain("const navigationMemoryReady = navigationScope != null");
    expect(chrome).toContain("!navigationMemoryReady");
    expect(chrome).toContain("const navigationStorage = navigationMemoryReady ? undefined : null");
    expect(chrome).toContain("if (navigationMemoryReady) {");
    expect(chrome).not.toContain(
      "getV3OrganizerTabDestination(id, undefined, navigationScope)",
    );
  });

  it("invalidates Organizer lens interaction when exact edition context changes", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    expect(chrome).toContain(
      'const navigationInteractionKey = navigationScope ?? "unscoped"',
    );
    expect(chrome).toContain("key={navigationInteractionKey}");
    expect(chrome).not.toContain("key={editionId}");
  });

  it("lets V3 root morphology override legacy compact classification only at roots", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    expect(chrome).toContain(
      "resolveV3OrganizerTabbarMode(pathname, legacyScreen.tabbar)",
    );
    expect(chrome).toContain("mode={tabbarMode}");
  });
});
