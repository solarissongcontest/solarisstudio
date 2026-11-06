import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "scripts");
const forbiddenDirectIdentityWrites =
  /\.auth\s*\.\s*admin\s*\.\s*(?:updateUserById|deleteUser)\s*\(/;

function scriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return scriptSources(path);
    return entry.isFile() && /\.(?:mjs|cjs|js|mts|cts|ts)$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("S16 canonical identity mutation authority", () => {
  it("does not ship the one-off hard-coded user email mutation utility", () => {
    expect(existsSync(join(root, "change-user-email.mjs"))).toBe(false);
  });

  it("does not permit scripts to mutate account identity through raw auth.admin calls", () => {
    const unsafe = scriptSources(root)
      .filter((path) => forbiddenDirectIdentityWrites.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));

    // Account changes belong to authenticated, authorized, auditable server
    // operations, not standalone scripts able to act with service-role access.
    expect(unsafe).toEqual([]);
  });
});
