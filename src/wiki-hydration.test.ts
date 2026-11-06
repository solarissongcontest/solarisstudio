import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./routes/wiki/$code.tsx", import.meta.url), "utf8");

describe("Wiki hydration stability", () => {
  it("keeps the first browser render aligned with SSR before cached country data can replace the skeleton", () => {
    expect(route).toContain("const [clientReady, setClientReady] = useState(false);");
    expect(route).toContain("setClientReady(true);");
    expect(route).toContain("clientReady ? <CountryWikiExperience code={code} /> : <WikiHydrationSkeleton code={code} />");
  });

  it("preserves the full-width Wiki loading shell during the hydration gate", () => {
    expect(route).toContain('className="wiki-canvas wiki-loading"');
    expect(route).toContain('aria-label={label}');
    expect(route).toContain('label = "Loading Terra Solaris Wiki article"');
    expect(route).toContain('aria-live="polite"');
  });

  it("keeps one semantic article heading in the SSR loading tree until the stable article hydrates", () => {
    const skeletonStart = route.indexOf("function WikiHydrationSkeleton");
    expect(skeletonStart).toBeGreaterThanOrEqual(0);
    const skeleton = route.slice(skeletonStart);
    expect(skeleton).toContain('<h1 className="sr-only">{code.toUpperCase()} — Terra Solaris Wiki</h1>');
    expect(skeleton).toContain('<span className="sr-only">{label}</span>');
    expect(skeleton).toContain('label = "Loading Terra Solaris Wiki article"');
  });
});
