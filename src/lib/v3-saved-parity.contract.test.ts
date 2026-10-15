import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/saved-source.server.ts");
const route = () => read("src/routes/_authenticated/my-solaris/saved.tsx");
const screen = () => read("src/components/v3/V3SavedScreen.tsx");
const meRoot = () => read("src/components/v3/V3MeRoot.tsx");
const engagement = () => read("src/lib/engagement-data.ts");

describe("V3 Following and Saved migration", () => {
  it("resolves viewer identity on the server and hydrates only followed entity IDs", () => {
    const code = source();

    expect(code).toContain("auth.getUser(token)");
    expect(code).toContain('.from("fan_follows")');
    expect(code).toContain('.eq("profile_id", viewerId)');
    expect(code).toContain('.in("id", countryIds)');
    expect(code).toContain('.in("id", editionIds)');
    expect(code).not.toContain("useCountries");
    expect(code).not.toContain("useEditions");
  });

  it("does not leak unpublished saved editions through entity hydration", () => {
    expect(source()).toContain('.eq("published", true)');
  });

  it("uses the existing canonical follow mutation instead of browser-owned saved state", () => {
    const code = screen();

    expect(code).toContain("useSetFanFollow(viewerId)");
    expect(engagement()).toContain('supabase.rpc("set_fan_follow"');
    expect(code).not.toContain("localStorage");
    expect(code).not.toContain("sessionStorage");
  });

  it("supports empty, stale, notification-level and removal states", () => {
    const code = screen();

    expect(code).toContain('data-v3-saved-state="empty"');
    expect(code).toContain('title="Unavailable"');
    expect(code).toContain('option value="all"');
    expect(code).toContain('option value="important"');
    expect(code).toContain('option value="none"');
    expect(code).toContain("onRemove");
  });

  it("cuts the installed Me route over reversibly and preserves the browser fallback", () => {
    const code = route();

    expect(code).toContain("rollout.data?.meEnabled === true");
    expect(code).toContain("useV3SavedProjection");
    expect(code).toContain("saved.data.viewerId !== rollout.data.userId");
    expect(code).toContain("<LegacySaved />");
    expect(code).toContain("<V3SavedScreen");
  });

  it("routes Me Following to the canonical Following and Saved surface", () => {
    expect(meRoot()).toContain('href: "/my-solaris/saved"');
  });
});
