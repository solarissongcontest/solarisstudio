import { createServerFn } from "@tanstack/react-start";

export const syncConfirmationSubmissionToSolaris = createServerFn({ method: "POST" })
  .inputValidator((data: { submissionId?: unknown }) => {
    const submissionId = typeof data?.submissionId === "string" ? data.submissionId.trim() : "";
    if (!submissionId) throw new Error("Missing confirmation submission id");
    return { submissionId };
  })
  .handler(async ({ data }) => {
    const { requireSolarisCapabilityServer } = await import(
      "@/integrations/supabase/capabilities.server"
    );
    await requireSolarisCapabilityServer("confirmation.manage", null);

    // Keep the large reconciliation implementation and its Node-only hashing
    // entirely on the server. The browser route imports only this thin RPC shell.
    // The named capability check above must complete before this privileged
    // service-role-backed implementation can be loaded or executed.
    const { syncConfirmationSubmissionToSolarisInternal } = await import(
      "@/integrations/confirmations/sync.functions"
    );
    return syncConfirmationSubmissionToSolarisInternal(data.submissionId);
  });
