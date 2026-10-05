import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const voting = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/my-solaris/voting.tsx"),
  "utf8",
);

describe("MySolaris voting state truth", () => {
  it("does not infer a closed jury window when Organizer Participant View has no country-scoped window context", () => {
    expect(voting).toContain("const juryWindowOpen: boolean | null = organizerInspection");
    expect(voting).toContain('"Window state unavailable"');
    expect(voting).toContain('"Window state is available in Organizer controls"');
  });

  it("refreshes jury, delegation and televote state while the page remains open", () => {
    expect(voting.match(/refetchInterval: 30_000/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(voting.match(/refetchOnWindowFocus: true/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
