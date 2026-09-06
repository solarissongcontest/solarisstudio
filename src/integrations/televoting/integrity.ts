import type { IntegrityIntervention } from "@/integrations/televoting/integrity-policy";

export type VoteIntegritySeverity =
  | "none"
  | "notable"
  | "review"
  | "strong"
  | "high"
  | "critical";

export type VoteIntegrityFinding = {
  targetCode: string;
  targetName: string;
  lens: "hod" | "country";
  scopeLabel: string;
  riskScore: number;
  confidence: number;
  uniqueEditions: number;
  supportFrequency: number;
  maximumFrequency: number;
  reciprocalSupport: number;
  crossChannelEditions: number;
  reasons: string[];
  recentRisk?: number;
  lifetimeRisk?: number;
  effectiveRecentEditions?: number;
  similarityRisk?: number;
  continuityRisk?: number;
};

export type VoteIntegrityTechnicalSignal = {
  key: "ip_changed";
  title: string;
  description: string;
};

export type VoteIntegrityReport = {
  token: string;
  expiresAt: string;
  automatic: true;
  modelVersion?: string;
  relationshipRisk: number;
  riskScore: number;
  confidence?: number;
  severity: VoteIntegritySeverity;
  interventionLevel?: IntegrityIntervention;
  requiresAttestation: boolean;
  reasonCategories?: string[];
  findings: VoteIntegrityFinding[];
  technicalSignals: VoteIntegrityTechnicalSignal[];
  history: {
    hodHistoryAvailable: boolean;
    televoteBallotsConsidered: number;
    juryBallotsConsidered: number;
    previousIpFingerprints: number;
    ipChanged: boolean;
    effectiveRecentEditions?: number;
    effectiveLifetimeEditions?: number;
  };
};

export const VOTE_INTEGRITY_STATEMENT_VERSION = 2;

export const VOTE_INTEGRITY_INDEPENDENCE =
  "These votes reflect my own independent preferences.";

export const VOTE_INTEGRITY_COORDINATION =
  "I did not take part in coordinated friend-voting, reciprocal voting, vote trading, copied voting, or any agreement to exchange or arrange votes with another voter or delegation.";

export const VOTE_INTEGRITY_PRESSURE =
  "Nobody instructed, pressured, or required me to vote this way.";

export const VOTE_INTEGRITY_AUTOMATION =
  "I understand that Solaris automatically compares this ballot with relevant current and historical voting patterns for integrity purposes, and that an automated warning is not by itself a finding of misconduct.";

// Kept as one exported string for older callers while the UI presents the
// declarations as separate acknowledgements.
export const VOTE_INTEGRITY_ATTESTATION =
  `${VOTE_INTEGRITY_INDEPENDENCE} ${VOTE_INTEGRITY_COORDINATION} ${VOTE_INTEGRITY_PRESSURE}`;

export const VOTE_INTEGRITY_CONSEQUENCE =
  "I understand that this declaration is recorded. If SSC organizers later establish that I knowingly lied in this declaration, it can lead to removal of the ballot or other SSC sanctions, including a ban from SSC.";
