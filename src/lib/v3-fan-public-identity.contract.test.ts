import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const screen = source("src/components/v3/V3FanIdentityScreen.tsx");
const route = source("src/routes/_authenticated/my-solaris/profile.tsx");
const me = source("src/components/v3/V3MeScreen.tsx");

describe("V3 fan public identity", () => {
  it("keeps fan visibility separate from account and delegation identity", () => {
    expect(screen).toContain("Public fan identity");
    expect(screen).toContain("private account identity and delegation identity stay separate");
    expect(screen).toContain("leaderboard_opt_in");
    expect(screen).not.toContain("country_id");
    expect(screen).not.toContain("email:");
    expect(screen).not.toContain("supabase");
  });

  it("reuses and remounts on the authenticated viewer boundary instead of deriving another session", () => {
    expect(screen).toContain("viewerId: string");
    expect(screen).toContain("useFanProfile(viewerId)");
    expect(screen).toContain("useSaveFanProfile(viewerId)");
    expect(screen).not.toContain("useFanSession");
    expect(route).toContain("key={rollout.data.userId}");
    expect(route).toContain("viewerId={rollout.data.userId}");
  });

  it("clears previous viewer form state before applying the next viewer profile", () => {
    expect(screen).toContain('setDisplayName("Solaris fan")');
    expect(screen).toContain('setVisibility("private")');
    expect(screen).toContain("setLeaderboardOptIn(false)");
    expect(screen).toContain("}, [viewerId]);");
    expect(screen).toContain("}, [viewerId, profile.data]);
  });

  it("recovers a failed caller-scoped profile read without mutating state", () => {
    expect(screen).toContain("Your fan identity could not be loaded. Nothing was changed.");
    expect(screen).toContain("profile.refetch()");
    expect(screen).toContain('profile.isFetching ? "Retrying…" : "Retry"');
  });

  it("keeps the installed-app cutover reversible and private without bundling a second legacy profile surface", () => {
    expect(route).toContain("useV3RolloutProbe");
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("rollout.data.meEnabled === true");
    expect(route).toContain('<Navigate to="/my-solaris" replace />');
    expect(route).not.toContain("ProfileActivityPanel");
    expect(route).not.toContain('from "@/components/AppShell"');
    expect(route).toContain('content: "noindex, nofollow"');
  });

  it("makes the identity editor discoverable from canonical Me", () => {
    expect(me).toContain('title="Public fan identity"');
    expect(me).toContain('to="/my-solaris/profile"');
    expect(me).toContain("fan-facing Solaris features");
  });
});
