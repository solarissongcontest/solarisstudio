import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyV3BetaFeedbackViewport } from "./v3-beta-feedback-context";

const contextSource = readFileSync(
  resolve(process.cwd(), "src/lib/v3-beta-feedback-context.ts"),
  "utf8",
);
const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/beta-test/index.tsx"),
  "utf8",
);

describe("Public V3 Beta feedback runtime context", () => {
  it("coarsens viewport width instead of retaining exact dimensions", () => {
    expect(classifyV3BetaFeedbackViewport(390)).toBe("compact");
    expect(classifyV3BetaFeedbackViewport(599)).toBe("compact");
    expect(classifyV3BetaFeedbackViewport(600)).toBe("medium");
    expect(classifyV3BetaFeedbackViewport(1023)).toBe("medium");
    expect(classifyV3BetaFeedbackViewport(1024)).toBe("wide");
    expect(classifyV3BetaFeedbackViewport(Number.NaN)).toBe("medium");
  });

  it("limits automatically attached context to low-entropy UI reproduction signals", () => {
    expect(contextSource).toContain(
      'export type V3BetaFeedbackInstallation = "browser" | "installed_app";',
    );
    expect(contextSource).toContain("installation: V3BetaFeedbackInstallation;");
    expect(contextSource).toContain("reducedMotion: boolean");
    expect(contextSource).toContain("classifyV3BetaFeedbackViewport(window.innerWidth)");
    expect(contextSource).not.toContain("navigator.userAgent");
    expect(contextSource).not.toContain("screen.width");
    expect(contextSource).not.toContain("screen.height");
    expect(contextSource).not.toContain("devicePixelRatio");
    expect(contextSource).not.toContain("geolocation");
  });

  it("attaches the coarse context to feedback while keeping the existing UA privacy rule", () => {
    expect(routeSource).toContain("const runtimeContext = readV3BetaFeedbackContext()");
    expect(routeSource).toContain("_runtimeContext: runtimeContext");
    expect(routeSource).toContain("user_agent: null");
    expect(routeSource).toContain("never exact screen dimensions");
    expect(routeSource).toContain("not your full browser user-agent string");
  });
});
