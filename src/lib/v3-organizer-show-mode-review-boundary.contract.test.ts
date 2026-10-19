import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/shows/$slug.tsx");

describe("V3 Organizer Show Mode production review", () => {
  it("reviews Show Mode changes instead of writing directly from the editor button", () => {
    expect(route).toContain("PendingShowModeReview");
    expect(route).toContain("reviewShowMode");
    expect(route).toContain('onClick={reviewShowMode}');
    expect(route).toContain('confirmationText={pendingShowModeReview?.showName}');
    expect(route).not.toContain('onClick={() => void saveShowMode()}');
  });

  it("captures exact edition/show identity and before-after production state", () => {
    expect(route).toContain("editionId: edition.id");
    expect(route).toContain("showId: showModeTarget.id");
    expect(route).toContain("showName: showModeTarget.name");
    expect(route).toContain("before: showModeSnapshot(current)");
    expect(route).toContain("after: showModeSnapshot(next)");
  });

  it("authoritatively re-reads the exact show and refuses stale Show Mode state", () => {
    expect(route).toContain('.select("id,edition_id,name,broadcast_config")');
    expect(route).toContain('.eq("id", review.showId)');
    expect(route).toContain("sameShowMode(showModeSnapshot(current), review.before)");
    expect(route).toContain("Show Mode changed while this review was open. Nothing was applied.");
    expect(route).toContain('.eq("edition_id", review.editionId)');
  });

  it("keeps the legacy-authority limitation explicit until System #625 lands", () => {
    expect(route).toContain("legacy browser-side broadcast configuration write");
    expect(route).toContain("is not a server CAS, idempotency key or authoritative operation receipt");
    expect(route).toContain("System #625 remains the blocker");
  });
});
