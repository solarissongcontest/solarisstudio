import {
  V3_AUTHORIZATION_KNOWN_GAPS,
  V3_AUTHORIZATION_REQUIREMENT_REGISTRY,
  validateV3AuthorizationRequirementRegistry,
} from "../src/lib/v3-authorization-requirement-registry";

const json = process.argv.includes("--json");
const registryErrors = validateV3AuthorizationRequirementRegistry();
const declared = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.filter((item) => item.state !== "verified");
const verified = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.filter((item) => item.state === "verified");
const incompleteVerified = verified.filter(
  (item) =>
    !item.requiredCapability ||
    !item.scope ||
    !item.objectResolution ||
    !item.serverBoundary ||
    item.serviceRoleAllowed === null ||
    item.negativePaths.length < 3 ||
    item.evidence.length === 0,
);

const ready =
  registryErrors.length === 0 &&
  V3_AUTHORIZATION_KNOWN_GAPS.length === 0 &&
  declared.length === 0 &&
  incompleteVerified.length === 0;

const result = {
  ready,
  commandCount: V3_AUTHORIZATION_REQUIREMENT_REGISTRY.length,
  verifiedCount: verified.length,
  declaredCount: declared.length,
  knownGapCount: V3_AUTHORIZATION_KNOWN_GAPS.length,
  registryErrors,
  declaredCommands: declared.map((item) => ({ command: item.command, ownerDomain: item.ownerDomain })),
  incompleteVerifiedCommands: incompleteVerified.map((item) => item.command),
};

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (ready) {
  process.stdout.write(
    `S16 authorization readiness: READY (${verified.length}/${V3_AUTHORIZATION_REQUIREMENT_REGISTRY.length} canonical mutation commands verified)\n`,
  );
} else {
  process.stdout.write("S16 authorization readiness: BLOCKED\n");
  if (registryErrors.length) {
    for (const error of registryErrors) process.stdout.write(`- registry: ${error}\n`);
  }
  if (V3_AUTHORIZATION_KNOWN_GAPS.length) {
    process.stdout.write(`- ${V3_AUTHORIZATION_KNOWN_GAPS.length} known authorization gaps remain open\n`);
  }
  if (declared.length) {
    process.stdout.write(`- ${declared.length} canonical mutation commands are declared but not verified\n`);
    for (const item of declared) process.stdout.write(`  - ${item.command} (${item.ownerDomain})\n`);
  }
  if (incompleteVerified.length) {
    process.stdout.write(`- ${incompleteVerified.length} verified commands have incomplete hostile-path evidence\n`);
  }
}

if (!ready) process.exitCode = 1;
