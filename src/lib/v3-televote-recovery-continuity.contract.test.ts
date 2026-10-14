import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Televote recovery continuity contract", () => {
  const migration = source("supabase/migrations/20261014153000_v3_televote_recovery_continuity.sql");
  const cookie = source("src/integrations/televoting/recovery-cookie.server.ts");
  const functions = source("src/integrations/televoting/vote.functions.ts");
  const server = source("src/integrations/televoting/vote.server.ts");
  const wrapper = source("src/components/televoting/TelevotingBoothWithReceipt.tsx");

  it("keeps recovery secrets hashed at rest and unavailable to browser database roles", () => {
    expect(migration).toContain("recovery_secret_hash");
    expect(migration).toContain("extensions.digest(v_recovery_secret, 'sha256')");
    expect(migration).toContain("revoke all on function public.v3_create_televote_recovery_handle(uuid) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.v3_reconcile_televote_recovery(uuid, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.v3_create_televote_recovery_handle(uuid) to service_role");
    expect(migration).toContain("grant execute on function public.v3_reconcile_televote_recovery(uuid, text) to service_role");
  });

  it("persists only the read-only recovery capability in an HTTP-only cookie", () => {
    expect(cookie).toContain("httpOnly: true");
    expect(cookie).toContain('sameSite: "lax"');
    expect(cookie).not.toContain("localStorage");
    expect(cookie).not.toContain("sessionStorage");
    expect(cookie).not.toContain("preflightToken");
    expect(functions).toContain("writeTelevoteRecoveryCookie(data.roundId, recovery)");
    expect(functions).not.toMatch(/localStorage|sessionStorage/);
  });

  it("routes recovery through rate-limited server authority rather than direct browser RPCs", () => {
    expect(server).toContain('enforceTelevotingRateLimit(`vote-recovery:');
    expect(server).toContain('enforceTelevotingRateLimit(`vote-recovery-create:');
    expect(server).toContain('"v3_reconcile_televote_recovery"');
    expect(server).toContain('"v3_create_televote_recovery_handle"');
    expect(functions).toContain("reconcileMergedTelevotingRecoveryCookie");
    expect(wrapper).toContain("recoverCookieReceipt({ data: { roundId } })");
  });

  it("makes portable recovery read-only, explicit, and reusable after a successful import", () => {
    expect(functions).toContain("const receipt = await reconcileMergedTelevotingRecoveryServer(data)");
    expect(functions).toContain("writeTelevoteRecoveryCookie(data.roundId");
    expect(wrapper).toContain("Show recovery code");
    expect(wrapper).toContain("Recover receipt");
    expect(wrapper).toContain("it cannot submit, edit or reveal your ballot");
    expect(wrapper).toContain("only restores the authoritative receipt; it never submits a new ballot");
  });

  it("never treats a browser marker or a recovery error as proof of acceptance", () => {
    expect(wrapper).toContain("The authoritative receipt still came from the server");
    expect(wrapper).toContain("Absence or temporary recovery failure is not evidence that a ballot");
    expect(wrapper).toContain("if (!receipt)");
  });
});
