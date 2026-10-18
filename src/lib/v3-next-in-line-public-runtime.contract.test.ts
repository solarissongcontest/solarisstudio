import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/confirmation-next-in-line.functions.ts"),
    "utf8",
  );

const route = () =>
  readFileSync(resolve(process.cwd(), "src/routes/next-in-line.tsx"), "utf8");

const systemMigration = () =>
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql",
    ),
    "utf8",
  );

describe("V3 Public Next in Line runtime", () => {
  it("propagates the authenticated Solaris request instead of mutating anonymously", () => {
    const runtime = source();

    expect(runtime).toContain("createSolarisAuthenticatedClientServer");
    expect(runtime).toContain("getSolarisAccessTokenServer");
    expect(runtime).toContain("type AuthenticatedRpcClient");
    expect(runtime).toContain("client.auth.getUser(token)");
    expect(runtime).toContain('throw new Error("AUTHENTICATION")');
    expect(runtime).toContain('"v3_submit_next_in_line"');
    expect(runtime).not.toContain('rpc<{ ok: boolean; error?: string }>("submit_next_in_line"');
  });

  it("keeps signed-out visitors at an explicit authentication boundary instead of reporting an inactive competition", () => {
    const page = route();

    expect(page).toContain("useFanSession()");
    expect(page).toContain("if (!session.data)");
    expect(page).toContain('search={{ redirect: "/next-in-line" }}');
    expect(page).toContain("Sign in to enter Next in Line");
    expect(page).toContain("eligible delegation and source entry from your authenticated account");
    expect(page).toContain("return <NextInLineCompetition />");
  });

  it("uses the caller-scoped V3 projection as the participant read authority", () => {
    const runtime = source();

    expect(runtime).toContain('"v3_my_next_in_line"');
    expect(runtime).toContain("projection.contexts");
    expect(runtime).toContain("context.eligible");
    expect(runtime).toContain("candidate.sourceSubmissionId === data.source_submission_id");
    expect(runtime).toContain("context.country.name.trim().toLocaleLowerCase()");
  });

  it("keeps anonymous access read-only and limited to active-edition discovery", () => {
    const runtime = source();

    expect(runtime).toContain("createConfirmationPublicRuntimeClient");
    expect(runtime).toContain('"public_next_in_line_countries"');
    expect(runtime).not.toContain('"public_next_in_line_country"');
    expect(runtime).not.toContain("service_role");
    expect(runtime).not.toContain("supabaseAdmin");
  });

  it("executes the canonical S2 operation envelope with a hashed stable retry identity", () => {
    const runtime = source();

    expect(runtime).toContain("p_operation_id: crypto.randomUUID()");
    expect(runtime).toContain("p_idempotency_key: await nextInLineIdempotencyKey(data)");
    expect(runtime).toContain('crypto.subtle.digest(\n    "SHA-256"');
    expect(runtime).toContain("participant-next-in-line-v3:${fingerprint}");
    expect(runtime).toContain("semanticRequest");
  });

  it("classifies authentication and authorization failures instead of presenting them as generic availability", () => {
    const runtime = source();

    expect(runtime).toContain("classifyRuntimeError(error)");
    expect(runtime).toContain('return "authentication"');
    expect(runtime).toContain('return "forbidden"');
  });

  it("reconciles a lost or ambiguous response against canonical submission truth", () => {
    const runtime = source();

    expect(runtime).toContain("reconcileSubmittedIntent(client, data)");
    expect(runtime).toContain("submissionMatchesIntent");
    expect(runtime).toContain("reconciled: true as const");
    expect(runtime).toContain("lastOperationId");
  });

  it("does not create browser-owned or direct-table write authority", () => {
    const runtime = source();

    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      '.from("next_in_line_submissions")',
    ]) {
      expect(runtime).not.toContain(forbidden);
    }
  });

  it("matches the existing System V3 authenticated projection and command contract", () => {
    const migration = systemMigration();

    expect(migration).toContain("create or replace function public.v3_submit_next_in_line(");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("private.v3_next_in_line_actor_controls_country");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("create or replace function public.v3_my_next_in_line(");
    expect(migration).toContain("grant execute on function public.v3_my_next_in_line(uuid)\n  to authenticated");
    expect(migration).toContain("grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)\n  to authenticated");
  });
});
