import { supabase } from "@/integrations/supabase/client";

export type ShowDefinitionSnapshot = {
  id: string;
  name: string;
  kind: string;
  sortOrder: number;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;

function transportFailure(error: unknown) {
  return Boolean(error && typeof error === "object" && !("code" in error));
}

async function governedRpc(name: string, args: Record<string, unknown>) {
  let response = await client.rpc(name, args);
  if (response.error && transportFailure(response.error)) response = await client.rpc(name, args);
  if (response.error) throw response.error;
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
    throw new Error("Show command returned no canonical result. Reload before retrying.");
  }
  return response.data as Record<string, unknown>;
}

function operation(kind: string) {
  const operationId = globalThis.crypto.randomUUID();
  return {
    p_operation_id: operationId,
    p_idempotency_key: `show:${kind}:${operationId}`,
  };
}

export async function createShow(input: {
  editionId: string;
  name: string;
  kind: string;
  sortOrder: number;
  publicationConfig: Record<string, unknown>;
}) {
  return governedRpc("v3_create_show", {
    p_edition_id: input.editionId,
    p_name: input.name,
    p_kind: input.kind,
    p_sort_order: input.sortOrder,
    p_publication_config: input.publicationConfig,
    p_reason: "Organizer created show",
    ...operation("create"),
  });
}

export async function updateShowDefinition(input: {
  current: ShowDefinitionSnapshot;
  name: string;
  kind: string;
  sortOrder: number;
}) {
  return governedRpc("v3_update_show_definition", {
    p_show_id: input.current.id,
    p_expected_name: input.current.name,
    p_expected_kind: input.current.kind,
    p_expected_sort_order: input.current.sortOrder,
    p_name: input.name,
    p_kind: input.kind,
    p_sort_order: input.sortOrder,
    p_reason: "Organizer updated show definition",
    ...operation("definition"),
  });
}

export async function deleteShowDefinition(input: {
  current: ShowDefinitionSnapshot;
  reason?: string;
}) {
  return governedRpc("v3_delete_show", {
    p_show_id: input.current.id,
    p_expected_name: input.current.name,
    p_expected_kind: input.current.kind,
    p_expected_sort_order: input.current.sortOrder,
    p_reason: input.reason ?? "Organizer deleted setup-only show",
    ...operation("delete"),
  });
}
