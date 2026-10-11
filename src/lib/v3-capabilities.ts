export type V3CapabilityRequirement = {
  allOf?: readonly string[];
  anyOf?: readonly string[];
};

export type V3SurfaceAccess = {
  visible: boolean;
  enabled: boolean;
  missing: readonly string[];
  reason: "allowed" | "missing_all" | "missing_any" | "missing_both";
};

function normalizeCapabilities(capabilities: readonly string[]) {
  return new Set(capabilities.map((item) => item.trim()).filter(Boolean));
}

/**
 * Evaluate UI access from the server-supplied capability set only. Display
 * roles such as "HOD" or "Organizer" are intentionally not inputs here.
 * Authorization still belongs on the server; this function only keeps V3
 * presentation consistent with the authoritative capability projection.
 */
export function evaluateV3CapabilityRequirement(
  capabilities: readonly string[],
  requirement: V3CapabilityRequirement,
): V3SurfaceAccess {
  const available = normalizeCapabilities(capabilities);
  const allOf = requirement.allOf ?? [];
  const anyOf = requirement.anyOf ?? [];

  const missingAll = allOf.filter((capability) => !available.has(capability));
  const hasAny = anyOf.length === 0 || anyOf.some((capability) => available.has(capability));
  const missingAny = hasAny ? [] : [...anyOf];

  const allSatisfied = missingAll.length === 0;
  const allowed = allSatisfied && hasAny;

  const reason: V3SurfaceAccess["reason"] = allowed
    ? "allowed"
    : missingAll.length && missingAny.length
      ? "missing_both"
      : missingAll.length
        ? "missing_all"
        : "missing_any";

  return {
    visible: allowed,
    enabled: allowed,
    missing: [...missingAll, ...missingAny],
    reason,
  };
}

export type V3CapabilitySurface =
  | "confirmation_manage"
  | "entry_edit"
  | "jury_manage"
  | "organizer_mode"
  | "results_publish"
  | "roles_manage";

/**
 * These keys intentionally mirror the authoritative Permission Engine v2
 * capability vocabulary already present in Solaris. Do not invent a new V3
 * role/capability namespace in the client.
 */
const SURFACE_REQUIREMENTS: Readonly<Record<V3CapabilitySurface, V3CapabilityRequirement>> = Object.freeze({
  confirmation_manage: { anyOf: ["confirmation.manage"] },
  entry_edit: { anyOf: ["entry.edit"] },
  jury_manage: { anyOf: ["jury.ballots.manage", "voting.manage"] },
  organizer_mode: {
    anyOf: [
      "edition.manage",
      "delegation.manage",
      "confirmation.manage",
      "entry.approve",
      "voting.manage",
      "jury.ballots.manage",
      "televote.ballots.manage",
      "results.publish",
      "communications.send",
      "integrity.manage",
      "broadcast.control",
      "permissions.manage",
    ],
  },
  results_publish: { anyOf: ["results.publish", "publishing.publish"] },
  roles_manage: { anyOf: ["permissions.manage"] },
});

export function projectV3SurfaceAccess(
  surface: V3CapabilitySurface,
  capabilities: readonly string[],
) {
  return evaluateV3CapabilityRequirement(capabilities, SURFACE_REQUIREMENTS[surface]);
}
