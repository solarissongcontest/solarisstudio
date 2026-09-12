import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(path))) return [];
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) return [];
    return [path];
  });
}

describe("frontend secret boundary", () => {
  it("never embeds or requests a Supabase service-role key from browser source", () => {
    const violations = sourceFiles(resolve(process.cwd(), "src")).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const findings = [
        /SUPABASE_SERVICE_ROLE_KEY/g,
        /VITE_[A-Z0-9_]*SERVICE_ROLE/g,
        /service[_-]?role[_-]?key/gi,
        /createClient\([^)]*service[_-]?role/gi,
      ].flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[0]));
      return findings.length ? [`${path}: ${findings.join(", ")}`] : [];
    });

    expect(violations).toEqual([]);
  });
});
