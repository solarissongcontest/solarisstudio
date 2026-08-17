import { createServerFn } from "@tanstack/react-start";
import type { HodChannel } from "@/integrations/unified/hod-history.server";

export const getHodHistory = createServerFn({ method: "GET" }).handler(async () => {
  const { getHodHistoryServer } = await import("@/integrations/unified/hod-history.server");
  return getHodHistoryServer();
});

export const getHodIdentitySuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const { getHodIdentitySuggestionsServer } = await import("@/integrations/unified/hod-suggestions.server");
  return getHodIdentitySuggestionsServer();
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
    const { saveHodPersonServer } = await import("@/integrations/unified/hod-history.server");
    return saveHodPersonServer(data);
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
    const { saveHodAssignmentsServer } = await import("@/integrations/unified/hod-history.server");
    return saveHodAssignmentsServer(data);
  });

export const deleteHodAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing assignment");
    return { id: String(data.id) };
  })
  .handler(async ({ data }) => {
    const { deleteHodAssignmentServer } = await import("@/integrations/unified/hod-history.server");
    return deleteHodAssignmentServer(data.id);
  });