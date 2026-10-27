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
  if (value?.ok !== true || !value.operationId || !value.edition?.id) {
    throw new Error(
      "Edition operation has no confirmed canonical receipt. Reload the edition before retrying.",
    );
  }
  return value as EditionAuthorityReceipt;
}

export async function createEdition(input: {
  editionNumber: number;
  name: string;
  year: number | null;
  hostCountryId: string | null;
  hostCity: string | null;
  reason: string;
}) {
  return governedEditionRpc("v3_create_edition", {
    p_edition_number: input.editionNumber,
    p_name: input.name,
    p_year: input.year,
    p_host_country_id: input.hostCountryId,
    p_host_city: input.hostCity,
    p_reason: input.reason,
  });
}

export async function applyEditionMetadataChange(input: {
  editionId: string;
  expectedRevision: number;
  patch: Record<string, unknown>;
  reason: string;
}) {
  return governedEditionRpc("v3_apply_edition_metadata_change", {
    p_edition_id: input.editionId,
    p_expected_revision: input.expectedRevision,
    p_patch: input.patch,
    p_reason: input.reason,
  });
}

export async function applyEditionEditingChange(input: {
  editionId: string;
  expectedEnabled: boolean;
  enabled: boolean;
  reason: string;
}) {
  return governedEditionRpc("v3_apply_edition_editing_change", {
    p_edition_id: input.editionId,
    p_expected_enabled: input.expectedEnabled,
    p_enabled: input.enabled,
    p_reason: input.reason,
  });
}
