import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverFunctions = readFileSync(
  resolve(process.cwd(), "src/lib/integrity.functions.ts"),
  "utf8",
);

describe("anonymous integrity server boundary", () => {
  it("creates a dedicated sessionless Supabase client", () => {
    expect(serverFunctions).toContain("function createAnonymousIntegrityClient()");
    expect(serverFunctions).toContain("persistSession: false");
    expect(serverFunctions).toContain("autoRefreshToken: false");
    expect(serverFunctions).toContain("detectSessionInUrl: false");
  });

  it("does not read or forward a signed-in Solaris session", () => {
    expect(serverFunctions).not.toMatch(/getSession\s*\(/);
    expect(serverFunctions).not.toMatch(/getUser\s*\(/);
    expect(serverFunctions).not.toMatch(/authorization\s*:/i);
    expect(serverFunctions).not.toMatch(/access_token/i);
  });

  it("routes create, read and reply operations through the anonymous RPC client", () => {
    expect(serverFunctions).toContain(
      'anonymousRpc<{\n      ok: boolean;\n      case_code: string;',
    );
    expect(serverFunctions).toContain(
      '>("public_get_anonymous_integrity_case",',
    );
    expect(serverFunctions).toContain(
      '>("public_reply_anonymous_integrity_case",',
    );
  });
});
