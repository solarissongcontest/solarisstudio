import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const organizerRpcCallers = [
  "src/routes/_authenticated/admin/next-in-line.tsx",
  "src/routes/_authenticated/admin/jury/$slug.tsx",
] as const;

describe("Supabase RPC method binding", () => {
  it("never detaches rpc from its Supabase client receiver", () => {
    for (const path of organizerRpcCallers) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/=\s*(?:confirmationsSupabase|supabase)\.rpc\s+as/);
    }
  });

  it("keeps the known dynamic RPC wrappers as client method calls", () => {
    const nextInLine = readFileSync(organizerRpcCallers[0], "utf8");
    const jury = readFileSync(organizerRpcCallers[1], "utf8");
    expect(nextInLine).toContain("confirmationsSupabase.rpc(functionName, args)");
    expect(jury).toContain("(supabase as any).rpc(functionName, args)");
  });
});
