// Compatibility entry point. All current callers use the recency-weighted v4
// implementation while the stable module path remains unchanged.
export { getCoordinationGroupsV4Server as getCoordinationGroupsServer } from "@/integrations/televoting/coordination-groups-v4.server";
