import { describe, expect, it } from "vitest";

import {
  readTabScopedEdition,
  validateEditionCommandScope,
  writeTabScopedEdition,
} from "@/lib/solaris-v6-edition-context";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("Solaris V6 edition isolation", () => {
  it("accepts a command only when all supplied edition identities agree", () => {
    expect(
      validateEditionCommandScope({
        routeEditionId: "ssc22",
        commandEditionId: "ssc22",
        entityEditionId: "ssc22",
        capabilityEditionId: "ssc22",
      }),
    ).toEqual({ ok: true, editionId: "ssc22", mismatches: [] });
  });

  it("fails closed when route, command, entity or capability edition disagrees", () => {
    const result = validateEditionCommandScope({
      routeEditionId: "ssc22",
      commandEditionId: "ssc22",
      entityEditionId: "ssc21",
      capabilityEditionId: "ssc22",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.mismatches).toContain("entity:ssc21");
  });

  it("stores organizer edition preference in the provided tab-scoped storage only", () => {
    const tab = storage();
    writeTabScopedEdition(tab as Storage, "edition-22");
    expect(readTabScopedEdition(tab as Storage)).toBe("edition-22");
    writeTabScopedEdition(tab as Storage, "");
    expect(readTabScopedEdition(tab as Storage)).toBe("");
  });
});
