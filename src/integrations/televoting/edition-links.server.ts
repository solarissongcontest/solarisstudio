import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";

export type MergedTelevotingEditionLink = {
  solaris_id: string;
  name: string;
  edition_number: number;
  solaris_status: string;
  expected_active: boolean;
  expected_archived: boolean;
  remote_id: string | null;
  remote_name: string | null;
  remote_is_active: boolean | null;
  remote_is_archived: boolean | null;
  sync_status: string | null;
  last_synced_at: string | null;
  health: "linked" | "drift" | "missing_remote" | "unlinked";
};

async function solarisDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function televotingDb() {
  const { televotingAdmin } = await import("@/integrations/televoting/client.server");
  return televotingAdmin;
}

/**
 * Read-only projection for Organizer integration diagnostics.
 *
 * Loading the Edition links page must never create, rename, archive or relink
 * Televoting records. Repair remains an explicit command through the existing
 * sync authority.
 */
export async function listMergedTelevotingEditionLinksServer(): Promise<
  MergedTelevotingEditionLink[]
> {
  await requireSolarisCapabilityServer("voting.read");
  const [db, votingDb] = await Promise.all([solarisDb(), televotingDb()]);

  const [solarisResult, linkResult, remoteResult] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number,status")
      .not("edition_number", "is", null)
      .order("edition_number", { ascending: false }),
    db
      .from("integration_links")
      .select("solaris_id,remote_id,sync_status,last_synced_at")
      .eq("service", "televoting")
      .eq("entity_type", "edition"),
    votingDb
      .from("editions")
      .select("id,name,is_active,is_archived")
      .order("created_at"),
  ]);

  if (solarisResult.error) throw new Error(solarisResult.error.message);
  if (linkResult.error) throw new Error(linkResult.error.message);
  if (remoteResult.error) throw new Error(remoteResult.error.message);

  const links = new Map(
    (linkResult.data ?? []).map((row: any) => [String(row.solaris_id), row]),
  );
  const remoteById = new Map(
    (remoteResult.data ?? []).map((row: any) => [String(row.id), row]),
  );

  return (solarisResult.data ?? []).flatMap((edition: any) => {
    const editionNumber = Number(edition.edition_number);
    if (!Number.isInteger(editionNumber)) return [];

    const solarisId = String(edition.id);
    const status = String(edition.status ?? "");
    const expectedActive = status === "active";
    const expectedArchived = status === "completed" || status === "finished";
    const link = links.get(solarisId) as any | undefined;
    const remoteId = link?.remote_id == null ? null : String(link.remote_id);
    const remote = remoteId ? (remoteById.get(remoteId) as any | undefined) : undefined;

    let health: MergedTelevotingEditionLink["health"] = "linked";
    if (!link) health = "unlinked";
    else if (!remote) health = "missing_remote";
    else if (
      String(remote.name ?? "") !== String(edition.name ?? "") ||
      Boolean(remote.is_active) !== expectedActive ||
      Boolean(remote.is_archived) !== expectedArchived
    ) {
      health = "drift";
    }

    return [
      {
        solaris_id: solarisId,
        name: String(edition.name ?? `SSC ${editionNumber}`),
        edition_number: editionNumber,
        solaris_status: status,
        expected_active: expectedActive,
        expected_archived: expectedArchived,
        remote_id: remoteId,
        remote_name: remote ? String(remote.name ?? "") : null,
        remote_is_active: remote ? Boolean(remote.is_active) : null,
        remote_is_archived: remote ? Boolean(remote.is_archived) : null,
        sync_status: link?.sync_status == null ? null : String(link.sync_status),
        last_synced_at: link?.last_synced_at == null ? null : String(link.last_synced_at),
        health,
      } satisfies MergedTelevotingEditionLink,
    ];
  });
}