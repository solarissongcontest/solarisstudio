import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = () => readFileSync(resolve(process.cwd(), "e2e/v3-navigation/navbar-local-rollout.ts"), "utf8");

describe("isolated navbar Browser Audit rollout", () => {
  it("keeps both shared local test identities authorized across parallel browser suites", () => {
    const source = fixture();
    expect(source).toContain("const audience = [...new Set([organizer.user.id, country.user.id])]");
    expect(source).toContain("await setFeature(config, organizer, key, audience)");
    expect(source).not.toContain("const audience = [country.user.id]");
  });

  it("refuses hosted Supabase and nonlocal browser origins before writing flags", () => {
    const source = fixture();
    expect(source).toContain('if (!["127.0.0.1", "localhost"].includes(supabase.hostname))');
    expect(source).toContain('if (!["127.0.0.1", "localhost"].includes(app.hostname))');
    expect(source.indexOf("const config = requiredLocalConfig()")).toBeLessThan(source.indexOf("await setFeature(config, organizer, key, audience)"));
  });
});
