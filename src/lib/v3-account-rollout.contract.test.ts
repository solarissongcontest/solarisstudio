import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Account reversible rollout", () => {
  it("renders P42 content only after the server-authoritative account rollout gate passes", () => {
    const shell = read("src/components/v3/V3AccountSettingsRouteShell.tsx");
    const route = read("src/routes/_authenticated/my-solaris/account.tsx");

    expect(shell).toContain("rollout.data?.accountSettingsEnabled !== true");
    expect(shell).toContain("{v3Children ?? children}");
    expect(route).toContain("v3Children={<V3AccountSections />}");
    expect(route).toContain("<LegacyAccountContent />");
  });
});
