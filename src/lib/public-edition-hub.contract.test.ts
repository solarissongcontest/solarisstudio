import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("state-aware public Edition Hub", () => {
  const route = source("src/routes/editions/$slug.tsx");
  const state = source("src/lib/current-contest-state.ts");
  const status = source("src/components/public/PublicCurrentStatus.tsx");

  it("uses the same canonical lifecycle resolver as Home", () => {
    expect(route).toContain("resolvePublicEditionState");
    expect(state).toContain("resolvePublicEditionState");
    expect(route).toContain("editionState.statusLabel");
  });

  it("gives the edition state a contextual action without inventing another alert component", () => {
    expect(route).toContain("PublicCurrentStatus");
    expect(status).toContain("action?: ReactNode");
    expect(route).toContain("editionState.primaryAction");
  });

  it("turns edition section navigation into a mobile swipe row", () => {
    expect(route).toContain("snap-x snap-mandatory");
    expect(route).toContain("overflow-x-auto");
    expect(route).toContain("sm:grid");
  });
});
