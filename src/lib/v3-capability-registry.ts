import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";

/** Public capability inventory after combining legacy V6 surfaces and route-scan discoveries. */
export const V3_PUBLIC_CAPABILITIES = [
  ...V3_PUBLIC_CAPABILITY_REGISTRY,
  ...V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES,
] as const;

export {
  V3_PUBLIC_CAPABILITY_REGISTRY,
  V3_PUBLIC_FEATURE_FLAGS,
  V3_PUBLIC_SOURCE_SURFACE_IDS,
} from "./v3-public-capability-registry";
export { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";
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
