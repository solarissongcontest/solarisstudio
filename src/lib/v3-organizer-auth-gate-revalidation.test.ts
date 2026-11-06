import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldRevalidateOrganizerGate } from "./v3-organizer-auth-gate-revalidation";

const gate = readFileSync("src/components/admin/UnifiedServiceAdminGate.tsx", "utf8");

describe("Unified Organizer gate authorization after account transitions", () => {
  it("detects A to B without a route transition and always rechecks sign-out", () => {
    expect(shouldRevalidateOrganizerGate("SIGNED_IN", "actor-A", "actor-B")).toBe(true);
    expect(shouldRevalidateOrganizerGate("SIGNED_OUT", null, null)).toBe(true);
    expect(shouldRevalidateOrganizerGate("SIGNED_OUT", "actor-A", null)).toBe(true);
    expect(shouldRevalidateOrganizerGate("USER_UPDATED", "actor-A", "actor-A")).toBe(true);
  });

  it("avoids redundant initial and same-actor session refresh work", () => {
    expect(shouldRevalidateOrganizerGate("INITIAL_SESSION", null, "actor-A")).toBe(false);
    expect(shouldRevalidateOrganizerGate("SIGNED_IN", "actor-A", "actor-A")).toBe(false);
    expect(shouldRevalidateOrganizerGate("TOKEN_REFRESHED", "actor-A", "actor-A")).toBe(false);
    expect(shouldRevalidateOrganizerGate("TOKEN_REFRESHED", "actor-A", "actor-B")).toBe(true);
  });

  it("masks the old shell immediately and resolves authorizations outside the callback", () => {
    expect(gate).toContain("supabase.auth.onAuthStateChange((event, session) => {");
    expect(gate).toContain("authGenerationRef.current += 1;");
    expect(gate).toContain('setState({ status: "checking", user: null });');
    expect(gate).toContain("setAuthRevision((revision) => revision + 1);");
    expect(gate).toContain("return () => data.subscription.unsubscribe();");
    const listener = gate.slice(gate.indexOf("supabase.auth.onAuthStateChange("),
      gate.indexOf("return () => data.subscription.unsubscribe();"));
    expect(listener).not.toContain("auth.getUser()");
    expect(listener).not.toContain("hasSolarisOrganizerAccess(");
  });

  it("prevents stale A results from reopening the shell after B signs in", () => {
    expect(gate).toContain("requestGeneration === authGenerationRef.current");
    expect(gate).toContain("if (!isCurrent()) return;");
    expect(gate).toContain("if (isCurrent()) {");
    expect(gate).toContain("observedActorRef.current = userData.user.id;");
    expect(gate).toContain("authRevision, getTelevotingStatus, navigate, pathname");
  });

  it("retains capability checks, Televoting readiness and account-scoped provider", () => {
    expect(gate).toContain("await hasSolarisOrganizerAccess(userData.user.id)");
    expect(gate).toContain("await getTelevotingStatus()");
    expect(gate).toContain("<AuthenticatedUserProvider user={user}>");
  });
});
