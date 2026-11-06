import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_ARCHIVE_CAPABILITIES } from "./v3-public-archive-capabilities";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/archive/index.tsx");
const aggregate = () => read("src/lib/v3-capability-registry.ts");

describe("V3 P34 Archive root", () => {
  it("registers the net-new Archive route with explicit Public ownership", () => {
    const capability = V3_PUBLIC_ARCHIVE_CAPABILITIES.find((item) => item.id === "archive-root");

    expect(capability).toBeDefined();
    expect(capability?.legacyRoutes).toContain("/archive");
    expect(capability?.targetArea).toBe("explore");
    expect(capability?.targetRoute).toBe("/archive");
    expect(capability?.specificationStatus).toBe("building");
    expect(aggregate()).toContain("...V3_PUBLIC_ARCHIVE_CAPABILITIES");
  });

  it("exposes the retained historical destination families required by P34", () => {
    const source = route();

    expect(source).toContain('to: "/editions"');
    expect(source).toContain('to: "/countries"');
    expect(source).toContain('to: "/shows"');
    expect(source).toContain('to: "/stories"');
    expect(source).toContain('to: "/encyclopedia"');
    expect(source).toContain('to: "/archive-games"');
  });

  it("makes historical context explicit and does not surface a current participation CTA", () => {
    const source = route();

    expect(source).toContain("Historical context stays historical");
    expect(source).toContain("Current participation responsibilities belong in Participate");
    expect(source).not.toContain('to="/participate"');
    expect(source).not.toContain('to: "/participate"');
  });

  it("keeps the Archive root projection-free and mutation-free", () => {
    const source = route();

    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("useMutation(");
    expect(source).not.toContain('.from("');
    expect(source).not.toContain("useCountries(");
    expect(source).not.toContain("useEditions(");
    expect(source).not.toContain("useAll");
  });

  it("does not overclaim P34 parity before child historical-context verification", () => {
    const capability = V3_PUBLIC_ARCHIVE_CAPABILITIES[0];

    expect(capability.specificationStatus).toBe("building");
    expect(capability.migrationEvidence).toContain("not yet claimed as parity");
  });
});
