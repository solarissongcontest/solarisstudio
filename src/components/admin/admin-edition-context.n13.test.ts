import { describe, expect, it } from "vitest";

import type { Edition } from "@/lib/data";
import { resolveAdminEditionContext } from "./admin-edition-context";

const editions = [
  { id: "older", slug: "ssc21", edition_number: 21, name: "Older" },
  { id: "newest", slug: "ssc22", edition_number: 22, name: "Newest" },
] as Edition[];

describe("Organizer N13 exact edition context", () => {
  it("uses only the exact selected edition", () => {
    expect(resolveAdminEditionContext(editions, "older")?.slug).toBe("ssc21");
    expect(resolveAdminEditionContext(editions, "newest")?.slug).toBe("ssc22");
  });

  it("fails closed for missing or stale context", () => {
    expect(resolveAdminEditionContext(editions, null)).toBeNull();
    expect(resolveAdminEditionContext(editions, undefined)).toBeNull();
    expect(resolveAdminEditionContext(editions, "stale")).toBeNull();
  });
});
