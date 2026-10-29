import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";

// Acceptance binds the registry to the existing real-consumer and production
// presentation regressions. It does not enable rollout or claim calculation
// authority: the local SQL rehearsal certifies the Publication read boundary.
const accepted = {
  "explore-root": "explore-source.server.ts",
  "edition-hub": "edition-source.server.ts",
  "country-profile": "delegation-source.server.ts",
  "delegation-detail": "delegation-source.server.ts",
  results: "results-source.server.ts",
  "result-lab": "result-lab-source.server.ts",
  "broadcast-intelligence": "broadcast-intelligence-source.server.ts",
  "result-relationships": "relationships-source.server.ts",
  scorecharts: "scorecharts-source.server.ts",
  records: "records-source.server.ts",
} as const;

function row(id: string) {
  const result = V3_PUBLIC_CAPABILITIES.find((item) => item.id === id);
  if (!result) throw new Error(`Missing Public capability ${id}`);
  return result;
}

describe("accepted Public immutable publication read family", () => {
  it("accepts only the audited published read consumers with inspectable runtime and consumer evidence", () => {
    for (const [id, source] of Object.entries(accepted)) {
      const capability = row(id);
      expect(capability.specificationStatus, id).toBe("cutover");
      const evidence = "migrationEvidence" in capability ? capability.migrationEvidence : "";
      expect(evidence, id).toContain(`src/integrations/v3/${source}`);
      expect(evidence, id).toContain("scripts/rehearse-v3-public-result-snapshot.sh");
      expect(evidence, id).toContain("src/lib/v3-public-result-consumers.test.ts");
      expect(evidence, id).toContain("src/lib/v3-public-read-family-acceptance.test.tsx");
      for (const path of evidence.split("; ")) expect(existsSync(path), `${id}: ${path}`).toBe(true);
      const adapter = readFileSync(`src/integrations/v3/${source}`, "utf8");
      expect(adapter, id).not.toMatch(/\.from\(["']results["']\)/);
      expect(adapter, id).not.toMatch(/\.(?:insert|update|delete|upsert)\(/);
      if (source === "delegation-source.server.ts") {
        expect(adapter).toContain("loadV3ResultsBundle");
      } else {
        expect(adapter).toMatch(/loadPublicResultSnapshot(?:Headers|s)/);
      }
    }
  });

  it("keeps separately owned Stories and participant write authority gaps visible", () => {
    // Scoreboard has its separate exact-show transport/actual-gate proof;
    // published Stories still needs independent owner certification.
    expect(row("stories").specificationStatus).toBe("mapped");
    for (const id of ["confirmations", "jury", "televote"]) {
      expect(row(id).specificationStatus, id).toBe("parity");
    }
  });
});
