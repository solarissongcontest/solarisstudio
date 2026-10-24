import { existsSync, readFileSync } from "node:fs";

import { evaluateV3NavigationRuntimeEvidence } from "../src/lib/v3-qa-navigation-runtime-evidence";

function read(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const evidence = evaluateV3NavigationRuntimeEvidence({
  appRuntime: read("src/components/app/AppRuntime.tsx"),
  swipeSurface: read("src/components/v3/V3TopLevelSwipeSurface.tsx"),
  serviceWorker: existsSync("public/sw.js")
    ? read("public/sw.js")
    : existsSync("src/sw.ts")
      ? read("src/sw.ts")
      : null,
});

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      "V3 navigation/PWA runtime evidence",
      `gesture arbitration: ${evidence.gestureArbitration}`,
      `standalone PWA: ${evidence.standalonePwa}`,
      `safe updates: ${evidence.safeUpdates}`,
      `resume reconciliation: ${evidence.resumeReconciliation}`,
      `offline shell: ${evidence.offlineShell}`,
      `P45 runtime aggregate: ${evidence.pwaAggregate}`,
      "",
      "This is implementation evidence only. It is not route-activation, Browser Audit, real-device, parity or release certification evidence.",
      "",
    ].join("\n"),
  );
}

if (process.argv.includes("--require-implemented")) {
  const required = [
    evidence.gestureArbitration,
    evidence.standalonePwa,
    evidence.safeUpdates,
    evidence.resumeReconciliation,
    evidence.pwaAggregate,
  ];
  if (required.some((state) => state !== "implemented")) {
    process.exitCode = 1;
  }
}
