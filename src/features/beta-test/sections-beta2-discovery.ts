import type { BetaSection } from "./types";

const FIND_OPTIONS = [
  "Found immediately",
  "Found after looking around",
  "Found, but it was difficult",
  "Could not find it",
];

const FIVE = ["1", "2", "3", "4", "5"];
const WORK_OPTIONS = ["✅ Worked", "⚠️ Something was wrong", "❌ Couldn't use it", "➖ Didn't test"];

export const beta2DiscoverySections: BetaSection[] = [
  {
    id: "tester-profile",
    title: "1. Tester profile",
    description: "A little context so we can separate newcomer problems from things that only feel obvious after using Solaris for a while.",
    questions: [
      { id: "testerName", label: "Name / SSC username", type: "text", required: true, placeholder: "Your name or SSC username" },
      { id: "country", label: "Your SSC country", type: "text", placeholder: "Country" },
      { id: "device", label: "Main device used for this test", type: "single", required: true, options: ["Phone", "Tablet", "Laptop", "Desktop"] },
      { id: "browser", label: "Browser", type: "single", options: ["Chrome", "Safari", "Firefox", "Edge", "Other / Not sure"] },
      { id: "familiarity", label: "Have you used the CURRENT Solaris Studio before this beta test?", type: "single", options: ["Never", "Once or twice", "Several times", "I use it regularly"] },
      { id: "firstRound", label: "Did you participate in Beta 1?", type: "single", required: true, options: ["Yes", "No"] },
      { id: "beta1Memory", label: "How well do you remember Beta 1?", type: "single", options: ["Barely", "A little", "Quite well", "Very well"], showWhen: { id: "firstRound", equals: "Yes" } },
    ],
  },
  {
    id: "capabilities",
    title: "2. What Solaris Studio should let you do",
    description: "Read this once before the discovery tasks. It tells you WHAT Solaris can do, but deliberately does not tell you WHERE anything is.",
    task: {
      body: "Solaris Studio should let you browse editions, countries, shows, entries and results; explore Records, Relationships, Analysis and Pulse; create a country account; manage your country through My Solaris; find and edit confirmation responses; edit country information and SSC entries; customise Country and Wiki pages, colours, content and media; and find help when you need it. IMPORTANT: during the next discovery tasks, do not use the Guide unless the task specifically tells you to. Do not ask another tester where something is.",
    },
    questions: [
      { id: "capabilityRead", label: "Ready to begin the unaided tasks?", type: "single", required: true, options: ["Yes — I will try them without the Guide first"] },
    ],
  },
  {
    id: "account-setup",
    title: "3. Create your country account",
    task: {
      body: "Starting from the normal public site, create your country account and enter My Solaris. Do not use the Guide for this task.",
      href: "/",
      linkLabel: "Open Solaris Studio",
    },
    questions: [
      { id: "accountFindSuccess", label: "Were you able to create the account and reach My Solaris?", type: "single", required: true, options: FIND_OPTIONS },
      { id: "accountEase", label: "How easy was the whole account-creation process?", type: "single", options: ["1 — Very difficult", "2", "3", "4", "5 — Very easy"] },
      { id: "accountConfidence", label: "How confident were you that you understood what you were doing?", type: "single", options: ["1 — Not confident", "2", "3", "4", "5 — Very confident"] },
      { id: "accountUsernameClear", label: "Was it clear what username you should use?", type: "single", options: ["Yes", "Mostly", "No"] },
      { id: "accountRecoveryEmailClear", label: "Did you understand what the optional recovery email was for?", type: "single", options: ["Yes", "Mostly", "No", "I didn't notice it"] },
      { id: "mySolarisInitialClear", label: "When My Solaris opened, did you understand what it was for?", type: "single", options: ["Immediately", "Mostly", "Only after looking around", "No"] },
      { id: "accountConfusing", label: "What, if anything, was confusing?", type: "textarea", helper: "Optional. A short answer is enough." },
    ],
  },
  {
    id: "confirmation-discovery",
    title: "4. Find and edit your confirmation",
    task: {
      body: "Without using a recovery code and without using the Guide, find your country's existing confirmation response. If editing is open, change something, save it, then refresh and check that the change remained.",
      href: "/",
      linkLabel: "Continue in Solaris Studio",
    },
    questions: [
      { id: "confirmationFindSuccess", label: "Could you find your country's confirmation response?", type: "single", required: true, options: FIND_OPTIONS },
      { id: "confirmationAutoRecognised", label: "Did Solaris automatically recognise your signed-in country?", type: "single", options: ["Yes", "No", "Not sure"] },
      { id: "confirmationRecoveryAsked", label: "Did it ask you for a recovery code even though you were signed in?", type: "single", options: ["No", "Yes", "Not sure"] },
      { id: "confirmationEditWorked", label: "Could you edit the saved response?", type: "single", options: ["Yes", "Editing was closed", "No", "I couldn't find the response"] },
      { id: "confirmationSaveObvious", label: "Was it obvious that your change had saved?", type: "single", options: ["Yes", "Mostly", "No", "I couldn't test saving"] },
      { id: "confirmationPersisted", label: "After refreshing, was the changed information still there?", type: "single", options: ["Yes", "No", "I didn't test / couldn't edit"] },
      { id: "confirmationEase", label: "How easy was this task overall?", type: "single", options: ["1 — Very difficult", "2", "3", "4", "5 — Very easy"] },
      { id: "confirmationConfusing", label: "What made this harder than it should have been?", type: "textarea", helper: "Optional." },
    ],
  },
  {
    id: "my-solaris",
    title: "5. Understand My Solaris",
    task: {
      body: "Stay in My Solaris. Without using the Guide, find where you would change basic country information, edit the public page appearance, edit an SSC entry, and add or change page media.",
      href: "/country-hub",
      linkLabel: "Open My Solaris",
    },
    questions: [
      { id: "mySolarisTasks", label: "How easy were these to find?", type: "matrix", rows: ["Basic country information", "Public page appearance", "An SSC entry", "Page images / media"], options: FIND_OPTIONS },
      { id: "mySolarisExpectedSections", label: "Which section did you EXPECT each thing to be in?", type: "matrix", rows: ["Basic country information", "Public page appearance", "An SSC entry", "Page images / media"], options: ["Overview", "Country", "Page & media", "Entries", "Not sure"] },
      { id: "mySolarisSectionClarity", label: "How clear are the My Solaris sections?", type: "matrix", rows: ["Overview", "Country", "Page & media", "Entries"], options: FIVE },
      { id: "mySolarisOverwhelming", label: "How overwhelming did My Solaris feel?", type: "single", options: ["1 — Not at all", "2", "3", "4", "5 — Extremely overwhelming"] },
      { id: "mySolarisWrongSection", label: "Did anything feel like it belonged in a different section?", type: "multi", options: ["Profile / activity", "Country identity", "National facts", "Appearance", "Page builder", "Images / media", "SSC entries", "Public previews", "Nothing felt misplaced", "Other"] },
      { id: "mySolarisFunctionality", label: "What worked during your country-account test?", type: "matrix", rows: ["Create account", "Sign in", "Sign out", "My Solaris Overview", "Country information", "Confirmation response", "Automatic confirmation access", "Country page editor", "Wiki/page content", "Page & media", "Appearance", "Entries", "Saving changes", "Public preview", "Navigation", "Guide"], options: WORK_OPTIONS },
      { id: "mySolarisSplitBetter", label: "If you remember the older one-page My Solaris, is the new separated layout easier?", type: "single", options: ["Much worse", "Worse", "Same", "Better", "Much better", "I don't remember / never used it"] },
    ],
  },
  {
    id: "country-editing",
    title: "6. Edit your country page",
    task: {
      body: "Use your country tools to change a colour, change the page personality/design, change some content, and add or change an image if possible. Save, then open the public Country page and check that the changes appear.",
      href: "/country-hub",
      linkLabel: "Open My Solaris",
    },
    questions: [
      { id: "countryEditActions", label: "What happened with each action?", type: "matrix", rows: ["Change a colour", "Change page personality/design", "Change page content", "Add/change an image", "Save changes", "See the change on the public page"], options: ["Worked", "Something was wrong", "Couldn't find it", "Didn't test"] },
      { id: "countryWikiDifference", label: "Was it clear which changes affected the Country page and which affected the Wiki page?", type: "single", options: ["Completely clear", "Mostly clear", "A little confusing", "Very confusing"] },
      { id: "countryEditorEase", label: "How easy was the country editor to use?", type: "single", options: ["1 — Very difficult", "2", "3", "4", "5 — Very easy"] },
      { id: "countryEditorConfidence", label: "How confident were you that you could fix a mistake you made?", type: "single", options: ["1 — Not confident", "2", "3", "4", "5 — Very confident"] },
      { id: "countryEditorProblem", label: "What was the most confusing part of editing the country?", type: "textarea", helper: "Optional." },
    ],
  },
  {
    id: "public-discovery",
    title: "7. Public information discovery",
    description: "Some historical Solaris data is still incomplete. Do NOT mark a feature as broken simply because an old edition, entry or result has not been added yet. Judge whether the information that IS available is easy to find, understandable and displayed correctly.",
    task: {
      body: "Without the Guide, find SSC21. Find Oland's entry in SSC21, Oland's placement, the full voting result, something showing Oland's longer-term history, Oland's public Country page, and Oland's Wiki page.",
      href: "/",
      linkLabel: "Start from the public site",
    },
    questions: [
      { id: "publicDiscoveryTasks", label: "How easy was each task?", type: "matrix", rows: ["Find SSC21", "Find Oland's SSC21 entry", "Find Oland's placement", "Find the full voting result", "Find Oland's longer-term history", "Find Oland's Country page", "Find Oland's Wiki page"], options: FIND_OPTIONS },
      { id: "countryTasks", label: "Could you quickly answer these using a country page?", type: "matrix", rows: ["How well has this country historically performed?", "What are some of its best results?", "What entries has it sent?", "How has its performance changed over time?", "Which countries does it have interesting voting relationships with?"], options: ["Yes, easily", "Yes, but took some searching", "No"] },
      { id: "publicDiscoveryConfusing", label: "What was hardest to find or understand?", type: "textarea", helper: "Ignore missing historical data itself." },
    ],
  },
  {
    id: "search-discovery",
    title: "8. Search / finding something quickly",
    task: {
      body: "Starting from the normal site, find Oland or its SSC21 entry using whatever method feels most natural. Do not assume you have to use a search box.",
      href: "/",
      linkLabel: "Start from home",
    },
    questions: [
      { id: "searchSuccess", label: "How quickly did you reach what you were looking for?", type: "single", required: true, options: ["Immediately", "Eventually", "Only after trying several things", "No"] },
      { id: "searchMethod", label: "How did you find it?", type: "single", options: ["Search", "Main navigation", "Country page", "Edition/results page", "Clicked it somewhere else", "Another way", "I didn't find it"] },
      { id: "searchExpected", label: "If you struggled, where did you EXPECT to find it?", type: "text", showWhen: { id: "searchSuccess", oneOf: ["Eventually", "Only after trying several things", "No"] } },
    ],
  },
  {
    id: "guide-discovery",
    title: "9. Find help",
    task: {
      body: "Now you MAY use the Guide. Imagine you do not know how to change your Country page design. Find instructions explaining how to do it.",
      href: "/",
      linkLabel: "Find the help yourself",
    },
    questions: [
      { id: "guideFindSuccess", label: "How easy was the Guide to find?", type: "single", required: true, options: FIND_OPTIONS },
      { id: "guideCorrectAnswer", label: "How easy was it to find the correct answer inside the Guide?", type: "single", options: ["1 — Very difficult", "2", "3", "4", "5 — Very easy"] },
      { id: "guideLanguage", label: "How easy was the Guide language to understand?", type: "single", options: ["1 — Very confusing", "2", "3", "4", "5 — Very clear"] },
      { id: "guideSolve", label: "Did the Guide actually solve the question?", type: "single", options: ["Yes completely", "Mostly", "Only partly", "No"] },
      { id: "guideTooMuch", label: "Did the Guide contain too much information at once?", type: "single", options: ["No", "A little", "Yes"] },
      { id: "guidePurpose", label: "In your own words, what is the Guide for?", type: "textarea", placeholder: "The Guide is for..." },
      { id: "guideMissing", label: "Was anything important missing from the Guide?", type: "textarea", helper: "Optional." },
    ],
  },
  {
    id: "navigation",
    title: "10. Navigation",
    questions: [
      { id: "navigationStatements", label: "How much do you agree?", type: "matrix", rows: ["I always knew where I was on the website", "I usually knew where I should click next", "Important features were where I expected them to be", "Going between the public site and My Solaris made sense", "Buttons and menu names clearly explained what they did"], options: ["1 — Strongly disagree", "2", "3", "4", "5 — Strongly agree"] },
      { id: "navigationDifferences", label: "How clearly did you understand the difference between these?", type: "matrix", rows: ["Country page and Wiki", "Public site and My Solaris", "The My Solaris sections", "Pulse and Analysis", "Results and Full Scorecharts"], options: ["1 — Completely unclear", "2", "3", "4", "5 — Completely clear"] },
      { id: "feltLost", label: "How often did you feel lost?", type: "single", options: ["Never", "Once", "A few times", "Often"] },
      { id: "feltLostDoing", label: "What were you trying to do when you felt lost?", type: "textarea", showWhen: { id: "feltLost", oneOf: ["Once", "A few times", "Often"] } },
    ],
  },
];
