import {
  V3_AUTHORIZATION_KNOWN_GAPS,
  V3_AUTHORIZATION_REQUIREMENT_REGISTRY,
  validateV3AuthorizationRequirementRegistry,
} from "./v3-authorization-requirement-registry";

export function assessV3S16AuthorizationReadiness() {
  const registryErrors = validateV3AuthorizationRequirementRegistry();
  const declared = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.filter(
    (item) => item.state !== "verified",
  );
  const verified = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.filter(
    (item) => item.state === "verified",
  );
  const incompleteVerified = verified.filter((item) => {
    const authorizationModelIncomplete =
      !item.authorizationModel ||
      (item.authorizationModel === "capability" && !item.requiredCapability) ||
      (item.authorizationModel === "participant-boundary" && item.requiredCapability !== null);

    return (
      authorizationModelIncomplete ||
      !item.scope ||
      !item.objectResolution ||
      !item.serverBoundary ||
      item.serviceRoleAllowed === null ||
      item.negativePaths.length < 3 ||
      item.evidence.length === 0
    );
  });

  const ready =
    registryErrors.length === 0 &&
    V3_AUTHORIZATION_KNOWN_GAPS.length === 0 &&
    declared.length === 0 &&
    incompleteVerified.length === 0;

  return {
    ready,
    commandCount: V3_AUTHORIZATION_REQUIREMENT_REGISTRY.length,
    verifiedCount: verified.length,
    declaredCount: declared.length,
    knownGapCount: V3_AUTHORIZATION_KNOWN_GAPS.length,
    registryErrors,
    declaredCommands: declared.map((item) => ({
      command: item.command,
      ownerDomain: item.ownerDomain,
    })),
    incompleteVerifiedCommands: incompleteVerified.map((item) => item.command),
  } as const;
}

export type V3S16AuthorizationReadiness = ReturnType<
  typeof assessV3S16AuthorizationReadiness
>;
