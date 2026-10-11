import { createServerFn } from "@tanstack/react-start";

export const syncConfirmationSubmissionToSolaris = createServerFn({ method: "POST" })
  .inputValidator((data: { submissionId?: unknown }) => {
    const submissionId = typeof data?.submissionId === "string" ? data.submissionId.trim() : "";
    if (!submissionId) throw new Error("Missing confirmation submission id");
    return { submissionId };
  })
  .handler(async ({ data }) => {
    const { requireSolarisOrganizerServer } = await import(
      "@/integrations/supabase/organizer.server"
    );
    await requireSolarisOrganizerServer();

    // Keep the large reconciliation implementation and its Node-only hashing
    // entirely on the server. The browser route imports only this thin RPC shell.
    const { syncConfirmationSubmissionToSolarisInternal } = await import(
      "@/integrations/confirmations/sync.functions"
    );
    return syncConfirmationSubmissionToSolarisInternal(data.submissionId);
  });
