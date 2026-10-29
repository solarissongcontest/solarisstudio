import { supabase } from "@/integrations/supabase/client";

export type OrganizerAcceptanceEvidenceInput = {
  editionId: string;
  submissionId: string;
  testerName: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: unknown;
  bugReports: readonly unknown[];
  screenshotPaths: readonly string[];
  userAgent: string | null;
  formVersion: number;
  operationId: string;
  idempotencyKey: string;
};

export type OrganizerAcceptanceEvidenceReceipt = {
  ok: true;
  submissionId: string;
  editionId: string;
  operationId: string;
  createdAt: string;
  replayed: boolean;
};

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function parseReceipt(
  value: unknown,
  input: Pick<OrganizerAcceptanceEvidenceInput, "editionId" | "submissionId" | "operationId">,
): OrganizerAcceptanceEvidenceReceipt | null {
  const outer = record(value);
  if (!outer) return null;
  const candidate = outer.status === "succeeded" ? record(outer.result) : outer;
  if (!candidate || candidate.ok !== true) return null;

  const submissionId = string(candidate.submissionId);
  const editionId = string(candidate.editionId);
  const operationId = string(candidate.operationId);
  const createdAt = string(candidate.createdAt);
  if (
    submissionId !== input.submissionId ||
    editionId !== input.editionId ||
    operationId !== input.operationId ||
    !createdAt
  ) return null;

  return {
    ok: true,
    submissionId,
    editionId,
    operationId,
    createdAt,
    replayed: candidate.replayed === true || outer.replayed === true,
  };
}

async function reconcileAcceptanceEvidence(
  client: RpcClient,
  input: OrganizerAcceptanceEvidenceInput,
) {
  try {
    const { data, error } = await client.rpc("studio2_reconcile_operation", {
      p_operation_id: input.operationId,
    });
    if (error) return null;
    return parseReceipt(data, input);
  } catch {
    return null;
  }
}

export async function submitOrganizerAcceptanceEvidence(
  input: OrganizerAcceptanceEvidenceInput,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<OrganizerAcceptanceEvidenceReceipt> {
  let originalError: unknown = null;
  try {
    const { data, error } = await client.rpc("studio2_submit_admin_beta_test", {
      p_edition_id: input.editionId,
      p_submission_id: input.submissionId,
      p_tester_name: input.testerName,
      p_device: input.device,
      p_browser: input.browser,
      p_familiarity: input.familiarity,
      p_answers: input.answers,
      p_bug_reports: input.bugReports,
      p_screenshot_paths: input.screenshotPaths,
      p_user_agent: input.userAgent,
      p_form_version: input.formVersion,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message || "Could not submit Organizer acceptance evidence.");
    const receipt = parseReceipt(data, input);
    if (!receipt) throw new Error("Solaris returned an invalid Organizer acceptance receipt.");
    return receipt;
  } catch (error) {
    originalError = error;
  }

  // A lost response must never create a replacement mutation. Read back the
  // exact operation first and accept only a succeeded receipt matching the
  // original edition, submission and operation identity.
  const reconciled = await reconcileAcceptanceEvidence(client, input);
  if (reconciled) return { ...reconciled, replayed: true };

  if (originalError instanceof Error) throw originalError;
  throw new Error("Could not submit Organizer acceptance evidence.");
}
