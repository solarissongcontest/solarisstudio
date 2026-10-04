import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type OrganisationBackendContract = {
  available: boolean;
  schemaId: string | null;
  ready: boolean;
  capabilities: {
    organizerTasks: boolean;
    systemOperations: boolean;
    juryWindowOperations: boolean;
  };
  error: string | null;
};

const SUPPORTED_SCHEMA_IDS = new Set([
  "organisation-os-v5-20261004-complete",
]);

const unavailable = (error: string | null): OrganisationBackendContract => ({
  available: false,
  schemaId: null,
  ready: false,
  capabilities: {
    organizerTasks: false,
    systemOperations: false,
    juryWindowOperations: false,
  },
  error,
});

const incompatible = (
  schemaId: string | null,
  error: string,
): OrganisationBackendContract => ({
  available: true,
  schemaId,
  ready: false,
  capabilities: {
    organizerTasks: false,
    systemOperations: false,
    juryWindowOperations: false,
  },
  error,
});

export async function loadOrganisationBackendContract(): Promise<OrganisationBackendContract> {
  const { data, error } = await (supabase as any).rpc("studio2_runtime_contract");
  if (error) {
    return unavailable(error.message || "Runtime compatibility contract is unavailable.");
  }

  const value = data && typeof data === "object" ? (data as any) : null;
  const schemaId = typeof value?.schemaId === "string" ? value.schemaId : null;
  if (!schemaId || !SUPPORTED_SCHEMA_IDS.has(schemaId)) {
    return incompatible(
      schemaId,
      schemaId
        ? `Unsupported Organizer runtime contract: ${schemaId}.`
        : "Organizer runtime contract did not report a schema identifier.",
    );
  }

  const capabilities =
    value?.capabilities && typeof value.capabilities === "object"
      ? value.capabilities
      : {};

  return {
    available: true,
    schemaId,
    ready: value?.ready === true,
    capabilities: {
      organizerTasks: capabilities.organizerTasks === true,
      systemOperations: capabilities.systemOperations === true,
      juryWindowOperations: capabilities.juryWindowOperations === true,
    },
    error: null,
  };
}

export function useOrganisationBackendContract() {
  return useQuery({
    queryKey: ["organisation-backend-contract"],
    queryFn: loadOrganisationBackendContract,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
