import { assessV3S16AuthorizationReadiness } from "../src/lib/v3-s16-authorization-readiness";

const json = process.argv.includes("--json");
const result = assessV3S16AuthorizationReadiness();

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.ready) {
  process.stdout.write(
    `S16 authorization readiness: READY (${result.verifiedCount}/${result.commandCount} canonical mutation commands verified)\n`,
  );
} else {
  process.stdout.write("S16 authorization readiness: BLOCKED\n");
  for (const error of result.registryErrors) process.stdout.write(`- registry: ${error}\n`);
  if (result.knownGapCount) {
    process.stdout.write(`- ${result.knownGapCount} known authorization gaps remain open\n`);
  }
  if (result.declaredCount) {
    process.stdout.write(
      `- ${result.declaredCount} canonical mutation commands are declared but not verified\n`,
    );
    for (const item of result.declaredCommands) {
      process.stdout.write(`  - ${item.command} (${item.ownerDomain})\n`);
    }
  }
  if (result.incompleteVerifiedCommands.length) {
    process.stdout.write(
      `- ${result.incompleteVerifiedCommands.length} verified commands have incomplete hostile-path evidence\n`,
    );
  }
}

if (!result.ready) process.exitCode = 1;
