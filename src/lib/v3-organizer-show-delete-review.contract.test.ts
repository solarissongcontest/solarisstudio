import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/shows/$slug.tsx"),
  "utf8",
);
const authority = readFileSync(
  resolve(process.cwd(), "src/lib/show-lifecycle-authority.ts"),
  "utf8",
);

describe("V3 Organizer destructive show deletion review", () => {
  it("freezes canonical server preflight rather than a browser-selected dependency subset", () => {
    expect(route).toContain("type PendingShowDeleteReview = {");
    expect(route).toContain("preview: ShowLifecyclePreview");
    expect(route).toContain("const preview = await previewShowLifecycle({ editionId: edition.id, showId: show.id })");
    expect(route).toContain("preview.dependencies.blockingReferenceCount");
    expect(route).toContain("preview.dependencies.tables");
    expect(route).not.toContain("participantIds: participants");
    expect(route).not.toContain("publicationFingerprint: stableJson");
  });

  it("revalidates the complete reviewed dependency and publication snapshot before commit", () => {
    expect(route).toContain("const live = await previewShowLifecycle({ editionId: review.editionId, showId: review.showId })");
    expect(route).toContain("sameDeleteReview(live, review.preview)");
    expect(route).toContain("left.expectedVersion === right.expectedVersion");
    expect(route).toContain("left.publication.version === right.publication.version");
    expect(route).toContain("left.dependencies.blockingReferenceCount === right.dependencies.blockingReferenceCount");
    expect(route).toContain("JSON.stringify(left.dependencies.tables) === JSON.stringify(right.dependencies.tables)");
  });

  it("requires R3 safeguards before the governed delete command", () => {
    const authIndex = route.indexOf("await reauthenticateShowLifecycleR3(deletePassword)");
    const deleteIndex = route.indexOf("const result = await executeShowDelete({");
    expect(authIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(authIndex);
    expect(route).toContain("deleteReason.trim().length < 5");
    expect(route).toContain("expectedVersion: review.preview.expectedVersion");
    expect(route).toContain("identity: review.identity");
    expect(route).toContain('confirmationText={pendingDeleteReview?.showName}');
    expect(route).toContain("Type ${pendingDeleteReview.showName} exactly to confirm permanent deletion");
  });

  it("removes the compatibility direct-delete boundary entirely", () => {
    expect(route).not.toContain('supabase.from("shows")');
    expect(route).not.toContain('supabase.from("participants")');
    expect(route).not.toMatch(/from\(["']shows["']\)[\s\S]{0,220}\.delete\s*\(/);
    expect(route).toContain("executeShowDelete({");
    expect(authority).toContain('rpcName: "studio2_delete_show_v3"');
  });

  it("keeps dependency discovery and final CAS server-authoritative", () => {
    expect(authority).toContain("blockingTableCount");
    expect(authority).toContain("blockingReferenceCount");
    expect(authority).toContain("requiresFreshAuthentication");
    expect(route).toContain("Permanent deletion is R3");
    expect(route).toContain("Solaris will revalidate publication and every discovered canonical dependency again at commit");
    expect(route).not.toContain("A concurrent dependency change after this final browser recheck remains outside this compatibility boundary");
  });
});
