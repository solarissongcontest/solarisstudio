import { syncConfirmationSubmissionToSolarisInternal } from "../src/integrations/confirmations/sync.functions";
import { assertV3ProductionIsolation } from "./check-v3-production-isolation";

const submissionId = process.argv[2]?.trim();
if (!submissionId) {
  throw new Error("Usage: bun run scripts/v3-s14-sync-confirmation-entry.ts <submission-id>");
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url)) {
  throw new Error(`S14 canonical sync refuses non-local Supabase URL: ${url || "<missing>"}`);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("S14 canonical sync requires the local Supabase service-role key");
}

// This CLI may run outside the full S14 harness. Check every configured
// Supabase/Confirmations/database target and privileged credential scope at
// the point of use; a locally configured primary URL alone is not enough.
assertV3ProductionIsolation();

const result = await syncConfirmationSubmissionToSolarisInternal(submissionId);
if (!result.ok || result.status !== "synced") {
  throw new Error(`Canonical Confirmation sync failed: ${JSON.stringify(result)}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
