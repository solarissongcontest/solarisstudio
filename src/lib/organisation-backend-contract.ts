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

export async function loadOrganisationBackendContract(): Promise<OrganisationBackendContract> {
  const { data, error } = await (supabase as any).rpc("studio2_runtime_contract");
  if (error) {
    return unavailable(error.message || "Runtime compatibility contract is unavailable.");
  }

  const value = data && typeof data === "object" ? (data as any) : null;
  const capabilities =
    value?.capabilities && typeof value.capabilities === "object"
      ? value.capabilities
      : {};

  return {
    available: true,
    schemaId: typeof value?.schemaId === "string" ? value.schemaId : null,
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
