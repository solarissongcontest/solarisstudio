import type { BetaSection } from "./types";

const FIND_OPTIONS = [
  "Found immediately",
  "Found after looking around",
  "Found, but it was difficult",
  "Could not find it",
];

const TASK_EASE = [
  "1 — Very difficult",
  "2",
  "3",
  "4",
  "5 — Very easy",
];

function taskSection({
  number,
  id,
  title,
  body,
  analyticsId,
  outcomeId,
  helper,
}: {
  number: number;
  id: string;
  title: string;
  body: string;
  analyticsId: string;
  outcomeId: string;
  helper?: string;
}): BetaSection {
  return {
    id,
    title: `${number}. ${title}`,
    description:
      "Start from the normal public site unless the task says otherwise. Use whatever navigation feels natural. Search is allowed.",
    task: {
      body,
      href: "/",
      linkLabel: "Start task",
      analyticsId,
    },
    questions: [
      {
        id: outcomeId,
        label: "Were you able to complete this task?",
        type: "single",
        required: true,
        options: FIND_OPTIONS,
        helper,
      },
      {
        id: `${outcomeId}Ease`,
        label: "How easy was the route you took?",
        type: "single",
        options: TASK_EASE,
      },
      {
        id: `${outcomeId}Expected`,
        label: "If you hesitated or failed, where did you expect this to be?",
        type: "text",
        showWhen: {
          id: outcomeId,
          oneOf: ["Found after looking around", "Found, but it was difficult", "Could not find it"],
        },
      },
    ],
  };
}

export const beta3NavigationSections: BetaSection[] = [
  {
    id: "tester-profile",
    title: "1. Tester profile",
    description:
      "This lets us compare newcomer, returning-user, desktop and mobile journeys without guessing who struggled.",
    questions: [
      {
        id: "testerName",
        label: "Name / SSC username",
        type: "text",
        required: true,
        placeholder: "Your name or SSC username",
      },
      {
        id: "country",
        label: "Your SSC country",
        type: "text",
        placeholder: "Country",
      },
      {
        id: "device",
        label: "Main device used for this test",
        type: "single",
        required: true,
        options: ["Phone", "Tablet", "Laptop", "Desktop"],
      },
      {
        id: "browser",
        label: "Browser",
        type: "single",
        options: ["Chrome", "Safari", "Firefox", "Edge", "Other / Not sure"],
      },
      {
        id: "familiarity",
        label: "How familiar are you with Solaris Studio?",
        type: "single",
        options: ["Never used it", "Used it once or twice", "Used it several times", "I use it regularly"],
      },
    ],
  },
  taskSection({
    number: 2,
    id: "beta3-old-edition-winner",
    title: "Find an old edition winner",
    analyticsId: "beta3-old-edition-winner",
    outcomeId: "beta3OldWinnerOutcome",
    body:
      "Find the winner of SSC 21. Do not use the Guide or ask another tester where to go.",
  }),
  taskSection({
    number: 3,
    id: "beta3-country-entry",
    title: "Find a country's entry in a specific edition",
    analyticsId: "beta3-country-entry",
    outcomeId: "beta3CountryEntryOutcome",
    body:
      "Find Oland's entry in SSC 21, including the artist and song. Do not start from a direct country or edition link.",
  }),
  taskSection({
    number: 4,
    id: "beta3-jury-scores",
    title: "Find detailed jury scores",
    analyticsId: "beta3-jury-scores",
    outcomeId: "beta3JuryScoresOutcome",
    body:
      "Find the detailed published jury scores for an SSC 21 show. The goal is the individual voting detail, not only the final ranking.",
  }),
  taskSection({
    number: 5,
    id: "beta3-compare-countries",
    title: "Compare two countries",
    analyticsId: "beta3-compare-countries",
    outcomeId: "beta3CompareOutcome",
    body:
      "Find a way to compare Oland and Vendia side by side across their SSC history.",
  }),
  taskSection({
    number: 6,
    id: "beta3-result-scenario",
    title: "Change a result scenario",
    analyticsId: "beta3-result-scenario",
    outcomeId: "beta3ResultScenarioOutcome",
    body:
      "Without being told a feature name, find the tool that lets you see how a published result would change if the jury/televote balance or calculation rules were different.",
  }),
  taskSection({
    number: 7,
    id: "beta3-confirmation",
    title: "Find the current confirmation",
    analyticsId: "beta3-confirmation",
    outcomeId: "beta3ConfirmationOutcome",
    body:
      "Find the current country confirmation process and determine whether there is anything you can do right now.",
  }),
  taskSection({
    number: 8,
    id: "beta3-jury-voting",
    title: "Find jury voting",
    analyticsId: "beta3-jury-voting",
    outcomeId: "beta3JuryVotingOutcome",
    body:
      "Find where a Head of Delegation would submit the country's official jury ballot, or confirm that no ballot currently needs action.",
  }),
  taskSection({
    number: 9,
    id: "beta3-entry-rule",
    title: "Check whether a planned entry is allowed",
    analyticsId: "beta3-entry-rule",
    outcomeId: "beta3EntryRuleOutcome",
    body:
      "Imagine you are considering an SSC entry but are unsure whether it is allowed. Find the official rule information that would let you check entry eligibility, and find where you could ask privately before acting if the rule is still unclear.",
  }),
  taskSection({
    number: 10,
    id: "beta3-report-concern",
    title: "Report a concern",
    analyticsId: "beta3-report-concern",
    outcomeId: "beta3ConcernOutcome",
    body:
      "Find the correct place to report a contest integrity, safety or privacy concern. You do not need to submit a real report.",
  }),
  taskSection({
    number: 11,
    id: "beta3-appeal",
    title: "Appeal a decision",
    analyticsId: "beta3-appeal",
    outcomeId: "beta3AppealOutcome",
    body:
      "Imagine you received an eligible formal decision and want it reviewed. Find the appeal route. You do not need to create an appeal.",
  }),
  taskSection({
    number: 12,
    id: "beta3-voting-taste",
    title: "Explore your voting taste",
    analyticsId: "beta3-voting-taste",
    outcomeId: "beta3TasteOutcome",
    body:
      "Without being told the product name, find the tool that compares your personal ranking with jury, televote and overall results.",
  }),
  taskSection({
    number: 13,
    id: "beta3-country-tools",
    title: "Find your country editing tools",
    analyticsId: "beta3-country-tools",
    outcomeId: "beta3CountryToolsOutcome",
    body:
      "If you have a country account, find where you would edit country identity, public page/media and appearance. If you do not have access, find where those tools would live after sign-in.",
  }),
  {
    id: "final",
    title: "14. Final Beta 3 assessment",
    description:
      "This is the only opinion-heavy part. The navigation tasks above matter more than whether the interface merely felt nice.",
    questions: [
      {
        id: "navigationConfidence",
        label: "After these tasks, how confident are you that you could find something unfamiliar in Solaris Studio?",
        type: "rating",
        lowLabel: "Not confident",
        highLabel: "Very confident",
      },
      {
        id: "feltLost",
        label: "How often did you feel lost during the 12 tasks?",
        type: "single",
        options: ["Never", "Once", "A few times", "Often"],
      },
      {
        id: "priorityOne",
        label: "What is the single most important navigation/findability improvement still needed?",
        type: "textarea",
        required: true,
      },
      {
        id: "bugsFound",
        label: "Did you find a reproducible bug during Beta 3?",
        type: "single",
        required: true,
        options: ["No", "Yes"],
      },
      {
        id: "betterIf",
        label: "Anything else that would make Solaris Studio easier to understand or navigate?",
        type: "textarea",
      },
    ],
  },
];

export const BETA3_RELEASE_GATES = {
  coreTaskSuccessPercent: 90,
  firstClickSuccessPercent: 80,
  oldEditionLookupPercent: 90,
  mobileDesktopGapPercent: 5,
} as const;
