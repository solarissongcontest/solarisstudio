import { createServerFn } from "@tanstack/react-start";

export type SyncHealthEdition = {
  id: string;
  editionNumber: number | null;
  name: string;
  status: string;
  dataRevision: number;
  confirmedParticipants: number;
  withdrawnParticipants: number;
  entries: number;
  selectedEntries: number;
  pendingEntries: number;
  confirmationSubmissions: number;
  confirmationEntries: number;
  televotingRounds: number;
  staleTelevotingRounds: number;
  frozenTelevotingRounds: number;
  hodMappedDelegations: number;
  hodUnmappedDelegations: number;
  hodCoveragePercent: number;
  hodChannelOverrides: number;
  health: "healthy" | "attention" | "idle";
};

export type SyncHealthEvent = {
  id: string;
  service: string;
  eventType: string;
  status: string;
  remoteId: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type TelevotingRuntimeHealth = {
  status: "healthy" | "unavailable";
  reachable: boolean;
  organizerCompatibilityReady: boolean;
  message: string;
};

export type SyncHealthSummary = {
  generatedAt: string;
  editions: SyncHealthEdition[];
  recentProblems: SyncHealthEvent[];
  televotingRuntime: TelevotingRuntimeHealth;
  totals: {
    confirmationLinks: number;
    televotingBindings: number;
    staleTelevotingBindings: number;
    failedEvents: number;
    pendingEvents: number;
    hodPeople: number;
    hodAssignments: number;
    hodChannelOverrides: number;
  };
};

export const getUnifiedSyncHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<SyncHealthSummary> => {
    const { requireSolarisOrganizerServer } = await import("@/integrations/supabase/organizer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireSolarisOrganizerServer();
    const db = supabaseAdmin as any;

    const runtimeProbe = (async (): Promise<TelevotingRuntimeHealth> => {
      try {
        const { requireMergedTelevotingAdminServer } = await import("@/integrations/televoting/admin-session.server");
        await requireMergedTelevotingAdminServer();
        return {
          status: "healthy",
          reachable: true,
          organizerCompatibilityReady: true,
          message: "Televoting admin bridge is reachable and the compatibility admin identity is ready.",
        };
      } catch (caught) {
        const raw = caught instanceof Error ? caught.message : "Televoting runtime check failed.";
        const message = raw.length > 260 ? `${raw.slice(0, 257)}…` : raw;
        return {
          status: "unavailable",
          reachable: false,
          organizerCompatibilityReady: false,
          message,
        };
      }
    })();

    const [
      editionsResult,
      participantsResult,
      entriesResult,
      linksResult,
      bindingsResult,
      eventsResult,
      hodPeopleResult,
      hodAssignmentsResult,
      televotingRuntime,
    ] = await Promise.all([
      db.from("editions").select("id,edition_number,name,status,data_revision").order("edition_number", { ascending: false, nullsFirst: false }),
      db.from("participants").select("edition_id,country_id,participation_status"),
      db.from("entries").select("edition_id,status"),
      db.from("integration_links").select("id,service,entity_type,edition_id,sync_status,last_synced_at"),
      db.from("televoting_round_bindings").select("remote_round_id,edition_id,show_id,last_synced_at,last_synced_revision,frozen_at"),
      db.from("integration_events").select("id,service,event_type,status,remote_id,last_error,updated_at").in("status", ["failed", "pending", "retrying"]).order("updated_at", { ascending: false }).limit(30),
      db.from("delegation_people").select("id"),
      db.from("delegation_hod_assignments").select("edition_id,country_id,channel"),
      runtimeProbe,
    ]);

    for (const result of [editionsResult, participantsResult, entriesResult, linksResult, bindingsResult, eventsResult, hodPeopleResult, hodAssignmentsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const participants = participantsResult.data ?? [];
    const entries = entriesResult.data ?? [];
    const links = linksResult.data ?? [];
    const bindings = bindingsResult.data ?? [];
    const problemEvents = eventsResult.data ?? [];
    const hodPeople = hodPeopleResult.data ?? [];
    const hodAssignments = hodAssignmentsResult.data ?? [];

    const editions: SyncHealthEdition[] = (editionsResult.data ?? []).map((edition: any) => {
      const editionParticipants = participants.filter((row: any) => row.edition_id === edition.id);
      const editionEntries = entries.filter((row: any) => row.edition_id === edition.id);
      const confirmationLinks = links.filter((row: any) => row.service === "confirmations" && row.edition_id === edition.id);
      const editionBindings = bindings.filter((row: any) => row.edition_id === edition.id);
      const editionHodAssignments = hodAssignments.filter((row: any) => row.edition_id === edition.id);
      const dataRevision = Number(edition.data_revision ?? 0);
      const staleBindings = editionBindings.filter((binding: any) => !binding.frozen_at && (!binding.last_synced_at || Number(binding.last_synced_revision ?? 0) < dataRevision));
      const confirmedRows = editionParticipants.filter((row: any) => !row.participation_status || row.participation_status === "confirmed");
      const confirmedParticipants = confirmedRows.length;
      const confirmedCountryIds = new Set(confirmedRows.map((row: any) => String(row.country_id)).filter(Boolean));
      const defaultHodCountries = new Set(
        editionHodAssignments
          .filter((row: any) => row.channel === "delegation" && confirmedCountryIds.has(String(row.country_id)))
          .map((row: any) => String(row.country_id)),
      );
      const hodMappedDelegations = defaultHodCountries.size;
      const hodUnmappedDelegations = Math.max(0, confirmedCountryIds.size - hodMappedDelegations);
      const hodCoveragePercent = confirmedCountryIds.size ? Math.round((hodMappedDelegations / confirmedCountryIds.size) * 100) : 0;
      const hodChannelOverrides = editionHodAssignments.filter((row: any) => row.channel === "jury" || row.channel === "televote").length;
      const selectedEntries = editionEntries.filter((row: any) => ["selected", "confirmed", "official"].includes(String(row.status).toLowerCase())).length;
      const pendingEntries = editionEntries.filter((row: any) => ["pending", "awaiting", "draft"].includes(String(row.status).toLowerCase())).length;
      const hasActivity = editionParticipants.length > 0 || confirmationLinks.length > 0 || editionBindings.length > 0;
      const attention = staleBindings.length > 0;

      return {
        id: edition.id,
        editionNumber: edition.edition_number == null ? null : Number(edition.edition_number),
        name: String(edition.name),
        status: String(edition.status),
        dataRevision,
        confirmedParticipants,
        withdrawnParticipants: editionParticipants.filter((row: any) => row.participation_status === "withdrawn").length,
        entries: editionEntries.length,
        selectedEntries,
        pendingEntries,
        confirmationSubmissions: confirmationLinks.filter((row: any) => row.entity_type === "submission").length,
        confirmationEntries: confirmationLinks.filter((row: any) => row.entity_type === "entry").length,
        televotingRounds: editionBindings.length,
        staleTelevotingRounds: staleBindings.length,
        frozenTelevotingRounds: editionBindings.filter((row: any) => Boolean(row.frozen_at)).length,
        hodMappedDelegations,
        hodUnmappedDelegations,
        hodCoveragePercent,
        hodChannelOverrides,
        health: attention ? "attention" : hasActivity ? "healthy" : "idle",
      };
    });

    const recentProblems: SyncHealthEvent[] = problemEvents.map((event: any) => ({
      id: String(event.id),
      service: String(event.service),
      eventType: String(event.event_type),
      status: String(event.status),
      remoteId: event.remote_id == null ? null : String(event.remote_id),
      lastError: event.last_error == null ? null : String(event.last_error),
      updatedAt: String(event.updated_at),
    }));

    return {
      generatedAt: new Date().toISOString(),
      editions,
      recentProblems,
      televotingRuntime,
      totals: {
        confirmationLinks: links.filter((row: any) => row.service === "confirmations").length,
        televotingBindings: bindings.length,
        staleTelevotingBindings: editions.reduce((sum, edition) => sum + edition.staleTelevotingRounds, 0),
        failedEvents: recentProblems.filter((event) => event.status === "failed").length,
        pendingEvents: recentProblems.filter((event) => event.status !== "failed").length,
        hodPeople: hodPeople.length,
        hodAssignments: hodAssignments.length,
        hodChannelOverrides: hodAssignments.filter((row: any) => row.channel === "jury" || row.channel === "televote").length,
      },
    };
  },
);