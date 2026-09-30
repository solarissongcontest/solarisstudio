import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Show Mode companion contract", () => {
  it("keeps YouTube as the external live source instead of pretending Solaris knows the current performer", () => {
    const route = source("src/routes/show-mode/index.tsx");
    expect(route).toContain("Watch on YouTube");
    expect(route).toContain("Solaris does not mark a current performer automatically.");
    expect(route).not.toContain("Now performing");
    expect(route).not.toContain("Up next");
  });

  it("derives voting from a specifically linked Televoting round", () => {
    const route = source("src/routes/show-mode/index.tsx");
    const resolver = source("src/lib/show-mode.ts");
    expect(route).toContain('from("rounds")');
    expect(route).toContain('.eq("id", linkedRoundId!)');
    expect(resolver).toContain('televoteRound?.status === "open"');
    expect(resolver).toContain('televoteRound?.status === "closed"');
  });

  it("derives result publication from the existing publication engine", () => {
    const resolver = source("src/lib/show-mode.ts");
    expect(resolver).toContain("resolveShowPublication(show)");
    expect(resolver).toContain("publication.results === true");
  });

  it("gives Organizer only the manual companion controls Solaris cannot infer", () => {
    const admin = source("src/routes/_authenticated/admin/shows/$slug.tsx");
    expect(admin).toContain("Show Mode companion");
    expect(admin).toContain("Scheduled");
    expect(admin).toContain("Results in progress");
    expect(admin).toContain("Linked Televoting round");
    expect(admin).toContain("getMergedTelevotingRoundsPage");
  });

  it("uses Screen Wake Lock only as optional progressive enhancement", () => {
    const route = source("src/routes/show-mode/index.tsx");
    expect(route).toContain('wakeLock.request("screen")');
    expect(route).toContain("wakeLockSupported");
    expect(route).toContain("preferences.keepScreenAwake");
  });
});
