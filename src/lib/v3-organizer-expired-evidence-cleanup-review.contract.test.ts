import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/integrity-evidence.tsx", "utf8");

describe("V3 Organizer expired evidence upload cleanup review", () => {
  it("removes the native browser confirmation path", () => {
    expect(route).not.toContain("window.confirm(");
    expect(route).not.toContain("const confirmCleanup = () =>");
    expect(route).toContain("Review expired upload cleanup");
  });

  it("shows the exact expired upload and irreversible consequence before cleanup", () => {
    expect(route).toContain("data-v3-organizer-expired-upload-cleanup-review");
    expect(route).toContain("Upload token: {item.token_id}");
    expect(route).toContain("Private storage object: {item.object_exists ?");
    expect(route).toContain("The storage object cannot be recovered after cleanup.");
    expect(route).toContain("No storage bytes remain, but discarding the token is still irreversible.");
  });

  it("requires typed identity confirmation before invoking the existing cleanup authority", () => {
    expect(route).toContain("confirmationText={item.original_name}");
    expect(route).toContain("Type ${item.original_name} to confirm cleanup of this exact expired upload.");
    expect(route).toContain("await mutation.mutateAsync();");
    expect(route).toContain("mutationFn: () => cleanExpiredEvidenceUpload(item)");
  });

  it("preserves the stricter scheduled evidence deletion review", () => {
    expect(route).toContain("Review permanent deletion");
    expect(route).toContain("Delete private evidence permanently");
    expect(route).toContain("confirmationText={item.case_code}");
  });
});
