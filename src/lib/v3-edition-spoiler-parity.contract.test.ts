import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Edition spoiler and lifecycle parity", () => {
  it("uses the same local and server spoiler preference authority as Results", () => {
    const gate = read("src/components/v3/V3EditionRouteGate.tsx");

    expect(gate).toContain("useAppExperiencePreferences");
    expect(gate).toContain("useNotificationPreferences");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection");
    expect(gate).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(gate).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
    expect(gate).toContain("<V3EditionSpoilerBoundary");
  });

  it("withholds Story text, ranking rows and result deep-links before deliberate reveal", () => {
    const boundary = read("src/components/v3/V3EditionSpoilerBoundary.tsx");

    expect(boundary).toContain('data-v3-edition-spoilers="protected"');
    expect(boundary).toContain("hideSpoilers && !revealed");
    expect(boundary).toContain('title: "Published story hidden"');
    expect(boundary).toContain("items: []");
    expect(boundary).toContain('projection.results.state === "available"');
    expect(boundary).toContain("showHref: null");
    expect(boundary).toContain("rows: []");
    expect(boundary).toContain("setRevealed(true)");
    expect(boundary).toContain("Reveal edition spoilers");
  });

  it("does not turn spoiler preference into a publication decision", () => {
    const boundary = read("src/components/v3/V3EditionSpoilerBoundary.tsx");

    expect(boundary).not.toContain("supabase");
    expect(boundary).not.toContain(".rpc(");
    expect(boundary).not.toContain(".from(");
    expect(boundary).not.toContain(".insert(");
    expect(boundary).not.toContain(".update(");
  });

  it("keeps archived and post-edition lifecycle ahead of current-phase inference", () => {
    const source = read("src/integrations/v3/edition-source.server.ts");
    const explore = read("src/lib/v3-explore.ts");

    const archived = source.indexOf('if (lifecycle === "archived")');
    const postEdition = source.indexOf('if (lifecycle === "post_edition")');
    const phaseInference = source.indexOf("resolvePublicEditionState({ edition, shows, results })");

    expect(archived).toBeGreaterThan(0);
    expect(postEdition).toBeGreaterThan(archived);
    expect(phaseInference).toBeGreaterThan(postEdition);
    expect(explore).toContain('input.edition.experience === "live" && input.edition.liveHref');
  });
});
