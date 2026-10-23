import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  assessV3QaSystemPhaseReadiness,
  type V3QaSystemPhaseReadinessRow,
} from "../src/lib/v3-qa-system-phase-readiness";

function exactSha() {
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(gitSha)) {
    throw new Error("Unable to resolve an exact checked-out SHA for V3 QA system phase readiness");
  }

  const claimedCandidate = (process.env.V3_CANDIDATE_SHA || "").trim().toLowerCase();
  if (claimedCandidate) {
    if (!/^[0-9a-f]{40}$/.test(claimedCandidate)) {
      throw new Error("V3 QA system phase readiness requires an exact 40-character V3_CANDIDATE_SHA");
    }
    if (claimedCandidate !== gitSha) {
      throw new Error(
        `V3_CANDIDATE_SHA does not match checked-out HEAD: ${claimedCandidate} != ${gitSha}`,
      );
    }
  }

  return gitSha;
}

function table(rows: readonly V3QaSystemPhaseReadinessRow[]) {
  const lines = [
    "| Phase | Owner | Static wiring | Missing implementation | Missing verification | Certification |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.id} ${row.name} | ${row.owner} | **${row.staticReadiness}** | ${row.missingImplementationFiles.join(", ") || "—"} | ${row.missingVerificationFiles.join(", ") || "—"} | exact-SHA runtime evidence required |`,
    );
  }

  return lines.join("\n");
}

const candidateSha = exactSha();
const phases = assessV3QaSystemPhaseReadiness(existsSync);
const payload = {
  schemaVersion: 1,
  candidateSha,
  generatedAt: new Date().toISOString(),
  evidenceKind: "static-repository-wiring",
  certificationClaim: false,
  productionTrafficGenerated: false,
  phases,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      "# Solaris Studio V3 · Chat 5 System phase readiness",
      "",
      `- Exact source SHA: \`${candidateSha}\``,
      "- Evidence kind: **static repository wiring**",
      "- Certification claim: **false**",
      "- Production traffic generated: **false**",
      "",
      "> This report answers whether S10–S16 have their expected repository-side implementation and verification plumbing. It deliberately does not infer that any phase passed at runtime.",
      "> Exact-SHA Actions evidence remains mandatory for release certification.",
      "",
      table(phases),
      "",
    ].join("\n"),
  );
}
