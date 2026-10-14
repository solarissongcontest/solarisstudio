import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { loadOrganizerTasksV5 } from "@/lib/admin-tasks-v5";
import { loadControlRoomModelServer } from "@/lib/control-room.server";
import {
  buildV3OrganizerProjection,
  type V3OrganizerEditionProjection,
  type V3OrganizerProjection,
} from "@/lib/v3-organizer-projection";

function validEditionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function loadV3OrganizerProjectionServer(
  editionId: string,
): Promise<V3OrganizerProjection> {
  if (!validEditionId(editionId)) throw new Error("Invalid edition id");

  // The capability engine is authoritative for edition-scoped Organizer
  // access. Do not re-impose the older global organizer-role requirement here,
  // or legitimate edition-scoped operators would be rejected.
  const capability = await requireSolarisCapabilityServer("edition.read", editionId);

  const db = createSolarisAuthenticatedClientServer();
  const { data: editionRow, error: editionError } = await (db as any)
    .from("editions")
    .select("id,slug,name,edition_number,status")
    .eq("id", editionId)
    .single();
  if (editionError || !editionRow) {
    throw new Error(editionError?.message || "Edition could not be loaded");
  }

  const [tasks, live] = await Promise.all([
    loadOrganizerTasksV5(editionId, "all", db as any),
    loadControlRoomModelServer(editionId),
  ]);

  const edition: V3OrganizerEditionProjection = {
    id: String(editionRow.id),
    slug: String(editionRow.slug ?? ""),
    name: String(editionRow.name ?? ""),
    editionNumber: Number.isFinite(Number(editionRow.edition_number))
      ? Number(editionRow.edition_number)
      : null,
    status: editionRow.status == null ? null : String(editionRow.status),
  };

  if (!edition.slug) throw new Error("Edition is missing its canonical slug");

  return buildV3OrganizerProjection({
    edition,
    tasks,
    live,
    actorId: capability.userId,
  });
}
