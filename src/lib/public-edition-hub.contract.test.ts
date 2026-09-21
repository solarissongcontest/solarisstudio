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
  const navigation = source("src/components/edition/EditionPublicPrimitives.tsx");
  const designCss = source("src/edition-public-v5.css");

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

  it("keeps section navigation visible on desktop and adaptive on mobile", () => {
    expect(route).toContain("<EditionNavigation");
    expect(navigation).toContain('className="edition-navigation"');
    expect(navigation).toContain('className="edition-navigation-mobile"');
    expect(navigation).toContain('aria-current={active === item.href ? "location"');
    expect(navigation).toContain("IntersectionObserver");
    expect(designCss).toContain(".edition-navigation-more-panel");
    expect(designCss).not.toContain("overflow-x: auto");
  });
});
