import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const chrome = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/admin/OrganizerV3MobileChrome.tsx"),
    "utf8",
  );

describe("V3 Organizer navigation memory bootstrap", () => {
  it("does not read or write route memory until exact edition scope exists", () => {
    const code = chrome();
    expect(code).toContain("const navigationScope = activeEdition?.id ?? null");
    expect(code).toContain("const navigationMemoryReady = navigationScope != null");
    expect(code).toContain("!navigationMemoryReady");
    expect(code).toContain("const navigationStorage = navigationMemoryReady ? undefined : null");
    expect(code).toContain("if (navigationMemoryReady) {");
    expect(code).toContain(
      "markV3OrganizerNavigationRestore(target, undefined, navigationScope)",
    );
  });

  it("keeps canonical root navigation available while memory fails closed", () => {
    const code = chrome();
    expect(code).toContain(
      "resetV3OrganizerTabToRoot(id, navigationStorage, navigationScope)",
    );
    expect(code).toContain(
      "getV3OrganizerTabDestination(id, navigationStorage, navigationScope)",
    );
    expect(code).toContain("navigate({ to: v3OrganizerEntryHref(target) as any })");
  });

  it("never deliberately routes unresolved edition context through browser storage", () => {
    const code = chrome();
    expect(code).not.toContain(
      "getV3OrganizerTabDestination(id, undefined, navigationScope)",
    );
    expect(code).not.toContain(
      "resetV3OrganizerTabToRoot(id, undefined, navigationScope)",
    );
  });
});
