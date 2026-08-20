import type { BetaSection } from "./types";

export const betaSectionsRound2: BetaSection[] = [
  {
    id: "your-test",
    title: "Quick context",
    description: "This is a shorter follow-up beta. It focuses only on things that changed after the first round.",
    questions: [
      { id: "testerName", label: "1. Name / SSC username", type: "text", required: true, placeholder: "Your name or SSC username" },
      { id: "device", label: "2. What are you testing on?", type: "single", required: true, options: ["Phone", "Tablet", "Laptop", "Desktop"] },
      { id: "browser", label: "3. Browser", type: "single", options: ["Chrome", "Safari", "Firefox", "Edge", "Other / Not sure"] },
      { id: "firstRound", label: "4. Did you take the first Solaris Studio beta test?", type: "single", options: ["Yes", "No", "Not sure"] },
    ],
  },
  {
    id: "entry-discovery",
    title: "Find an entry and listen",
    task: {
      body: "Starting from the normal site, find a past SSC entry and try to open its YouTube, Spotify or Apple Music link. Do not use this form as a map unless you get stuck.",
      href: "/",
      linkLabel: "Open Solaris Studio",
    },
    questions: [
      { id: "entryFindEase", label: "5. How easy was it to find an actual song/entry?", type: "rating", lowLabel: "Couldn't find one", highLabel: "Immediately obvious" },
      { id: "entryFindPath", label: "6. Where did you end up finding it?", type: "single", options: ["Edition page", "Country page", "Wiki", "Search / another page", "I couldn't find one"] },
      { id: "listenLinkWorked", label: "7. Did a listening link open the song/service you expected?", type: "single", options: ["Yes", "There was no listening link on the entry I chose", "The link was confusing", "The link did not work", "I couldn't reach an entry"] },
      { id: "entryDiscoveryComment", label: "8. What, if anything, made finding or listening to the entry harder than it should be?", type: "textarea", helper: "Write “Nothing” if it felt obvious." },
    ],
  },
  {
    id: "analysis",
    title: "Discover",
    task: {
      body: "Open Analysis. Spend a few minutes on Discover first, then open one deeper view such as Jury vs Tele, Relationships or Connections map.",
      href: "/analysis",
      linkLabel: "Open Analysis",
    },
    questions: [
      { id: "discoverClear", label: "9. Could you understand the Discover stories WITHOUT someone explaining them to you?", type: "rating", lowLabel: "Not at all", highLabel: "Completely" },
      { id: "discoverInteresting", label: "10. Did Discover show you anything you genuinely wanted to keep reading?", type: "single", options: ["Definitely", "A few things", "Not really", "No"] },
      { id: "winnerRadarClear", label: "11. If you saw Winner radar, what did you think it meant?", type: "textarea", placeholder: "I thought it showed...", helper: "Use your own words. This checks whether the explanation works, not whether you remember a definition." },
      { id: "analysisDeepView", label: "12. Which deeper view did you try?", type: "single", options: ["Jury vs Tele", "Relationships", "Connections map", "History", "Heat map", "Another one"] },
      { id: "analysisDeepClear", label: "13. How readable was that deeper view on your device?", type: "rating", lowLabel: "Basically unusable", highLabel: "Very easy to read" },
      { id: "analysisStillBoring", label: "14. What still feels boring, unnecessary or too difficult in Analysis?", type: "textarea", helper: "“Nothing” is useful too." },
    ],
  },
  {
    id: "records",
    title: "Records",
    task: {
      body: "Browse several Records categories. Open at least one record with multiple tied countries and one record that refers to a specific edition/result.",
      href: "/records",
      linkLabel: "Open Records",
    },
    questions: [
      { id: "recordsUnique", label: "15. Did you notice the SAME country appearing twice inside a single record?", type: "single", options: ["No", "Yes", "I'm not sure"] },
      { id: "recordsContext", label: "16. When edition/song/artist context mattered, was enough context shown to understand the record?", type: "single", options: ["Yes", "Mostly", "No", "I didn't see a record where this mattered"] },
      { id: "recordsInteresting", label: "17. How much did Records make you want to keep browsing?", type: "rating", lowLabel: "Not at all", highLabel: "A lot" },
      { id: "recordsWantNext", label: "18. Name ONE record or weird statistic you would genuinely want Solaris to add next.", type: "text", placeholder: "I would want to see..." },
      { id: "recordsWrong", label: "19. Did any record value look obviously wrong?", type: "single", options: ["No", "Yes", "I'm not sure"] },
      { id: "recordsWrongDetail", label: "20. Which record looked wrong and why?", type: "textarea", showWhen: { id: "recordsWrong", oneOf: ["Yes", "I'm not sure"] } },
    ],
  },
  {
    id: "responsive",
    title: "Does the site fit your screen?",
    task: {
      body: "Use Solaris normally for a few minutes. Open menus, scroll long pages and try at least one page with a chart or a long list. If you're on desktop, resize the browser once. If you're on mobile, rotate once if practical.",
      href: "/countries",
      linkLabel: "Continue testing",
    },
    questions: [
      { id: "responsiveProblems", label: "21. Did anything overlap, cover controls, fly over other text, get cut off or leave a huge useless empty area?", type: "single", options: ["No", "Yes", "I'm not sure"] },
      { id: "responsiveDetail", label: "22. Where did it happen?", type: "textarea", placeholder: "PAGE: ___\nWHAT HAPPENED: ___", showWhen: { id: "responsiveProblems", oneOf: ["Yes", "I'm not sure"] } },
      { id: "navEase", label: "23. How easy was moving around Solaris on this device?", type: "rating", lowLabel: "Frustrating", highLabel: "Effortless" },
      { id: "visualPolish", label: "24. How finished/polished does Solaris feel now?", type: "rating", lowLabel: "Clearly unfinished", highLabel: "Release-ready" },
    ],
  },
  {
    id: "bugs",
    title: "Anything actually broken?",
    description: "Report reproducible problems here. Screenshots are especially useful for layout problems.",
    questions: [
      { id: "bugsFound", label: "25. Did you find any bug that you have NOT already described above?", type: "single", required: true, options: ["No", "Yes"] },
    ],
  },
  {
    id: "final",
    title: "One decision",
    questions: [
      { id: "priorityOne", label: "26. If I could improve only ONE thing before release, what should it be?", type: "textarea", required: true, placeholder: "The one thing I would fix/improve is..." },
      { id: "releaseReady", label: "27. Based on this test, does the PUBLIC side feel ready for normal SSC fans?", type: "single", options: ["Yes", "Almost — only small fixes", "Not yet", "Definitely not"] },
      { id: "bestChange", label: "28. What change since the first beta (if you saw it) improved the site the most?", type: "textarea", helper: "Skip this if you didn't use the first beta." },
      { id: "anythingElse", label: "29. Anything else you want me to know?", type: "textarea", helper: "Optional. Specific criticism is more useful than being polite." },
    ],
  },
];
