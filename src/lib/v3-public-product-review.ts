import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";

export const V3_PUBLIC_PRODUCT_PARITY_STATES = [
  "unaudited",
  "legacy",
  "partial",
  "parity",
] as const;

export type V3PublicProductParity = (typeof V3_PUBLIC_PRODUCT_PARITY_STATES)[number];

export const V3_PUBLIC_VERIFICATION_STATES = [
  "untested",
  "component-tested",
  "workflow-tested",
  "responsive-tested",
  "visual-tested",
] as const;

export type V3PublicVerificationState = (typeof V3_PUBLIC_VERIFICATION_STATES)[number];

export const V3_PUBLIC_CERTIFICATION_STATES = [
  "uncertified",
  "candidate-certified",
  "released",
] as const;

export type V3PublicCertificationState = (typeof V3_PUBLIC_CERTIFICATION_STATES)[number];

type PublicCapability = (typeof V3_PUBLIC_CAPABILITIES)[number];

export type V3PublicProductReviewOverride = {
  capabilityId: string;
  productParity: V3PublicProductParity;
  verification: V3PublicVerificationState;
  certification: V3PublicCertificationState;
  evidence: readonly string[];
  blocker?: string;
};

export type V3PublicProductReviewRow = {
  capabilityId: string;
  migrationStatus: PublicCapability["specificationStatus"];
  productParity: V3PublicProductParity;
  verification: V3PublicVerificationState;
  certification: V3PublicCertificationState;
  evidence: readonly string[];
  blocker?: string;
};

/**
 * QA-owned product evidence only.
 *
 * Capability owners continue to own migration/classification state in the Public
 * Capability Registry. An entry belongs here only after QA has independent
 * product/responsive/visual evidence. Absence is deliberately fail-closed and
 * resolves to unaudited / untested / uncertified.
 */
export const V3_PUBLIC_PRODUCT_REVIEW_OVERRIDES: readonly V3PublicProductReviewOverride[] = [];

const DEFAULT_BLOCKER =
  "Independent Public product-parity review has not been recorded for this capability";

export function buildV3PublicProductReviewRows(
  capabilities: readonly PublicCapability[] = V3_PUBLIC_CAPABILITIES,
  overrides: readonly V3PublicProductReviewOverride[] = V3_PUBLIC_PRODUCT_REVIEW_OVERRIDES,
): V3PublicProductReviewRow[] {
  const overrideByCapability = new Map(overrides.map((override) => [override.capabilityId, override]));

  return capabilities.map((capability) => {
    const review = overrideByCapability.get(capability.id);
    return {
      capabilityId: capability.id,
      migrationStatus: capability.specificationStatus,
      productParity: review?.productParity ?? "unaudited",
      verification: review?.verification ?? "untested",
      certification: review?.certification ?? "uncertified",
      evidence: review?.evidence ?? [],
      blocker: review?.blocker ?? (review ? undefined : DEFAULT_BLOCKER),
    };
  });
}

export function validateV3PublicProductReviewRegistry(
  capabilities: readonly PublicCapability[] = V3_PUBLIC_CAPABILITIES,
  overrides: readonly V3PublicProductReviewOverride[] = V3_PUBLIC_PRODUCT_REVIEW_OVERRIDES,
): string[] {
  const errors: string[] = [];
  const knownCapabilityIds = new Set(capabilities.map((capability) => capability.id));
  const seenOverrideIds = new Set<string>();

  for (const override of overrides) {
    if (!knownCapabilityIds.has(override.capabilityId)) {
      errors.push(`Unknown Public capability product-review override: ${override.capabilityId}`);
    }
    if (seenOverrideIds.has(override.capabilityId)) {
      errors.push(`Duplicate Public capability product-review override: ${override.capabilityId}`);
    }
    seenOverrideIds.add(override.capabilityId);

    if (override.productParity !== "unaudited" && override.evidence.length === 0) {
      errors.push(`${override.capabilityId}: product parity ${override.productParity} requires evidence`);
    }
    if (override.verification !== "untested" && override.evidence.length === 0) {
      errors.push(`${override.capabilityId}: verification ${override.verification} requires evidence`);
    }
    if (override.certification !== "uncertified") {
      if (override.productParity !== "parity") {
        errors.push(
          `${override.capabilityId}: ${override.certification} requires productParity=parity`,
        );
      }
      if (override.evidence.length === 0) {
        errors.push(`${override.capabilityId}: ${override.certification} requires evidence`);
      }
    }
  }

  const rows = buildV3PublicProductReviewRows(capabilities, overrides);
  if (rows.length !== capabilities.length) {
    errors.push(
      `Public product review coverage mismatch: ${rows.length}/${capabilities.length} capabilities`,
    );
  }

  return errors;
}
