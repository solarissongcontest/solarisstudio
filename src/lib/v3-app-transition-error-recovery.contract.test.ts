import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 app transition error recovery contract", () => {
  it("keeps feature availability in the shared root error taxonomy", () => {
    const taxonomy = source("src/lib/app-error-state.ts");
    const root = source("src/routes/__root.tsx");

    expect(taxonomy).toContain('| "feature-unavailable"');
    expect(taxonomy).toContain('case "feature-unavailable"');
    expect(root).toContain("const kind = classifyAppError(error");
    expect(root).toContain("const presentation = appErrorPresentation(kind)");
    expect(root).toContain("data-solaris-error-kind={kind}");
  });

  it("reconciles recoverable route failures before resetting the boundary", () => {
    const root = source("src/routes/__root.tsx");
    const invalidate = root.indexOf("router.invalidate();");
    const reset = root.indexOf("reset();", invalidate);

    expect(root).toContain("{presentation.retry ? (");
    expect(invalidate).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(invalidate);
  });

  it("keeps unavailable and stale-link recovery inside ordinary Solaris navigation", () => {
    const taxonomy = source("src/lib/app-error-state.ts");

    expect(taxonomy).toContain('primaryHref: "/explore"');
    expect(taxonomy).not.toContain("window.location");
    expect(taxonomy).not.toContain("location.reload");
    expect(taxonomy).not.toContain("createClient(");
    expect(taxonomy).not.toContain(".from(");
    expect(taxonomy).not.toContain(".rpc(");
  });
});
