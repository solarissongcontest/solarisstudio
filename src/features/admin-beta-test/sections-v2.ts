import type { BetaQuestion, BetaSection } from "@/features/beta-test/types";

export const ADMIN_BETA_DRAFT_KEY = "solaris:admin-beta-test:draft:v2";
export const ADMIN_BETA_SUBMITTED_KEY = "solaris:admin-beta-test:submitted:v2";
export const ADMIN_BETA_FORM_VERSION = 2;

export const ADMIN_BETA_TESTED_OPTIONS = [
  "Tested properly",
  "Only tried briefly",
  "Didn't test",
] as const;

export type AdminBetaCoverageItem = {
  id: string;
  label: string;
  group: string;
  answerId: string;
  href: string;
  critical?: boolean;
};

export const ADMIN_BETA_COVERAGE: AdminBetaCoverageItem[] = [
  { id: "overview", label: "Overview & next actions", group: "Organizer", answerId: "overviewTested", href: "/admin/operations", critical: true },
  { id: "edition-library", label: "Edition library & lifecycle", group: "Organizer", answerId: "editionLibraryTested", href: "/admin", critical: true },
  { id: "edition-workspace", label: "Edition workspace", group: "Organizer", answerId: "editionWorkspaceTested", href: "/admin", critical: true },
  { id: "shows", label: "Shows", group: "Contest", answerId: "showsTested", href: "/admin", critical: true },
  { id: "entries", label: "Entries & running order", group: "Contest", answerId: "entriesTested", href: "/admin", critical: true },
  { id: "jury", label: "Jury roster & ballot entry", group: "Contest", answerId: "juryTested", href: "/admin", critical: true },
  { id: "voting-system", label: "Voting system", group: "Contest", answerId: "votingSystemTested", href: "/admin", critical: true },
  { id: "televote-totals", label: "Televote totals", group: "Contest", answerId: "televoteTotalsTested", href: "/admin", critical: true },
  { id: "publication", label: "Publication & result visibility", group: "Contest", answerId: "publicationTested", href: "/admin", critical: true },
  { id: "edition-theme", label: "Edition artwork & visual identity", group: "Production", answerId: "editionThemeTested", href: "/admin", critical: true },
  { id: "design", label: "Design & broadcast configuration", group: "Production", answerId: "designTested", href: "/admin", critical: true },
  { id: "live-broadcast", label: "Live broadcast controller", group: "Production", answerId: "liveBroadcastTested", href: "/broadcast", critical: true },
  { id: "broadcast-intelligence", label: "Broadcast Intelligence", group: "Production", answerId: "broadcastIntelligenceTested", href: "/broadcast-intelligence" },
  { id: "hosting", label: "Hosting", group: "Archive & identity", answerId: "hostingTested", href: "/admin/hosts" },
  { id: "country-accounts", label: "Country accounts", group: "Archive & identity", answerId: "countryAccountsTested", href: "/admin/country-accounts", critical: true },
  { id: "hod-history", label: "HOD history", group: "Archive & identity", answerId: "hodHistoryTested", href: "/admin/hod-history", critical: true },
  { id: "predictions", label: "Predictions", group: "Engagement", answerId: "predictionsTested", href: "/admin/predictions" },
  { id: "system", label: "System deadlines & organizer audit", group: "System", answerId: "systemTested", href: "/admin/system" },
  { id: "sync-health", label: "Sync health", group: "System", answerId: "syncHealthTested", href: "/admin/sync-health", critical: true },
  { id: "more", label: "More / low-frequency navigation", group: "System", answerId: "moreTested", href: "/admin/more" },
  { id: "beta-feedback", label: "Public beta feedback dashboard", group: "System", answerId: "betaFeedbackTested", href: "/admin/beta-feedback" },
  { id: "delegations-overview", label: "Delegations overview", group: "Delegations", answerId: "delegationsOverviewTested", href: "/confirmations/admin", critical: true },
  { id: "delegation-responses", label: "Delegation response queue", group: "Delegations", answerId: "delegationResponsesTested", href: "/confirmations/admin/responses", critical: true },
  { id: "delegation-response-review", label: "Individual response review", group: "Delegations", answerId: "delegationReviewTested", href: "/confirmations/admin/responses", critical: true },
  { id: "delegation-countries", label: "Delegations by country", group: "Delegations", answerId: "delegationCountriesTested", href: "/confirmations/admin/countries" },
  { id: "submission-rounds", label: "Submission rounds", group: "Delegations", answerId: "submissionRoundsTested", href: "/confirmations/admin/rounds", critical: true },
  { id: "delegation-calendar", label: "Delegation calendar", group: "Delegations", answerId: "delegationCalendarTested", href: "/confirmations/admin/calendar" },
  { id: "recovery-access", label: "Recovery access", group: "Delegations", answerId: "recoveryAccessTested", href: "/confirmations/admin/recovery-codes", critical: true },
  { id: "delegation-edition-links", label: "Delegation edition links", group: "Delegations", answerId: "delegationEditionLinksTested", href: "/confirmations/admin/editions", critical: true },
  { id: "delegation-settings", label: "Delegation settings", group: "Delegations", answerId: "delegationSettingsTested", href: "/confirmations/admin/settings" },
  { id: "voting-overview", label: "Voting service overview", group: "Televoting", answerId: "votingOverviewTested", href: "/televoting/admin", critical: true },
  { id: "voting-edition-links", label: "Voting edition links", group: "Televoting", answerId: "votingEditionLinksTested", href: "/televoting/admin/editions", critical: true },
  { id: "voting-rounds", label: "Voting rounds", group: "Televoting", answerId: "votingRoundsTested", href: "/televoting/admin/rounds", critical: true },
  { id: "voting-round-entries", label: "Voting round entries & Solaris sync", group: "Televoting", answerId: "votingRoundEntriesTested", href: "/televoting/admin/rounds", critical: true },
  { id: "voting-results", label: "Voting results", group: "Televoting", answerId: "votingResultsTested", href: "/televoting/admin/results", critical: true },
  { id: "combined-results", label: "Combined results", group: "Televoting", answerId: "combinedResultsTested", href: "/televoting/admin/combined", critical: true },
  { id: "voting-analytics", label: "Voting analytics", group: "Televoting", answerId: "votingAnalyticsTested", href: "/televoting/admin/analytics" },
  { id: "voting-intelligence", label: "Integrity & voting intelligence", group: "Televoting", answerId: "votingIntelligenceTested", href: "/televoting/admin/intelligence", critical: true },
  { id: "voting-audit", label: "Voting audit log", group: "Televoting", answerId: "votingAuditTested", href: "/televoting/admin/audit-log", critical: true },
  { id: "mobile", label: "Mobile layout & touch behavior", group: "Cross-cutting", answerId: "mobileTested", href: "/admin/operations", critical: true },
  { id: "desktop", label: "Desktop expansion", group: "Cross-cutting", answerId: "desktopTested", href: "/admin/operations" },
  { id: "session", label: "Session, reload & back navigation", group: "Cross-cutting", answerId: "sessionTested", href: "/admin/operations", critical: true },
  { id: "concurrency", label: "Two-admin concurrent editing", group: "Cross-cutting", answerId: "concurrencyTested", href: "/admin/operations", critical: true },
  { id: "rehearsal", label: "End-to-end contest rehearsal", group: "Cross-cutting", answerId: "rehearsalTested", href: "/admin/operations", critical: true },
];

const testedOptions = [...ADMIN_BETA_TESTED_OPTIONS];
const clarityOptions = ["Clear", "Mostly clear", "A bit confusing", "Very confusing"];
const confidenceOptions = ["Yes", "Mostly", "Not really", "No"];

function editionHref(slug: string | undefined, area?: string) {
  if (!slug) return "/admin";
  if (!area) return `/admin/${slug}`;
  return `/admin/${area}/${slug}`;
}

function tested(id: string, label: string): BetaQuestion {
  return {
    id,
    label: `How much did you test ${label}?`,
    type: "single",
    required: true,
    options: testedOptions,
    helper: "Choose “Tested properly” only if you actually explored the normal workflow, not just opened the page.",
  };
}

function rating(id: string, label: string, testedId: string, lowLabel = "Poor", highLabel = "Excellent"): BetaQuestion {
  return { id, label, type: "rating", lowLabel, highLabel, showWhen: { id: testedId, notEquals: "Didn't test" } };
}

function single(id: string, label: string, testedId: string, options = clarityOptions): BetaQuestion {
  return { id, label, type: "single", options, showWhen: { id: testedId, notEquals: "Didn't test" } };
}

function note(id: string, label: string, testedId: string, placeholder = "A few words are enough. Write “Nothing” if nothing stood out."): BetaQuestion {
  return { id, label, type: "textarea", placeholder, showWhen: { id: testedId, notEquals: "Didn't test" } };
}

export function buildAdminBetaSections(slug?: string): BetaSection[] {
  return [
    {
      id: "context",
      title: "About this test pass",
      description: "This is an acceptance test, not a popularity poll. The goal is to find what can still break real organizer work.",
      task: {
        body: "Use Solaris normally while completing the form. You can split the test across multiple sessions because your progress saves on this device. If an action would alter official data, inspect the workflow and stop before confirmation unless you are on a designated test edition.",
        href: "/admin/operations",
        linkLabel: "Open Organizer",
      },
      questions: [
        { id: "testerName", label: "Name / username", type: "text", required: true, placeholder: "Used to compare the two admins' latest test passes." },
        { id: "device", label: "Main device used for this pass", type: "single", required: true, options: ["Phone", "Tablet", "Laptop", "Desktop"] },
        { id: "browser", label: "Browser", type: "single", options: ["Safari", "Chrome", "Firefox", "Edge", "Other / Not sure"] },
        { id: "familiarity", label: "How familiar are you with the admin?", type: "single", required: true, options: ["New to it", "Used it a few times", "Regular user", "One of the main organizers"] },
        { id: "testData", label: "What data did you use?", type: "single", required: true, options: ["Dedicated test edition/show", "Mostly read-only inspection of real data", "A mix of test and real data", "Other"] },
        { id: "timeSpent", label: "Roughly how long was this test pass?", type: "single", options: ["Under 15 minutes", "15–30 minutes", "30–60 minutes", "1–2 hours", "More than 2 hours / multiple sessions"] },
      ],
    },
    {
      id: "organizer-navigation",
      title: "Organizer navigation & Overview",
      description: "This tests whether you can operate Solaris without remembering its route structure like some cursed incantation.",
      task: {
        body: "Start at Overview. Check readiness, next actions, bottom/side navigation, edition switching and Organizer search. Find at least two specialist tools without returning to this form for directions.",
        href: "/admin/operations",
        linkLabel: "Open Overview",
      },
      questions: [
        tested("overviewTested", "Overview & next actions"),
        rating("overviewClarity", "How quickly can you understand what needs attention?", "overviewTested", "No idea", "Immediately"),
        rating("overviewUsefulness", "How useful are the readiness and next-action signals?", "overviewTested", "Noise", "Essential"),
        single("overviewTrust", "Did the readiness/next action seem to match the edition's real state?", "overviewTested", [...confidenceOptions, "Not sure"]),
        note("overviewProblem", "What did Overview fail to tell you?", "overviewTested"),
        { id: "navigationEase", label: "How easy is it to find an admin tool without memorising where it lives?", type: "rating", required: true, lowLabel: "Constant hunting", highLabel: "Effortless" },
        { id: "editionSwitcherBehavior", label: "When switching edition inside a specialist workspace, did Solaris keep you in the equivalent workspace?", type: "single", required: true, options: ["Yes", "Mostly", "No", "Didn't test edition switching"] },
        { id: "commandSearchBehavior", label: "Did Organizer search find the tools/edition you expected?", type: "single", options: ["Yes", "Mostly", "No", "Didn't use search"] },
      ],
    },
    {
      id: "edition-lifecycle",
      title: "Edition library & lifecycle",
      description: "Creation, archive-level status and destructive actions deserve their own test because they affect the whole contest structure.",
      task: {
        body: "Open Manage editions. Inspect creating an edition, edition cards, public/private state and deletion confirmation. Only actually create/delete on safe test data.",
        href: "/admin",
        linkLabel: "Open editions",
      },
      questions: [
        tested("editionLibraryTested", "the edition library & lifecycle"),
        rating("editionLibraryEase", "How easy is it to understand what each edition card lets you do?", "editionLibraryTested", "Confusing", "Obvious"),
        single("editionCreateClarity", "Was the create-edition flow clear and appropriately compact?", "editionLibraryTested"),
        single("editionDangerSafety", "Did private/delete actions explain their consequences before commitment?", "editionLibraryTested", ["Yes", "Mostly", "No", "Didn't inspect them"]),
        note("editionLifecycleProblem", "Anything risky, repetitive or missing in edition management?", "editionLibraryTested"),
      ],
    },
    {
      id: "edition-workspace",
      title: "Edition workspace",
      task: {
        body: "Open the current edition. Follow the Build → Score → Present → Services structure, check progress/status signals and use its links to specialist workspaces.",
        href: editionHref(slug),
        linkLabel: "Open current edition",
      },
      questions: [
        tested("editionWorkspaceTested", "the edition workspace"),
        rating("editionWorkspaceClarity", "How clearly does it show the edition's state and next step?", "editionWorkspaceTested", "Unclear", "Very clear"),
        single("editionWorkflowConnected", "Does it feel like one connected contest workflow?", "editionWorkspaceTested", [...confidenceOptions]),
        note("editionWorkspaceMissing", "What action/status did you expect here but could not find?", "editionWorkspaceTested"),
      ],
    },
    {
      id: "shows-entries",
      title: "Shows, entries & running order",
      task: {
        body: "Inspect Shows and Entries & running order. Switch shows, open create/edit sheets, inspect running-order controls, custom countries, qualifier promotion and cross-show song/artist syncing. Save only against safe data.",
        href: editionHref(slug, "shows"),
        linkLabel: "Open Shows",
      },
      questions: [
        tested("showsTested", "Shows"),
        rating("showsEase", "How easy is show creation/editing and status management?", "showsTested", "Awkward", "Effortless"),
        single("showsSafety", "Were publish/private/delete controls safe and understandable?", "showsTested", ["Yes", "Mostly", "No", "Didn't inspect them"]),
        note("showsProblem", "What would you change in Shows?", "showsTested"),
        tested("entriesTested", "Entries & running order"),
        rating("entriesEase", "How fast is normal entry editing?", "entriesTested", "Slow", "Very fast"),
        rating("runningOrderEase", "How good are the running-order controls on your device?", "entriesTested", "Painful", "Excellent"),
        single("customCountryClarity", "Were global vs edition-only/custom identities understandable?", "entriesTested"),
        single("qualifierSyncClarity", "Were qualifier promotion and cross-show artist/song syncing understandable?", "entriesTested", ["Yes", "Mostly", "No", "Didn't use them"]),
        note("entriesProblem", "What could cause entry or running-order mistakes?", "entriesTested"),
      ],
    },
    {
      id: "jury-scoring",
      title: "Jury & edition scoring",
      task: {
        body: "Inspect Jury, Voting System and Televote totals. Check roster behavior, ballot completion, score entry, weighting/tie rules and deliberate-save behavior. Do not alter official scores simply to test controls.",
        href: editionHref(slug, "jury"),
        linkLabel: "Open Jury",
      },
      questions: [
        tested("juryTested", "Jury roster & ballot entry"),
        rating("juryEntrySpeed", "How practical is rapid jury entry during a real sequence?", "juryTested", "Too slow", "Very fast"),
        single("juryRosterClarity", "Did automatic vs editable jury rosters make sense?", "juryTested"),
        rating("jurySaveConfidence", "How confident were you that scores saved correctly?", "juryTested", "Not confident", "Completely confident"),
        note("juryMistakeRisk", "What could make an organizer enter the wrong jury score?", "juryTested"),
        tested("votingSystemTested", "Voting System"),
        rating("votingRulesClarity", "How understandable are point scales, jury/televote balance, qualifiers and tie rules?", "votingSystemTested", "Opaque", "Crystal clear"),
        single("votingExistingDataSafety", "If votes already exist, is the warning/confirmation before rule changes strong enough?", "votingSystemTested", ["Yes", "Mostly", "No", "Didn't reach that state"]),
        note("votingSystemProblem", "Anything too technical or too easy to change here?", "votingSystemTested"),
        tested("televoteTotalsTested", "Televote totals"),
        single("televoteDraftSave", "Was draft → deliberate save behavior obvious?", "televoteTotalsTested"),
        rating("televoteSaveConfidence", "How safe does editing existing/public totals feel?", "televoteTotalsTested", "Risky", "Very safe"),
        note("televoteTotalsProblem", "What could cause an incorrect televote total?", "televoteTotalsTested"),
      ],
    },
    {
      id: "publication",
      title: "Publication & result visibility",
      task: {
        body: "Open Publication. Work out exactly what the public site can see, inspect presets and result-release controls, and check how Solaris protects hidden results. Do not publish unreleased official results during testing.",
        href: editionHref(slug, "publication"),
        linkLabel: "Open Publication",
      },
      questions: [
        tested("publicationTested", "Publication & result visibility"),
        rating("publicationClarity", "How quickly can you tell what is public vs private?", "publicationTested", "No idea", "Immediately"),
        rating("publicationSafety", "How safe does early-result protection feel?", "publicationTested", "Risky", "Very safe"),
        single("publicationPresetClarity", "Did staged release presets and fine-grained visibility make sense together?", "publicationTested"),
        note("publicationProblem", "What would stop you trusting this during results night?", "publicationTested"),
      ],
    },
    {
      id: "visual-production",
      title: "Artwork, theme & design configuration",
      task: {
        body: "Inspect Edition artwork & colours and Design & Broadcast. Check uploads, generated palette/theme, edition vs show scope, scoreboard design and broadcast settings. Use safe/test assets if saving.",
        href: editionHref(slug, "edition-theme"),
        linkLabel: "Open artwork & colours",
      },
      questions: [
        tested("editionThemeTested", "Edition artwork & visual identity"),
        rating("editionThemeEase", "How easy is artwork upload and visual-theme setup?", "editionThemeTested", "Confusing", "Very clear"),
        single("themeSyncClarity", "Did you understand what theme changes would affect across scoreboard/broadcast styling?", "editionThemeTested"),
        note("editionThemeProblem", "Any artwork, palette or theme problem?", "editionThemeTested"),
        tested("designTested", "Design & Broadcast configuration"),
        rating("designFindability", "How easy is it to find the design/broadcast control you need?", "designTested", "Scattered", "Very organised"),
        single("designScopeClarity", "Was edition-wide vs show-specific configuration clear?", "designTested"),
        note("designProblem", "Which design/scoreboard/broadcast control felt misplaced or unclear?", "designTested"),
      ],
    },
    {
      id: "live-production",
      title: "Live broadcast & intelligence",
      description: "These tools matter at the exact moment nobody wants a surprise.",
      task: {
        body: "From Design & Broadcast, open a show's live broadcast controller if safe. Inspect the control dock, result sequence, timing/speed controls and scoreboard behavior. Also inspect Broadcast Intelligence and its jury view. Prefer a test show or read-only inspection.",
        href: editionHref(slug, "design"),
        linkLabel: "Open Design & Broadcast",
      },
      questions: [
        tested("liveBroadcastTested", "the live broadcast controller"),
        rating("liveBroadcastControl", "How confident are you controlling a live reveal from this interface?", "liveBroadcastTested", "Would panic", "Fully confident"),
        single("liveBroadcastState", "Was it always obvious what step/state the broadcast was in?", "liveBroadcastTested", [...confidenceOptions]),
        single("liveBroadcastMobile", "Could the essential live controls be used on a phone if needed?", "liveBroadcastTested", ["Yes", "Mostly", "No", "Didn't try on phone"]),
        note("liveBroadcastRisk", "What could go wrong during an actual live result reveal?", "liveBroadcastTested"),
        tested("broadcastIntelligenceTested", "Broadcast Intelligence"),
        rating("broadcastIntelligenceUsefulness", "How useful are detected moments/replay insights for production?", "broadcastIntelligenceTested", "Not useful", "Very useful"),
        single("broadcastJuryIntelligence", "Did you also inspect the jury-focused intelligence view?", "broadcastIntelligenceTested", ["Yes", "No", "Couldn't find it"]),
        note("broadcastIntelligenceProblem", "Anything misleading or hard to interpret in Broadcast Intelligence?", "broadcastIntelligenceTested"),
      ],
    },
    {
      id: "archive-identity",
      title: "Hosting, accounts & HOD identity",
      task: {
        body: "Inspect Hosting, Country accounts and HOD history. Pay attention to edition/show host inheritance, account suspension safety and historical HOD tenure assignment/suggestions.",
        href: "/admin/more",
        linkLabel: "Open More tools",
      },
      questions: [
        tested("hostingTested", "Hosting"),
        single("hostingInheritance", "Was edition host vs per-show host/copy-to-all behavior understandable?", "hostingTested"),
        note("hostingProblem", "Anything confusing in host country/city management?", "hostingTested"),
        tested("countryAccountsTested", "Country accounts"),
        single("accountOwnershipClarity", "Could you distinguish claimed, unclaimed and suspended accounts quickly?", "countryAccountsTested"),
        single("accountModerationSafety", "Was suspension/restoration behavior and its impact clear before acting?", "countryAccountsTested", ["Yes", "Mostly", "No", "Didn't inspect moderation"]),
        note("accountProblem", "What could cause an account moderation mistake?", "countryAccountsTested"),
        tested("hodHistoryTested", "HOD history"),
        rating("hodHistoryClarity", "How understandable are people, edition tenures, channels and suggestions?", "hodHistoryTested", "Very confusing", "Very clear"),
        single("hodSuggestionTrust", "Did identity suggestions explain enough evidence before you would trust them?", "hodHistoryTested", [...confidenceOptions, "No suggestions available"]),
        note("hodHistoryProblem", "Anything that could incorrectly join/split one real HOD's history?", "hodHistoryTested"),
      ],
    },
    {
      id: "engagement-system",
      title: "Predictions, system tools & sync health",
      task: {
        body: "Inspect Predictions, System, Sync health, More, and the public beta feedback dashboard. For Predictions, inspect open/lock/scoring controls without changing a live round unless safe.",
        href: "/admin/more",
        linkLabel: "Open More",
      },
      questions: [
        tested("predictionsTested", "Predictions"),
        single("predictionLifecycle", "Were open/lock/status/scoring controls understandable?", "predictionsTested"),
        note("predictionsProblem", "Anything risky or missing in prediction management?", "predictionsTested"),
        tested("systemTested", "System deadlines & organizer audit"),
        rating("systemEase", "How useful and understandable are deadlines plus organizer history?", "systemTested", "Not useful", "Very useful"),
        note("systemProblem", "Any System-page problem?", "systemTested"),
        tested("syncHealthTested", "Sync health"),
        rating("syncHealthClarity", "Could you tell whether Solaris, Delegations and Televoting agree?", "syncHealthTested", "No", "Immediately"),
        single("syncHealthActionability", "If something were unhealthy, would the page tell you what to investigate next?", "syncHealthTested", [...confidenceOptions, "No unhealthy state available"]),
        note("syncHealthProblem", "What technical wording/status still needs translation into organizer language?", "syncHealthTested"),
        tested("moreTested", "More / low-frequency navigation"),
        single("moreGrouping", "Did the grouping of archive, engagement and system tools make sense?", "moreTested"),
        tested("betaFeedbackTested", "the public beta feedback dashboard"),
        single("betaFeedbackUseful", "Could you identify recurring feedback, bugs and launch priorities from it?", "betaFeedbackTested"),
      ],
    },
    {
      id: "delegations-core",
      title: "Delegations: overview, responses & countries",
      task: {
        body: "Open Delegations, then Responses and Countries. Open at least one individual response if available. Inspect review status, history, NF/internal-entry detail, editing locks and sync actions. Avoid changing a real response just for testing.",
        href: "/confirmations/admin",
        linkLabel: "Open Delegations",
      },
      questions: [
        tested("delegationsOverviewTested", "Delegations overview"),
        rating("delegationsOverviewClarity", "How quickly can you see what delegations need attention?", "delegationsOverviewTested", "Unclear", "Immediately"),
        note("delegationsOverviewProblem", "What did the overview fail to surface?", "delegationsOverviewTested"),
        tested("delegationResponsesTested", "the delegation response queue"),
        rating("responseQueueTriage", "How easy is it to triage many responses?", "delegationResponsesTested", "Slow", "Very fast"),
        single("responseFilters", "Were status/search/filter controls sufficient?", "delegationResponsesTested", [...confidenceOptions]),
        note("responseQueueProblem", "What would make bulk review faster?", "delegationResponsesTested"),
        tested("delegationReviewTested", "individual response review"),
        rating("responseReviewClarity", "How easy is it to understand the complete response, history and review state?", "delegationReviewTested", "Confusing", "Very clear"),
        single("responseReviewSafety", "Were accept/decline/lock/sync actions clear about what they change?", "delegationReviewTested", ["Yes", "Mostly", "No", "Didn't inspect all actions"]),
        note("responseReviewProblem", "What could make you approve, decline or sync the wrong thing?", "delegationReviewTested"),
        tested("delegationCountriesTested", "Delegations by country"),
        single("delegationCountryStatus", "Did country status labels accurately tell you what each delegation still needs?", "delegationCountriesTested", [...confidenceOptions]),
        note("delegationCountriesProblem", "Anything missing from the country-level view?", "delegationCountriesTested"),
      ],
    },
    {
      id: "delegations-operations",
      title: "Delegations: rounds, calendar & access",
      task: {
        body: "Inspect Submission rounds, Calendar, Recovery access, Edition links and Settings. Check opening/closing windows, scheduled dates, search/copy recovery codes, cross-service edition linkage and response-editing controls.",
        href: "/confirmations/admin/rounds",
        linkLabel: "Open submission rounds",
      },
      questions: [
        tested("submissionRoundsTested", "Submission rounds"),
        rating("roundsClarity", "How understandable are round timing/status controls?", "submissionRoundsTested", "Confusing", "Very clear"),
        single("roundsSafety", "Would you trust yourself to open/close the right round under time pressure?", "submissionRoundsTested", [...confidenceOptions]),
        note("roundsProblem", "Anything that could cause the wrong round to open/close?", "submissionRoundsTested"),
        tested("delegationCalendarTested", "the Delegation calendar"),
        rating("calendarUsefulness", "How useful is the calendar for NF/reveal/deadline planning?", "delegationCalendarTested", "Not useful", "Very useful"),
        note("calendarProblem", "Any missing date type or awkward calendar behavior?", "delegationCalendarTested"),
        tested("recoveryAccessTested", "Recovery access"),
        single("recoverySearchCopy", "Could you safely find and copy the correct delegation's recovery code?", "recoveryAccessTested", [...confidenceOptions]),
        note("recoveryRisk", "What could make you send the wrong recovery code?", "recoveryAccessTested"),
        tested("delegationEditionLinksTested", "Delegation edition links"),
        single("delegationLinkClarity", "Was it clear that edition changes made in Solaris also appear in Confirmations?", "delegationEditionLinksTested"),
        tested("delegationSettingsTested", "Delegation settings"),
        single("delegationSettingsClarity", "Were the public link, active edition and response-editing settings understandable?", "delegationSettingsTested"),
        note("delegationOperationsProblem", "Anything across these low-frequency Delegation tools that should be merged, moved or simplified?", "delegationSettingsTested"),
      ],
    },
    {
      id: "televoting-core",
      title: "Televoting: overview, editions & rounds",
      task: {
        body: "Open Voting admin. Check the status and next action, edition links, voting rounds and a round's Entries page. Review Solaris entries, custom entries, running order and self-voting controls without changing live voting data unnecessarily.",
        href: "/televoting/admin",
        linkLabel: "Open Voting admin",
      },
      questions: [
        tested("votingOverviewTested", "Voting service overview"),
        rating("votingOverviewClarity", "How clearly does it explain service readiness and the next action?", "votingOverviewTested", "Unclear", "Very clear"),
        note("votingOverviewProblem", "What is missing from the voting control centre?", "votingOverviewTested"),
        tested("votingEditionLinksTested", "Voting edition links"),
        single("votingEditionSourceTruth", "Was it clear that editions are managed in Solaris and automatically appear in Televoting?", "votingEditionLinksTested"),
        tested("votingRoundsTested", "Voting rounds"),
        rating("votingRoundManagement", "How safe and understandable is round creation/open/close management?", "votingRoundsTested", "Risky", "Very safe"),
        note("votingRoundsProblem", "What could make you operate the wrong voting round?", "votingRoundsTested"),
        tested("votingRoundEntriesTested", "Voting round entries & Solaris sync"),
        rating("roundEntrySyncClarity", "How clear is the difference between Solaris entries and custom entries?", "votingRoundEntriesTested", "Unclear", "Very clear"),
        single("roundEntrySelfVote", "Was self-voting mode easy to find and understand?", "votingRoundEntriesTested"),
        note("roundEntriesProblem", "Any sync/order/custom-entry risk?", "votingRoundEntriesTested"),
      ],
    },
    {
      id: "televoting-results",
      title: "Televoting: results & aggregation",
      task: {
        body: "Inspect Voting results and Combined results. Follow the normal result preparation path, then inspect how multiple sources, weights, corrections, participant pools, recalculation, locking and publishing are represented. Use read-only inspection for official data.",
        href: "/televoting/admin/results",
        linkLabel: "Open Voting results",
      },
      questions: [
        tested("votingResultsTested", "Voting results"),
        rating("votingResultsWorkflow", "How understandable is review → calculate → lock/publish?", "votingResultsTested", "Confusing", "Very clear"),
        single("votingResultsSafety", "Were result-changing actions protected enough?", "votingResultsTested", ["Yes", "Mostly", "No", "Didn't inspect destructive/release actions"]),
        note("votingResultsProblem", "What could cause an incorrect or premature result?", "votingResultsTested"),
        tested("combinedResultsTested", "Combined results"),
        rating("combinedSourceClarity", "How understandable are sources, input modes, weights and corrections?", "combinedResultsTested", "Impossible", "Very clear"),
        single("combinedRecalcSafety", "Could you predict what recalculation/locking/publishing would do before pressing it?", "combinedResultsTested", [...confidenceOptions]),
        note("combinedResultsProblem", "What part of combined aggregation is most error-prone?", "combinedResultsTested"),
      ],
    },
    {
      id: "televoting-intelligence",
      title: "Televoting: analytics, integrity & audit",
      task: {
        body: "Inspect Analytics, Integrity/Intelligence and the Voting audit log. Change scopes/filters, inspect HOD lenses and relationship evidence, open technical change details, and judge whether evidence is understandable before moderation decisions.",
        href: "/televoting/admin/analytics",
        linkLabel: "Open Voting analytics",
      },
      questions: [
        tested("votingAnalyticsTested", "Voting analytics"),
        rating("analyticsScopeClarity", "How understandable are edition/round/HOD scopes and channels?", "votingAnalyticsTested", "Confusing", "Very clear"),
        single("analyticsUsefulness", "Could the analytics answer a real organizer question without exporting data elsewhere?", "votingAnalyticsTested", [...confidenceOptions]),
        note("analyticsProblem", "Which metric/view needs better explanation?", "votingAnalyticsTested"),
        tested("votingIntelligenceTested", "Integrity & voting intelligence"),
        rating("intelligenceEvidenceClarity", "How clear is why a relationship/group was flagged?", "votingIntelligenceTested", "Black box", "Very clear"),
        single("intelligenceDecisionConfidence", "Is there enough evidence/context to make a moderation decision without blindly trusting the risk score?", "votingIntelligenceTested", [...confidenceOptions]),
        single("intelligenceHodClarity", "Did the HOD-tenure lens vs country-history lens make sense?", "votingIntelligenceTested"),
        note("intelligenceProblem", "What could cause a false interpretation of friend-voting/integrity evidence?", "votingIntelligenceTested"),
        tested("votingAuditTested", "the Voting audit log"),
        rating("auditTraceability", "How easy is it to trace who changed what, when and why?", "votingAuditTested", "Difficult", "Very easy"),
        note("auditProblem", "What audit information is missing or too technical?", "votingAuditTested"),
      ],
    },
    {
      id: "responsive-resilience",
      title: "Mobile, desktop & session resilience",
      description: "A beautiful workflow that falls apart after a reload is still a broken workflow wearing nice shoes.",
      task: {
        body: "Use several admin pages at phone width and, if possible, desktop width. Open sheets/menus with the keyboard visible, rotate or resize, refresh a specialist page, use browser Back/Forward, then return after leaving the app briefly.",
        href: "/admin/operations",
        linkLabel: "Open Organizer",
      },
      questions: [
        tested("mobileTested", "mobile layout & touch behavior"),
        rating("mobileOneHanded", "How usable is normal organizer work on a phone?", "mobileTested", "Frustrating", "Excellent"),
        single("mobileSheets", "Did sheets, sticky actions and menus remain reachable with the keyboard/safe area?", "mobileTested", ["Yes", "Mostly", "No", "Didn't test keyboard"]),
        note("mobileWorstPage", "Which admin page felt worst on mobile, and why?", "mobileTested"),
        tested("desktopTested", "desktop expansion"),
        rating("desktopUseOfSpace", "Does desktop use extra width without becoming sparse or overwhelming?", "desktopTested", "Poorly", "Very well"),
        note("desktopProblem", "Any desktop-only layout problem?", "desktopTested"),
        tested("sessionTested", "session, reload & back navigation"),
        single("reloadContext", "After refresh, did the same edition and page stay selected?", "sessionTested", ["Yes", "Mostly", "No"]),
        single("backForwardContext", "Did browser Back/Forward behave predictably?", "sessionTested", ["Yes", "Mostly", "No"]),
        single("authPersistence", "Did organizer authentication/session behave predictably after leaving and returning?", "sessionTested", ["Yes", "Mostly", "No", "Session did not expire during test"]),
        note("sessionProblem", "Describe any state that reset, duplicated, disappeared or reopened incorrectly.", "sessionTested", "Page + what happened after reload/back/return."),
      ],
    },
    {
      id: "concurrency-rehearsal",
      title: "Two-admin test & end-to-end rehearsal",
      description: "With only two admins, this is one of the most valuable tests because you can reproduce the real operating model exactly.",
      task: {
        body: "On a SAFE test edition, have both admins open the same edition at once. Admin A changes a harmless field; Admin B refreshes/opens it and verifies the change. If safe, try nearby edits from both sessions and watch for stale overwrites or confusing status. Then rehearse the normal chain: edition → show → entries → jury/voting setup → results preparation → publication preview → broadcast readiness. Do not use unreleased official results for this rehearsal.",
        href: "/admin/operations",
        linkLabel: "Start from Overview",
      },
      questions: [
        tested("concurrencyTested", "two-admin concurrent editing"),
        single("concurrencyVisibility", "Could the second admin see the first admin's saved change after refresh/navigation?", "concurrencyTested", ["Yes", "Mostly", "No"]),
        single("concurrencyOverwrite", "Did either session silently overwrite or revert the other's work?", "concurrencyTested", ["No", "Possibly", "Yes"]),
        single("concurrencyFeedback", "Was it clear when data was stale/loading/saved?", "concurrencyTested", ["Yes", "Mostly", "No"]),
        note("concurrencyProblem", "Describe any two-admin conflict or uncertainty.", "concurrencyTested"),
        tested("rehearsalTested", "the end-to-end contest rehearsal"),
        rating("rehearsalFlow", "How smoothly can you move through the full organizer workflow without dead ends?", "rehearsalTested", "Constant friction", "Seamless"),
        single("rehearsalNextAction", "At each stage, was the next sensible action easy to find?", "rehearsalTested", [...confidenceOptions]),
        single("rehearsalDataConsistency", "Did the same edition/show/entry data remain consistent across specialist workspaces?", "rehearsalTested", [...confidenceOptions]),
        note("rehearsalBreak", "Where did the end-to-end flow feel weakest or disconnected?", "rehearsalTested"),
      ],
    },
    {
      id: "errors-saving",
      title: "Saving, errors & empty states",
      task: {
        body: "While testing, pay attention to save indicators, loading states, empty lists, validation, disabled actions and error messages. If you naturally encounter an error, judge whether Solaris tells you what happened and whether anything was changed.",
      },
      questions: [
        { id: "adminSpeed", label: "Overall admin speed", type: "rating", required: true, lowLabel: "Very slow", highLabel: "Instant" },
        { id: "saveConfidence", label: "How confident were you that changes had actually saved?", type: "rating", required: true, lowLabel: "Never sure", highLabel: "Always clear" },
        { id: "actionFeedback", label: "After an action, did loading/success/failure feedback appear quickly enough?", type: "rating", required: true, lowLabel: "Often no clue", highLabel: "Always clear" },
        { id: "emptyStates", label: "Were empty/no-data states useful rather than dead ends?", type: "single", options: ["Yes", "Mostly", "No", "Didn't encounter any"] },
        { id: "errorQuality", label: "Were errors understandable and actionable?", type: "single", options: ["Yes", "Mostly", "No", "Didn't encounter any"] },
        { id: "silentFailure", label: "Did anything appear to save/work but actually fail, reset or disappear?", type: "textarea", required: true, placeholder: "Write “No” if you saw none. This answer matters a lot." },
        { id: "slowAreas", label: "What was noticeably slow?", type: "textarea", placeholder: "Page/action, or “Nothing”." },
      ],
    },
    {
      id: "bugs",
      title: "Structured bugs",
      description: "Report every reproducible failure separately so fixes can be verified one by one.",
      questions: [
        { id: "bugsFound", label: "Did you find any actual bugs?", type: "single", required: true, options: ["No", "Yes — one", "Yes — more than one"] },
      ],
    },
    {
      id: "final",
      title: "Final judgement",
      description: "Prioritise what matters for two people actually running the contest, not theoretical feature completeness.",
      questions: [
        { id: "overallNow", label: "Overall admin experience right now", type: "rating", required: true, lowLabel: "Needs major work", highLabel: "Excellent" },
        { id: "efficiency", label: "How efficient is Solaris for real organizer work?", type: "rating", required: true, lowLabel: "Slows us down", highLabel: "Saves major time" },
        { id: "professional", label: "How polished/professional does the admin feel?", type: "rating", required: true, lowLabel: "Prototype", highLabel: "Release quality" },
        { id: "confidence", label: "How much would you trust it during a live SSC workflow?", type: "rating", required: true, lowLabel: "Would avoid it", highLabel: "Completely" },
        { id: "bestAdminPart", label: "What worked best?", type: "textarea", placeholder: "One feature, workflow or design choice." },
        { id: "leastFinished", label: "Which admin area feels least finished?", type: "text", required: true, placeholder: "Page / workflow, or “None”." },
        { id: "priorityOne", label: "If only ONE thing is fixed before wider admin use, what should it be?", type: "textarea", required: true, placeholder: "The single highest-priority change." },
        { id: "removeSimplify", label: "What should be removed, hidden or simplified?", type: "textarea", placeholder: "Or “Nothing”." },
        { id: "missingAdminFeature", label: "What admin feature or shortcut is still missing?", type: "textarea", placeholder: "Or “Nothing”." },
        { id: "launchReady", label: "Is the admin ready for real organizer use?", type: "single", required: true, options: ["Yes, definitely", "Yes, with a few small fixes", "Almost, but important things should be improved first", "No, significant work is still needed"] },
      ],
    },
  ];
}
