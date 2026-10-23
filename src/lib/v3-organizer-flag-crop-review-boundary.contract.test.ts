import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/flag-audit.tsx"),
  "utf8",
);

describe("V3 Organizer Flag QA crop review boundary", () => {
  it("prepares a frozen review from canonical server preflight", () => {
    expect(route).toContain("type PendingCropReview");
    expect(route).toContain("async function requestSave()");
    expect(route).toContain("preflightCountryFlagCropV3(country.id)");
    expect(route).toContain("preflight.flagImage !== country.flag_image");
    expect(route).toContain("!sameCrop(preflight.crop, persistedCrop)");
    expect(route).toContain("expectedStateVersion: preflight.stateVersion");
    expect(route).toContain("const operationId = crypto.randomUUID()");
    expect(route).toContain(
      "idempotencyKey: `flag-crop:${preflight.countryId}:${operationId}`",
    );
    expect(route).toContain("<AdminConfirmSheet");
  });

  it("applies only the reviewed crop through the governed V3 command", () => {
    expect(route).toContain("updateCountryFlagCropV3({");
    expect(route).toContain("countryId: review.countryId");
    expect(route).toContain("crop: review.next");
    expect(route).toContain("expectedStateVersion: review.expectedStateVersion");
    expect(route).toContain("operationId: review.operationId");
    expect(route).toContain("idempotencyKey: review.idempotencyKey");
    expect(route).toContain("setCrop(result.crop)");
    expect(route).not.toContain('.from("countries")');
    expect(route).not.toContain(".update({");
  });

  it("keeps the same reviewed operation available when its outcome cannot yet be confirmed", () => {
    expect(route).toContain("if (!saving) setPendingReview(null)");
    expect(route).toContain(
      'await queryClient.invalidateQueries({ queryKey: ["countries"] })',
    );
    expect(route).toContain(
      "The reviewed operation remains available with the same identity.",
    );
    expect(route).toContain("reconciles this same operation ID");
    expect(route).toContain("keeps the same operation and idempotency identity");
  });

  it("states the canonical authority boundary honestly", () => {
    expect(route).toContain("canonical server preflight");
    expect(route).toContain("receipted, idempotent country-identity command");
    expect(route).toContain("The original image is not modified");
    expect(route).not.toContain("existing legacy country metadata write");
    expect(route).not.toContain(
      "does not claim a versioned, idempotent or receipted System operation",
    );
  });
});
