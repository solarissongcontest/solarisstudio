export type SystemFeatureSignal = {
  feature: string;
  domain: string;
  purpose: string;
};

/** System-audience feature flags are rollout controls, never domain authorities. */
export const SYSTEM_V3_FEATURE_SIGNALS: readonly SystemFeatureSignal[] = [
  { feature: "edition_state_engine", domain: "editions", purpose: "Canonical edition lifecycle foundation" },
  { feature: "contest_event_engine", domain: "activity", purpose: "Existing contest-event/event-stream foundation pending the canonical DomainEvent cutover" },
  { feature: "permission_engine_v2", domain: "capabilities", purpose: "Canonical capability-based authorization foundation" },
] as const;
