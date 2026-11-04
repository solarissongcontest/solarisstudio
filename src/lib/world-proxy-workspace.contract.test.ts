import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const workspace = source("src/components/world/WorldProxyWorkspace.tsx");
const api = source("src/lib/world-proxy-commands.ts");
const route = source("src/routes/world/proxies/index.tsx");

describe("TG6 Proxy workspace access and operation safety", () => {
  it("does not bypass emergency maintenance or the server's public World rollout gate", () => {
    expect(route).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(route).toContain("throw notFound()");
    expect(workspace).toContain("queryFn: proxyWorldEnabled");
    expect(workspace).toContain("world.data !== true");
    expect(api).toContain('p_key: "terra_world_public"');
    expect(route).toContain("noindex,nofollow");
  });

  it("uses country-controlled private identity candidates, never foreign public rosters", () => {
    expect(workspace).toContain("getProxyCandidates(representative!.id, representative!.revision)");
    expect(workspace).toContain('queryKey: ["world", "proxies", "candidates"');
    expect(workspace).toContain("const candidates = candidateRoster.data ?? []");
    expect(workspace).not.toContain("directory.data?.representatives.filter");
    expect(api).toContain('client.rpc("world_my_proxy_candidates_v1"');
    expect(api).toContain("parseProxyCandidates(data, representationId, expectedRevision)");
    expect(workspace).toContain("candidateRoster.isError");
    expect(workspace).toContain("No other person with a recorded delegation");
    expect(workspace).not.toContain("Date.now()");
    expect(workspace).toContain('item.status === "requested" || item.status === "approved"');
  });

  it("preserves the exact idempotency key on ambiguous results and cannot silently start another mutation", () => {
    expect(workspace).toContain("retry.current = action");
    expect(workspace).toContain("if (knownRejection(failure))");
    expect(workspace).toContain("retry.current = null");
    expect(workspace).toContain("if (retry.current) {");
    expect(workspace.match(/if \(retry\.current\) \{/g)?.length).toBeGreaterThanOrEqual(4);
    expect(workspace).toContain("disabled={busy || Boolean(retry.current)}");
    expect(workspace).toContain('onClick={() => void execute(retry.current!)}');
    expect(workspace).toContain("setError(message(failure))");
    expect(workspace).toContain("queryKey: [\"world\", \"proxies\"]");
  });

  it("parses mutation receipts instead of treating a successful HTTP request as an official decision", () => {
    expect(api).toContain('envelope.status !== "succeeded"');
    expect(api).toContain("envelope.operationId !== expected.operationId");
    expect(api).toContain("result.ok !== true");
    expect(api).toContain("result.status !== expected.status");
    expect(api).toContain("expected.proxyId !== result.proxyId");
    expect(api).toContain("expected.representationId !== result.representationId");
    expect(api).toContain('client.rpc("world_request_proxy_v1"');
    expect(api).toContain('client.rpc("world_approve_proxy_v1"');
    expect(api).toContain('client.rpc("world_revoke_proxy_v1"');
  });
});
