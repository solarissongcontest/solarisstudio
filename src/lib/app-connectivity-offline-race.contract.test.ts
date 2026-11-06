import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const connectivity = readFileSync("src/lib/app-connectivity.ts", "utf8");

describe("installed-app connectivity probe interruption", () => {
  it("invalidates an in-flight origin probe before publishing browser offline state", () => {
    const offlineStart = connectivity.indexOf("const onOffline = () => {");
    const restrictionStart = connectivity.indexOf(
      "const onRestriction = () => {",
      offlineStart,
    );

    expect(offlineStart).toBeGreaterThan(-1);
    expect(restrictionStart).toBeGreaterThan(offlineStart);

    const offlineBlock = connectivity.slice(offlineStart, restrictionStart);
    const invalidateIndex = offlineBlock.indexOf("probeGeneration += 1");
    const abortIndex = offlineBlock.indexOf("probeController?.abort()");
    const clearIndex = offlineBlock.indexOf("probeController = null");
    const snapshotIndex = offlineBlock.indexOf("snapshot = {");

    expect(invalidateIndex).toBeGreaterThan(-1);
    expect(abortIndex).toBeGreaterThan(invalidateIndex);
    expect(clearIndex).toBeGreaterThan(abortIndex);
    expect(snapshotIndex).toBeGreaterThan(clearIndex);
    expect(offlineBlock).toContain("navigatorOnline: false");
    expect(offlineBlock).toContain("originReachable: false");
  });

  it("keeps probe settlement generation-gated so invalidated work cannot commit later", () => {
    const probeStart = connectivity.indexOf("const runProbe = async () => {");
    const onlineStart = connectivity.indexOf("const onOnline = () => {", probeStart);
    const probeBlock = connectivity.slice(probeStart, onlineStart);

    expect(probeBlock).toContain("const generation = ++probeGeneration");
    expect(probeBlock).toContain("generation !== probeGeneration");
    expect(probeBlock).toContain("controller.signal.aborted");
  });
});
