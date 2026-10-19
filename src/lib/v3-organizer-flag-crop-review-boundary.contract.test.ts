import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/flag-audit.tsx"),
  "utf8",
);

describe("V3 Organizer Flag QA crop review boundary", () => {
  it("reviews a frozen before/after crop instead of saving directly from the editor button", () => {
    expect(route).toContain("type PendingCropReview");
    expect(route).toContain("function requestSave()");
    expect(route).toContain("setPendingReview({");
    expect(route).toContain('onClick={requestSave}');
    expect(route).toContain('Review crop');
    expect(route).toContain('<AdminConfirmSheet');
    expect(route).toContain('confirmLabel="Apply crop"');
  });

  it("re-reads the exact country source and stored crop immediately before apply", () => {
    expect(route).toContain('.select("id,name,flag_image,flag_crop_x,flag_crop_y,flag_crop_zoom")');
    expect(route).toContain('.eq("id", pendingReview.countryId)');
    expect(route).toContain("liveCountry.flag_image !== pendingReview.sourceImage");
    expect(route).toContain("!sameCrop(liveCrop, pendingReview.before)");
    expect(route).toContain("The flag source or saved crop changed while this review was open");
    expect(route).toContain("Nothing was changed");
  });

  it("applies only the reviewed crop to the reviewed country after the stale-state check", () => {
    expect(route).toContain("flag_crop_x: pendingReview.next.x");
    expect(route).toContain("flag_crop_y: pendingReview.next.y");
    expect(route).toContain("flag_crop_zoom: pendingReview.next.zoom");
    expect(route).toContain('setCrop(pendingReview.next)');
    expect(route).not.toContain('onClick={() => void save()}');
  });

  it("states the remaining legacy authority boundary instead of claiming V3 parity", () => {
    expect(route).toContain("existing legacy country metadata write");
    expect(route).toContain("does not claim a versioned, idempotent or receipted System operation");
    expect(route).toContain("The original image is not modified");
  });
});
