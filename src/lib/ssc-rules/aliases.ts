export { LEGACY_RULE_ALIASES } from "@/lib/ssc-rules/canon-v4";

export const SEARCH_SYNONYMS: Record<string, string[]> = {
  friend: ["friend voting", "coordination", "relationships", "alliance"],
  friends: ["friend voting", "coordination", "relationships", "alliance"],
  esc: ["eurovision"],
  ns: ["national selection"],
  late: ["deadline", "extension"],
  deadline: ["late", "schedule", "time", "server timestamp"],
  timer: ["countdown", "server time", "timestamp"],
  confirmation: ["slot", "place", "first come", "opening time"],
  slot: ["confirmation", "place", "first come"],
  ban: ["sanction", "suspension", "lifetime ban", "permanent exclusion"],
  cheating: ["integrity", "manipulation", "vote trading", "fake account"],
  cheat: ["integrity", "manipulation", "vote trading", "fake account"],
  report: ["anonymous", "integrity", "evidence"],
  anonymous: ["report", "confidential", "privacy", "recovery key"],
  bot: ["automation", "script"],
  bug: ["exploit", "technical", "vulnerability"],
  host: ["hosting", "creative director", "winner"],
  artist: ["eligibility", "spotify", "reuse", "eurovision"],
  copyright: ["third party", "rights holder", "music rights"],
  appeal: ["review", "sanction", "conflict of interest"],
};
