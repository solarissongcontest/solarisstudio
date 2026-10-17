import { describe, expect, it } from "vitest";

import type { Edition } from "@/lib/data";
import { resolveAdminEditionContext } from "./admin-edition-context";

const editions = [
  { id: "older", slug: "ssc21", edition_number: 21, name: "Older" },
  { id: "newest", slug: "ssc22", edition_number: 22, name: "Newest" },
] as Edition[];

describe("resolveAdminEditionContext", () => {
  it("returns only the exact edition selected by Organizer context", () => {
    expect(resolveAdminEditionContext(editions, "older")?.slug).toBe("ssc21");
    expect(resolveAdminEditionContext(editions, "newest")?.slug).toBe("ssc22");
  });

  it("fails closed when context is missing instead of choosing the newest edition", () => {
    expect(resolveAdminEditionContext(editions, null)).toBeNull();
    expect(resolveAdminEditionContext(editions, undefined)).toBeNull();
  });

  it("fails closed when context is stale instead of choosing another loaded edition", () => {
    expect(resolveAdminEditionContext(editions, "deleted-or-stale")).toBeNull();
  });
});
