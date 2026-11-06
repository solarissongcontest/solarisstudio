import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Terra Solaris World country discoverability", () => {
  const worldLanding = source("src/components/world/WorldPublic.tsx")
    .split("export function WorldLanding()")[1]
    ?.split("export function WorldDirectory()")[0] ?? "";

  it("keeps canonical contest country discovery while exposing World international history", () => {
    expect(worldLanding).toContain('to="/countries"');
    expect(worldLanding).toContain('to="/world/countries"');
    expect(worldLanding).toContain("Browse World country records");
    expect(worldLanding).toContain("Looking for country memberships and international history?");
  });

  it("routes World country records through a second server-authoritative rollout gate", () => {
    const index = source("src/routes/world/countries/index.tsx");
    const detail = source("src/routes/world/countries/$code.tsx");
    const world = source("src/routes/world/index.tsx");

    expect(index).toContain('createFileRoute("/world/countries/")');
    expect(detail).toContain('createFileRoute("/world/countries/$code")');
    expect(index).toContain("<WorldCountryRolloutGate>");
    expect(detail).toContain("<WorldCountryRolloutGate>");
    expect(world).toContain("<WorldPublicGate verifyOnMount><WorldLanding /></WorldPublicGate>");
  });
});
