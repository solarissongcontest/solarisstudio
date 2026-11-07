import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isV3S16UnsafeStandaloneIdentityWriter, scanV3S16StaticAuthority } from "./v3-s16-mutation-authority";

const root = resolve(process.cwd(), "scripts");
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
    const unsafe = scriptSources(root).filter((path) =>
      isV3S16UnsafeStandaloneIdentityWriter({
        path: relative(process.cwd(), path).replaceAll(String.fromCharCode(92), "/"),
        source: readFileSync(path, "utf8"),
      }),
    );

    // Account changes belong to authenticated, authorized, auditable server
    // operations, not standalone scripts able to act with service-role access.
    expect(unsafe).toEqual([]);
  });

  it("classifies standalone raw account mutations as hard S16 release blockers", () => {
    const findings = scanV3S16StaticAuthority(
      [{
        path: "scripts/one-off-identity-update.mjs",
        source: "await supabase.auth.admin.updateUserById('fixed-id', { email: 'test@example.invalid' });",
      }],
      [],
    );

    expect(isV3S16UnsafeStandaloneIdentityWriter({
      path: "scripts/destructured-auth.js",
      source: "await auth.admin.deleteUser('fixed-id');",
    })).toBe(true);

    expect(findings).toEqual([
      expect.objectContaining({
        domain: "account-session",
        kind: "competing_legacy_writer",
        path: "scripts/one-off-identity-update.mjs",
        releaseRisk: "hard_blocker",
      }),
    ]);
  });

  it("does not misclassify isolated rehearsal data mutations or S16 source tests", () => {
    const findings = scanV3S16StaticAuthority(
      [
        { path: "scripts/local-rehearsal.ts", source: "await db.from('entries').update({ name: 'test' });" },
        { path: "scripts/writer.test.ts", source: "await admin.auth.admin.deleteUser('fixture-id');" },
      ],
      [{
        id: "entry",
        risk: "integrity_critical",
        canonicalTables: ["public.entries"],
        canonicalOwner: "entry domain",
        canonicalCommands: [],
      }],
    );

    expect(findings).toEqual([]);
  });
});
