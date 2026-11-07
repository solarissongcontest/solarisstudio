import { compareRulebookVersions } from "@/lib/ssc-rules/runtime-overlay";
import { ROLEPLAY_QUICK_ANSWERS } from "@/lib/ssc-rules/roleplay";

/**
 * Quick Answers are help text, not the legally binding rule snapshots.
 * Match their wording to the CURRENT published rules without altering v4.1
 * history, retaining the old search phrases so existing links still work.
 */
const V42_ROLEPLAY_QUICK_ANSWERS = ROLEPLAY_QUICK_ANSWERS.map((answer) => {
  switch (answer.id) {
    case "invade-country":
      return {
        ...answer,
        question: "Can I invade another country in my story?",
        explanation:
          "Yes, you can write an invasion into your country's story. But you cannot permanently take land from a Protected country without its HoD's agreement.",
        phrases: [...answer.phrases, answer.question],
      };
    case "annex-hodless-country":
      return {
        ...answer,
        question: "Can I take over a country with no HoD?",
        explanation:
          "Not straight away. It must complete six SSC editions in a row without an active HoD at any point. Only then does it become Unprotected. Any lasting map change must still be officially recorded.",
        phrases: [...answer.phrases, answer.question, "take over unprotected country", "country without a hod"],
      };
    case "destroy-dormant-country":
      return {
        ...answer,
        question: "Can an Unprotected country be removed from the map?",
        explanation:
          "Yes. Its land can be taken over or divided after six completed editions without an active HoD. TSBC must record the map change. If a new HoD arrives before removal, the country is Protected again. Its past SSC results stay in the archive.",
        phrases: [...answer.phrases, answer.question, "remove unprotected country", "unprotected country map"],
      };
    case "withdrawal-dormant":
      return {
        ...answer,
        question: "Does withdrawing from an edition remove a country's protection?",
        explanation:
          "No. Withdrawing does not make a country Unprotected. An edition counts toward the six only if the country had no active HoD at any time during that edition.",
        phrases: [...answer.phrases, answer.question, "withdrawal unprotected country"],
      };
    case "return-after-annexation":
      return {
        ...answer,
        question: "Can a country return after being taken off the map?",
        explanation:
          "Sometimes. If an HoD returns before the official removal, protection comes back immediately. After removal, the country needs a new official map decision. It does not automatically get its old borders back.",
        phrases: [...answer.phrases, answer.question],
      };
    default:
      return answer;
  }
});

export function roleplayQuickAnswersForVersion(version: string) {
  return compareRulebookVersions(version, "4.2") >= 0
    ? V42_ROLEPLAY_QUICK_ANSWERS
    : ROLEPLAY_QUICK_ANSWERS;
}
