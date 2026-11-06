import { getSolarisCapabilitiesServer } from "@/integrations/supabase/capabilities.server";
import type { SolarisCapability } from "@/lib/permissions-v2";

const RESULT_INTEGRITY_READ_CAPABILITIES = [
  "results.preview",
  "integrity.read",
  "televote.ballots.read",
] as const satisfies readonly SolarisCapability[];

const RESULT_INTEGRITY_RECOMPUTE_CAPABILITIES = [
  ...RESULT_INTEGRITY_READ_CAPABILITIES,
  "integrity.manage",
] as const satisfies readonly SolarisCapability[];

async function requireCapabilityBundle(
  required: readonly SolarisCapability[],
  label: string,
) {
  const context = await getSolarisCapabilitiesServer(null);
  const missing = required.filter(
    (capability) => !context.capabilities.includes(capability),
  );

  if (missing.length > 0) {
    throw new Error(
      `Solaris capabilities required for ${label}: ${missing.join(", ")}`,
    );
  }

  return context;
}

export function requireResultIntegrityReadServer() {
  return requireCapabilityBundle(
    RESULT_INTEGRITY_READ_CAPABILITIES,
    "Result Integrity read",
  );
}

export function requireResultIntegrityRecomputeServer() {
  return requireCapabilityBundle(
    RESULT_INTEGRITY_RECOMPUTE_CAPABILITIES,
    "Result Integrity recompute",
  );
}

export {
  RESULT_INTEGRITY_READ_CAPABILITIES,
  RESULT_INTEGRITY_RECOMPUTE_CAPABILITIES,
};
