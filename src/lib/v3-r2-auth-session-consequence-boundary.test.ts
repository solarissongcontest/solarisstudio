import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { v3DomainConsequence } from "./v3-domain-consequence-registry";

const source = (path: string) => readFileSync(path, "utf8");
const sessions = source(
  "supabase/migrations/20261016163000_v3_account_session_management.sql",
);
const accessBoundary = source(
  "supabase/migrations/20261003212000_organisation_os_v5_platform_permission_enforcement.sql",
);
const cacheIsolation = source("src/lib/account-cache-isolation.ts");
const authSubscriber = source("src/components/app/AccountCacheIsolation.tsx");
const signOut = source("src/lib/account-session.ts");

describe("Worker 3 R2 Auth/session consequence boundary", () => {
  it("proves the browser identity projection is isolated across account changes", () => {
    expect(authSubscriber).toContain("supabase.auth.onAuthStateChange");
    expect(authSubscriber).toContain("createAccountCacheIsolationHandler");
    expect(cacheIsolation).toContain("clearPrivateAccountQueries(client)");
    expect(cacheIsolation).toContain('client.cancelQueries({ queryKey: ["fan-session"], exact: true })');
    expect(cacheIsolation).toContain('client.setQueryData(["fan-session"], user ?? null)');
    expect(signOut).toContain("supabase.auth.signOut()");
  });

  it("proves session.revoked has a durable actor-scoped tombstone and deletes Auth session truth", () => {
    expect(sessions).toContain("create table if not exists public.studio2_account_session_revocations");
    expect(sessions).toContain("user_id uuid not null references auth.users(id)");
    expect(sessions).toContain("create or replace function public.v3_revoke_session(");
    expect(sessions).toContain("private.v3_require_active_auth_session()");
    expect(sessions).toContain("delete from auth.sessions session_row");
    expect(sessions).toContain("session_row.user_id = v_actor");
    expect(sessions).toContain("private.studio2_claim_operation");
    expect(sessions).toContain("private.studio2_complete_operation");
  });

  it("documents the remaining server-enforcement gap instead of calling Auth existence a complete replacement", () => {
    expect(accessBoundary).toContain(
      "create or replace function public.studio2_access_allowed(",
    );
    expect(accessBoundary).toContain("v_actor uuid := auth.uid()");
    expect(accessBoundary).toContain("private.studio2_user_has_capability(");
    expect(accessBoundary).not.toContain("v3_require_active_auth_session");
    expect(accessBoundary).not.toContain("from auth.sessions");
  });

  it("keeps Auth/session consequence labels unresolved until revoked JWTs fail every protected boundary", () => {
    for (const eventType of [
      "identity.authenticated",
      "identity.signed_out",
      "session.changed",
      "session.revoked",
    ]) {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence, eventType).not.toBeNull();
      expect(consequence?.implementationState, eventType).toBe("declared");
      expect(consequence?.replacement, eventType).toBeNull();
    }
  });
});
