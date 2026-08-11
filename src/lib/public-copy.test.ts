import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_ROUTES = [
  "src/routes/archive-games/index.tsx",
  "src/routes/broadcast-intelligence/index.tsx",
  "src/routes/me/index.tsx",
  "src/routes/predictions/index.tsx",
  "src/routes/predictions/$showId.tsx",
  "src/routes/predictions/share/$token.tsx",
  "src/routes/pulse/index.tsx",
  "src/routes/result-lab/index.tsx",
  "src/routes/taste-dna/index.tsx",
];

const FORBIDDEN_PUBLIC_COPY = [
  /Phase\s+\d/i,
  /SQL migration/i,
  /setup SQL/i,
  /database setup/i,
  /database-timed/i,
  /database clock/i,
  /migration is live/i,
  /private prediction tables/i,
  /Lovable/i,
];

describe("public product copy", () => {
  for (const file of PUBLIC_ROUTES) {
    it(`${file} does not expose implementation language`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");

      for (const pattern of FORBIDDEN_PUBLIC_COPY) {
        expect(source, `${file} contains ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});
