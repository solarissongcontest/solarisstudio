import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./routes/wiki/$code.tsx", import.meta.url), "utf8");

describe("Wiki hydration stability", () => {
  it("keeps the first browser render aligned with SSR before cached country data can replace the skeleton", () => {
    expect(route).toContain("const [clientReady, setClientReady] = useState(false);");
    expect(route).toContain("setClientReady(true);");
    expect(route).toContain("clientReady ? <CountryWikiExperience code={code} /> : <WikiHydrationSkeleton />");
  });

  it("preserves the full-width Wiki loading shell during the hydration gate", () => {
    expect(route).toContain('className="wiki-canvas wiki-loading"');
    expect(route).toContain('aria-label="Loading Wiki article"');
  });
});
