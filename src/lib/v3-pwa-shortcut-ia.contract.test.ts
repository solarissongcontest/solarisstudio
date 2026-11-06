import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ManifestShortcut = {
  name?: string;
  short_name?: string;
  url?: string;
};

type SolarisManifest = {
  start_url?: string;
  shortcuts?: ManifestShortcut[];
};

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readManifest(): SolarisManifest {
  return JSON.parse(source("public/site.webmanifest")) as SolarisManifest;
}

describe("V3 installed-app shortcut information architecture", () => {
  it("keeps installed-app launch behind the canonical restoration entry point", () => {
    expect(readManifest().start_url).toBe("/app-launch");
  });

  it("exposes canonical Public destinations instead of the retired MySolaris mental model", () => {
    const shortcuts = readManifest().shortcuts ?? [];
    const destinations = shortcuts.map(({ short_name, url }) => ({ short_name, url }));

    expect(destinations).toEqual(
      expect.arrayContaining([
        { short_name: "Explore", url: "/explore" },
        { short_name: "Participate", url: "/participate" },
        { short_name: "Results", url: "/results" },
        { short_name: "Me", url: "/me" },
      ]),
    );

    expect(
      shortcuts.some(({ name, short_name }) =>
        [name, short_name].some((value) => value?.toLowerCase().includes("mysolaris")),
      ),
    ).toBe(false);
    expect(
      shortcuts.some(({ url }) =>
        url === "/my-solaris" || url?.startsWith("/my-solaris/"),
      ),
    ).toBe(false);
  });

  it("keeps the offline shell on the same visible five-area V3 navigation model", () => {
    const offline = source("public/offline.html");

    expect(offline).toContain('href="/" data-tab="home"');
    expect(offline).toContain('href="/explore" data-tab="explore"');
    expect(offline).toContain('href="/participate" data-tab="participate"');
    expect(offline).toContain('href="/results" data-tab="results"');
    expect(offline).toContain('href="/me" data-tab="me"');
    expect(offline).not.toContain('href="/my-solaris" data-tab="me"');

    // Compatibility recognition is intentionally retained so an old cached or
    // bookmarked MySolaris deep link still resolves to the Me offline surface.
    expect(offline).toContain('path.startsWith("/my-solaris")');
    expect(offline).toContain('path.startsWith("/me")');
  });

  it("uses navigation-link current-page semantics in the offline shell", () => {
    const offline = source("public/offline.html");

    expect(offline).toContain('node.setAttribute("aria-current", "page")');
    expect(offline).toContain('node.removeAttribute("aria-current")');
    expect(offline).toContain('.tab[aria-current="page"]');
    expect(offline).not.toContain("aria-selected");
  });
});
