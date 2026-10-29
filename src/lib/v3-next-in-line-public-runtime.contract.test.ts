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

const competition = () =>
  readFileSync(resolve(process.cwd(), "src/components/NextInLineCompetition.tsx"), "utf8");

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
    expect(page).toContain("<NextInLineCompetition");
    expect(page).toContain("key={session.data.id}");
  });

  it("keeps the caller-specific participant workflow out of crawler indexes", () => {
    const page = route();

    expect(page).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(page).not.toContain('{ name: "robots", content: "index, follow" }');
  });

  it("uses the caller-scoped V3 projection as the participant read authority", () => {
    const runtime = source();

    expect(runtime).toContain('"v3_my_next_in_line"');
    expect(runtime).toContain("projection.contexts");
    expect(runtime).toContain("context.eligible");
    expect(runtime).toContain("candidate.sourceSubmissionId === data.source_submission_id");
    expect(runtime).toContain("context.country.name.trim().toLocaleLowerCase()");
  });

  it("returns an explicit ineligible state instead of an empty successful country picker", () => {
    const runtime = source();

    expect(runtime).toContain("if (!countries.length)");
    expect(runtime).toContain('error: "ineligible" as const');
    expect(runtime).toContain("editing_open: false");
  });

  it("does not collapse authentication, eligibility and server failures into an inactive-competition message", () => {
    const ui = competition();

    expect(ui).toContain('reason === "authentication"');
    expect(ui).toContain('reason === "forbidden" || reason === "ineligible"');
    expect(ui).toContain("Your Solaris session expired while Next in Line was loading");
    expect(ui).toContain("does not have an eligible delegation for this Next in Line competition");
    expect(ui).toContain("There is no active Next in Line competition at the moment");
    expect(ui).toContain("Try again after Solaris reconnects");
  });

  it("renders persisted submission times through canonical Solaris time formatting", () => {
    const ui = competition();

    expect(ui).toContain('import { formatEventWallTime } from "@/lib/public-time"');
    expect(ui).toContain('formatEventWallTime(date, { locale: "en-GB" })');
    expect(ui).not.toContain("new Intl.DateTimeFormat(undefined");
  });

  it("restores the canonical saved submission and uses the server window as edit authority", () => {
    const runtime = source();
    const ui = competition();

    expect(runtime).toContain("existing_submission: context.submission");
    expect(runtime).toContain("editing_open: projection.window?.effectiveOpen === true");
    expect(runtime).toContain("server_time: projection.serverTime");
    expect(ui).toContain("result.existing_submission ?? null");
    expect(ui).toContain("setPreviewStart(existing.previewStart ?? \"\")");
    expect(ui).toContain("setSelectedNfEntry(existing.nationalFinalEntryId ?? \"\")");
    expect(ui).toContain("setEditingOpen(result.editing_open === true)");
    expect(ui).toContain("disabled={submitting || checkingDuplicate || !editingOpen}");
    expect(ui).not.toContain("Date.now()");
  });

  it("shows canonical revision and receipt evidence after save or reconciliation", () => {
    const ui = competition();

    expect(ui).toContain('data-next-in-line-existing-submission=""');
    expect(ui).toContain("Revision {existingSubmission.revision}");
    expect(ui).toContain("existingSubmission.lastOperationId");
    expect(ui).toContain('data-next-in-line-submit-receipt=""');
    expect(ui).toContain("evidence.receiptId ?? evidence.operationId ?? null");
    expect(ui).toContain("Solaris reconciled this save against the existing server operation");
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
    expect(migration).toContain("'effectiveOpen', private.studio2_next_in_line_window_is_open(p_edition_id)");
    expect(migration).toContain("'history', coalesce((");
    expect(migration).toContain("'lastOperation', case");
    expect(migration).toContain("grant execute on function public.v3_my_next_in_line(uuid)\n  to authenticated");
    expect(migration).toContain("grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)\n  to authenticated");
  });
});
