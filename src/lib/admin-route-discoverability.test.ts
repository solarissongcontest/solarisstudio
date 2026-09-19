import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function routeFiles(root: string): string[] {
  const absolute = resolve(process.cwd(), root);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const relative = path.slice(resolve(process.cwd()).length + 1).replaceAll("\\", "/");
    if (statSync(path).isDirectory()) return routeFiles(relative);
    return /\.(ts|tsx)$/.test(path) ? [relative] : [];
  });
}

function routePattern(content: string) {
  return content.match(/createFileRoute\((["'])(.*?)\1\)/)?.[2] ?? null;
}

function navigablePrefix(pattern: string) {
  const publicPath = pattern.replace("/_authenticated", "").replace(/\/$/, "") || "/";
  const dynamicIndex = publicPath.indexOf("/$");
  return dynamicIndex >= 0 ? publicPath.slice(0, dynamicIndex) || "/" : publicPath;
}

const navigationCorpus = [
  source("src/components/admin/admin-navigation.ts"),
  source("src/components/admin/admin-domains.ts"),
  source("src/components/admin/admin-contextual-navigation.ts"),
  source("src/components/admin/AdminNav.tsx"),
  source("src/components/admin/AdminFrame.tsx"),
  source("src/routes/_authenticated/admin/operations.tsx"),
  source("src/routes/_authenticated/admin/menu.tsx"),
].join("\n");

const roots = [
  "src/routes/_authenticated/admin",
  "src/routes/confirmations/admin",
  "src/routes/televoting/admin",
];

describe("Organizer route discoverability", () => {
  it("does not allow real Organizer pages to exist only as secret URLs", () => {
    const failures: string[] = [];

    for (const file of roots.flatMap(routeFiles)) {
      const content = source(file);
      const pattern = routePattern(content);
      if (!pattern) continue;

      // Layout-only route. It owns the authenticated shell rather than a destination.
      if (pattern === "/_authenticated/admin") continue;

      // Compatibility and retired routes are allowed only when they explicitly redirect.
      if (content.includes("throw redirect(")) continue;

      const prefix = navigablePrefix(pattern);
      const visible =
        navigationCorpus.includes(`"${prefix}"`) ||
        navigationCorpus.includes(`'${prefix}'`) ||
        navigationCorpus.includes(`${prefix}/`);

      if (!visible) failures.push(`${pattern} · ${file}`);
    }

    expect(
      failures,
      `Every functional Organizer route needs a visible parent/navigation owner. Hidden routes:\n${failures.join("\n")}`,
    ).toEqual([]);
  });
});
