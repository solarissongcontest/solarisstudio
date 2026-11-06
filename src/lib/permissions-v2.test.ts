import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES, hasCapability, requireCapability } from "./permissions-v2";

describe("Permission Engine v2 capability model", () => {
  it("names read, operation, approval and administration boundaries", () => {
    expect(SOLARIS_CAPABILITIES).toContain("delegation.read");
    expect(SOLARIS_CAPABILITIES).toContain("entry.publish");
    expect(SOLARIS_CAPABILITIES).toContain("results.verify");
    expect(SOLARIS_CAPABILITIES).toContain("permissions.manage");
    expect(new Set(SOLARIS_CAPABILITIES).size).toBe(SOLARIS_CAPABILITIES.length);
  });

  it("applies global grants to every edition and scoped grants only to their edition", () => {
    expect(
      hasCapability([{ capability: "edition.read" }], "edition.read", {
        editionId: "ssc-21",
      }),
    ).toBe(true);
    expect(
      hasCapability([{ capability: "entry.edit", editionId: "ssc-21" }], "entry.edit", {
        editionId: "ssc-21",
      }),
    ).toBe(true);
    expect(
      hasCapability([{ capability: "entry.edit", editionId: "ssc-21" }], "entry.edit", {
        editionId: "ssc-22",
      }),
    ).toBe(false);
  });

  it("rejects expired grants and explains missing capabilities", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    expect(
      hasCapability(
        [{ capability: "results.preview", expiresAt: "2026-09-14T11:59:59Z" }],
        "results.preview",
        { now },
      ),
    ).toBe(false);
    expect(() => requireCapability([], "permissions.audit")).toThrow(
      "Missing Solaris capability: permissions.audit",
    );
  });

  it("does not promote malformed or expired grants into perpetual access", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    for (const expiresAt of [
      "",
      "  ",
      "not-a-date",
      "2026-09-14T11:59:59Z",
      "2026-09-14T12:00:00Z",
    ]) {
      expect(
        hasCapability([{ capability: "results.preview", expiresAt }], "results.preview", { now }),
      ).toBe(false);
    }

    expect(
      hasCapability(
        [{ capability: "results.preview", expiresAt: "2026-09-14T12:00:01Z" }],
        "results.preview",
        { now },
      ),
    ).toBe(true);
    expect(
      hasCapability([{ capability: "results.preview", expiresAt: null }], "results.preview", {
        now,
      }),
    ).toBe(true);
  });

  it("does not interpret an explicitly empty edition scope as a global grant", () => {
    for (const editionId of ["", "  "]) {
      const grants = [{ capability: "entry.edit" as const, editionId }];
      expect(hasCapability(grants, "entry.edit")).toBe(false);
      expect(hasCapability(grants, "entry.edit", { editionId: "ssc-21" })).toBe(false);
      expect(hasCapability(grants, "entry.edit", { editionId })).toBe(false);
    }

    expect(hasCapability([{ capability: "entry.edit", editionId: null }], "entry.edit")).toBe(
      true,
    );
  });

  it("denies all grants when the supplied authorization clock is invalid", () => {
    const now = new Date("invalid");
    expect(
      hasCapability(
        [{ capability: "results.preview", expiresAt: "2026-09-14T12:00:01Z" }],
        "results.preview",
        { now },
      ),
    ).toBe(false);
    expect(hasCapability([{ capability: "results.preview" }], "results.preview", { now })).toBe(
      false,
    );
  });

  it("fails closed for an unexpected non-string expiry from untyped runtime data", () => {
    expect(
      hasCapability(
        [{ capability: "entry.edit", expiresAt: 123 as unknown as string }],
        "entry.edit",
        { now: new Date("2026-09-14T12:00:00Z") },
      ),
    ).toBe(false);
  });
});
