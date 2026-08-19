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
  relationshipRisk: number;
  riskScore: number;
  severity: VoteIntegritySeverity;
  requiresAttestation: boolean;
  findings: VoteIntegrityFinding[];
  technicalSignals: VoteIntegrityTechnicalSignal[];
  history: {
    hodHistoryAvailable: boolean;
    televoteBallotsConsidered: number;
    juryBallotsConsidered: number;
    previousIpFingerprints: number;
    ipChanged: boolean;
  };
};

export const VOTE_INTEGRITY_STATEMENT_VERSION = 1;

export const VOTE_INTEGRITY_ATTESTATION =
  "I swear that this ballot reflects my own independent preferences. It is not coordinated friend-voting, reciprocal voting, vote trading, pressure from another delegation, or any other conflicted voting arrangement.";

export const VOTE_INTEGRITY_CONSEQUENCE =
  "I understand that this declaration is recorded. If SSC organizers later establish that I knowingly lied in this declaration, it can lead to removal of the ballot and a ban from SSC.";
