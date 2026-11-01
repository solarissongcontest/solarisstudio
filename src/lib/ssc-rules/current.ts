import {
  SSC_RULEBOOK as BASE_RULEBOOK,
  SSC_RULES as BASE_RULES,
  SSC_RULE_CHAPTERS as BASE_RULE_CHAPTERS,
} from "@/lib/ssc-rules/canon-v4";
import { ROLEPLAY_CHAPTER } from "@/lib/ssc-rules/roleplay";

export const SSC_RULE_CHAPTERS = [...BASE_RULE_CHAPTERS, ROLEPLAY_CHAPTER];

export const SSC_RULES = [
  ...BASE_RULES,
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
