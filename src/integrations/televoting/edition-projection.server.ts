import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type TelevotingEditionProjection = {
  id: string;
  solaris_id: string;
  name: string;
  edition_number: number;
  is_active: boolean;
  is_archived: boolean;
};

type SolarisEditionRow = {
  id: string;
  name: string;
  edition_number: number | null;
  status: string | null;
};

type RemoteEditionRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  created_at?: string;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function editionNumberFromName(value: unknown) {
  const matches = String(value ?? "").match(/(\d+)(?!.*\d)/);
  return matches ? Number(matches[1]) : null;
}

async function solarisDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function projection(solaris: SolarisEditionRow, remote: RemoteEditionRow): TelevotingEditionProjection {
  const editionNumber = Number(solaris.edition_number);
  if (!Number.isInteger(editionNumber)) throw new Error("Solaris edition is missing its edition number");

  return {
    id: remote.id,
    solaris_id: solaris.id,
    name: String(solaris.name),
    edition_number: editionNumber,
    is_active: Boolean(remote.is_active),
    is_archived: Boolean(remote.is_archived),
  };
}

async function loadSolarisEditionAndLink(solarisEditionId: string) {
  const db = await solarisDb();
  const [editionResult, linkResult] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number,status")
      .eq("id", solarisEditionId)
      .maybeSingle(),
    db
      .from("integration_links")
      .select("remote_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition")
      .eq("solaris_id", solarisEditionId)
      .maybeSingle(),
  ]);

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (linkResult.error) throw new Error(linkResult.error.message);

  return {
    db,
    solaris: (editionResult.data ?? null) as SolarisEditionRow | null,
    remoteId: linkResult.data?.remote_id ? String(linkResult.data.remote_id) : null,
  };
}

/** Read-only resolver used by ordinary organizer pages. It deliberately does
 * not rebuild the whole Televoting catalog or mutate integration metadata. */
export async function getTelevotingEditionProjectionServer(
  solarisEditionId: string,
): Promise<TelevotingEditionProjection | null> {
  await requireMergedTelevotingAdminServer();
  const source = await loadSolarisEditionAndLink(solarisEditionId);
  if (!source.solaris || !source.remoteId) return null;

  const { data, error } = await televotingAdmin
    .from("editions")
    .select("id,name,is_active,is_archived,created_at")
    .eq("id", source.remoteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return projection(source.solaris, data as RemoteEditionRow);
}

/** Targeted repair/creation for a single Solaris edition. This is reserved for
 * explicit mutations such as creating a voting round, never normal page reads. */
export async function ensureTelevotingEditionProjectionServer(
  solarisEditionId: string,
): Promise<TelevotingEditionProjection> {
  await requireMergedTelevotingAdminServer();
  const source = await loadSolarisEditionAndLink(solarisEditionId);
  if (!source.solaris) throw new Error("Solaris edition not found");

  let remote: RemoteEditionRow | null = null;

  if (source.remoteId) {
    const linked = await televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived,created_at")
      .eq("id", source.remoteId)
      .maybeSingle();
    if (linked.error) throw new Error(linked.error.message);
    remote = (linked.data ?? null) as RemoteEditionRow | null;
  }

  if (!remote) {
    const candidates = await televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived,created_at")
      .order("created_at");
    if (candidates.error) throw new Error(candidates.error.message);

    const editionNumber = Number(source.solaris.edition_number);
    remote = ((candidates.data ?? []) as RemoteEditionRow[]).find(
      (candidate) =>
        normalize(candidate.name) === normalize(source.solaris!.name) ||
        editionNumberFromName(candidate.name) === editionNumber,
    ) ?? null;
  }

  const isArchived = source.solaris.status === "completed" || source.solaris.status === "finished";

  if (!remote) {
    const created = await televotingAdmin
      .from("editions")
      .insert({
        name: source.solaris.name,
        is_active: false,
        is_archived: isArchived,
      })
      .select("id,name,is_active,is_archived,created_at")
      .single();
    if (created.error) throw new Error(created.error.message);
    remote = created.data as RemoteEditionRow;
  } else {
    const updated = await televotingAdmin
      .from("editions")
      .update({ name: source.solaris.name, is_archived: isArchived })
      .eq("id", remote.id)
      .select("id,name,is_active,is_archived,created_at")
      .single();
    if (updated.error) throw new Error(updated.error.message);
    remote = updated.data as RemoteEditionRow;
  }

  // Preserve the single-active-edition invariant here. Targeted projection
  // repair never promotes an arbitrary historical edition to active.
  await source.db
    .from("integration_links")
    .delete()
    .eq("service", "televoting")
    .eq("entity_type", "edition")
    .eq("solaris_id", source.solaris.id)
    .neq("remote_id", remote.id);
  await source.db
    .from("integration_links")
    .delete()
    .eq("service", "televoting")
    .eq("entity_type", "edition")
    .eq("remote_id", remote.id)
    .neq("solaris_id", source.solaris.id);

  const now = new Date().toISOString();
  const link = await source.db.from("integration_links").upsert(
    {
      service: "televoting",
      entity_type: "edition",
      solaris_id: source.solaris.id,
      remote_id: remote.id,
      edition_id: source.solaris.id,
      sync_status: "linked",
      metadata: { edition_number: Number(source.solaris.edition_number) },
      last_synced_at: now,
      updated_at: now,
    },
    { onConflict: "service,entity_type,remote_id" },
  );
  if (link.error) throw new Error(link.error.message);

  return projection(source.solaris, remote);
}
