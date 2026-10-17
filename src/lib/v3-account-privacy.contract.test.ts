import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Account privacy", () => {
  it("uses authenticated fan profile state and keeps private data boundaries explicit", () => {
    const screen = read("src/components/v3/V3AccountPrivacyPanel.tsx");
    const data = read("src/lib/prediction-data.ts");

    expect(screen).toContain("useFanSession()");
    expect(screen).toContain("useFanProfile(session.data?.id)");
    expect(screen).toContain("useSaveFanProfile(session.data?.id)");
    expect(screen).toContain("Recovery email and individual prediction picks are never made public");
    expect(data).toContain('.from("fan_profiles")');
    expect(data).toContain("leaderboard_opt_in");
    expect(screen).not.toContain("supabase");
  });
});
