import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PERSONALITY_DIR = "src/styles/personalities";
const PROTECTED = [
  "--solaris-app-",
  ".solaris-app-toolbar",
  ".solaris-app-tabbar",
  "data-solaris-app",
  "safe-area-inset",
];

describe("country personality app-chrome containment", () => {
  it("keeps personality adapters away from protected app geometry", () => {
    const violations: string[] = [];

    for (const file of readdirSync(PERSONALITY_DIR).filter((name) => name.endsWith(".css"))) {
      const path = join(PERSONALITY_DIR, file);
      const css = readFileSync(path, "utf8");
      for (const token of PROTECTED) {
        if (css.includes(token)) violations.push(`${file}: ${token}`);
      }
    }

    expect(
      violations,
      "Country personality adapters may style content personality, never app chrome or safe areas.",
    ).toEqual([]);
  });

  it("keeps the app shell as the only owner of installed navigation geometry", () => {
    const app = readFileSync("src/styles/app-shell.css", "utf8");
    expect(app).toContain("--solaris-app-toolbar-height");
    expect(app).toContain("--solaris-app-tabbar-height");
    expect(app).toContain("--solaris-app-bottom-obstruction");
    expect(app).toContain("--solaris-app-safe-bottom");
  });
});
