import { createServerFn } from "@tanstack/react-start";

export const listMergedModerationSubmissions = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId?: string | null } = {}) => ({ roundId: data?.roundId ?? null }))
  .handler(async ({ data }) => {
    const { listMergedModerationSubmissionsServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return listMergedModerationSubmissionsServer(data.roundId);
  });

export const setMergedSubmissionStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: "active" | "suspicious" | "verified"; reason?: string }) => {
    if (!data?.id) throw new Error("Missing vote id");
    if (!["active", "suspicious", "verified"].includes(data.status)) throw new Error("Invalid status");
    return { ...data, reason: data.reason?.trim() || undefined };
  })
  .handler(async ({ data }) => {
    const { setMergedSubmissionStatusServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return setMergedSubmissionStatusServer(data);
  });

export const softDeleteMergedSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; reason: string }) => {
    if (!data?.id) throw new Error("Missing vote id");
    const reason = String(data.reason ?? "").trim();
    if (!reason) throw new Error("A reason is required to delete a vote");
    if (reason.length > 2000) throw new Error("Reason is too long");
    return { id: data.id, reason };
  })
  .handler(async ({ data }) => {
    const { softDeleteMergedSubmissionServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return softDeleteMergedSubmissionServer(data);
  });

export const restoreMergedSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; reason?: string }) => {
    if (!data?.id) throw new Error("Missing vote id");
    return { id: data.id, reason: data.reason?.trim() || undefined };
  })
  .handler(async ({ data }) => {
    const { restoreMergedSubmissionServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return restoreMergedSubmissionServer(data);
  });

export const updateMergedSubmissionNote = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; note: string }) => {
    if (!data?.id) throw new Error("Missing vote id");
    return { id: data.id, note: String(data.note ?? "").slice(0, 2000) };
  })
  .handler(async ({ data }) => {
    const { updateMergedSubmissionNoteServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return updateMergedSubmissionNoteServer(data);
  });

export const editMergedSubmissionEntries = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id: string;
    entries: Array<{ target_country_code: string; points: number }>;
    reason: string;
  }) => {
    if (!data?.id) throw new Error("Missing vote id");
    const reason = String(data.reason ?? "").trim();
    if (!reason) throw new Error("A reason is required to edit a ballot");
    if (!Array.isArray(data.entries)) throw new Error("Invalid ballot entries");
    if (data.entries.length < 5) throw new Error("At least 5 entries are required");
    if (new Set(data.entries.map((entry) => entry.target_country_code)).size !== data.entries.length) {
      throw new Error("Duplicate entry in ballot");
    }
    for (const entry of data.entries) {
      if (!entry.target_country_code) throw new Error("Missing target entry");
      if (!Number.isInteger(entry.points) || entry.points < 1 || entry.points > 10) {
        throw new Error("Points must be whole numbers from 1 to 10");
      }
    }
    const total = data.entries.reduce((sum, entry) => sum + entry.points, 0);
    if (total !== 20) throw new Error(`Total points must equal 20 (got ${total})`);
    return { id: data.id, entries: data.entries, reason };
  })
  .handler(async ({ data }) => {
    const { editMergedSubmissionEntriesServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return editMergedSubmissionEntriesServer(data);
  });

export const getMergedModerationAlertsCount = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getMergedModerationAlertsCountServer } = await import(
      "@/integrations/televoting/moderation.server"
    );
    return await getMergedModerationAlertsCountServer();
  } catch {
    return 0;
  }
});
