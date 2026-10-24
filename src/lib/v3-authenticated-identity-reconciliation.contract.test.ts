import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = () =>
  readFileSync(resolve(process.cwd(), "src/routes/_authenticated/route.tsx"), "utf8");

describe("V3 authenticated identity reconciliation", () => {
  it("uses the shared live session namespace only to trigger verified identity rechecks", () => {
    const text = route();
    expect(text).toContain('import { useFanSession } from "@/lib/prediction-data"');
    expect(text).toContain("const session = useFanSession()");
    expect(text).toContain("const sessionIdentityKey = session.isPending");
    expect(text).toContain('["authenticated-identity-gate", sessionIdentityKey]');
    expect(text).toContain("supabase.auth.getUser()");
  });

  it("does not create a second auth subscription or weaken protected-route verification to getSession", () => {
    const text = route();
    expect(text).not.toContain("supabase.auth.onAuthStateChange");
    expect(text).not.toContain("supabase.auth.getSession");
    expect(text).toContain("getUser()` remains the verified authority");
  });

  it("distinguishes unresolved, errored and signed-out session triggers", () => {
    const text = route();
    expect(text).toContain('? "pending"');
    expect(text).toContain('? "error"');
    expect(text).toContain('session.data?.id ?? "signed-out"');
    expect(text).toContain("gcTime: 0");
  });

  it("keeps direct protected-route return intent when verified identity disappears", () => {
    const text = route();
    expect(text).toContain("const redirect = `${window.location.pathname}${window.location.search}`");
    expect(text).toContain('to: "/auth"');
    expect(text).toContain("search: { redirect }");
    expect(text).toContain("replace: true");
  });

  it("publishes only the freshly verified user to protected descendants", () => {
    const text = route();
    expect(text).toContain("<AuthenticatedUserProvider user={identity.data}>");
    expect(text).not.toContain("<AuthenticatedUserProvider user={session.data}>");
  });

  it("fails closed when current delegation access cannot be verified", () => {
    const text = route();
    expect(text).toContain("account.isError || account.data?.access.schemaReady === false");
    expect(text).toContain('title="Account access unavailable"');
    expect(text).toContain("protected participation tools stay closed");
    expect(text).toContain("void account.refetch()");
    expect(text).toContain("Retry access check");
  });

  it("does not reinterpret access-read failure as signed out, unassigned or active", () => {
    const text = route();
    const unavailable = text.indexOf("account.isError || account.data?.access.schemaReady === false");
    const suspended = text.indexOf('account.data?.access.countryStatus === "suspended"');
    const children = text.indexOf("return <>{children}</>");

    expect(unavailable).toBeGreaterThan(-1);
    expect(suspended).toBeGreaterThan(unavailable);
    expect(children).toBeGreaterThan(suspended);
    expect(text).toContain("Your account has not been treated as signed out or unassigned");
  });
});