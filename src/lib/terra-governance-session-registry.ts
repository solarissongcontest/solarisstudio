/**
 * TG6 session/agenda vertical slice ownership. The TG2 generic organization,
 * organ, durable person and world capability systems remain the only owners
 * of those dependencies. TG6 may never create a second capability engine.
 */
export const TERRA_GOVERNANCE_TG6 = Object.freeze({
  phase: "TG6" as const,
  status: "implementation" as const,
  migration: "20261104114000_v3_tg6_world_session_agenda.sql",
  canonicalTables: ["public.world_sessions", "public.world_agenda_items"] as const,
  commands: [
    "public.world_session_create_v1",
    "public.world_agenda_append_v1",
    "public.world_agenda_reorder_v1",
  ] as const,
  projections: [
    "public.world_session_schedule_v1",
    "public.world_session_detail_v1",
    "public.world_session_manage_v1",
  ] as const,
  events: [
    "world.session.created",
    "world.agenda.appended",
    "world.agenda.reordered",
  ] as const,
  capabilities: [
    "world.session.create",
    "world.session.manage",
    "world.agenda.manage",
  ] as const,
  sourceOfTruth: "TG2 organization/organ + TG6 session/agenda state",
  notYetImplemented: [
    "session lifecycle transitions",
    "attendance and representative/proxy roll call",
    "minutes and formal decisions",
    "constitutional quorum and official vote transitions",
    "institutional push/following consequences",
  ] as const,
});
