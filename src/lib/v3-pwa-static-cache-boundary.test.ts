import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sw = readFileSync("public/sw.js", "utf8");
const start = sw.indexOf("const PUBLIC_SHELL_ASSETS");
const end = sw.indexOf("async function networkNavigation", start);
if (start < 0 || end <= start) throw new Error("Static cache boundary missing");
const origin = "https://solaris.test";
const factory = new Function(
  "self",
  sw.slice(start, end) + "; return isCacheableStaticAsset;",
) as (scope: { location: { origin: string } }) => (url: URL, request: Request) => boolean;
const isStatic = factory({ location: { origin } });

function eligible(path: string, init: RequestInit = {}) {
  const url = new URL(path, origin);
  return isStatic(url, new Request(url, init));
}

describe("PWA fail-closed same-origin static asset caching", () => {
  it("retains public build output and declared application shell assets", () => {
    for (const path of [
      "/assets/app.23ab.js", "/assets/surface.css",
      "/_build/client/main.mjs", "/_build/assets/font.woff2",
      "/icon-192.png?v=img2340-20260929",
      "/icon-maskable.svg?v=maskable-20260930",
      "/solaris-background.webp", "/solaris-studio-mark.png",
    ]) expect(eligible(path), path).toBe(true);
  });

  it("rejects private image/file routes even when same origin and image-shaped", () => {
    for (const path of [
      "/my-solaris/receipt.png", "/confirmations/private-song.jpg",
      "/jury-voting/ballot.webp", "/televoting/receipt.png",
      "/integrity/cases/evidence.jpg", "/storage/v1/object/authenticated/proof.svg",
      "/rest/v1/avatar.png", "/functions/v1/private.jpg",
      "/auth/v1/user.png", "/admin/media.png", "/uploads/signed.png",
      "/api/image.jpg", "/assets/private.json", "/other/screenshot.jpg",
    ]) expect(eligible(path), path).toBe(false);
  });

  it("rejects credential-bearing queries, encoded separators, auth headers, no-store and foreign origins", () => {
    for (const path of [
      "/assets/app.js?token=secret", "/assets/app.js?signature=abc",
      "/assets/app.js?download=true", "/icon-192.png?access_token=secret",
      "/assets/private%2Fphoto.png", "/_build/%5cprivate.js",
      "/assets/private%252Fphoto.png", "/assets/private%252e%252e.jpg",
      "/assets/app.js?v=private%2Ftoken", "/assets/app.js?version=latest",
    ]) expect(eligible(path), path).toBe(false);
    expect(eligible("/assets/app.js", { cache: "no-store" })).toBe(false);
    expect(eligible("/assets/app.js", {
      headers: { Authorization: "Bearer private" },
    })).toBe(false);
    const offsite = new URL("https://private.example/assets/app.js");
    expect(isStatic(offsite, new Request(offsite))).toBe(false);
  });

  it("permits only bounded public version queries", () => {
    expect(eligible("/assets/app.js?v=release.123")).toBe(true);
    expect(eligible("/assets/app.js?v=")).toBe(false);
    expect(eligible("/assets/app.js?v=" + "x".repeat(81))).toBe(false);
  });
});
