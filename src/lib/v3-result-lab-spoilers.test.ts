import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveV3ResultLabSpoilerGate } from "./v3-result-lab-spoilers";

const base = {
  hideSpoilers: true,
  viewerId: "viewer-1",
  selectedShowId: "show-1",
  revealedResultKey: null,
};

describe("Public Result Lab spoiler-safe presentation", () => {
  it("protects a published result until this viewer deliberately reveals it", () => {
    const initial = resolveV3ResultLabSpoilerGate(base);
    expect(initial.protected).toBe(true);
    expect(initial.revealKey).not.toBeNull();

    const revealed = resolveV3ResultLabSpoilerGate({
      ...base,
      revealedResultKey: initial.revealKey,
    });
    expect(revealed.protected).toBe(false);
  });

  it("does not reuse consent after a show or viewer change", () => {
    const revealedResultKey = resolveV3ResultLabSpoilerGate(base).revealKey;

    expect(resolveV3ResultLabSpoilerGate({
      ...base,
      selectedShowId: "show-2",
      revealedResultKey,
    }).protected).toBe(true);
    expect(resolveV3ResultLabSpoilerGate({
      ...base,
      viewerId: "viewer-2",
      revealedResultKey,
    }).protected).toBe(true);
    expect(resolveV3ResultLabSpoilerGate({
      ...base,
      viewerId: null,
      revealedResultKey,
    }).protected).toBe(true);
  });

  it("keeps empty states and explicitly disabled spoiler mode available", () => {
    expect(resolveV3ResultLabSpoilerGate({
      ...base,
      selectedShowId: null,
    })).toEqual({ protected: false, revealKey: null });
    expect(resolveV3ResultLabSpoilerGate({
      ...base,
      hideSpoilers: false,
    }).protected).toBe(false);
  });

  it("uses shared account/local spoiler policy and never mounts the simulator while protected", () => {
    const gate = readFileSync(
      resolve(process.cwd(), "src/components/v3/V3ResultLabGate.tsx"),
      "utf8",
    );
    expect(gate).toContain("resolveV3ResultsSpoilerProtection({");
    expect(gate).toContain("serverPreferences.isPending");
    expect(gate).toContain("serverPreferences.isError");
    expect(gate).toContain("resolveV3ResultLabSpoilerGate({");
    expect(gate).toContain("spoilerGate.protected ? (");
    expect(gate).toContain('data-v3-result-lab-spoiler-protected=""');
    expect(gate).toContain("Reveal this simulation");
    expect(gate).toContain("setRevealedResultKey(null)");
    expect(gate).not.toContain("localStorage");
  });
});
