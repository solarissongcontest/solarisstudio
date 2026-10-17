export type V3CapacityTrafficClass = "read" | "write" | "mixed";

export type V3CapacityMeasurement =
  | "throughput"
  | "p95-latency"
  | "p99-latency"
  | "error-rate"
  | "database-activity"
  | "lock-contention"
  | "connection-pressure"
  | "observed-response-bytes"
  | "client-memory"
  | "queue-depth"
  | "retry-pressure";

export const V3_CAPACITY_DIMENSIONS = [
  "http-requests",
  "database-requests",
  "supabase-egress",
  "database-rows",
  "realtime-connections",
  "storage",
  "media-upload-bandwidth",
  "notification-sends",
  "search-volume",
  "cloudflare-invocations",
  "log-volume",
] as const;

export type V3CapacityDimension = (typeof V3_CAPACITY_DIMENSIONS)[number];

export const V3_CAPACITY_BUDGET_BANDS = [
  "normal",
  "contest-day",
  "peak",
  "hard-safety-limit",
] as const;

export type V3CapacityBudgetBand = (typeof V3_CAPACITY_BUDGET_BANDS)[number];

export type V3CapacityScenario = {
  id: string;
  intent: string;
  trafficClass: V3CapacityTrafficClass;
  environment: "local-isolated";
  loadShapeSource: "explicit-rehearsal-input-or-measured-baseline";
  requiredMeasurements: readonly V3CapacityMeasurement[];
  capacityDimensions: readonly V3CapacityDimension[];
  requiredBudgetBands: readonly V3CapacityBudgetBand[];
  providerEvidenceRequiredForCertification: boolean;
};

const REQUIRED_MEASUREMENTS: readonly V3CapacityMeasurement[] = [
  "throughput",
  "p95-latency",
  "p99-latency",
  "error-rate",
  "database-activity",
  "lock-contention",
  "connection-pressure",
  "observed-response-bytes",
  "client-memory",
  "queue-depth",
  "retry-pressure",
] as const;

const COMMON_RUNTIME_DIMENSIONS: readonly V3CapacityDimension[] = [
  "http-requests",
  "database-requests",
  "supabase-egress",
  "cloudflare-invocations",
  "log-volume",
] as const;

/**
 * Canonical S12 scenarios from the System plan.
 *
 * The registry deliberately owns no request count, concurrency, duration,
 * capacity budget number or pass/fail threshold. Those values must come from
 * an explicit rehearsal plan, measured baseline, provider constraint or other
 * recorded evidence so a convenient synthetic number cannot silently become a
 * production capacity promise.
 */
export const V3_CAPACITY_SCENARIOS: readonly V3CapacityScenario[] = [
  {
    id: "show-start-live-refresh",
    intent: "A show starts and a synchronized audience opens or refreshes the Live/public show projection.",
    trafficClass: "read",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "realtime-connections",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "confirmation-deadline",
    intent: "Many delegations submit or reconcile Confirmation work near the same deadline without duplicating canonical submissions.",
    trafficClass: "write",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "entry-media-deadline",
    intent: "Delegations concurrently save or submit Entry and media metadata near the deadline while review-side consequences are generated.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "storage",
      "media-upload-bandwidth",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "jury-deadline",
    intent: "Many delegations save or finalize Jury work near the same deadline, exercising idempotency, locking and consequence delivery.",
    trafficClass: "write",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "televote-open",
    intent: "Televote opens and eligible clients simultaneously load voting state and begin ballot activity.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "realtime-connections",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "voting-close-consequence-burst",
    intent: "A voting round closes while final writes settle and downstream task, projection, receipt and notification consequences are generated.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "results-publish",
    intent: "Results are published and public clients synchronously request the resulting projections and assets.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "realtime-connections",
      "storage",
      "search-volume",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "notification-fanout",
    intent: "One consequential contest event generates a bounded burst of notification deliveries without resending already successful recipients.",
    trafficClass: "write",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      "database-requests",
      "database-rows",
      "supabase-egress",
      "notification-sends",
      "cloudflare-invocations",
      "log-volume",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "organizer-control-room",
    intent: "Several organizers simultaneously refresh operational read models such as readiness, tasks, voting state and system health.",
    trafficClass: "read",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "realtime-connections",
      "search-volume",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "reconciliation-backlog-drain",
    intent: "A bounded recovery backlog is processed through canonical reconciliation/replay while normal operational reads continue.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "submission-burst",
    intent: "A deliberately broad submission envelope exercises shared mutation infrastructure after domain-specific deadline scenarios are understood.",
    trafficClass: "write",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: [
      ...COMMON_RUNTIME_DIMENSIONS,
      "database-rows",
      "storage",
      "media-upload-bandwidth",
      "notification-sends",
    ],
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
  {
    id: "synchronized-traffic-spike",
    intent: "A deliberately broad synthetic spike exercises shared application boundaries without targeting production.",
    trafficClass: "mixed",
    environment: "local-isolated",
    loadShapeSource: "explicit-rehearsal-input-or-measured-baseline",
    requiredMeasurements: REQUIRED_MEASUREMENTS,
    capacityDimensions: V3_CAPACITY_DIMENSIONS,
    requiredBudgetBands: V3_CAPACITY_BUDGET_BANDS,
    providerEvidenceRequiredForCertification: true,
  },
] as const;

export function v3CapacityScenario(id: string) {
  return V3_CAPACITY_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function validateV3CapacityScenarioRegistry() {
  const errors: string[] = [];
  const ids = new Set<string>();
  const requiredMeasurements = new Set(REQUIRED_MEASUREMENTS);
  const knownDimensions = new Set<V3CapacityDimension>(V3_CAPACITY_DIMENSIONS);
  const coveredDimensions = new Set<V3CapacityDimension>();
  const requiredBudgetBands = new Set<V3CapacityBudgetBand>(V3_CAPACITY_BUDGET_BANDS);

  for (const scenario of V3_CAPACITY_SCENARIOS) {
    if (ids.has(scenario.id)) errors.push(`duplicate capacity scenario ${scenario.id}`);
    ids.add(scenario.id);
    if (!scenario.intent.trim()) errors.push(`${scenario.id} has no intent`);
    if (scenario.environment !== "local-isolated") {
      errors.push(`${scenario.id} is not isolated/local`);
    }
    if (scenario.loadShapeSource !== "explicit-rehearsal-input-or-measured-baseline") {
      errors.push(`${scenario.id} invents or obscures its load-shape source`);
    }
    for (const measurement of requiredMeasurements) {
      if (!scenario.requiredMeasurements.includes(measurement)) {
        errors.push(`${scenario.id} is missing ${measurement}`);
      }
    }
    if (scenario.capacityDimensions.length === 0) {
      errors.push(`${scenario.id} has no capacity dimensions`);
    }
    for (const dimension of scenario.capacityDimensions) {
      if (!knownDimensions.has(dimension)) {
        errors.push(`${scenario.id} has unknown capacity dimension ${dimension}`);
      }
      coveredDimensions.add(dimension);
    }
    for (const band of requiredBudgetBands) {
      if (!scenario.requiredBudgetBands.includes(band)) {
        errors.push(`${scenario.id} is missing capacity budget band ${band}`);
      }
    }
    if (!scenario.providerEvidenceRequiredForCertification) {
      errors.push(`${scenario.id} incorrectly claims local evidence is enough for certification`);
    }
  }

  for (const dimension of V3_CAPACITY_DIMENSIONS) {
    if (!coveredDimensions.has(dimension)) {
      errors.push(`capacity model does not cover ${dimension}`);
    }
  }

  return errors;
}
