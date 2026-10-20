export const V3_PARTICIPANT_FEATURE_KEYS = [
  "official_communications",
  "hod_workspace_v2",
  "rules_engine",
] as const;

export type V3ParticipantFeatureKey = (typeof V3_PARTICIPANT_FEATURE_KEYS)[number];

type FeatureSnapshotRow = {
  flag_key: string;
  enabled: boolean;
};

export function resolveV3ParticipantFeatureSnapshot(
  data: unknown,
): V3ParticipantFeatureKey[] | null {
  if (!Array.isArray(data)) return null;

  const requested = new Set<string>(V3_PARTICIPANT_FEATURE_KEYS);
  const resolved = new Map<V3ParticipantFeatureKey, boolean>();

  for (const value of data) {
    if (!value || typeof value !== "object") return null;
    const row = value as Partial<FeatureSnapshotRow>;
    if (
      typeof row.flag_key !== "string" ||
      typeof row.enabled !== "boolean" ||
      !requested.has(row.flag_key) ||
      resolved.has(row.flag_key as V3ParticipantFeatureKey)
    ) {
      return null;
    }

    resolved.set(row.flag_key as V3ParticipantFeatureKey, row.enabled);
  }

  // The System snapshot contract returns every requested key, including
  // unknown/disabled keys as false. Missing rows therefore mean the response
  // is incomplete, not permission to infer a default in the Public client.
  if (resolved.size !== V3_PARTICIPANT_FEATURE_KEYS.length) return null;

  return V3_PARTICIPANT_FEATURE_KEYS.filter((key) => resolved.get(key) === true);
}
