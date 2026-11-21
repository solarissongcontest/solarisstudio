import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  scanV3S16StaticAuthority,
  V3_S16_CRITICAL_DOMAINS,
} from "./v3-s16-mutation-authority";

const sourcePath = "src/integrations/televoting/editions.server.ts";
const source = readFileSync(sourcePath, "utf8");
const client = readFileSync("src/integrations/televoting/client.server.ts", "utf8");
const sql = readFileSync(".github/tests/v3-s16-televote-edition-schema-pin.sql", "utf8");
const runner = readFileSync(".github/scripts/v3-s16-catalog-rehearsal.sh", "utf8");
const s14Workflow = readFileSync(".github/workflows/v3-s14-archive-forward-effects-local.yml", "utf8");

describe("P13: Televote edition updates cannot accidentally target public.editions", () => {
  it("pins every edition query and write to the correct Televote schema", () => {
    const calls = source.match(/\.from\("editions"\)/g) ?? [];
    const pinned = source.match(/\.schema\("televoting"\)\s*\.from\("editions"\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(8);
    expect(pinned).toHaveLength(calls.length);
    expect(client).toContain('db: { schema: "televoting" }');
    expect(client).toContain("getSolarisAccessTokenServer()");
    expect(source).toContain("requireMergedTelevotingAdminServer()");
    // No public-side edition writer or widened credentials are added.
    expect(source).not.toContain('.schema("public").from("editions")');
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("supabaseAdmin");
  });

  it("retains the unchanged S16 scanner while eliminating only a false public-editions target", () => {
    const findings = scanV3S16StaticAuthority(
      [{ path: sourcePath, source }],
      V3_S16_CRITICAL_DOMAINS.filter((domain) => domain.id === "contest-lifecycle"),
    );
    expect(findings.filter((finding) => finding.kind === "direct_application_writer")).toEqual([]);
    expect(sql).toContain("'public.editions'::regclass");
    expect(sql).toContain("'televoting.editions'::regclass");
    expect(runner).toContain("v3-s16-televote-edition-schema-pin.sql");
    // Without the independent producer, S16 must (and did) refuse a missing
    // same-SHA Publication certificate. Keep that failure closed and trigger
    // its actual PostgreSQL evidence for this class of S16 source changes.
    expect(s14Workflow).toContain('".github/scripts/v3-s16-catalog-rehearsal.sh"');
    expect(s14Workflow).toContain('".github/tests/v3-s16-*.sql"');
    expect(s14Workflow).toContain('"src/lib/v3-s16-*.contract.test.ts"');
  });

  it("produces identical Televote PostgREST request scope with explicit or default schema", async () => {
    const captured: string[] = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      captured.push(headers.get("Content-Profile") || "");
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const db = createClient("http://127.0.0.1:54321", "sb_publishable_testing_only", {
      db: { schema: "televoting" },
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: mockFetch },
    });
    await db.from("editions").update({ name: "Test" }).eq("id", "00000000-0000-4000-8000-000000000001");
    await db.schema("televoting").from("editions").update({ name: "Test" }).eq("id", "00000000-0000-4000-8000-000000000001");
    expect(captured).toEqual(["televoting", "televoting"]);
  });
});
