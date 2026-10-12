import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/integrations/supabase/request-auth.server.ts"),
    "utf8",
  );

describe("Solaris request-authenticated server client architecture", () => {
  it("has no service-role or secret-key environment fallback", () => {
    const client = source();

    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(client).not.toContain("SUPABASE_SECRET_KEY");
    expect(client).not.toContain("supabaseAdmin");
    expect(client).not.toContain("serviceKey");
    expect(client).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(client).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("preserves caller JWT as Authorization while publishable key identifies the app", () => {
    const client = source();

    expect(client).toContain('getRequestHeader("authorization")');
    expect(client).toContain('Authorization: `Bearer ${accessToken}`');
    expect(client).toContain("createClient<Database>(url, publishableKey");
  });

  it("verifies JWT claims before exposing viewer identity", () => {
    const client = source();

    expect(client).toContain("auth.getClaims(context.accessToken)");
    expect(client).toContain("claims.sub");
    expect(client).toContain('role !== "authenticated"');
    expect(client).not.toContain("auth.getSession(");
  });

  it("keeps editable user metadata presentation-only", () => {
    const client = source();

    expect(client).toContain("displayNameFromClaims");
    expect(client).toContain("User metadata is presentation-only here");
    expect(client).not.toContain("user_metadata.capabilities");
    expect(client).not.toContain("user_metadata.role");
  });

  it("does not persist or refresh a server session", () => {
    const client = source();

    expect(client).toContain("persistSession: false");
    expect(client).toContain("autoRefreshToken: false");
    expect(client).toContain("detectSessionInUrl: false");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("sessionStorage");
  });

  it("contains no database read, RPC or workflow behavior itself", () => {
    const client = source();

    expect(client).not.toContain(".from(");
    expect(client).not.toContain(".rpc(");
    expect(client).not.toContain("submitConfirmation");
    expect(client).not.toContain("country_jury_voting_context");
  });
});
