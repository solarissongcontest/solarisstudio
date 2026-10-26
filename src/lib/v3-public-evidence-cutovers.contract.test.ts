import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const EVIDENCE_ONLY_PUBLIC_CUTOVERS = [
  {
    id: "prediction-league",
    proofFiles: [
      "src/lib/v3-predictions-merge.contract.test.ts",
      "src/lib/v3-prediction-league-privacy.contract.test.ts",
    ],
  },
  {
    id: "result-lab",
    proofFiles: ["src/lib/v3-result-lab-p28.contract.test.ts"],
    readOnlySource: "src/integrations/v3/result-lab-source.server.ts",
  },
  {
    id: "broadcast-intelligence",
    proofFiles: ["src/lib/v3-broadcast-intelligence-p27.contract.test.ts"],
    readOnlySource: "src/integrations/v3/broadcast-intelligence-source.server.ts",
  },
  {
    id: "result-relationships",
    proofFiles: ["src/lib/v3-relationships-p26.contract.test.ts"],
    readOnlySource: "src/integrations/v3/relationships-source.server.ts",
  },
  {
    id: "stories",
    proofFiles: [
      "src/lib/v3-stories.contract.test.ts",
      "src/lib/v3-stories-detail-continuity.contract.test.ts",
    ],
  },
  {
    id: "scorecharts",
    proofFiles: ["src/lib/v3-scorecharts-p25.contract.test.ts"],
    readOnlySource: "src/integrations/v3/scorecharts-source.server.ts",
  },
  {
    id: "records",
    proofFiles: ["src/lib/v3-records-p24.contract.test.ts"],
    readOnlySource: "src/integrations/v3/records-source.server.ts",
  },
  {
    id: "sitemap",
    proofFiles: ["e2e/public-routes.e2e.ts"],
  },
  {
    id: "me-route",
    proofFiles: [
      "src/lib/v3-me-entry-route.contract.test.ts",
      "src/lib/v3-me-architecture.contract.test.ts",
    ],
  },
  {
    id: "beta-test-feedback",
    proofFiles: ["src/lib/v3-beta-feedback-privacy.contract.test.ts"],
  },
] as const;

describe("Public V3 evidence-only cutover proof", () => {
  it("binds every claimed capability to cutover status and executable proof", () => {
    for (const evidence of EVIDENCE_ONLY_PUBLIC_CUTOVERS) {
      const capability = V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES.find(
        (item) => item.id === evidence.id,
      );
      expect(capability, evidence.id).toBeDefined();
      expect(capability?.specificationStatus, evidence.id).toBe("cutover");

      const migrationEvidence =
        capability && "migrationEvidence" in capability
          ? capability.migrationEvidence
          : undefined;
      expect(migrationEvidence, evidence.id).toBeTruthy();

      for (const proofFile of evidence.proofFiles) {
        expect(migrationEvidence, `${evidence.id}:${proofFile}`).toContain(proofFile);
        const proof = read(proofFile);
        expect(proof.length, `${evidence.id}:${proofFile}`).toBeGreaterThan(100);
        expect(proof, `${evidence.id}:${proofFile}`).toMatch(/\b(?:describe|test)\s*\(/);
        expect(proof, `${evidence.id}:${proofFile}`).toContain("expect(");
      }
    }
  });

  it("keeps the Results-analysis evidence family downstream and read-only", () => {
    for (const evidence of EVIDENCE_ONLY_PUBLIC_CUTOVERS) {
      if (!("readOnlySource" in evidence)) continue;
      const source = read(evidence.readOnlySource);
      for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert(", "service_role"]) {
        expect(source, `${evidence.id}:${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
