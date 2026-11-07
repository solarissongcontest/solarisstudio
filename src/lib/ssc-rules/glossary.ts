import type { SscRule } from "@/lib/ssc-rules/types";

/** Plain-language definitions used by every rule detail page. */
export const SSC_PLAIN_GLOSSARY = [
  { term: "Head of Delegation (HoD)", definition: "The real person who officially represents a fictional country and contacts TSBC.", match: ["head of delegation", "hod"] },
  { term: "Edition", definition: "One complete Solaris Song Contest, from participation to final results.", match: ["edition"] },
  { term: "Protected country", definition: "A country that other players cannot take over, split or remove from the map without permission. It stays Protected while it has an active HoD, or until six finished SSC editions in a row have passed without one.", match: ["protected country", "protected"] },
  { term: "Unprotected country", definition: "A country with no active HoD at any point during six finished SSC editions in a row. After the sixth edition ends, its land may change under the official map rules. A new HoD restores protection before it is officially removed.", match: ["unprotected country", "becomes unprotected", "becoming unprotected"] },
  { term: "Major emergency", definition: "A serious, unexpected problem outside people's control that affects the contest, such as a large website failure or natural disaster.", match: ["major emergency"] },
  { term: "Taking over land", definition: "Making another fictional country's land part of your own country. Protected countries cannot be taken over without the required permission.", match: ["taking over land", "take over"] },
  { term: "Dormant country", definition: "The name used in the official v4.1 rules for a country with no active HoD during six finished SSC editions in a row. The proposed v4.2 name is Unprotected country. The six-edition rule does not change.", match: ["dormant", "dormancy"] },
  { term: "Official map", definition: "The map TSBC has accepted and recorded for the fictional Solaris world. A post or a different map picture does not change it.", match: ["canonical map", "official map", "canonical"] },
  { term: "Taking over land", definition: "A fictional country making another country's land part of its own. It cannot do this to a Protected country without permission.", match: ["annex", "annexation"] },
  { term: "Dividing land", definition: "Splitting a fictional country's land into parts.", match: ["partition"] },
  { term: "New country replacing an older one", definition: "A new fictional country that keeps some of the history or identity of the old country.", match: ["successor state"] },
  { term: "Secession", definition: "Part of a fictional country breaking away to form a new country.", match: ["secession"] },
  { term: "Penalty", definition: "A punishment TSBC gives after finding that someone broke an SSC rule.", match: ["sanction", "penalty level"] },
  { term: "Reasons for a lighter penalty", definition: "Facts that may lower a penalty, such as owning up to an honest mistake and fixing it.", match: ["mitigating"] },
  { term: "Reasons for a stronger penalty", definition: "Facts that may raise a penalty, such as cheating on purpose more than once.", match: ["aggravating"] },
  { term: "Major emergency (older name: Force Majeure)", definition: "A serious unexpected event that people cannot control, such as a major website failure or natural disaster.", match: ["force majeure"] },
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
