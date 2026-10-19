import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../components/v3/V3FanIdentityScreen.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../routes/_authenticated/my-solaris/profile.tsx", import.meta.url),
  "utf8",
);

describe("V3 fan public identity", () => {
  it("keeps fan visibility separate from account and delegation identity", () => {
    expect(screen).toContain("Public fan identity");
    expect(screen).toContain("private account and delegation identity stay separate");
    expect(screen).toContain("leaderboard_opt_in");
    expect(screen).not.toContain("country_id");
    expect(screen).not.toContain("email:");
    expect(screen).not.toContain("supabase");
  });

  it("uses the existing fan profile writer and keeps rollout reversible", () => {
    expect(screen).toContain("useSaveFanProfile");
    expect(route).toContain("useV3RolloutProbe");
    expect(route).toContain("rollout.data?.meEnabled === true");
    expect(route).toContain("ProfileActivityPanel");
  });
});
