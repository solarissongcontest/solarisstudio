import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveV3ResultsAnalysisReveal } from "./v3-results-analysis-reveal";
import { resolveV3ResultLabSpoilerGate } from "./v3-result-lab-spoilers";

const input = {
  hideSpoilers: true,
  selectedShowId: "show-a",
  viewerId: "viewer-a",
  revealedResultKey: null,
};

describe("V3 Results analysis spoiler reveal", () => {
  it("requires the viewer to reveal each selected published Show", () => {
    const hidden = resolveV3ResultsAnalysisReveal(input);
    expect(hidden.protected).toBe(true);
    expect(hidden.revealKey).not.toBeNull();
    expect(resolveV3ResultsAnalysisReveal({
      ...input,
      revealedResultKey: hidden.revealKey,
    }).protected).toBe(false);
  });

  it("does not carry reveal consent across shows or viewers", () => {
    const revealedResultKey = resolveV3ResultsAnalysisReveal(input).revealKey;
    expect(resolveV3ResultsAnalysisReveal({
      ...input,
      selectedShowId: "show-b",
      revealedResultKey,
    }).protected).toBe(true);
    expect(resolveV3ResultsAnalysisReveal({
      ...input,
      viewerId: "viewer-b",
      revealedResultKey,
    }).protected).toBe(true);
  });

  it("preserves optional spoiler-free mode and no-result empty state", () => {
    expect(resolveV3ResultsAnalysisReveal({
      ...input,
      hideSpoilers: false,
    }).protected).toBe(false);
    expect(resolveV3ResultsAnalysisReveal({
      ...input,
      selectedShowId: null,
    })).toEqual({ protected: false, revealKey: null });
  });

  it("keeps existing Result Lab reveal semantics on the shared policy", () => {
    expect(resolveV3ResultLabSpoilerGate(input)).toEqual(
      resolveV3ResultsAnalysisReveal(input),
    );
  });

  it("never mounts Broadcast Intelligence replay while spoiler-protected", () => {
    const gate = readFileSync(
      resolve(process.cwd(), "src/components/v3/V3BroadcastIntelligenceGate.tsx"),
      "utf8",
    );
    expect(gate).toContain("resolveV3ResultsSpoilerProtection({");
    expect(gate).toContain("serverPreferences.isPending");
    expect(gate).toContain("serverPreferences.isError");
    expect(gate).toContain("resolveV3ResultsAnalysisReveal({");
    expect(gate).toContain("spoilerGate.protected ? (");
    expect(gate).toContain("<V3AnalysisRevealScreen");
    const reveal = readFileSync(resolve(process.cwd(), "src/components/v3/V3AnalysisRevealScreen.tsx"), "utf8");
    expect(reveal).toContain("data-v3-broadcast-spoiler-protected");
    expect(reveal).toContain("Reveal this replay");
    expect(gate).toContain("setRevealedResultKey(null)");
    expect(gate).not.toContain("localStorage");
    expect(gate).not.toContain(".insert(");
    expect(gate).not.toContain(".update(");
  });
});
