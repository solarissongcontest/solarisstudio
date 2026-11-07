import {
  SSC_RULEBOOK as BASE_RULEBOOK,
  SSC_RULES as BASE_RULES,
  SSC_RULE_CHAPTERS as BASE_RULE_CHAPTERS,
} from "@/lib/ssc-rules/canon-v4";
import { ROLEPLAY_CHAPTER } from "@/lib/ssc-rules/roleplay";

/**
 * v4.0.1 was published through the rulebook governance service after the v4.0
 * source canon shipped. v4.1 is a structural bundled release, so it must carry
 * that already-published wording forward even when the server release pointer
 * has not yet advanced past v4.0.1.
 */
const PUBLISHED_4_0_1_RULE_2_1_BODY = [
  "Appeal: A formal request for TSBC to review a decision made under these Rules.",
  "Confirmation: The process through which a Country officially confirms and secures its participation in an Edition.",
  "Country: A fictional country registered within SSC and represented by a Delegation.",
  "Delegation: The Participant or group of Participants responsible for representing and managing a Country in SSC.",
  "Disqualification: The removal of a Country, Entry, vote, or Participant from an Edition because of a breach of the Rules.",
  "Edition: One complete occurrence of SSC, including its participation, selection, submission, voting, and results processes.",
  "Entry: The song and artist or performing act officially representing a Country in an Edition.",
  "Force Majeure: An exceptional circumstance beyond reasonable control that prevents or substantially disrupts the normal operation of the Contest or the fulfilment of an obligation under these Rules.",
  "Head of Delegation (HoD): The primary official representative of a Delegation and its main point of contact with TSBC.",
  "Internal Selection: A selection method in which a Delegation chooses its Entry directly rather than through a National Selection.",
  "Jury Vote: The official vote submitted on behalf of a Delegation in accordance with the applicable voting rules.",
  "National Selection: A selection process organised by a Delegation in which multiple potential Entries, artists, or both compete or are considered before the final Entry is chosen.",
  "Official Contest Channel: Solaris Studio or another communication channel expressly designated by TSBC for official Contest information or actions.",
  "Official Deadline: A date and time set by TSBC by which a required action must be completed.",
  "Official Result: A Contest result that has been verified and formally published or confirmed by TSBC.",
  "Participant: A real person officially taking part in SSC, whether individually or as part of a Delegation.",
  "Sanction: An official consequence imposed by TSBC following a breach of these Rules.",
  "Solaris Song Contest (SSC): The contest governed by these Rules.",
  "Solaris Studio: SSC’s primary online platform for Contest administration, participation, submissions, voting, communications, and related official functions.",
  "Submission: Information, material, or content formally provided to TSBC through Solaris Studio or another Official Contest Channel.",
  "Televote: An individual vote submitted through SSC’s official public voting system.",
  "Terra Solaris Broadcasting Coalition (TSBC): The organisation responsible for governing, regulating, and administering SSC.",
  "Withdrawal: The formal removal of a Country from an Edition after its participation has been confirmed.",
] as const;

function carryPublishedDefinitionWording<T extends { id: string; body: string[] }>(rule: T): T {
  if (rule.id !== "2.1") return { ...rule };
  return {
    ...rule,
    body: [...PUBLISHED_4_0_1_RULE_2_1_BODY],
  };
}

const inheritedChapters = BASE_RULE_CHAPTERS.map((chapter) => ({
  ...chapter,
  rules: chapter.rules.map((rule) => carryPublishedDefinitionWording(rule)),
}));

const inheritedRules = BASE_RULES.map((rule) => carryPublishedDefinitionWording(rule));

export const SSC_RULE_CHAPTERS = [...inheritedChapters, ROLEPLAY_CHAPTER];

export const SSC_RULES = [
  ...inheritedRules,
  ...ROLEPLAY_CHAPTER.rules.map((rule) => ({
    ...rule,
    chapterNumber: ROLEPLAY_CHAPTER.number,
    chapterTitle: ROLEPLAY_CHAPTER.title,
    chapterSlug: ROLEPLAY_CHAPTER.slug,
  })),
];

export const SSC_RULEBOOK = {
  ...BASE_RULEBOOK,
  version: "4.1",
  status: "Online-first 22-chapter edition",
  description:
    "The permanent General Regulations for the completely online, fan-organised Solaris Song Contest, including the Roleplay & Worldbuilding framework. Edition-Specific Regulations publish the variables that change from one edition to another.",
} as const;
