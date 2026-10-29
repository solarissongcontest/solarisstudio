import { SSC_RULES as SOURCE_RULES } from "@/lib/ssc-rules-online-base";
import type { SscRule, SscRuleChapter } from "@/lib/ssc-rules/types";

type Plan = Omit<SscRuleChapter, "rules"> & { sourceIds: string[] };

const PLANS: Plan[] = [
  { number: 1, slug: "nature-purpose-status", title: "Nature, Purpose & Status", shortTitle: "Nature & Status", description: "What SSC is, what it is not, and what its fictional online contest language means.", icon: "Globe2", accent: "sky", atAGlance: ["SSC is an independent fan-organised music competition.", "The Contest is conducted completely online.", "Countries and hosting are fictional contest concepts, not real-world state or broadcaster roles.", "Participation creates no official relationship with artists, labels, broadcasters or streaming platforms."], sourceIds: ["1.1"] },
  { number: 2, slug: "definitions", title: "Definitions", shortTitle: "Definitions", description: "The official meaning of recurring SSC, delegation, voting, platform and deadline terminology.", icon: "BookOpen", accent: "indigo", atAGlance: ["A Country is fictional; a Participant is a real person.", "An Entry is the song and artist representing a country.", "Solaris Studio is the primary official administration platform.", "Defined terms keep the same meaning throughout the Regulations."], sourceIds: ["2.1"] },
  { number: 3, slug: "governance-administration", title: "Governance & Administration", shortTitle: "Governance", description: "TSBC authority, the Contest Director and the limits of creative administration.", icon: "Landmark", accent: "sky", atAGlance: ["TSBC administers SSC and protects equal treatment.", "The Contest Director manages official operational decisions.", "The Creative Director is a creative role, not a voting or disciplinary authority.", "Uncovered situations are resolved using fairness, consistency and transparency."], sourceIds: ["1.2", "1.3", "1.4"] },
  { number: 4, slug: "platforms-accounts-confirmations", title: "Online Platforms, Accounts & Confirmations", shortTitle: "Online Participation", description: "The rules unique to a fully online contest: official channels, accounts, server records and limited confirmation rounds.", icon: "MonitorSmartphone", accent: "cyan", atAGlance: ["Solaris Studio is the primary operational platform.", "One person may not use extra accounts for extra competitive rights.", "Bots and technical exploits cannot be used to beat human participants.", "Limited confirmation places use trusted server receipt order unless announced otherwise.", "Confirmation fields must distinguish what is needed now from what can be edited later."], sourceIds: ["14.1", "14.2", "14.3", "14.4", "14.5", "8.7", "8.8"] },
  { number: 5, slug: "participation-delegations", title: "Participation & Delegations", shortTitle: "Delegations", description: "Who represents a fictional country and what participation requires from a Head of Delegation.", icon: "UsersRound", accent: "emerald", atAGlance: ["Each participating country has one official delegation.", "The Head of Delegation is the primary TSBC contact.", "Participation is voluntary but carries rule obligations.", "A fictional country and the real person representing it remain distinct inside SSC administration."], sourceIds: ["1.5", "1.6", "5.2"] },
  { number: 6, slug: "entry-eligibility", title: "Entry Eligibility", shortTitle: "Entries", description: "Song, artist, video, popularity, Eurovision-history, reuse and verification requirements.", icon: "Music2", accent: "violet", atAGlance: ["One eligible entry may represent each participating country.", "Popularity is judged against published objective thresholds at an official reference time.", "Eurovision and National Selection history restrictions apply.", "Artist reuse remains an internal SSC mechanic, not real-world ownership."], sourceIds: ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10"] },
  { number: 7, slug: "contest-format", title: "Contest Format", shortTitle: "Format", description: "Edition structure, running order, official results, tie-breaks and result verification.", icon: "PanelsTopLeft", accent: "cyan", atAGlance: ["SSC runs in numbered editions rather than being defined as an annual event.", "The edition format is published before the competitive phase.", "TSBC determines the running order for overall presentation.", "Results are official only after verification."], sourceIds: ["5.1", "5.3", "5.4", "5.5", "5.6", "5.7"] },
  { number: 8, slug: "creative-hosting", title: "Creative Hosting", shortTitle: "Hosting", description: "What winning and hosting mean in an entirely online fan contest.", icon: "Trophy", accent: "amber", atAGlance: ["Hosting is a creative online right, not a physical-event obligation.", "The winner receives first right to creatively host the next edition.", "Joint hosting or declining hosting is possible.", "TSBC keeps operational, voting and disciplinary authority."], sourceIds: ["6.1", "6.2", "6.3", "6.4", "6.5"] },
  { number: 9, slug: "jury-voting", title: "Jury Voting", shortTitle: "Jury Voting", description: "How delegation jury rankings are formed, submitted and kept independent.", icon: "ListOrdered", accent: "violet", atAGlance: ["A jury ranking should reflect genuine assessment of the entries.", "Required jury ballots must be submitted through the official process.", "No delegation may outsource its independent ranking to another participant.", "Edition rules define the exact jury format and point conversion."], sourceIds: ["7.1", "7.3"] },
  { number: 10, slug: "televoting", title: "Televoting", shortTitle: "Televoting", description: "The official public-voting system, round limits and validity of individual votes.", icon: "Vote", accent: "cyan", atAGlance: ["Only official-system votes count.", "Edition rules publish the number and distribution limits of televotes.", "Duplicate, fraudulent or technically invalid votes may be rejected.", "Extra accounts, bots or technical bypasses do not create extra voting rights."], sourceIds: ["7.4"] },
  { number: 11, slug: "voting-integrity-anti-collusion", title: "Voting Integrity & Anti-Collusion", shortTitle: "Voting Integrity", description: "Self-voting, coordination, campaigning, friendship, automated review and evidence standards.", icon: "ShieldCheck", accent: "emerald", atAGlance: ["Self-voting and reciprocal vote agreements are prohibited.", "Friendship and shared communities are not misconduct by themselves.", "Automated friend-voting analysis can flag cases but cannot determine guilt.", "Statistics must be considered with context and other evidence."], sourceIds: ["7.2", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10", "7.11"] },
  { number: 12, slug: "schedule-deadlines-technical-failures", title: "Schedule, Deadlines & Technical Failures", shortTitle: "Deadlines", description: "Official timestamps, late actions, extensions, outages and publication timing.", icon: "Clock3", accent: "cyan", atAGlance: ["Important times identify the date, clock time and time zone.", "Trusted server timestamps control timing disputes.", "Extensions require a stated justification.", "A widespread official-platform failure can justify reopening or restoration."], sourceIds: ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
  { number: 13, slug: "media-copyright-branding-ai", title: "Media, Copyright, Branding & AI", shortTitle: "Media & AI", description: "Official presentation, SSC-owned branding, third-party rights, clips, AI and promotion.", icon: "Sparkles", accent: "indigo", atAGlance: ["TSBC controls original SSC presentation and branding.", "Real-world songs, recordings and artist identities remain third-party property.", "Rights-holder and platform requirements continue to apply.", "AI can assist production but cannot replace the competing song under current rules."], sourceIds: ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6"] },
  { number: 14, slug: "community-conduct-safety-privacy", title: "Community Conduct, Safety & Privacy", shortTitle: "Safety & Privacy", description: "Respect, criticism, harassment, discrimination, jurisdiction and data minimisation.", icon: "HeartHandshake", accent: "emerald", atAGlance: ["Good-faith criticism of songs, results, rules and TSBC is allowed.", "Harassment, discrimination, threats and doxxing are prohibited.", "SSC rules do not claim authority over unrelated private life.", "Sensitive technical information is restricted to legitimate operational or integrity purposes."], sourceIds: ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "14.6", "14.13"] },
  { number: 15, slug: "withdrawals-replacements", title: "Withdrawals & Replacements", shortTitle: "Withdrawals", description: "Voluntary withdrawal, disruption after publication, replacement entries and host changes.", icon: "RefreshCcw", accent: "amber", atAGlance: ["Pre-deadline withdrawal is normally penalty-free.", "Late withdrawal matters mainly when it materially disrupts the edition.", "Compliant replacements are normally possible before the submission deadline.", "Post-deadline replacement requires TSBC approval."], sourceIds: ["9.1", "9.2", "9.3", "9.4", "9.5"] },
  { number: 16, slug: "investigations-evidence", title: "Investigations & Evidence", shortTitle: "Investigations", description: "Reporting, protected sources, evidence handling, disclosure and the distinction between allegations and findings.", icon: "SearchCheck", accent: "violet", atAGlance: ["Anyone may report a genuine concern without proving guilt first.", "Anonymous reporting must match the privacy promise made to the reporter.", "Evidence can be redacted when necessary to protect sources and private data.", "A report, flag or investigation is not a finding of misconduct."], sourceIds: ["11.3", "14.7", "14.8", "14.9", "14.10", "14.11"] },
  { number: 17, slug: "sanctions", title: "Sanctions", shortTitle: "Sanctions", description: "The official ten-level SSC sanction scale, proportionality factors, scope and decision-record requirements.", icon: "Scale", accent: "rose", atAGlance: ["SSC retains its ten-level sanction ladder from Official Warning to Lifetime Ban.", "Typical violations provide starting levels rather than automatic outcomes.", "Intent, history, cooperation and impact can aggravate or mitigate the level.", "A sanction should identify the correct person, ballot, entry or delegation and explain the decision."], sourceIds: ["11.1", "11.2", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9"] },
  { number: 18, slug: "appeals-conflicts", title: "Appeals & Conflicts of Interest", shortTitle: "Appeals", description: "The appeal window, fresh review, decision outcomes and reviewer independence.", icon: "Gavel", accent: "amber", atAGlance: ["Official sanctions may normally be appealed within 48 hours.", "A serious appeal should receive genuine fresh review where possible.", "Officials with significant conflicts should recuse where another reviewer is available.", "Appeal outcomes may uphold, reduce, increase or overturn a sanction."], sourceIds: ["12.1", "12.2", "12.3", "12.4", "12.5", "14.12"] },
  { number: 19, slug: "force-majeure-emergency-administration", title: "Force Majeure & Emergency Administration", shortTitle: "Emergencies", description: "Outages and exceptional real-world events that prevent normal online Contest operation.", icon: "CloudLightning", accent: "rose", atAGlance: ["Major technical and real-world emergencies can require temporary changes.", "TSBC may extend, postpone, reopen, suspend or cancel where necessary.", "Unavailable accepted media can be replaced where fair.", "Emergency measures aim to restore rather than distort competitive conditions."], sourceIds: ["13.1", "13.2", "13.3", "13.4"] },
  { number: 20, slug: "edition-specific-regulations", title: "Edition-Specific Regulations", shortTitle: "Edition Rules", description: "The compact official configuration for variables such as confirmation rounds, formats, vote limits and deadlines.", icon: "SlidersHorizontal", accent: "sky", atAGlance: ["Permanent General Regulations are not rewritten for every edition.", "Each edition publishes the variables that genuinely change.", "Confirmation slots, qualification, voting systems and dates belong here.", "Edition rules supplement the General Regulations only where variation is allowed."], sourceIds: ["15.2", "15.6"] },
  { number: 21, slug: "amendments-interpretation-entry-into-force", title: "Amendments, Interpretation & Entry into Force", shortTitle: "Amendments", description: "How permanent rules change, how ambiguity is resolved and when a version becomes active inside SSC.", icon: "FileClock", accent: "sky", atAGlance: ["Substantial competitive rules should normally stay stable during an active phase.", "Urgent integrity or technical corrections remain possible when necessary.", "Solaris Studio identifies the current official Rulebook version.", "Changes state when they enter into force."], sourceIds: ["15.1", "15.3", "15.4", "15.5"] },
];

const sourceById = new Map(SOURCE_RULES.map((rule) => [rule.id, rule]));
const legacyToCurrent = new Map<string, string>();

function canonicalSourceRule(sourceId: string, source: SscRule): SscRule {
  if (sourceId === "11.2") {
    return {
      ...source,
      title: "Sanction Levels",
      summary: "SSC uses a ten-level scale from an Official Warning to a Lifetime Ban.",
      body: ["The standard ten-level sanction scale is retained. TSBC selects the appropriate level after considering the seriousness, intent, history, cooperation and impact of the established violation."],
      bullets: [
        "Level 1 · Official Warning",
        "Level 2 · Loss of 50% of Bonus Points",
        "Level 3 · No Bonus Points Awarded",
        "Level 4 · −5 Contest Points",
        "Level 5 · −25 Contest Points",
        "Level 6 · −50 Contest Points",
        "Level 7 · −100 Contest Points",
        "Level 8 · Disqualification",
        "Level 9 · Disqualification + One-Edition Ban",
        "Level 10 · Lifetime Ban",
      ],
      important: "The ladder defines the available sanction levels. It does not make the typical starting levels automatic, and aggravating or mitigating factors may justify a different level.",
      tags: ["levels", "warning", "bonus points", "minus points", "disqualification", "ban", "lifetime ban", "sanction ladder"],
    };
  }

  if (sourceId === "11.4") {
    return {
      ...source,
      title: "Typical Violation Levels",
      summary: "Recurring violations have normal starting levels, while the actual circumstances still control the final sanction.",
      body: ["The following are typical starting points rather than automatic outcomes. TSBC may move upward or downward on the sanction scale where aggravating or mitigating factors justify it."],
      bullets: [
        "Minor misconduct · Level 1",
        "Repeated spam · Level 3",
        "Failure to vote on time · Level 4",
        "Late submission materially disrupting SSC · Level 5",
        "Falsifying Spotify or YouTube statistics · Level 6",
        "Continued harassment following warning · Level 7",
        "Submitting an ineligible artist · Level 8",
        "Submitting an ineligible Eurovision song · Level 8",
        "Vote trading or coordinated voting · Level 9",
        "Manipulating the televote · Level 9",
        "Serious threats toward SSC or participants · Level 10",
      ],
      tags: ["typical level", "vote trading", "harassment", "ineligible artist", "televote manipulation", "late jury", "starting level"],
    };
  }

  return source;
}

export const SSC_RULE_CHAPTERS: SscRuleChapter[] = PLANS.map(({ sourceIds, ...chapter }) => ({
  ...chapter,
  rules: sourceIds.map((sourceId, index) => {
    const rawSource = sourceById.get(sourceId);
    if (!rawSource) throw new Error(`SSC v4 references missing source rule ${sourceId}`);
    const source = canonicalSourceRule(sourceId, rawSource);
    const id = `${chapter.number}.${index + 1}`;
    legacyToCurrent.set(sourceId, id);
    return { ...source, id, tags: Array.from(new Set([...source.tags, `legacy rule ${sourceId}`])) };
  }),
}));

const assigned = PLANS.flatMap((chapter) => chapter.sourceIds);
const unassigned = SOURCE_RULES.map((rule) => rule.id).filter((id) => !assigned.includes(id));
const duplicate = assigned.filter((id, index) => assigned.indexOf(id) !== index);
if (unassigned.length || duplicate.length) {
  throw new Error(`SSC v4 architecture mismatch. Unassigned: ${unassigned.join(", ") || "none"}; duplicate: ${duplicate.join(", ") || "none"}.`);
}

export const SSC_RULES = SSC_RULE_CHAPTERS.flatMap((chapter) =>
  chapter.rules.map((rule) => ({
    ...rule,
    relatedRules: rule.relatedRules?.map((id) => legacyToCurrent.get(id) ?? id),
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    chapterSlug: chapter.slug,
  })),
);

export const LEGACY_RULE_ALIASES = Object.fromEntries(legacyToCurrent.entries());

export const SSC_RULEBOOK = {
  title: "Solaris Song Contest General Regulations",
  version: "4.0",
  status: "Online-first 21-chapter edition",
  publisher: "Terra Solaris Broadcasting Coalition (TSBC)",
  description: "The permanent General Regulations for the completely online, fan-organised Solaris Song Contest. Edition-Specific Regulations publish the variables that change from one edition to another.",
} as const;
