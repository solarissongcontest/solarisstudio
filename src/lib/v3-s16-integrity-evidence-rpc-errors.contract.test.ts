import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const download = readFileSync(resolve(process.cwd(), "supabase/functions/integrity-evidence-download/index.ts"), "utf8");
const lifecycle = readFileSync(resolve(process.cwd(), "supabase/functions/integrity-evidence-lifecycle/index.ts"), "utf8");

describe("S16 Integrity evidence RPC error disclosure", () => {
  it("does not return protected descriptor SQL/RPC diagnostics to the requester", () => {
    expect(download).toContain('if (descriptorError) {');
    expect(download).toContain('return json({ error: "Evidence is not available." }, 403);');
    expect(lifecycle).toContain('if (descriptorError) {');
    expect(lifecycle).toContain('return json({ error: "Evidence lifecycle action is not available." }, 403);');
    expect(download).not.toMatch(/return\s+json\s*\(\s*\{\s*error\s*:\s*descriptorError(?:\.message)?/);
    expect(lifecycle).not.toMatch(/return\s+json\s*\(\s*\{\s*error\s*:\s*descriptorError(?:\.message)?/);
  });

  it("preserves a recoverable but non-disclosing response after storage changes", () => {
    expect(lifecycle).toContain('if (finalizeError) {');
    expect(lifecycle).toContain('console.error("[integrity-evidence-lifecycle] Storage changed but finalization failed", finalizeError);');
    expect(lifecycle).toContain('return json({ error: "Evidence storage was changed but lifecycle finalization failed." }, 409);');
    expect(lifecycle).not.toMatch(/return\s+json\s*\(\s*\{\s*error\s*:\s*finalizeError(?:\.message)?/);
  });

  it("keeps authorization on the caller JWT, not the privileged Storage client", () => {
    for (const edge of [download, lifecycle]) {
      expect(edge).toContain("authClient.auth.getUser(token)");
      expect(edge).toContain("await authClient.rpc(");
      expect(edge).not.toContain("await service.rpc(");
      expect(edge).toContain('if (!token) return json(');
    }
    expect(download).toContain('.createSignedUrl(descriptor.storage_path, SIGNED_URL_TTL_SECONDS');
    expect(lifecycle).toContain('.remove([descriptor.storage_path])');
    expect(download).not.toContain("storage_path: descriptor.storage_path");
  });
});
