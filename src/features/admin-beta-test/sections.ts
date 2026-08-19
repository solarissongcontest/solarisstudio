import type { BetaSection } from "@/features/beta-test/types";

export const ADMIN_BETA_DRAFT_KEY = "solaris:admin-beta-test:draft:v1";
export const ADMIN_BETA_SUBMITTED_KEY = "solaris:admin-beta-test:submitted:v1";
export const ADMIN_BETA_FORM_VERSION = 1;

const testedOptions = ["Tested properly", "Only tried briefly", "Didn't test"];
const clarityOptions = ["Clear", "Mostly clear", "A bit confusing", "Very confusing", "Didn't test"];

function editionHref(slug: string | undefined, area?: string) {
  if (!slug) return "/admin";
  if (!area) return `/admin/${slug}`;
  return `/admin/${area}/${slug}`;
}

export function buildAdminBetaSections(slug?: string): BetaSection[] {
  return [
    {
      id: "context",
      title: "About your test",
      description: "A little context makes the rest of your feedback much more useful.",
      task: {
        body: "Use Solaris Studio normally for a while before judging it. You do not need to test every admin tool. This form lets you say when you skipped something.",
        href: "/admin/operations",
        linkLabel: "Open Organizer",
      },
      questions: [
        { id: "testerName", label: "1. Name / username", type: "text", required: true, placeholder: "How should we identify your response?" },
        { id: "device", label: "2. Main device used", type: "single", required: true, options: ["Phone", "Tablet", "Laptop", "Desktop"] },
        { id: "browser", label: "3. Browser", type: "single", options: ["Chrome", "Safari", "Firefox", "Edge", "Other / Not sure"] },
        { id: "familiarity", label: "4. Before this test, how familiar were you with the Solaris Studio admin?", type: "single", required: true, options: ["Never used it", "Used it once or twice", "Somewhat familiar", "Very familiar / organizer"] },
        { id: "timeSpent", label: "5. Roughly how long did you test it?", type: "single", options: ["Under 10 minutes", "10–20 minutes", "20–40 minutes", "40–60 minutes", "More than an hour"] },
        {
          id: "areasTried",
          label: "6. Which admin areas did you actually use?",
          type: "multi",
          options: ["Overview", "Edition workspace", "Shows", "Entries & running order", "Jury", "Voting system / televote", "Publication / results", "Design & broadcast", "Delegations", "Televoting service", "Countries / hosting / accounts", "System / other tools", "None of these"],
          helper: "Choose what you really touched. Skipping things is useful information too.",
        },
      ],
    },
    {
      id: "overview",
      title: "Overview & navigation",
      description: "Can an organizer understand where they are and what needs attention without memorising the site?",
      task: {
        body: "Open Organizer Overview. Look at readiness, next actions, navigation, the edition selector and search. Try finding one tool without using this form as a map.",
        href: "/admin/operations",
        linkLabel: "Open Overview",
      },
      questions: [
        { id: "overviewClarity", label: "7. How quickly did the Overview make sense?", type: "rating", required: true, lowLabel: "Not at all", highLabel: "Immediately" },
        { id: "overviewUseful", label: "8. How useful are readiness + next actions?", type: "rating", lowLabel: "Noise", highLabel: "Very useful" },
        { id: "navEase", label: "9. How easy was it to find the admin area you wanted?", type: "rating", required: true, lowLabel: "Had to hunt", highLabel: "Instant" },
        { id: "editionSwitcher", label: "10. Did the edition switcher behave the way you expected?", type: "single", options: ["Yes", "Mostly", "No", "Didn't use it"] },
        { id: "searchUseful", label: "11. Did Organizer search / ⌘K help you get somewhere faster?", type: "single", options: ["Yes", "A little", "No", "Didn't use it"] },
        { id: "navConfusing", label: "12. What, if anything, was hard to find?", type: "textarea", placeholder: "A page, button, label, or 'Nothing' is enough." },
      ],
    },
    {
      id: "edition",
      title: "Edition workspace",
      description: "The edition home should tell you what state the contest is in and where to go next.",
      task: {
        body: "Open an edition. Check the workflow/readiness information, quick actions and specialist tools. If you switch edition, notice whether Solaris keeps the context sensibly.",
        href: editionHref(slug),
        linkLabel: "Open current edition",
      },
      questions: [
        { id: "editionTested", label: "13. How much did you test the edition workspace?", type: "single", required: true, options: testedOptions },
        { id: "editionClarity", label: "14. How clear is the edition's current state and what to do next?", type: "rating", lowLabel: "Unclear", highLabel: "Very clear", showWhen: { id: "editionTested", notEquals: "Didn't test" } },
        { id: "editionWorkflow", label: "15. Did the workflow feel like one connected process rather than separate admin pages?", type: "single", options: ["Yes", "Mostly", "Not really", "No"], showWhen: { id: "editionTested", notEquals: "Didn't test" } },
        { id: "editionMissing", label: "16. What action did you expect on the edition home but could not find?", type: "textarea", placeholder: "A few words, or 'Nothing'.", showWhen: { id: "editionTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "shows",
      title: "Shows",
      task: {
        body: "Open Shows. Inspect the show list and the create/edit flow. Do not create or delete live contest data just for the test; stop before confirming a destructive action unless you are using a designated test edition.",
        href: editionHref(slug, "shows"),
        linkLabel: "Open Shows",
      },
      questions: [
        { id: "showsTested", label: "17. How much did you test Shows?", type: "single", required: true, options: testedOptions },
        { id: "showsEase", label: "18. How easy is it to understand and manage the show structure?", type: "rating", lowLabel: "Difficult", highLabel: "Effortless", showWhen: { id: "showsTested", notEquals: "Didn't test" } },
        { id: "showsSafety", label: "19. Were edit/delete actions clear enough that you knew what would happen before committing?", type: "single", options: ["Yes", "Mostly", "No", "Didn't inspect destructive actions"], showWhen: { id: "showsTested", notEquals: "Didn't test" } },
        { id: "showsProblem", label: "20. Anything confusing or missing in Shows?", type: "textarea", placeholder: "Short answer is fine.", showWhen: { id: "showsTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "entries",
      title: "Entries & running order",
      task: {
        body: "Open Entries & running order. Switch between shows, open an entry, inspect artist/song editing and the running-order controls. Use safe/test data if you actually save changes.",
        href: editionHref(slug, "entries"),
        linkLabel: "Open Entries",
      },
      questions: [
        { id: "entriesTested", label: "21. How much did you test Entries & running order?", type: "single", required: true, options: testedOptions },
        { id: "entriesEase", label: "22. How easy is everyday entry editing?", type: "rating", lowLabel: "Slow/confusing", highLabel: "Fast/obvious", showWhen: { id: "entriesTested", notEquals: "Didn't test" } },
        { id: "runningOrderEase", label: "23. How good are the running-order controls?", type: "rating", lowLabel: "Awkward", highLabel: "Excellent", showWhen: { id: "entriesTested", notEquals: "Didn't test" } },
        { id: "entryIdentityClarity", label: "24. Were normal countries vs edition-only/custom countries understandable?", type: "single", options: clarityOptions, showWhen: { id: "entriesTested", notEquals: "Didn't test" } },
        { id: "entriesProblem", label: "25. What would make this page faster or safer to use?", type: "textarea", placeholder: "Or write 'Nothing'.", showWhen: { id: "entriesTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "jury",
      title: "Jury voting",
      task: {
        body: "Open Jury. Check the show selector, ballot entry, jury completion state and roster management. If this is live data, inspect rather than changing official votes.",
        href: editionHref(slug, "jury"),
        linkLabel: "Open Jury",
      },
      questions: [
        { id: "juryTested", label: "26. How much did you test Jury?", type: "single", required: true, options: testedOptions },
        { id: "juryEase", label: "27. How easy would it be to enter many jury ballots quickly?", type: "rating", lowLabel: "Painful", highLabel: "Very fast", showWhen: { id: "juryTested", notEquals: "Didn't test" } },
        { id: "juryRosterClarity", label: "28. Did automatic vs editable jury rosters make sense?", type: "single", options: clarityOptions, showWhen: { id: "juryTested", notEquals: "Didn't test" } },
        { id: "jurySaveConfidence", label: "29. How confident were you that a score was saved correctly?", type: "rating", lowLabel: "Not confident", highLabel: "Completely", showWhen: { id: "juryTested", notEquals: "Didn't test" } },
        { id: "juryProblem", label: "30. What could cause mistakes during a real jury sequence?", type: "textarea", placeholder: "Anything that felt risky, slow, or easy to misclick.", showWhen: { id: "juryTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "voting",
      title: "Voting system & televote totals",
      task: {
        body: "Inspect Voting System and Televote totals for an edition. Focus on whether rules, weighting and saved totals are understandable. Do not change official point scales or totals purely for testing.",
        href: editionHref(slug, "voting-system"),
        linkLabel: "Open Voting System",
      },
      questions: [
        { id: "votingTested", label: "31. How much did you test the voting setup?", type: "single", required: true, options: testedOptions },
        { id: "rulesClarity", label: "32. How understandable are point scales, weighting, self-voting and qualifier rules?", type: "rating", lowLabel: "Opaque", highLabel: "Crystal clear", showWhen: { id: "votingTested", notEquals: "Didn't test" } },
        { id: "televoteTotalsClarity", label: "33. How clear is the difference between configuring voting and entering/seeing televote totals?", type: "rating", lowLabel: "Easy to mix up", highLabel: "Very distinct", showWhen: { id: "votingTested", notEquals: "Didn't test" } },
        { id: "votingRisk", label: "34. Did anything feel too easy to change accidentally?", type: "textarea", placeholder: "Or 'No'.", showWhen: { id: "votingTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "publication",
      title: "Publication & results",
      task: {
        body: "Open Publication. Work out what is public, what is still private and what action would release results. Do not publish unreleased official results during testing.",
        href: editionHref(slug, "publication"),
        linkLabel: "Open Publication",
      },
      questions: [
        { id: "publicationTested", label: "35. How much did you test Publication?", type: "single", required: true, options: testedOptions },
        { id: "publicationClarity", label: "36. Could you tell what the public site can currently see?", type: "rating", lowLabel: "No idea", highLabel: "Immediately", showWhen: { id: "publicationTested", notEquals: "Didn't test" } },
        { id: "publicationSafety", label: "37. How safe does the publish workflow feel against accidental early release?", type: "rating", lowLabel: "Risky", highLabel: "Very safe", showWhen: { id: "publicationTested", notEquals: "Didn't test" } },
        { id: "publicationProblem", label: "38. What would you change before trusting this during a real results night?", type: "textarea", placeholder: "Short and specific is perfect.", showWhen: { id: "publicationTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "broadcast",
      title: "Design & broadcast",
      task: {
        body: "Open Design & Broadcast. Look for edition artwork, visual theme and broadcast/scoreboard controls. Judge whether related controls are grouped where you would expect them.",
        href: editionHref(slug, "design"),
        linkLabel: "Open Design & Broadcast",
      },
      questions: [
        { id: "broadcastTested", label: "39. How much did you test Design & Broadcast?", type: "single", required: true, options: testedOptions },
        { id: "broadcastEase", label: "40. How easy is it to find the visual/broadcast control you need?", type: "rating", lowLabel: "Scattered", highLabel: "Very organised", showWhen: { id: "broadcastTested", notEquals: "Didn't test" } },
        { id: "artworkClarity", label: "41. Was edition artwork management clear?", type: "single", options: clarityOptions, showWhen: { id: "broadcastTested", notEquals: "Didn't test" } },
        { id: "broadcastProblem", label: "42. Which broadcast/design control felt misplaced, unclear or missing?", type: "textarea", placeholder: "Or 'Nothing'.", showWhen: { id: "broadcastTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "delegations",
      title: "Delegations & confirmations",
      task: {
        body: "Open Delegations. Inspect responses, submission rounds, calendar and edition links. Try to work out where you would go to answer a real delegation problem.",
        href: "/confirmations/admin",
        linkLabel: "Open Delegations",
      },
      questions: [
        { id: "delegationsTested", label: "43. How much did you test Delegations?", type: "single", required: true, options: testedOptions },
        { id: "delegationsEase", label: "44. How easy is it to understand the confirmation workflow?", type: "rating", lowLabel: "Confusing", highLabel: "Very clear", showWhen: { id: "delegationsTested", notEquals: "Didn't test" } },
        { id: "delegationMatrix", label: "45. How clear were these areas?", type: "matrix", rows: ["Responses", "Submission rounds", "Calendar", "Edition links"], options: ["Clear", "Somewhat clear", "Confusing"], showWhen: { id: "delegationsTested", notEquals: "Didn't test" } },
        { id: "delegationProblem", label: "46. What would make delegation administration easier?", type: "textarea", placeholder: "A few words is enough.", showWhen: { id: "delegationsTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "televoting",
      title: "Televoting service",
      task: {
        body: "Open Voting administration. Inspect rounds/entries, results, integrity and analytics. Think about whether the split between everyday actions and specialist analysis makes sense.",
        href: "/televoting/admin",
        linkLabel: "Open Voting admin",
      },
      questions: [
        { id: "televotingTested", label: "47. How much did you test Televoting administration?", type: "single", required: true, options: testedOptions },
        { id: "televotingEase", label: "48. How easy is it to understand the voting-admin structure?", type: "rating", lowLabel: "Maze", highLabel: "Very clear", showWhen: { id: "televotingTested", notEquals: "Didn't test" } },
        { id: "televotingMatrix", label: "49. How clear were these areas?", type: "matrix", rows: ["Rounds & entries", "Results", "Integrity / moderation", "Analytics"], options: ["Clear", "Somewhat clear", "Confusing"], showWhen: { id: "televotingTested", notEquals: "Didn't test" } },
        { id: "integrityConfidence", label: "50. Did integrity/risk information explain enough to act without blindly trusting a score?", type: "single", options: ["Yes", "Mostly", "No", "Didn't inspect integrity"], showWhen: { id: "televotingTested", notEquals: "Didn't test" } },
        { id: "televotingProblem", label: "51. What felt hardest or most technical here?", type: "textarea", placeholder: "Or 'Nothing'.", showWhen: { id: "televotingTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "secondary",
      title: "Countries, hosting & other tools",
      task: {
        body: "Browse the less-frequent organizer tools: countries, country accounts, hosting, predictions, beta feedback and system settings. You do not need to deeply test every one.",
        href: "/admin/more",
        linkLabel: "Open More tools",
      },
      questions: [
        { id: "secondaryTested", label: "52. How much did you browse the less-frequent tools?", type: "single", required: true, options: testedOptions },
        { id: "secondaryFindability", label: "53. Did their grouping/location make sense?", type: "rating", lowLabel: "Random", highLabel: "Very logical", showWhen: { id: "secondaryTested", notEquals: "Didn't test" } },
        { id: "secondaryMatrix", label: "54. Which of these felt clear enough?", type: "matrix", rows: ["Countries / country accounts", "Hosting", "Predictions", "System / sync health"], options: ["Clear", "Somewhat clear", "Confusing"], showWhen: { id: "secondaryTested", notEquals: "Didn't test" } },
        { id: "secondaryProblem", label: "55. Is any tool in the wrong place or unnecessarily prominent?", type: "textarea", placeholder: "Or 'No'.", showWhen: { id: "secondaryTested", notEquals: "Didn't test" } },
      ],
    },
    {
      id: "mobile",
      title: "Mobile & desktop feel",
      description: "The admin was rebuilt mobile-first, so this matters more than decorative perfection on a 5K monitor owned by three people.",
      questions: [
        { id: "testedPhone", label: "56. Did you use the admin on a phone or narrow window?", type: "single", required: true, options: ["Yes", "No"] },
        { id: "mobileEase", label: "57. How usable was it one-handed / on a narrow screen?", type: "rating", lowLabel: "Frustrating", highLabel: "Excellent", showWhen: { id: "testedPhone", equals: "Yes" } },
        { id: "mobileCramped", label: "58. Which page felt most cramped, scroll-heavy or awkward on mobile?", type: "textarea", placeholder: "Page name + what felt wrong.", showWhen: { id: "testedPhone", equals: "Yes" } },
        { id: "desktopExpansion", label: "59. On a larger screen, did pages use the extra space sensibly?", type: "single", options: ["Yes", "Mostly", "No", "Didn't test desktop"] },
      ],
    },
    {
      id: "reliability",
      title: "Speed, saving & reliability",
      questions: [
        { id: "adminSpeed", label: "60. Overall admin speed", type: "rating", required: true, lowLabel: "Very slow", highLabel: "Instant" },
        { id: "saveConfidence", label: "61. How confident were you that changes had actually saved?", type: "rating", required: true, lowLabel: "Never sure", highLabel: "Always clear" },
        { id: "slowAreas", label: "62. Did anything feel noticeably slow?", type: "textarea", placeholder: "Page/action, or 'No'." },
        { id: "silentFailure", label: "63. Did anything appear to save/work but actually fail, reset or disappear?", type: "textarea", placeholder: "This is especially important. Write 'No' if you saw none." },
        { id: "refreshProblems", label: "64. Did refreshing or returning to a page break your context/state?", type: "single", options: ["No", "Once", "More than once", "Not sure"] },
      ],
    },
    {
      id: "bugs",
      title: "Bugs",
      description: "Structured reports are much easier to fix than 'it broke somewhere'. Humanity has suffered enough from the latter.",
      questions: [
        { id: "bugsFound", label: "65. Did you find any actual bugs?", type: "single", required: true, options: ["No", "Yes — one", "Yes — more than one"] },
      ],
    },
    {
      id: "final",
      title: "Final judgement",
      description: "This is where you decide what should actually be fixed before wider admin use.",
      questions: [
        { id: "overallNow", label: "66. Overall admin experience right now", type: "rating", required: true, lowLabel: "Needs major work", highLabel: "Excellent" },
        { id: "efficiency", label: "67. How efficient does Solaris feel for real organizer work?", type: "rating", required: true, lowLabel: "Slows me down", highLabel: "Saves a lot of time" },
        { id: "professional", label: "68. How polished/professional does the admin feel?", type: "rating", lowLabel: "Prototype", highLabel: "Release quality" },
        { id: "confidence", label: "69. How much would you trust it during a live SSC workflow?", type: "rating", required: true, lowLabel: "Would avoid it", highLabel: "Completely" },
        { id: "bestAdminPart", label: "70. What worked best?", type: "textarea", placeholder: "One feature, workflow or design choice." },
        { id: "leastFinished", label: "71. Which admin area feels least finished?", type: "text", placeholder: "Page / workflow" },
        { id: "priorityOne", label: "72. If only ONE thing is fixed before broader admin testing, what should it be?", type: "textarea", required: true, placeholder: "The single highest-priority change." },
        { id: "removeSimplify", label: "73. Is there anything you would remove, hide or simplify?", type: "textarea", placeholder: "Or 'Nothing'." },
        { id: "missingAdminFeature", label: "74. What admin feature or shortcut is still missing?", type: "textarea", placeholder: "Or 'Nothing'." },
        { id: "launchReady", label: "75. Is the admin ready for wider organizer use?", type: "single", required: true, options: ["Yes, definitely", "Yes, with a few small fixes", "Almost, but some important things should be improved first", "No, significant work is still needed"] },
      ],
    },
  ];
}
