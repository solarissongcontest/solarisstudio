import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const expected = [
  "s16-canonical-ci.json",
  "s16-production-isolation.json",
  "s16-migration-rehearsal.json",
  "s14-full-contest.json",
  "security-advisor-classification.json",
  "s16-public-acceptance.json",
  "s16-organizer-acceptance.json",
  "s16-navigation-acceptance.json",
  "s16-accessibility.json",
  "s16-responsive-behavior.json",
] as const;

const sourceRoot = process.env.V3_S16_SOURCE_ROOT?.trim();
const outputRoot = resolve(
  process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence",
);

if (!sourceRoot) throw new Error("V3_S16_SOURCE_ROOT is required");
const source = resolve(sourceRoot);
if (!existsSync(source) || !statSync(source).isDirectory()) {
  throw new Error(`V3_S16_SOURCE_ROOT is not a directory: ${source}`);
}

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

const files = walk(source);
mkdirSync(outputRoot, { recursive: true });

for (const filename of expected) {
  const matches = files.filter((path) => basename(path) === filename);
  if (matches.length !== 1) {
    throw new Error(
      `${filename} must appear exactly once across downloaded evidence artifacts; found ${matches.length}`,
    );
  }
  cpSync(matches[0], join(outputRoot, filename));
}

const unexpectedCanonical = files
  .map((path) => basename(path))
  .filter(
    (filename) =>
      (filename.startsWith("s16-") || filename === "s14-full-contest.json") &&
      !expected.includes(filename as (typeof expected)[number]),
  );

if (unexpectedCanonical.length) {
  throw new Error(
    `downloaded evidence contains unexpected canonical-looking files: ${[
      ...new Set(unexpectedCanonical),
    ].join(", ")}`,
  );
}

process.stdout.write(
  `Assembled ${expected.length} immutable source evidence files into ${outputRoot}\n`,
);
