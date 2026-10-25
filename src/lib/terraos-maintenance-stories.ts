export type TerraOsStoryId =
  | "home"
  | "explore"
  | "participate"
  | "results"
  | "me";

export type TerraOsMaintenanceStory = {
  id: TerraOsStoryId;
  number: number;
  title: string;
  eyebrow: string;
  tagline: string;
  intro: string;
  legacySummary: string;
  legacyItems: string[];
  newItems: string[];
  keyChanges: string[];
  fixtures: string[];
  statement: string;
  finale: string;
  nextStory: TerraOsStoryId | null;
  nextLabel: string;
};

/**
 * Product-story copy for the public TerraOS maintenance experience.
 *
 * Legacy summaries intentionally describe only differences that are visible in
 * the repository's previous Public Solaris / MySolaris information
 * architecture. They do not invent defects or imply that the old workflows
 * themselves were incorrect.
 */
export const TERRAOS_MAINTENANCE_STORIES: readonly TerraOsMaintenanceStory[] = [
  {
    id: "home",
    number: 1,
    title: "Home",
    eyebrow: "What matters now",
    tagline: "What matters. Right now.",
    intro:
      "TerraOS starts from your current Solaris context, then brings the next useful thing forward without turning Home into a dashboard dump.",
    legacySummary:
      "Public contest context and participant responsibilities existed across Public Solaris and MySolaris surfaces, so the user often chose the relevant destination before seeing the detail they needed.",
    legacyItems: ["Current contest", "Updates", "Responsibilities", "Coming up"],
    newItems: ["Right now", "Current contest", "Coming up", "Latest"],
    keyChanges: [
      "One dominant next action when attention is required.",
      "The permanent Home structure stays recognizable while emphasis changes.",
      "Contest context and participant responsibility can meet in one starting point.",
    ],
    fixtures: ["home_caught_up", "home_attention"],
    statement: "Home changes when your day does.",
    finale: "One place to start Solaris.",
    nextStory: "explore",
    nextLabel: "Continue to Explore",
  },
  {
    id: "explore",
    number: 2,
    title: "Explore",
    eyebrow: "Discover Solaris",
    tagline: "There's a lot of Solaris. Finding it shouldn't feel like work.",
    intro:
      "Explore brings editions, countries, songs, artists, shows, stories and archive discovery into one editorial place without replacing precise search.",
    legacySummary:
      "Solaris already exposed rich discovery through dedicated edition, country, artist, song, story, Wiki and archive routes. TerraOS keeps those capabilities while giving them a single discovery hierarchy.",
    legacyItems: [
      "Editions · Countries",
      "Artists · Songs",
      "Stories · Shows",
      "Wiki · Archive",
    ],
    newItems: ["Search Solaris", "Current edition", "Discover", "Archive"],
    keyChanges: [
      "Search is first-class rather than requiring route memory.",
      "The current edition receives a clear editorial position.",
      "Historical discovery stays within reach of the current contest.",
    ],
    fixtures: ["explore_search", "explore_archive"],
    statement: "Search Solaris. Not menus.",
    finale: "More Solaris. Less searching.",
    nextStory: "participate",
    nextLabel: "Continue to Participate",
  },
  {
    id: "participate",
    number: 3,
    title: "Participate",
    eyebrow: "Know what needs you",
    tagline: "Solaris asks things of you. TerraOS tells you exactly what.",
    intro:
      "Confirmation, Entry, Jury and Televote remain distinct workflows. Participate turns their current state into one understandable journey and keeps required work separate from optional opportunities.",
    legacySummary:
      "Confirmation, Entry and voting already worked as specialist destinations, including participant work inside MySolaris. TerraOS preserves those workflows while adding one responsibility-first layer above them.",
    legacyItems: ["Confirmation", "Entry", "Jury", "Televote"],
    newItems: [
      "Your responsibilities",
      "✓ Country confirmed",
      "✓ Entry ready",
      "Voting · Jury · Televote",
    ],
    keyChanges: [
      "Required and optional participation are visibly different concepts.",
      "The next valid action comes from canonical workflow state.",
      "Review outcomes and recovery states stay visible instead of becoming a dead end.",
    ],
    fixtures: [
      "participate_changes_required",
      "participate_complete",
      "participate_voting",
    ],
    statement: "The workflow existed. The journey didn't.",
    finale: "No scavenger hunts. Just the next step.",
    nextStory: "results",
    nextLabel: "Continue to Results",
  },
  {
    id: "results",
    number: 4,
    title: "Results",
    eyebrow: "What happened",
    tagline: "Start with what happened.",
    intro:
      "The published outcome remains the hero. Jury, Televote and deeper analysis stay available as perspectives on the same canonical result rather than competing with the reveal.",
    legacySummary:
      "Solaris already offered official Results plus specialist products such as Scorecharts, Records, Relationships and Result Lab. TerraOS keeps those analytical capabilities while making the official published outcome the unmistakable starting point.",
    legacyItems: ["Official Results", "Scorecharts", "Records", "Relationships · Result Lab"],
    newItems: ["Official result", "Combined", "Jury", "Televote"],
    keyChanges: [
      "Published official truth is visually distinct from analysis.",
      "Jury and Televote are switchable perspectives on the same result.",
      "Advanced tools remain discoverable without loading every dataset up front.",
    ],
    fixtures: ["results_combined", "results_jury", "results_televote"],
    statement: "One result. Every perspective.",
    finale: "See what happened. Understand why.",
    nextStory: "me",
    nextLabel: "Continue to Me",
  },
  {
    id: "me",
    number: 5,
    title: "Me",
    eyebrow: "Your Solaris",
    tagline: "Your Solaris.",
    intro:
      "Me brings identity, current delegation, history, activity and account context together so the user's Solaris story continues beyond the current task or edition.",
    legacySummary:
      "Authenticated personal information already existed across MySolaris sections such as Account, Activity, History, Notices, Saved, Voting, Entry and Theme. TerraOS makes identity and continuity the primary Me concept while current responsibilities belong to Participate.",
    legacyItems: [
      "Account · Activity",
      "History · Notices",
      "Saved · Voting",
      "Entry · Theme",
    ],
    newItems: ["Identity", "Current delegation", "Participation history", "Activity"],
    keyChanges: [
      "Identity and current delegation context are immediately visible.",
      "Current responsibilities move to Participate instead of competing with identity.",
      "Historical participation becomes part of one continuous Solaris timeline.",
    ],
    fixtures: ["me_current", "me_history"],
    statement: "Solaris doesn't start over every edition.",
    finale: "Five perspectives. One Solaris.",
    nextStory: null,
    nextLabel: "Return to TerraOS 3",
  },
] as const;

export const TERRAOS_MAINTENANCE_STORY_IDS = TERRAOS_MAINTENANCE_STORIES.map(
  (story) => story.id,
) as readonly TerraOsStoryId[];

export function isTerraOsStoryId(value: string): value is TerraOsStoryId {
  return TERRAOS_MAINTENANCE_STORY_IDS.includes(value as TerraOsStoryId);
}

export function serializeTerraOsMaintenanceStories(): string {
  // This string is embedded inside application/json in the maintenance HTML.
  // Escaping '<' prevents a future copy change from forming a closing script
  // tag while retaining ordinary JSON parsing in the browser.
  return JSON.stringify(TERRAOS_MAINTENANCE_STORIES).replaceAll("<", "\\u003c");
}
