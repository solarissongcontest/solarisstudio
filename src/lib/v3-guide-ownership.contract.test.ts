import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Guide ownership", () => {
  it("teaches Explore, Participate and Me as the user-facing V3 mental model", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).toContain('to="/explore"');
    expect(guide).toContain('to="/participate"');
    expect(guide).toContain('to="/me"');
    expect(guide).toContain("Participate</Link> owns the things you");
    expect(guide).toContain(">Me</Link> owns your Solaris identity");
  });

  it("does not teach MySolaris as a separate primary destination", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).not.toContain('to="/my-solaris"');
    expect(guide).not.toContain("What is MySolaris?");
    expect(guide).not.toContain("MySolaris</Link> is your HOD home base");
    expect(guide).toContain("MySolaris is not a separate primary area you need to choose");
  });

  it("keeps specialist compatibility honest during incremental migration", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).toContain("compatibility screens while the V3 migration is being completed");
    expect(guide).toContain("compatibility MySolaris workspace while those specialist screens are migrated");
  });
});
