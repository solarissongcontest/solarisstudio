import { supabase } from "@/integrations/supabase/client";
import type { EditionAuthorityReceipt } from "./edition-authority";
export type EditionCreateIntent = {
  editionNumber: number;
  name: string;
  year: number | null;
  hostCountryId: string | null;
  hostCity: string | null;
  reason: string;
};
/** Reuses #1851's semantic identity: ambiguous retries retain every argument. */
export async function createEditionThroughAuthority(
  intent: EditionCreateIntent,
): Promise<EditionAuthorityReceipt> {
  const args = {
    p_edition_number: intent.editionNumber,
    p_name: intent.name,
    p_year: intent.year,
    p_host_country_id: intent.hostCountryId,
    p_host_city: intent.hostCity,
    p_reason: intent.reason,
  };
  const client = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
  let response = await client.rpc("v3_create_edition", args);
  if (response.error && !response.error.code)
    response = await client.rpc("v3_create_edition", args);
  if (response.error) throw response.error;
  const receipt = response.data as Partial<EditionAuthorityReceipt> | null;
  if (
    receipt?.ok !== true ||
    typeof receipt.operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.operationId) ||
    typeof receipt.edition?.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.edition.id) ||
    receipt.edition.edition_number !== intent.editionNumber ||
    receipt.edition.published !== false ||
    receipt.edition.status !== "draft" ||
    !Number.isSafeInteger(receipt.edition.data_revision) ||
    receipt.edition.data_revision < 1 ||
    typeof receipt.replayed !== "boolean"
  ) {
    throw new Error(
      "Edition creation has no confirmed receipt. Keep the same draft and reconcile before creating another Edition.",
    );
  }
  return receipt as EditionAuthorityReceipt;
}
