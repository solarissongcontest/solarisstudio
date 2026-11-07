import type { SscRule } from "@/lib/ssc-rules/types";

/** Plain-language definitions used by every rule detail page. */
export const SSC_PLAIN_GLOSSARY = [
  { term: "Head of Delegation (HoD)", definition: "The real person who officially represents a fictional country and contacts TSBC.", match: ["head of delegation", "hod"] },
  { term: "Edition", definition: "One complete Solaris Song Contest, from participation to final results.", match: ["edition"] },
  { term: "Protected country", definition: "A country that other players cannot permanently annex, split or erase without the required permission. It is protected while an HoD is active or fewer than six consecutive completed editions have passed with none.", match: ["protected country", "protected"] },
  { term: "Dormant country", definition: "A country that has had no active HoD at any point during six completed SSC editions in a row. It can then be permanently changed in worldbuilding under the official map rules.", match: ["dormant", "dormancy"] },
  { term: "Official (canonical) map", definition: "The version of Solaris's fictional world map recognised and recorded by TSBC. An unofficial claim does not change it.", match: ["canonical map", "official map", "canonical"] },
  { term: "Annexation", definition: "A fictional country taking another country's territory and making it part of its own.", match: ["annex", "annexation"] },
  { term: "Partition", definition: "Dividing a fictional country or territory into separate parts.", match: ["partition"] },
  { term: "Successor state", definition: "A new fictional country that continues some of the identity or history of a former one.", match: ["successor state"] },
  { term: "Secession", definition: "Part of a fictional country breaking away to form a new country.", match: ["secession"] },
  { term: "Sanction", definition: "An official penalty imposed after TSBC finds that a rule was broken.", match: ["sanction", "penalty level"] },
  { term: "Mitigating factors", definition: "Reasons that can justify a lighter penalty, such as correcting an honest mistake.", match: ["mitigating"] },
  { term: "Aggravating factors", definition: "Reasons that can justify a stronger penalty, such as repeated deliberate cheating.", match: ["aggravating"] },
  { term: "Force Majeure", definition: "An exceptional problem outside reasonable control, such as a major platform outage or natural disaster.", match: ["force majeure"] },
  { term: "Conflict of interest", definition: "When an official's personal involvement may make it difficult to decide a case fairly.", match: ["conflict of interest", "personal conflict"] },
  { term: "Official server time", definition: "The time recorded by Solaris Studio's official system when an action arrives. A phone countdown cannot override it.", match: ["server-side timestamp", "server time", "server's recorded", "server records"] },
  { term: "National Selection", definition: "A selection where a delegation considers multiple songs or artists before choosing its entry.", match: ["national selection"] },
  { term: "Internal Selection", definition: "A delegation choosing an entry directly instead of holding a National Selection.", match: ["internal selection"] },
  { term: "Jury vote", definition: "A country delegation's official independent ranking or ballot for the edition.", match: ["jury vote", "jury ranking", "jury ballot"] },
  { term: "Televote", definition: "A public vote submitted through SSC's official voting system.", match: ["televote"] },
  { term: "Official Contest Channel", definition: "Solaris Studio or another communication channel that TSBC expressly announces as official.", match: ["official contest channel", "official channel"] },
  { term: "Appeal", definition: "A request for TSBC to review an official decision or penalty.", match: ["appeal"] },
  { term: "Eligibility check", definition: "The recorded time when TSBC checks whether a song and artist meet the entry requirements.", match: ["eligibility check", "eligibility-check", "official check"] },
] as const;

export function glossaryForRule(rule: Pick<SscRule, "id" | "title" | "summary" | "body">) {
  if (rule.id === "2.1") return [];
  const words = [rule.title, rule.summary, ...rule.body].join(" ").toLowerCase();
  return SSC_PLAIN_GLOSSARY.filter(({ match }) =>
    match.some((needle) => words.includes(needle.toLowerCase())),
  ).slice(0, 6);
}
