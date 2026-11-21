import type { IntegrityIntervention } from "./integrity-policy";

/**
 * The voter sees the server's intervention, NOT a guess based on risk alone.
 * Confidence, corroborating signals and Jury-specific evidence gates matter.
 */
export const VOTER_INTEGRITY_MESSAGES: Record<IntegrityIntervention, { title: string; body: string }> = {
  none: {
    title: "Review your votes",
    body: "Your votes are ready. Check them before submitting.",
  },
  notice: {
    title: "Please check your votes",
    body: "Solaris noticed an unusual voting pattern. This doesn't mean you've broken any rules. Please check your votes before submitting.",
  },
  review: {
    title: "Your votes need another look",
    body: "Some of your votes stand out from past voting patterns. Check that these are your own choices. This warning does not mean you've broken any rules.",
  },
  declaration: {
    title: "Please confirm your votes",
    body: "Solaris found voting patterns that need an extra check. Please confirm you chose these votes yourself and haven't arranged votes with anyone else.",
  },
  enhanced_declaration: {
    title: "Your vote needs an extra check",
    body: "Solaris found several unusual voting patterns. You can still submit your vote after signing a declaration. Organizers may review the ballot.",
  },
  provisional_review: {
    title: "Your vote needs organizer review",
    body: "Solaris found strong signs of possible coordinated voting. This is not proof that you've broken the rules. You can change your votes or sign and submit them for organizer review.",
  },
};

export function voterIntegrityMessage(intervention?: IntegrityIntervention) {
  return VOTER_INTEGRITY_MESSAGES[intervention ?? "none"];
}

const GENERAL_REASONS: Record<string, { title: string; description: string }> = {
  historical_relationship: {
    title: "Repeated high scores",
    description: "Similar support for the same country has appeared across several contests.",
  },
  reciprocal_pattern: {
    title: "Mutual high scores",
    description: "Two countries have repeatedly given each other high scores.",
  },
  recent_persistence: {
    title: "Repeated recent support",
    description: "This voting pattern has appeared in several recent contests.",
  },
  persistent_recent_pattern: {
    title: "Repeated recent support",
    description: "This voting pattern has appeared in several recent contests.",
  },
  unusual_similarity: {
    title: "Similar voting patterns",
    description: "Parts of this ballot are unusually similar to other voting patterns.",
  },
  multiple_relationships: {
    title: "Several unusual patterns",
    description: "Solaris noticed unusual support involving more than one country.",
  },
  jury_peer_deviation: {
    title: "Different from other juries",
    description: "Some scores differ noticeably from the overall jury voting pattern.",
  },
  jury_independence_pattern: {
    title: "Several patterns together",
    description: "More than one voting pattern contributed to this warning.",
  },
};

/** Only pre-approved generic explanations are suitable for voter-facing UI. */
export function voterIntegrityReasons(categories?: string[]) {
  const seen = new Set<string>();
  return (categories ?? []).flatMap((category) => {
    const reason = GENERAL_REASONS[category];
    if (!reason || seen.has(reason.title)) return [];
    seen.add(reason.title);
    return [reason];
  });
}

/**
 * Short labels summarize the versioned declaration, not replace it.
 * Never silently change the signed statement text or policy version without
 * the System-owned statement-version migration and local rehearsal.
 */
export const VOTER_DECLARATION_LABELS = {
  automation: "I understand that Solaris checks votes for unusual patterns. A warning doesn't automatically mean someone broke the rules.",
  independence: "I chose these votes myself.",
  coordination: "I haven't agreed to exchange votes, copy votes or arrange votes with anyone else.",
  pressure: "Nobody pressured me or told me how to vote.",
  consequences: "I understand this declaration is saved. Knowingly lying could lead to my vote being removed or other SSC penalties, including a ban.",
} as const;

/** Make known preflight/signature failures understandable without masking other errors. */
export function voterIntegrityErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/integrity check expired|voting check expired/i.test(raw)) {
    return "Your voting check has expired. Please check your votes again before submitting.";
  }
  if (/connection (?:or device identity )?changed|connection fingerprint changed/i.test(raw)) {
    return "Your connection changed during the voting check. Please check your votes again.";
  }
  if (/outdated statement|declaration was invalidated/i.test(raw)) {
    return "This declaration needs to be signed again. Please return to your votes and repeat the check.";
  }
  if (/all voting-integrity declarations must be acknowledged/i.test(raw)) {
    return "Please confirm all five statements before continuing.";
  }
  if (/type the same username|username.*sign|signature.*match/i.test(raw)) {
    return "Your username doesn't match. Please enter the same username you used to vote.";
  }
  return raw || fallback;
}
