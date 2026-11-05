import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_PUBLIC_DIRECTORY_EVIDENCE,
  validateV3PublicDirectoryEvidence,
  type PublicDirectoryEvidence,
} from "./v3-public-directory-evidence";

const routes = [
  "/countries", "/editions", "/tools", "/site-directory",
  "/shows", "/archive", "/stories", "/encyclopedia",
  "/rules/chapters", "/songs", "/artists",
];

function withCertifiedEvidence(row: PublicDirectoryEvidence): PublicDirectoryEvidence {
  return {
    ...row,
    productParity: "parity",
    responsiveEvidence: ["installed / mobile web / desktop browser matrix"],
    accessibilityEvidence: ["keyboard, zoom, labels, screen-reader QA"],
    visualEvidence: ["approved screenshot comparison for all three"],
    exactHeadCi: {
      sha: "a".repeat(40),
      requiredChecks: ["Quality", "Browser audit", "Client bundle budget evidence"],
      passedChecks: ["Quality", "Browser audit", "Client bundle budget evidence"],
    },
    certification: "candidate",
  };
}

describe("Solaris V3 directory certification index", () => {
  it("indexes every required directory exactly once against an existing Public capability", () => {
    expect(V3_PUBLIC_DIRECTORY_EVIDENCE.map((row) => row.route).sort()).toEqual([...routes].sort());
    expect(validateV3PublicDirectoryEvidence(V3_PUBLIC_DIRECTORY_EVIDENCE, null)).toEqual([]);
    expect(V3_PUBLIC_DIRECTORY_EVIDENCE.every((row) => row.certification === "uncertified")).toBe(true);
  });

  it("records different app, mobile-browser and desktop-browser compositions", () => {
    for (const row of V3_PUBLIC_DIRECTORY_EVIDENCE) {
      expect(new Set([row.installedApp, row.mobileWeb, row.desktopWeb]).size).toBe(3);
      expect(row.canonicalReadModel.length).toBeGreaterThan(0);
    }
  });

  it("rejects a falsely promoted directory without visual, accessibility and exact-SHA proof", () => {
    const row = { ...V3_PUBLIC_DIRECTORY_EVIDENCE[0], certification: "certified" as const };
    const errors = validateV3PublicDirectoryEvidence([row], "a".repeat(40));
    expect(errors.some((error) => error.includes("product parity not proven"))).toBe(true);
    expect(errors.some((error) => error.includes("verification evidence incomplete"))).toBe(true);
    expect(errors.some((error) => error.includes("exact candidate SHA evidence missing"))).toBe(true);
    expect(errors.some((error) => error.includes("missing required CI"))).toBe(true);
  });

  it("requires evidence on the exact candidate and rejects duplications", () => {
    const valid = withCertifiedEvidence(V3_PUBLIC_DIRECTORY_EVIDENCE[0]);
    expect(validateV3PublicDirectoryEvidence([valid], "a".repeat(40))).toEqual([]);
    expect(validateV3PublicDirectoryEvidence([valid], "b".repeat(40)))
      .toContain("directory countries: exact candidate SHA evidence missing or stale");
    const duplicates = validateV3PublicDirectoryEvidence([valid, valid], "a".repeat(40));
    expect(duplicates).toContain("directory countries: duplicate ID");
    expect(duplicates).toContain("directory countries: duplicate route /countries");
  });
  it("exposes the evidence index through the existing canonical completion dashboard", () => {
    const dashboard = readFileSync("scripts/generate-v3-completion-dashboard.ts", "utf8");
    expect(dashboard).toContain("V3_PUBLIC_DIRECTORY_EVIDENCE");
    expect(dashboard).toContain("validateV3PublicDirectoryEvidence(");
    expect(dashboard).toContain("directories: directoryRows");
    expect(dashboard).toContain("directoryRegistryIssues");
    expect(dashboard).toContain("table(directoryRows)");
    expect(dashboard).toContain("...directoryRows]");
  });

});
