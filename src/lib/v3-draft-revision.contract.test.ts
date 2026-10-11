import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris Studio V3 draft revision architecture", () => {
  it("keeps the draft protocol storage and transport agnostic", () => {
    const protocol = source("src/lib/v3-draft-revision.ts");
    expect(protocol).not.toContain("@supabase");
    expect(protocol).not.toContain("createClient(");
    expect(protocol).not.toContain("fetch(");
    expect(protocol).not.toContain("localStorage");
    expect(protocol).not.toContain("sessionStorage");
    expect(protocol).not.toContain("useEffect(");
    expect(protocol).not.toContain("useQuery(");
  });

  it("requires optimistic concurrency instead of last-write-wins", () => {
    const protocol = source("src/lib/v3-draft-revision.ts");
    expect(protocol).toContain("baseRevision");
    expect(protocol).toContain("serverRevision");
    expect(protocol).toContain('reason: "stale_revision"');
    expect(protocol).toContain('reason: "future_revision"');
    expect(protocol).toContain('status: "conflict"');
    expect(protocol).not.toMatch(/last[- ]write[- ]wins/i);
  });

  it("preserves device/session provenance without using it as ordering truth", () => {
    const protocol = source("src/lib/v3-draft-revision.ts");
    expect(protocol).toContain("deviceId");
    expect(protocol).toContain("sessionId");
    expect(protocol).toContain("updatedAt: serverTime");
    expect(protocol).not.toContain("updatedAt: command.clientUpdatedAt");
  });

  it("does not pretend local/offline edits were acknowledged by the server", () => {
    const protocol = source("src/lib/v3-draft-revision.ts");
    expect(protocol).toContain('"offline_local"');
    expect(protocol).toContain("no server acknowledgement");
    expect(protocol).toContain("serverRevision: draft.serverRevision");
  });

  it("documents that real persistence must compare-and-write transactionally", () => {
    const protocol = source("src/lib/v3-draft-revision.ts");
    expect(protocol).toContain("single transaction/conditional update");
    expect(protocol).toContain("does NOT claim operation-id idempotency");
  });
});
