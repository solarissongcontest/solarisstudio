import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = () => readFileSync("src/lib/app-view-transitions.ts", "utf8");

describe("app view-transition update safety", () => {
  it("gives every overlapping transition its own update blocker", () => {
    const transitions = source();

    expect(transitions).toContain("let appViewTransitionSequence = 0");
    expect(transitions).toContain("appViewTransitionSequence += 1");
    expect(transitions).toContain(
      "return `${APP_VIEW_TRANSITION_UPDATE_BLOCKER}:${appViewTransitionSequence}`",
    );
    expect(transitions).toContain("const updateBlockerId = nextViewTransitionBlockerId()");
    expect(transitions).toContain("setAppUpdateBlocker(");
    expect(transitions).toContain("clearAppUpdateBlocker(updateBlockerId)");
  });

  it("keeps reduced-motion and unsupported-browser navigation inside the same safety boundary", () => {
    const transitions = source();
    const blockerStart = transitions.indexOf("setAppUpdateBlocker(");
    const reducedMotion = transitions.indexOf("if (prefersReducedMotion())", blockerStart);
    const fallback = transitions.indexOf(
      'if (typeof transitionDocument.startViewTransition !== "function")',
      reducedMotion,
    );
    const outerFinally = transitions.lastIndexOf("clearAppUpdateBlocker(updateBlockerId)");

    expect(blockerStart).toBeGreaterThanOrEqual(0);
    expect(reducedMotion).toBeGreaterThan(blockerStart);
    expect(fallback).toBeGreaterThan(reducedMotion);
    expect(outerFinally).toBeGreaterThan(fallback);
  });

  it("keeps overlapping visual markers instance-owned until each transition finishes", () => {
    const transitions = source();

    expect(transitions).toContain(
      "const activeViewTransitionMarkers = new Map<string, AppViewTransitionKind>()",
    );
    expect(transitions).toContain("activeViewTransitionMarkers.set(ownerId, kind)");
    expect(transitions).toContain("activeViewTransitionMarkers.delete(ownerId)");
    expect(transitions).toContain("const latestKind = remainingKinds.at(-1)");
    expect(transitions).toContain("root.dataset.solarisViewTransition = latestKind");
    expect(transitions).toContain("await transition.finished");
    expect(transitions).toContain("releaseViewTransitionMarker(root, updateBlockerId)");
  });
});
