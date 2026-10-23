import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 exact published Result consumer", () => {
  it("uses only the System-owned exact-version RPC and has no mutable-results fallback", () => {
    const source = read("src/integrations/v3/public-result-snapshot.server.ts");

    expect(source).toContain('client.rpc("v3_public_published_result_snapshot"');
    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).toContain("parseV3PublishedResultSnapshot(data)");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain("public.results");
    expect(source).not.toContain("service_role");
  });

  it("accepts only one bounded Show identity from the browser", () => {
    const fn = read("src/lib/v3-public-result-snapshot.functions.ts");

    expect(fn).toContain("showId: z.string().uuid()");
    expect(fn).toContain(".strict()");
    expect(fn).toContain("loadV3PublishedResultSnapshot(data.showId)");
    expect(fn).not.toContain("publicationVersion");
    expect(fn).not.toContain("resultVersion:");
    expect(fn).not.toContain("rows:");
  });

  it("keeps hidden, stale and historically unversioned Results fail-closed", () => {
    const parser = read("src/lib/v3-public-result-snapshot.ts");
    const source = read("src/integrations/v3/public-result-snapshot.server.ts");

    expect(parser).toContain("if (value == null) return null");
    expect(source).toContain("There is intentionally no direct-table compatibility");
    expect(source).toContain("legacy/unversioned publication returns `null`");
  });

  it("pins field-level split-result publication instead of trusting the consuming screen", () => {
    const parser = read("src/lib/v3-public-result-snapshot.ts");

    expect(parser).toContain("Unpublished Jury points must not be present");
    expect(parser).toContain("Unpublished Televote points must not be present");
    expect(parser).toContain("Unpublished detailed voting must not be present");
  });
});
