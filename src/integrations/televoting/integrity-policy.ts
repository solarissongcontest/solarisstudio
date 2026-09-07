export type IntegrityIntervention =
  | "none"
  | "notice"
  | "review"
  | "declaration"
  | "enhanced_declaration"
  | "provisional_review";

export type IntegrityPolicyInput = {
  risk: number;
  confidence: number;
  strongSignalCount?: number;
  currentCoordinationEvidence?: boolean;
};

export function resolveIntegrityIntervention(input: IntegrityPolicyInput): IntegrityIntervention {
  const risk = Math.max(0, Math.min(100, Number(input.risk) || 0));
  const confidence = Math.max(0, Math.min(100, Number(input.confidence) || 0));
  const strongSignalCount = Math.max(0, Math.trunc(Number(input.strongSignalCount) || 0));

  if (risk >= 90 && confidence >= 75 && input.currentCoordinationEvidence) return "provisional_review";
  if (risk >= 75 && confidence >= 60) return "enhanced_declaration";
  if ((risk >= 60 && confidence >= 40) || (risk >= 50 && strongSignalCount >= 2 && confidence >= 35)) return "declaration";
  if (risk >= 45 && confidence >= 30) return "review";
  if (risk >= 30) return "notice";
  return "none";
}

export function interventionRequiresAttestation(intervention: IntegrityIntervention) {
  return intervention === "declaration" || intervention === "enhanced_declaration" || intervention === "provisional_review";
}

export function interventionCreatesAdminReview(intervention: IntegrityIntervention) {
  return intervention === "enhanced_declaration" || intervention === "provisional_review";
}
