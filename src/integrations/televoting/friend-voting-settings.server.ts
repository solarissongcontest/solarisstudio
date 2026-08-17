import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";
import type { FriendVotingRiskConfig } from "@/integrations/televoting/friend-voting-math";

export type FriendVotingSettings = FriendVotingRiskConfig & {
  cliqueMinEdgeRisk: number;
  cliqueInternalShareThreshold: number;
  cliqueMinMembers: number;
  cliqueMinDensity: number;
  riskNotable: number;
  riskReview: number;
  riskStrong: number;
  riskHigh: number;
  riskCritical: number;
};

const DEFAULTS: FriendVotingSettings = {
  minIndependentEditions: 3,
  fullConfidenceEditions: 4,
  supportEditionThreshold: 0.75,
  maximumEditionThreshold: 0.45,
  reciprocalEditionThreshold: 0.6,
  intensityThreshold: 0.5,
  crossChannelMinEditions: 2,
  baseConfidenceWeight: 20,
  supportWeight: 22,
  maximumWeight: 16,
  reciprocityWeight: 16,
  intensityWeight: 10,
  crossChannelWeight: 10,
  crossChannelPerEditionWeight: 3,
  oneEditionCap: 29,
  twoEditionCap: 49,
  cliqueMinEdgeRisk: 65,
  cliqueInternalShareThreshold: 0.5,
  cliqueMinMembers: 3,
  cliqueMinDensity: 0.5,
  riskNotable: 30,
  riskReview: 50,
  riskStrong: 65,
  riskHigh: 80,
  riskCritical: 90,
};

function n(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rowToSettings(row: any): FriendVotingSettings {
  return {
    minIndependentEditions: n(row?.min_independent_editions, DEFAULTS.minIndependentEditions),
    fullConfidenceEditions: n(row?.full_confidence_editions, DEFAULTS.fullConfidenceEditions),
    supportEditionThreshold: n(row?.support_edition_threshold, DEFAULTS.supportEditionThreshold),
    maximumEditionThreshold: n(row?.maximum_edition_threshold, DEFAULTS.maximumEditionThreshold),
    reciprocalEditionThreshold: n(row?.reciprocal_edition_threshold, DEFAULTS.reciprocalEditionThreshold),
    intensityThreshold: n(row?.intensity_threshold, DEFAULTS.intensityThreshold),
    crossChannelMinEditions: n(row?.cross_channel_min_editions, DEFAULTS.crossChannelMinEditions),
    baseConfidenceWeight: n(row?.base_confidence_weight, DEFAULTS.baseConfidenceWeight),
    supportWeight: n(row?.support_weight, DEFAULTS.supportWeight),
    maximumWeight: n(row?.maximum_weight, DEFAULTS.maximumWeight),
    reciprocityWeight: n(row?.reciprocity_weight, DEFAULTS.reciprocityWeight),
    intensityWeight: n(row?.intensity_weight, DEFAULTS.intensityWeight),
    crossChannelWeight: n(row?.cross_channel_weight, DEFAULTS.crossChannelWeight),
    crossChannelPerEditionWeight: n(row?.cross_channel_per_edition_weight, DEFAULTS.crossChannelPerEditionWeight),
    oneEditionCap: n(row?.one_edition_cap, DEFAULTS.oneEditionCap),
    twoEditionCap: n(row?.two_edition_cap, DEFAULTS.twoEditionCap),
    cliqueMinEdgeRisk: n(row?.clique_min_edge_risk, DEFAULTS.cliqueMinEdgeRisk),
    cliqueInternalShareThreshold: n(row?.clique_internal_share_threshold, DEFAULTS.cliqueInternalShareThreshold),
    cliqueMinMembers: n(row?.clique_min_members, DEFAULTS.cliqueMinMembers),
    cliqueMinDensity: n(row?.clique_min_density, DEFAULTS.cliqueMinDensity),
    riskNotable: n(row?.risk_notable, DEFAULTS.riskNotable),
    riskReview: n(row?.risk_review, DEFAULTS.riskReview),
    riskStrong: n(row?.risk_strong, DEFAULTS.riskStrong),
    riskHigh: n(row?.risk_high, DEFAULTS.riskHigh),
    riskCritical: n(row?.risk_critical, DEFAULTS.riskCritical),
  };
}

export async function loadFriendVotingSettingsServer(): Promise<FriendVotingSettings> {
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("friend_voting_settings").select("*").eq("id", "default").maybeSingle();
  if (error) throw new Error(error.message);
  return rowToSettings(data);
}

export async function getFriendVotingSettingsServer() {
  await requireSolarisOrganizerServer();
  return loadFriendVotingSettingsServer();
}

export async function updateFriendVotingSettingsServer(input: FriendVotingSettings) {
  await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const values = {
    id: "default",
    min_independent_editions: Math.max(1, Math.trunc(input.minIndependentEditions)),
    full_confidence_editions: Math.max(1, Math.trunc(input.fullConfidenceEditions)),
    support_edition_threshold: input.supportEditionThreshold,
    maximum_edition_threshold: input.maximumEditionThreshold,
    reciprocal_edition_threshold: input.reciprocalEditionThreshold,
    intensity_threshold: input.intensityThreshold,
    cross_channel_min_editions: Math.max(1, Math.trunc(input.crossChannelMinEditions)),
    base_confidence_weight: input.baseConfidenceWeight,
    support_weight: input.supportWeight,
    maximum_weight: input.maximumWeight,
    reciprocity_weight: input.reciprocityWeight,
    intensity_weight: input.intensityWeight,
    cross_channel_weight: input.crossChannelWeight,
    cross_channel_per_edition_weight: input.crossChannelPerEditionWeight,
    one_edition_cap: Math.round(input.oneEditionCap),
    two_edition_cap: Math.round(input.twoEditionCap),
    clique_min_edge_risk: Math.round(input.cliqueMinEdgeRisk),
    clique_internal_share_threshold: input.cliqueInternalShareThreshold,
    clique_min_members: Math.max(2, Math.trunc(input.cliqueMinMembers)),
    clique_min_density: input.cliqueMinDensity,
    risk_notable: Math.round(input.riskNotable),
    risk_review: Math.round(input.riskReview),
    risk_strong: Math.round(input.riskStrong),
    risk_high: Math.round(input.riskHigh),
    risk_critical: Math.round(input.riskCritical),
  };
  const { error } = await db.from("friend_voting_settings").upsert(values, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return loadFriendVotingSettingsServer();
}

export { DEFAULTS as DEFAULT_FRIEND_VOTING_SETTINGS };
