import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectV3NavigationReferencePackage } from "../../scripts/lib/v3-navigation-reference-evidence";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8HOEAAAAASUVORK5CYII=",
  "base64",
);
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "v3-reference-test-"));
  directories.push(directory);
  const states = Object.fromEntries(
    [
      "expanded-resting",
      "compact-scrolled",
      "first-selected",
      "middle-selected",
      "last-selected",
      "pressed",
      "lens-moving",
      "dark",
      "light",
      "high-detail-under-glass",
    ].map((state) => [state, `${state}.png`]),
  );
  for (const path of Object.values(states)) writeFileSync(join(directory, path), image);
  const baseline = {
    status: "approved",
    captureDate: "2026-10-29",
    instagramAppVersion: null,
    iosVersion: "test-only",
    iphoneModelOrViewport: "test-only",
    displayScale: 3,
    appearance: "both",
    approvedBy: "unit-test-fixture",
    states,
    captureSha256: Object.fromEntries(
      Object.keys(states).map((state) => [state, createHash("sha256").update(image).digest("hex")]),
    ),
    geometry: {
      shellWidth: 360,
      shellMaxWidth: 544,
      shellHeightExpanded: 70,
      shellHeightCompact: 57,
      horizontalInset: 15,
      bottomInset: 7,
      shellRadius: 32,
      slotWidth: 68,
      iconOpticalSize: 19,
      iconCenterX: [42, 110, 178, 246, 314],
      lensWidth: 66,
      lensHeight: 58,
      lensRadius: 25,
      lensCenterX: 178,
      lensOvershootMax: 14,
      compactWidth: 324,
      compactHeight: 57,
      shadowSpreadBudget: 58,
      viewportWidth: 390,
    },
  };
  const save = () => writeFileSync(join(directory, "baseline.json"), JSON.stringify(baseline));
  save();
  return { directory, baseline, save };
}

describe("N0 navigation reference capture evidence", () => {
  it("does not credit an existing README as an approved capture package", () => {
    const { directory } = fixture();
    rmSync(join(directory, "baseline.json"));
    writeFileSync(join(directory, "README.md"), "Reference pending");
    expect(inspectV3NavigationReferencePackage(directory).pass).toBe(false);
  });
  it("accepts a complete test-only manifest with the expected capture bytes", () => {
    expect(inspectV3NavigationReferencePackage(fixture().directory)).toEqual({
      pass: true,
      failures: [],
    });
  });
  it("rejects unapproved metadata and missing measurements", () => {
    const { directory, baseline, save } = fixture();
    baseline.status = "pending";
    delete (baseline.geometry as Partial<typeof baseline.geometry>).shellWidth;
    save();
    expect(inspectV3NavigationReferencePackage(directory).failures).toContain(
      "baseline.status must be approved",
    );
    expect(inspectV3NavigationReferencePackage(directory).failures).toContain(
      "geometry.shellWidth must be positive",
    );
  });
  it("rejects captures replaced after approval", () => {
    const { directory } = fixture();
    writeFileSync(join(directory, "dark.png"), Buffer.concat([image, Buffer.from("changed")]));
    expect(inspectV3NavigationReferencePackage(directory).failures).toContain(
      "Missing, unsafe or changed capture: dark",
    );
  });
  it("rejects missing hashes, missing files, malformed manifests and non-images", () => {
    const { directory, baseline, save } = fixture();
    delete baseline.captureSha256.light;
    rmSync(join(directory, "pressed.png"));
    writeFileSync(join(directory, "dark.png"), "not an image");
    save();
    expect(inspectV3NavigationReferencePackage(directory).failures).toHaveLength(3);
    writeFileSync(join(directory, "baseline.json"), "{}");
    expect(inspectV3NavigationReferencePackage(directory).pass).toBe(false);
  });
  it("rejects traversal and symlinks escaping the approved package", () => {
    const { directory, baseline, save } = fixture();
    const outside = fixture().directory;
    baseline.states.light = "../outside.png";
    rmSync(join(directory, "dark.png"));
    symlinkSync(join(outside, "dark.png"), join(directory, "dark.png"));
    save();
    expect(inspectV3NavigationReferencePackage(directory).failures).toHaveLength(2);
  });
});
