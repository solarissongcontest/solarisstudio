import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("P42 devices and sessions authority boundary", () => {
  const client = () => read("src/lib/v3-account-sessions.ts");
  const transport = () => read("src/lib/account-session-management.ts");
  const panel = () => read("src/components/v3/V3AccountSessionsPanel.tsx");
  const account = () => read("src/components/v3/V3AccountSections.tsx");
  const cacheIsolation = () => read("src/lib/account-cache-isolation.ts");
  const migration = () => read("supabase/migrations/20261016163000_v3_account_session_management.sql");

  it("uses the caller-bound System projection through the non-V3 data boundary", () => {
    expect(migration()).toContain("create or replace function public.v3_my_sessions()");
    expect(client()).toContain("fetchAccountSessionProjection()");
    expect(transport()).toContain('supabase.rpc("v3_my_sessions")');
    expect(account()).toContain("<V3AccountSessionsPanel");
    expect(client()).not.toContain("integrations/supabase");
    expect(panel()).not.toContain("navigator.userAgent");
    expect(panel()).not.toContain("localStorage");
    expect(panel()).not.toContain("sessionStorage");
    expect(panel()).toContain("Raw session IDs, IP addresses and tokens are never shown here.");
  });

  it("scopes private device/session cache state to the authenticated viewer and auth lifecycle", () => {
    expect(client()).toContain('return [SESSION_QUERY_PREFIX, viewerId] as const');
    expect(client()).toContain("useV3AccountSessions(viewerId");
    expect(client()).toContain("useRevokeV3AccountSession(viewerId");
    expect(panel()).toContain("const viewerId = workspace.user?.id ?? null");
    expect(account()).toContain('const viewerKey = workspace.user?.id ?? "signed-out"');
    expect(account()).toContain("key={`sessions:${viewerKey}`}");
    expect(cacheIsolation()).toContain("v3-account-");
  });

  it("revokes only an opaque server session handle with idempotent operation identity", () => {
    expect(migration()).toContain("create or replace function public.v3_revoke_session(");
    expect(client()).toContain("revokeAccountSessionRpc(attempt)");
    expect(transport()).toContain('supabase.rpc("v3_revoke_session"');
    expect(transport()).toContain("p_session_handle: input.sessionHandle");
    expect(transport()).toContain("p_operation_id: input.operationId");
    expect(transport()).toContain("p_idempotency_key: input.idempotencyKey");
    expect(client()).toContain("const operationId = crypto.randomUUID()");
    expect(transport()).not.toMatch(/v3_revoke_session[\s\S]{0,500}(user_id|userId|profile_id)/);
  });

  it("preserves the reviewed operation through fresh-auth retry without replacing the browser session", () => {
    expect(transport()).toContain("createPasswordVerificationClient");
    expect(transport()).toContain("persistSession: false");
    expect(transport()).toContain("autoRefreshToken: false");
    expect(transport()).toContain("verifier.auth.signInWithPassword");
    expect(transport()).toContain('verifier.auth.signOut({ scope: "local" })');
    expect(transport()).not.toContain("typedSupabase.auth.signInWithPassword");
    expect(panel()).toContain("revokeV3AccountSessionWithPassword(attempt, password)");
    expect(panel()).toContain("const refreshed = await sessionsQuery.refetch()");
    expect(panel()).toContain("session.sessionHandle === pending.sessionHandle");
    expect(panel()).toContain("same reviewed revocation operation");
  });

  it("locks the reviewed revocation target while fresh-auth confirmation is open", () => {
    const code = panel();
    expect(code).toContain("needsFreshAuth ||\n      attempt");
    expect(code).toContain("locked={needsFreshAuth || reauthenticating}");
    expect(code).toContain('locked ? "Finish verification" : "Revoke"');
    expect(code).toContain("setAttempt(null)");
  });

  it("fails closed while the production migration is absent or projection verification fails", () => {
    expect(client()).toContain("isV3AccountSessionContractUnavailable");
    expect(panel()).toContain('data-v3-account-sessions-state="unavailable"');
    expect(panel()).toContain('data-v3-account-sessions-state="error"');
    expect(panel()).toContain("No device list is shown when the server-authoritative projection cannot be verified.");
  });
});
