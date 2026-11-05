import type { SscRuleChapter } from "@/lib/ssc-rules/types";

export const ROLEPLAY_CHAPTER: SscRuleChapter = {
  number: 22,
  slug: "roleplay-worldbuilding",
  title: "Roleplay & Worldbuilding",
  shortTitle: "Roleplay",
  description:
    "How fictional countries interact, when another country may be affected by roleplay, and how wars, dormancy, territorial change and the canonical Solaris map work.",
  icon: "Map",
  accent: "indigo",
  atAGlance: [
    "You control the ordinary internal worldbuilding of your own country.",
    "A represented or recently represented country cannot be permanently altered without the required consent.",
    "A country becomes Dormant only after six consecutive completed SSC Editions with no active Head of Delegation at any point in those editions.",
    "Dormant countries may be conquered, partitioned or eliminated, while their historical SSC records remain intact.",
  ],
  rules: [
    {
      id: "22.1",
      title: "Creative Ownership of Countries",
      summary:
        "Each Head of Delegation controls the ordinary internal worldbuilding of their own fictional country.",
      tone: "information",
      body: [
        "A Head of Delegation may determine the ordinary internal worldbuilding of the country they officially represent, including its government, leaders, institutions, culture, religion, cities, regions, domestic politics, military, economy and internal events.",
        "The shared Solaris world does not give one participant creative ownership over another participant's represented country. A storyline that materially changes another country is governed by the consent and protection rules in this chapter.",
      ],
      allowed: [
        "Create elections, coups, revolutions, reforms or civil conflict inside your own country.",
        "Develop your own country's cities, institutions, culture, armed forces and foreign policy.",
        "Make diplomatic claims or statements about another country without treating the claim itself as an official map change.",
      ],
      prohibited: [
        "Decide another represented country's government, destruction or permanent territorial fate without the required consent.",
        "Present unilateral roleplay as if it automatically rewrote official Solaris records.",
      ],
      examples: [
        {
          title: "Domestic revolution",
          outcome: "allowed",
          detail: "An HOD may overthrow or replace the fictional government of their own country without asking other delegations for permission.",
        },
        {
          title: "Changing another country's government",
          outcome: "not-allowed",
          detail: "Another HOD cannot simply declare that a represented country's government has been permanently removed and replaced.",
        },
      ],
      tags: [
        "roleplay",
        "worldbuilding",
        "country ownership",
        "creative ownership",
        "government",
        "coup",
        "revolution",
        "civil war",
        "lore",
      ],
      relatedRules: ["22.2", "22.11"],
    },
    {
      id: "22.2",
      title: "Consent and Shared Storylines",
      summary:
        "Permanent changes to another protected country normally require clear consent from its active HOD.",
      tone: "conditional",
      body: [
        "Where roleplay would materially and permanently alter another protected country, the affected Head of Delegation must normally agree to that outcome. Consent should be reasonably clear and should cover the material consequence being made canonical.",
        "Silence, temporary inactivity, failure to answer a message, or withdrawal from one Edition must not be treated as consent. Collaborative roleplay may evolve over time, but participants remain free to decline an unagreed permanent outcome affecting their country.",
      ],
      allowed: [
        "Agree with another HOD on a border change, occupation, union, independence event or other shared storyline.",
        "Run collaborative wars or crises where the affected participants agree on the material outcomes.",
      ],
      prohibited: [
        "Treat silence as permission to annex or destroy another protected country.",
        "Pressure another HOD to accept a permanent storyline as the price of normal SSC participation.",
      ],
      important:
        "Consent to participate in a storyline is not automatically consent to every possible ending. The material permanent outcome must be reasonably understood by the affected participants.",
      examples: [
        {
          title: "Agreed border war",
          outcome: "allowed",
          detail: "Two HODs may agree that a war ends with a permanent border transfer and ask TSBC to reflect it on the canonical map.",
        },
        {
          title: "No reply for a week",
          outcome: "not-allowed",
          detail: "A lack of response does not allow another participant to treat the country as abandoned or annexed.",
        },
      ],
      tags: ["consent", "permission", "shared roleplay", "silence", "agreement", "storyline", "border change"],
      relatedRules: ["22.1", "22.4", "22.7"],
    },
    {
      id: "22.3",
      title: "War, Invasion and Occupation",
      summary:
        "Wars and invasions may be roleplayed, but military claims do not automatically create permanent sovereignty over a protected country.",
      tone: "conditional",
      body: [
        "Declarations of war, invasions, battles, blockades, occupations, resistance movements, ceasefires and peace agreements may be used as fictional Solaris worldbuilding.",
        "A participant may determine the actions of forces and institutions they control. They may not unilaterally determine the permanent defeat, annexation, dissolution or destruction of a protected country. Temporary occupation may exist in roleplay without changing the official canonical border.",
      ],
      allowed: [
        "Declare war or launch an invasion as a roleplay action.",
        "Describe the actions of your own military and government.",
        "Create a temporary occupation where the affected HOD has agreed to the storyline.",
      ],
      prohibited: [
        "Treat an invasion alone as automatic ownership of another protected country.",
        "Permanently erase or annex a protected country without the required consent.",
      ],
      examples: [
        {
          title: "Country A invades Country B",
          outcome: "depends",
          detail: "The invasion can exist as roleplay. Country B does not automatically disappear or become Country A's territory.",
        },
        {
          title: "Dormant Country B is conquered",
          outcome: "allowed",
          detail: "If Country B already satisfies the Dormant-country rule, permanent conquest can be completed under Rules 22.6 and 22.7.",
        },
      ],
      tags: ["war", "invasion", "invade", "occupation", "army", "military", "conquest", "blockade", "resistance"],
      relatedRules: ["22.4", "22.6", "22.7"],
    },
    {
      id: "22.4",
      title: "Protected Countries",
      summary:
        "Active and recently represented countries are protected from unilateral permanent annexation, dissolution or elimination.",
      tone: "prohibited",
      body: [
        "A country is Protected while it has an active Head of Delegation or while fewer than six consecutive completed SSC Editions have passed in which that country had no active Head of Delegation at any point.",
        "Withdrawal, suspension, a temporary vacancy, missing one or more Editions, or losing an HOD during an Edition does not immediately remove this protection. A country that had an active HOD at any time during a completed Edition does not count that Edition toward the six-Edition Dormant threshold.",
      ],
      prohibited: [
        "Permanently annex, dissolve, partition, absorb or eliminate a Protected country without the required consent.",
        "Remove a Protected country from the canonical map merely because it is not competing in the current Edition.",
        "Start the Dormant clock from the middle of an Edition in which the country had an active HOD.",
      ],
      important:
        "Withdrawal from an Edition is a participation decision, not abandonment of the fictional country. Protected status and SSC participation status are separate concepts.",
      examples: [
        {
          title: "HOD withdraws midway through SSC 30",
          outcome: "not-allowed",
          detail: "SSC 30 does not count toward dormancy because the country had an active HOD during that Edition. The first possible Dormant-count Edition is SSC 31.",
        },
        {
          title: "Country skips two Editions",
          outcome: "not-allowed",
          detail: "Two HODless completed Editions are not enough. The country remains Protected.",
        },
      ],
      tags: [
        "protected country",
        "recently active",
        "withdrawal",
        "withdrawn",
        "hodless",
        "no hod",
        "inactive",
        "six editions",
        "territorial integrity",
      ],
      relatedRules: ["15.1", "22.5", "22.6"],
    },
    {
      id: "22.5",
      title: "Dormant Countries",
      summary:
        "A country becomes Dormant after six consecutive completed SSC Editions with no active HOD at any point in those Editions.",
      tone: "administrative",
      body: [
        "A country becomes a Dormant Country when six consecutive SSC Editions have fully completed and the country had no active Head of Delegation at any point in any of those six Editions.",
        "The threshold is measured in completed Editions rather than months or calendar years. An Edition in which the country had an active HOD for any period breaks the consecutive Dormant count. TSBC records determine official HOD activity where the status is disputed.",
      ],
      bullets: [
        "0–5 consecutive fully HODless completed Editions · Protected",
        "6 consecutive fully HODless completed Editions · Dormant",
        "Any active HOD during an Edition · that Edition does not count toward Dormancy",
        "A new active HOD before canonical elimination · protection immediately resumes",
      ],
      important:
        "Dormant status removes protection from permanent geopolitical change. It does not erase the country's historical SSC identity or results.",
      examples: [
        {
          title: "Last represented in SSC 18",
          outcome: "information",
          detail: "If SSC 19 through SSC 24 all complete with no active HOD at any point, the country becomes Dormant when SSC 24 is completed.",
        },
        {
          title: "New HOD joins during the sixth Edition",
          outcome: "information",
          detail: "That Edition no longer counts as fully HODless, so the six-Edition Dormant threshold has not been reached.",
        },
      ],
      tags: [
        "dormant",
        "dormant country",
        "six editions",
        "6 editions",
        "hodless",
        "no hod",
        "inactive country",
        "abandoned country",
        "unrepresented",
      ],
      relatedRules: ["22.4", "22.6", "22.8"],
    },
    {
      id: "22.6",
      title: "Conquest and Elimination of Dormant Countries",
      summary:
        "Dormant countries may be permanently conquered, annexed, partitioned, absorbed or eliminated from the contemporary Solaris map.",
      tone: "allowed",
      body: [
        "Once a country is Dormant, its former territorial integrity is no longer protected against permanent geopolitical roleplay. Other countries may conquer, annex, partition, absorb, colonise, permanently occupy or otherwise end the Dormant state.",
        "A Dormant country may be completely eliminated as a present-day country. Its territory may be divided between other states or removed from its former sovereign status, subject to the canonical-map process in Rule 22.7.",
      ],
      allowed: [
        "Permanently annex all or part of a Dormant country.",
        "Partition a Dormant country between multiple states.",
        "Absorb or dissolve the Dormant state so it no longer appears as a present-day sovereign country.",
        "Create successor territories or new political entities from Dormant territory where the resulting canon is clear.",
      ],
      prohibited: [
        "Use this rule against a country that has not yet completed the six-Edition Dormant threshold.",
        "Delete or rewrite the eliminated country's historical SSC entries, votes, results or hosting record.",
      ],
      important:
        "Country elimination is a present-day worldbuilding outcome. It never means deleting the country's historical SSC record.",
      examples: [
        {
          title: "Dormant country annexed in full",
          outcome: "allowed",
          detail: "A qualifying Dormant country can cease to exist as a current sovereign state after the canonical map outcome is registered.",
        },
        {
          title: "Country has been HODless for five completed Editions",
          outcome: "not-allowed",
          detail: "It is still Protected for one more fully HODless completed Edition.",
        },
      ],
      tags: [
        "annex",
        "annexation",
        "conquer",
        "conquest",
        "destroy country",
        "erase country",
        "eliminate country",
        "partition",
        "absorb",
        "colonise",
        "colonize",
        "remove from map",
      ],
      relatedRules: ["22.5", "22.7", "22.10"],
    },
    {
      id: "22.7",
      title: "Canonical Map and Competing Claims",
      summary:
        "Permanent territorial outcomes must be recorded consistently before they alter the official Solaris map.",
      tone: "administrative",
      body: [
        "Roleplay may establish a claim or conflict, but the official Solaris map and country registry must remain internally consistent. Permanent changes affecting official borders, sovereignty or the existence of a country must therefore be registered or confirmed through the TSBC canonical-map process.",
        "For a qualifying Dormant country, this is an administrative consistency check rather than a general veto on dramatic roleplay. TSBC verifies Dormant status, resolves incompatible simultaneous claims, records the effective canonical outcome and prevents contradictory official maps.",
      ],
      allowed: [
        "Submit an agreed or completed territorial outcome for canonical-map registration.",
        "Resolve multiple claims collaboratively and provide one final map outcome.",
      ],
      prohibited: [
        "Treat an unofficial map image as automatically overriding the official Solaris map.",
        "Claim exclusive ownership merely because you posted first when another unresolved claim already exists.",
      ],
      examples: [
        {
          title: "Two states claim the same Dormant region",
          outcome: "depends",
          detail: "The claims must be reconciled by the participants or determined by TSBC before the official map can show one canonical outcome.",
        },
        {
          title: "One uncontested Dormant annexation",
          outcome: "allowed",
          detail: "Once Dormant status and the resulting borders are confirmed, the official map can be updated to the new present-day canon.",
        },
      ],
      tags: ["official map", "canonical map", "map change", "territory", "border", "claim", "competing claims", "tsbc approval", "recognition"],
      relatedRules: ["22.2", "22.6", "22.8"],
    },
    {
      id: "22.8",
      title: "Return, Restoration and Successor States",
      summary:
        "A returning HOD regains protection before elimination, but does not automatically restore a country that was already canonically eliminated.",
      tone: "conditional",
      body: [
        "If a new or returning HOD takes control of a Dormant country before its permanent elimination has been canonically completed, the country immediately becomes Protected again. Existing temporary roleplay may remain part of its history, but unilateral permanent alteration must stop.",
        "If the Dormant country was already canonically eliminated, a future HOD may still return to Solaris worldbuilding, but the former borders do not automatically reappear. Restoration, a successor state, independence movement, government-in-exile or another continuation may be recognised through a new canonical outcome that respects territory already transferred to other countries.",
      ],
      examples: [
        {
          title: "HOD returns before annexation is completed",
          outcome: "allowed",
          detail: "Protection resumes immediately and the country cannot then be unilaterally eliminated.",
        },
        {
          title: "HOD returns years after canonical partition",
          outcome: "depends",
          detail: "The participant may develop a restoration or successor-state storyline, but cannot simply invalidate the already canonical borders of other countries.",
        },
      ],
      tags: ["returning country", "returning hod", "restore country", "restoration", "successor state", "government in exile", "independence"],
      relatedRules: ["22.5", "22.7", "22.10"],
    },
    {
      id: "22.9",
      title: "Secession, Unification and Dissolution",
      summary:
        "New states, mergers and voluntary dissolution are allowed when the affected country ownership and official records are handled clearly.",
      tone: "conditional",
      body: [
        "HODs may create secessions, new states, unions, mergers, dependencies, autonomous regions or voluntary dissolution within territory they control. Where the change affects territory controlled by another protected country, that HOD's consent is required.",
        "Changes that create or remove official SSC country identities, merge established countries, or materially alter the canonical map must identify the resulting country identities and historical continuity clearly enough for TSBC records to remain unambiguous.",
      ],
      allowed: [
        "Split your own country's territory into successor states as worldbuilding.",
        "Merge represented countries when all affected HODs agree.",
        "Voluntarily retire or dissolve your own current country without deleting its history.",
      ],
      prohibited: [
        "Create a new state by taking protected territory from another HOD without consent.",
        "Use a merger or dissolution to rewrite previous SSC results under a different historical identity.",
      ],
      tags: ["secession", "independence", "new country", "unification", "merge", "union", "dissolution", "dependency", "autonomous region"],
      relatedRules: ["22.2", "22.7", "22.10"],
    },
    {
      id: "22.10",
      title: "Historical Continuity",
      summary:
        "Present-day geopolitical changes never rewrite the country identities and official results of past SSC Editions.",
      tone: "information",
      body: [
        "The archive records each Edition using the country identities and official facts that applied to that Edition. Later annexation, dissolution, restoration, merger, rebranding or elimination does not retroactively rewrite historical SSC results.",
        "A country may therefore cease to exist on the present-day Solaris map while continuing to appear normally in past entries, votes, scoreboards, hosting records, sanctions and other historical material.",
      ],
      bullets: [
        "Past entries remain credited to the country that competed at the time.",
        "Past votes and results are not transferred merely because territory later changes hands.",
        "Historical flags and names may remain visible in edition-specific archive views.",
        "Present-day maps may differ from historical maps without creating a contradiction.",
      ],
      tags: ["history", "archive", "historical continuity", "old results", "past editions", "old flag", "country history", "records"],
      relatedRules: ["22.6", "22.8", "22.9"],
    },
    {
      id: "22.11",
      title: "Roleplay Conduct and Abuse",
      summary:
        "Roleplay cannot be used to harass participants, falsify consent, impersonate delegations or interfere with real SSC participation.",
      tone: "integrity",
      body: [
        "Fictional political conflict does not suspend SSC conduct, integrity or account rules. Roleplay must remain distinguishable from real threats, harassment, impersonation and administrative actions.",
        "A participant may not use roleplay to obtain another delegation's account rights, falsify another HOD's agreement, force a participant out of SSC, manipulate official records, or disguise personal abuse as fictional diplomacy.",
      ],
      prohibited: [
        "Forge or misrepresent another HOD's consent to a permanent storyline.",
        "Impersonate another country's official delegation in Solaris Studio.",
        "Harass or threaten a real participant and excuse it as roleplay.",
        "Manipulate delegation records so a protected country appears Dormant.",
      ],
      important:
        "Where fictional conflict and real participant conduct collide, the ordinary SSC conduct and integrity rules continue to apply.",
      tags: ["roleplay abuse", "harassment", "threat", "impersonation", "fake consent", "manipulation", "conduct", "integrity"],
      relatedRules: ["14.1", "14.2", "22.1", "22.2"],
    },
  ],
};

export const ROLEPLAY_QUICK_ANSWERS = [
  {
    id: "invade-country",
    question: "Can I invade another HOD's country?",
    answer: "Depends" as const,
    explanation:
      "You may roleplay an invasion, but you cannot unilaterally make a protected country permanently disappear, lose territory or become annexed.",
    ruleIds: ["22.3", "22.4"],
    phrases: ["invade country", "invasion", "attack another country", "war another hod", "occupy country"],
  },
  {
    id: "annex-hodless-country",
    question: "Can I annex a country that has no HOD?",
    answer: "Depends" as const,
    explanation:
      "Not immediately. The country must first complete six consecutive SSC Editions with no active HOD at any point in those Editions and become Dormant.",
    ruleIds: ["22.4", "22.5", "22.6"],
    phrases: ["annex hodless", "country no hod", "hodless country", "inactive country annex", "abandoned country"],
  },
  {
    id: "destroy-dormant-country",
    question: "Can a Dormant country be completely eliminated?",
    answer: "Yes" as const,
    explanation:
      "A qualifying Dormant country may be conquered, partitioned, absorbed or eliminated from the present-day map, while its historical SSC record remains intact.",
    ruleIds: ["22.6", "22.7", "22.10"],
    phrases: ["destroy country", "erase country", "eliminate country", "remove country from map", "wipe country off map"],
  },
  {
    id: "withdrawal-dormant",
    question: "Does withdrawing from an Edition make a country Dormant?",
    answer: "No" as const,
    explanation:
      "Withdrawal does not remove protection. An Edition only counts toward Dormancy when it completes with no active HOD at any point in that Edition.",
    ruleIds: ["22.4", "22.5"],
    phrases: ["withdraw dormant", "withdrawn country", "withdrew mid edition", "hod left mid edition"],
  },
  {
    id: "return-after-annexation",
    question: "Can a country return after it was canonically annexed or eliminated?",
    answer: "Depends" as const,
    explanation:
      "A future HOD may return through restoration, a successor state or another canonical continuation, but old borders do not automatically override territory already transferred to other countries.",
    ruleIds: ["22.8", "22.10"],
    phrases: ["return after annexation", "restore country", "country comes back", "successor state", "return eliminated country"],
  },
];
