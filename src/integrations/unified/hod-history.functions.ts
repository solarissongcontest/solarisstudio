import { createServerFn } from "@tanstack/react-start";
import type { HodChannel } from "@/integrations/unified/hod-history.server";

export const getHodHistory = createServerFn({ method: "GET" }).handler(async () => {
  const { getHodHistoryServer } = await import("@/integrations/unified/hod-history.server");
  const result = await getHodHistoryServer();
  if (!result) throw new Error("HOD history returned no data");
  return result;
});

export const getHodIdentitySuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const { getHodIdentitySuggestionsServer } = await import("@/integrations/unified/hod-suggestions.server");
  const result = await getHodIdentitySuggestionsServer();
  return result ?? [];
});

export const saveHodPerson = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; displayName: string; identityKey?: string; notes?: string | null }) => {
    const displayName = String(data?.displayName ?? "").trim();
    if (!displayName) throw new Error("HOD name is required");
    return {
      id: data.id ? String(data.id) : undefined,
      displayName,
      identityKey: data.identityKey?.trim() || undefined,
      notes: data.notes ?? null,
    };
  })
  .handler(async ({ data }) => {
    const [{ saveHodPersonServer }, { writeAdminAuditServer }] = await Promise.all([
      import("@/integrations/unified/hod-history.server"),
      import("@/integrations/supabase/admin-audit.server"),
    ]);
    const result = await saveHodPersonServer(data);
    if (!result?.id) throw new Error("HOD identity was not saved");
    await writeAdminAuditServer({
      action: data.id ? "hod_person.update" : "hod_person.create",
      tableName: "delegation_people",
      recordId: result.id,
      afterData: {
        displayName: data.displayName,
        identityKey: data.identityKey ?? null,
        notes: data.notes ?? null,
      },
    });
    return result;
  });

export const saveHodAssignments = createServerFn({ method: "POST" })
  .inputValidator((data: {
    personId: string;
    countryId: string;
    editionIds: string[];
    channel: HodChannel;
    source?: string;
    confidence?: number;
    notes?: string | null;
  }) => {
    const personId = String(data?.personId ?? "");
    const countryId = String(data?.countryId ?? "");
    const editionIds = [...new Set((data?.editionIds ?? []).map(String).filter(Boolean))];
    if (!personId || !countryId || !editionIds.length) throw new Error("Person, country and at least one edition are required");
    if (!["delegation", "jury", "televote"].includes(data.channel)) throw new Error("Invalid HOD channel");
    return {
      personId,
      countryId,
      editionIds,
      channel: data.channel,
      source: data.source?.trim() || "manual",
      confidence: Math.max(0, Math.min(100, Math.round(Number(data.confidence ?? 100)))),
      notes: data.notes ?? null,
    };
  })
  .handler(async ({ data }) => {
    const [{ saveHodAssignmentsServer }, { writeAdminAuditServer }] = await Promise.all([
      import("@/integrations/unified/hod-history.server"),
      import("@/integrations/supabase/admin-audit.server"),
    ]);
    const result = await saveHodAssignmentsServer(data);
    if (!result) throw new Error("HOD tenure was not saved");
    await writeAdminAuditServer({
      action: "hod_assignment.range_save",
      tableName: "delegation_hod_assignments",
      countryId: data.countryId,
      afterData: {
        personId: data.personId,
        editionIds: data.editionIds,
        channel: data.channel,
        source: data.source,
        confidence: data.confidence,
        notes: data.notes,
      },
    });
    return result;
  });

export const deleteHodAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing assignment");
    return { id: String(data.id) };
  })
  .handler(async ({ data }) => {
    const [{ deleteHodAssignmentServer }, { writeAdminAuditServer }] = await Promise.all([
      import("@/integrations/unified/hod-history.server"),
      import("@/integrations/supabase/admin-audit.server"),
    ]);
    const result = await deleteHodAssignmentServer(data.id);
    if (!result) throw new Error("HOD assignment was not removed");
    await writeAdminAuditServer({
      action: "hod_assignment.delete",
      tableName: "delegation_hod_assignments",
      recordId: data.id,
    });
    return result;
  });