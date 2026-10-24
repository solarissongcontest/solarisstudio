import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";
import { V3_PUBLIC_PLANNED_CAPABILITIES } from "./v3-public-planned-capabilities";

/** Public capability inventory after combining legacy V6 surfaces, route-scan discoveries and canonical new V3 product work. */
export const V3_PUBLIC_CAPABILITIES = [
  ...V3_PUBLIC_CAPABILITY_REGISTRY,
  ...V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES,
  ...V3_PUBLIC_PLANNED_CAPABILITIES,
] as const;

export {
  V3_PUBLIC_CAPABILITY_REGISTRY,
  V3_PUBLIC_FEATURE_FLAGS,
  V3_PUBLIC_SOURCE_SURFACE_IDS,
} from "./v3-public-capability-registry";
export { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";
export { V3_PUBLIC_PLANNED_CAPABILITIES } from "./v3-public-planned-capabilities";
export {
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CLASSIFICATION_BY_ID,
  V3_ORGANIZER_DISCOVERED_IDS,
  V3_ORGANIZER_FEATURE_FLAGS,
} from "./v3-organizer-capability-registry";
export {
  V3_ORGANIZER_NON_CAPABILITY_ROUTES,
  V3_ORGANIZER_ROUTE_OWNERSHIP,
} from "./v3-organizer-route-ownership";
export { V3_API_CAPABILITY_REGISTRY } from "./v3-api-capability-registry";
export {
  V3_SYSTEM_DOMAIN_REGISTRY,
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
} from "./v3-system-domain-registry";
export {
  V3_WORKFLOW_DEPENDENCY_REGISTRY,
  validateV3WorkflowDependencyRegistry,
  v3WorkflowDependency,
} from "./v3-workflow-dependency-registry";
export {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  validateV3DomainConsequenceRegistry,
  v3DomainConsequence,
} from "./v3-domain-consequence-registry";
export {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  validateV3ProjectionReconciliationRegistry,
  v3ProjectionReconciliation,
  v3ProjectionsInvalidatedByEvent,
} from "./v3-projection-reconciliation-registry";
export { assessV3ProjectionFreshness } from "./v3-projection-freshness";
export type {
  V3ProjectionAuthorityEvidence,
  V3ProjectionFreshnessResult,
  V3ProjectionObservation,
} from "./v3-projection-freshness";
