import { supabase } from "@/integrations/supabase/client";

export type EditionAuthorityRow = {
  id: string;
  edition_number: number | null;
  name: string;
  year: number | null;
  slug: string;
  description: string | null;
  host_country_id: string | null;
  host_city: string | null;
  status: string;
  published: boolean;
  editing_enabled: boolean;
  data_revision: number;
  event_date?: string | null;
};

export type EditionAuthorityReceipt = {
  ok: true;
  operationId: string;
  replayed: boolean;
  changed?: boolean;
  edition: EditionAuthorityRow;
};

type RpcResponse = {
  data: unknown;
  error: ({ code?: string; message?: string } & Record<string, unknown>) | null;
};

async function governedEditionRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<EditionAuthorityReceipt> {
  const client = supabase as unknown as {
    rpc: (fn: string, payload: Record<string, unknown>) => Promise<RpcResponse>;
  };

  let response = await client.rpc(name, args);
  // Transport ambiguity is the only automatic retry. The database derives the
  // operation identity from the actor and exact semantic input, so the second
  // request can only read back the first operation or perform the same write.
  if (response.error && !response.error.code) response = await client.rpc(name, args);
  if (response.error) throw response.error;

  const value = response.data as Partial<EditionAuthorityReceipt> | null;
  if (value?.ok !== true || typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.operationId) ||
      value.edition?.id !== args.p_edition_id ||
      !Number.isSafeInteger(value.edition?.data_revision) ||
      Number(value.edition?.data_revision) <= Number(args.p_expected_revision)) {
    throw new Error(
      "Edition operation has no confirmed canonical receipt. Reload the edition before retrying.",
    );
  }
  return value as EditionAuthorityReceipt;
}

export async function applyEditionMetadataChange(input: {
  editionId: string;
  expectedRevision: number;
  patch: Record<string, unknown>;
  reason: string;
}) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("Reload the edition before reviewing its revision.");
  }
  return governedEditionRpc("v3_apply_edition_metadata_change", {
    p_edition_id: input.editionId,
    p_expected_revision: input.expectedRevision,
    p_patch: input.patch,
    p_reason: input.reason,
  });
}

