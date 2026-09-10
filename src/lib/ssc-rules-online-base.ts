import {
  SSC_RULE_CHAPTERS as BASE_CHAPTERS,
  type RuleTone,
  type SscRule,
  type SscRuleChapter,
} from "@/lib/ssc-rules";

export type { RuleTone, SscRule, SscRuleChapter };

type RulePatch = Partial<Omit<SscRule, "id">> & { id: string };

function patchRules(chapter: SscRuleChapter, patches: RulePatch[], additions: SscRule[] = []): SscRuleChapter {
  const patchMap = new Map(patches.map((patch) => [patch.id, patch]));
  return {
    ...chapter,
    rules: [
      ...chapter.rules.map((rule) => {
        const patch = patchMap.get(rule.id);
        return patch ? { ...rule, ...patch, id: rule.id } : rule;
      }),
      ...additions,
    ],
  };
}

const chapters = BASE_CHAPTERS.map((chapter): SscRuleChapter => {
  if (chapter.number === 4) {
    return patchRules(chapter, [
      {
        id: "4.4",
        title: "Artist Popularity",
        summary: "Eligibility is measured using published thresholds at the official eligibility-check time, not an undefined idea of fame.",
        body: [
          "At the official eligibility-check time, an artist must have fewer than 25 million monthly Spotify listeners and the relevant official music video must have fewer than 20 million YouTube views, unless an edition-specific regulation expressly announces a different threshold before submissions open.",
          "Eligibility shall not be rejected merely because an artist is subjectively described as mainstream, famous, popular or overused where the artist satisfies the published measurable requirements. Any additional objective restriction must be published before the relevant selection or submission phase begins.",
        ],
        important: "A later increase in listeners or views does not make an already accepted entry retroactively ineligible.",
        examples: [
          { title: "Artist grows after acceptance", outcome: "allowed", detail: "An artist has 23.8M monthly listeners when officially checked and later passes 25M. The accepted entry remains eligible." },
          { title: "Threshold already exceeded", outcome: "not-allowed", detail: "An artist has 27M monthly listeners when officially checked. The entry does not satisfy the published threshold." },
          { title: "Administrator calls the artist mainstream", outcome: "information", detail: "A subjective description alone is not a separate eligibility rule. TSBC must rely on published objective criteria." },
        ],
        tags: ["spotify", "monthly listeners", "25 million", "youtube", "20 million", "mainstream", "objective threshold", "eligibility time"],
      },
      {
        id: "4.10",
        title: "Entry Verification & Reference Time",
        summary: "TSBC verifies eligibility against the information and thresholds applicable at a defined official reference time.",
        body: [
          "Delegations are expected to check entry eligibility before submission. TSBC may independently verify any entry and may request supporting information where a requirement cannot be confirmed reliably from public sources.",
          "Where eligibility depends on a changing statistic, the relevant value is the value reasonably established at the official eligibility-check time recorded by TSBC. Later changes do not normally alter that decision unless false information was supplied or the original verification was materially wrong.",
        ],
        bullets: ["Spotify availability and listener count", "YouTube statistics", "artist eligibility", "previous contest participation", "artist-reuse status", "video availability", "the date and time of the eligibility check"],
        tags: ["verify", "entry checker", "eligibility check", "statistics", "reference time", "snapshot"],
      },
    ]);
  }

  if (chapter.number === 7) {
    return patchRules(chapter, [
      {
        id: "7.7",
        title: "Friendship, Relationships & Genuine Preference",
        summary: "Friendship, alliances and shared communities are not misconduct by themselves; the decisive question is whether the vote remained genuinely independent.",
        body: [
          "Friendships, alliances, shared communities and ordinary social relationships between SSC participants are permitted. A participant may genuinely prefer a friend's entry and award it a high score.",
          "A relationship becomes relevant to voting integrity only when credible evidence indicates that it replaced, controlled or coordinated the voter's independent musical judgment.",
        ],
        important: "A relationship or voting pattern alone is not sufficient evidence of deliberate voting misconduct.",
        examples: [
          { title: "Friend's song is genuinely your favourite", outcome: "allowed", detail: "You rank a friend's entry first because it is honestly your favourite entry. The relationship does not invalidate the vote." },
          { title: "Friends promise reciprocal support", outcome: "not-allowed", detail: "Two participants agree to exchange high scores regardless of their actual preferences. That is coordinated voting." },
          { title: "Repeated mutual high scores", outcome: "information", detail: "The pattern may justify review, but it does not establish an agreement by itself." },
        ],
        tags: ["friend", "friends", "friend voting", "relationship", "alliance", "community", "genuine preference", "favouritism", "favoritism"],
      },
      {
        id: "7.8",
        title: "Automated Integrity Analysis",
        summary: "Automated systems may prioritise review using multiple signals, but they may never independently determine guilt or impose a sanction.",
        body: [
          "Solaris Studio may analyse voting behaviour to identify ballots or relationships that warrant human review. Relevant signals may include reciprocity, concentration, repeated historical patterns, changes from a voter's normal behaviour, jury-televote differences and other statistically meaningful indicators.",
          "Recent editions may be weighted more heavily than older editions where the system uses historical information, provided the method is applied consistently.",
        ],
        important: "Automated scores, classifications and anomalies are review signals only. A human decision must consider the actual context and evidence before misconduct is found.",
        tags: ["algorithm", "automated", "flag", "friend voting model", "risk score", "analysis", "historical weighting", "jury televote"],
      },
      {
        id: "7.9",
        title: "Voting Integrity Declaration",
        summary: "A ballot selected for review may require a good-faith declaration confirming independent voting, without treating the declaration request as an accusation.",
        body: [
          "Where a ballot is selected for additional verification, TSBC may ask the voter to confirm that the ballot reflects genuine preferences, was made independently and was not part of a voting arrangement, reward, threat or reciprocal agreement.",
          "The declaration may ask the voter to acknowledge that knowingly false information can itself be treated as an integrity issue.",
        ],
        important: "Receiving a declaration request does not mean that Solaris Studio or TSBC has concluded that the voter cheated.",
        tags: ["declaration", "contract", "verification", "flagged ballot", "friend voting", "good faith"],
      },
    ]);
  }

  if (chapter.number === 8) {
    return patchRules(
      {
        ...chapter,
        description: "Official times, confirmation rounds, slot allocation, extensions, late submissions and platform failures.",
        atAGlance: [
          "Published timestamps are binding.",
          "Confirmation places are allocated using authoritative server records.",
          "Visual countdowns are convenience displays, not the legal clock.",
          "A widespread official-platform failure can justify reopening or restoration.",
        ],
      },
      [
        {
          id: "8.1",
          title: "Official Schedule & Time Zone",
          summary: "Important SSC events must be published with an exact date, time and time-zone reference.",
          body: [
            "TSBC shall publish the relevant timetable for each edition through Solaris Studio or another official Contest channel. Important deadlines and opening times must identify an exact date, clock time and time zone or UTC offset.",
            "Where CET or CEST is used, the applicable offset at the stated date governs. A participant's local device clock does not redefine an official timestamp.",
          ],
          important: "A countdown may help participants understand a deadline, but the published event timestamp remains authoritative.",
          tags: ["schedule", "calendar", "deadline", "time zone", "cest", "cet", "utc", "timestamp"],
        },
        {
          id: "8.2",
          title: "Authoritative Server Time",
          summary: "Solaris Studio server-side timestamps control disputes about when an online action was received.",
          body: [
            "Where the timing of an online action is disputed, the authoritative record is the relevant server-side timestamp or equivalent trusted submission record maintained by the official system.",
            "A visual countdown, browser timer, screenshot of a local clock or delayed client display does not independently override reliable server records.",
          ],
          important: "If the official interface displays the wrong time because of a Solaris Studio defect, TSBC may apply a remedy under Rules 8.5 and 13.4 rather than pretending the defect never happened.",
          tags: ["countdown", "timer", "server time", "timezone", "deadline bug", "timestamp"],
        },
      ],
      [
        {
          id: "8.7",
          title: "Confirmation Rounds & Slot Allocation",
          summary: "Limited confirmation places are allocated by valid official submissions received after the published opening time, using server-side order.",
          tone: "administrative",
          body: [
            "Where an edition uses a limited confirmation round, TSBC shall announce the opening time, number of available places and required minimum confirmation information before the round opens.",
            "Unless an edition-specific rule states another fair allocation method, available places are allocated in the order valid confirmations are received by the official server after the opening time.",
          ],
          prohibited: [
            "submitting before the official opening through an unintended technical path",
            "bots, scripts or automation designed to beat human participants",
            "duplicate confirmations used to reserve several places for one participant",
            "using additional accounts to obtain multiple participation places",
          ],
          important: "Device latency, a locally inaccurate clock or a countdown reaching zero early does not by itself create a right to a place. A confirmed official-platform defect may justify restoration, re-running the round or another proportionate remedy.",
          examples: [
            { title: "Two users submit almost simultaneously", outcome: "information", detail: "The trusted server receipt order determines priority, not whose phone displayed zero first." },
            { title: "Automated submission script", outcome: "not-allowed", detail: "A script designed to submit the instant the round opens is an unfair technical advantage." },
          ],
          tags: ["confirmation", "confirmation round", "last spot", "slot", "first come", "server timestamp", "automation"],
          relatedRules: ["14.3", "14.5", "15.2"],
        },
        {
          id: "8.8",
          title: "Confirmation Information & Later Editing",
          summary: "A confirmation may require only the information necessary to secure participation; editable fields may be completed later where the edition rules permit it.",
          tone: "conditional",
          body: [
            "Edition-specific regulations may identify which confirmation fields are required to secure a place and which information may be edited or completed later. Participants are not required to provide information before the deadline merely because the interface technically permits it.",
            "Material information that affects eligibility or identity may be locked at a stated deadline or require TSBC approval to change after that point.",
          ],
          important: "TSBC should distinguish clearly between 'required to secure the place', 'required before the entry deadline' and 'optional'.",
          tags: ["confirmation", "edit response", "required fields", "country", "deadline", "form"],
          relatedRules: ["8.7", "15.2"],
        },
      ],
    );
  }

  if (chapter.number === 10) {
    return patchRules(chapter, [
      {
        id: "10.3",
        title: "Third-Party Music, Media & Rights",
        summary: "SSC does not acquire ownership of songs, recordings, artist identities or videos merely because they are used in the fan contest.",
        body: [
          "Rights in submitted songs, recordings, videos, artist names, photographs and other third-party material remain with their respective rights holders. Submission to SSC does not transfer ownership to TSBC, a Host Country or a delegation.",
          "SSC uses third-party material only for the non-commercial operation and presentation of the fan contest through the relevant platforms. Platform rules and rights-holder requirements continue to apply.",
          "If a platform or rights holder requires material to be removed, restricted or replaced, TSBC may take the minimum reasonable action necessary while trying to preserve fair participation.",
        ],
        important: "Internal SSC artist-association rules are competition mechanics only and do not imply real-world ownership, permission or endorsement by the artist.",
        tags: ["copyright", "rights", "artist ownership", "music", "record label", "takedown", "third party"],
      },
    ]);
  }

  if (chapter.number === 11) {
    return patchRules(
      {
        ...chapter,
        description: "Proportionate remedies and sanctions designed to correct the actual rule breach rather than punish unrelated parts of an entry.",
        atAGlance: [
          "The response should target the actual problem.",
          "Votes, entries, privileges, people and delegations can be treated separately.",
          "Intent, history, cooperation and impact matter.",
          "No sanction follows merely because a report or automated flag exists.",
        ],
      },
      [
        {
          id: "11.1",
          title: "Sanction & Remedy Principles",
          summary: "Any response must be necessary, proportionate and connected to the actual violation found.",
          body: [
            "Sanctions and corrective measures exist to protect fairness, safety and the reliable operation of SSC. Every case shall be considered individually after the relevant facts are established.",
            "Where a problem can be corrected directly, TSBC should normally prefer a remedy connected to that problem rather than an unrelated competitive punishment.",
          ],
          bullets: ["seriousness and competitive impact", "intent or recklessness", "previous relevant conduct", "cooperation and prompt correction", "whether the problem can be directly remedied", "consistency with comparable previous cases"],
          important: "A community-conduct issue does not automatically justify deducting song points, and an invalid vote should normally be corrected or invalidated before unrelated penalties are considered.",
          tags: ["sanction", "penalty", "proportional", "intent", "remedy", "direct response"],
        },
        {
          id: "11.2",
          title: "Available Measures",
          summary: "TSBC can choose the measure that fits the breach rather than forcing every case into a fixed points ladder.",
          body: ["Depending on the circumstances, TSBC may use one or more proportionate measures."],
          bullets: [
            "informal correction or reminder",
            "Official Warning",
            "loss of a specific privilege or bonus",
            "rejection or invalidation of an affected vote",
            "correction of an erroneous score or result",
            "competitive points penalty where the breach directly affected competition and a lesser correction is insufficient",
            "temporary loss of jury or televoting rights",
            "entry replacement where a curable eligibility problem is discovered in time",
            "entry disqualification",
            "temporary suspension from one or more editions",
            "long-term or permanent exclusion for exceptionally serious or repeated misconduct",
          ],
          important: "The purpose is to restore fairness and protect participants, not to make every violation fit the same numerical ladder.",
          tags: ["warning", "points", "disqualification", "ban", "suspension", "vote invalidation", "remedy"],
        },
        {
          id: "11.4",
          title: "Typical Responses",
          summary: "Common violations have logical starting responses, while the actual circumstances still control.",
          body: ["The following examples illustrate the normal relationship between a problem and its first-line response. They are not automatic penalties."],
          bullets: [
            "minor first-time administrative mistake → correction or warning",
            "late jury vote → apply the published late-vote consequence or reject the ballot",
            "fraudulent televote → invalidate the affected vote and investigate the responsible voter",
            "ineligible entry discovered before publication → require replacement where reasonably possible",
            "ineligible entry discovered after the competitive phase begins → disqualification may be necessary",
            "vote trading or deliberate coordination → invalidate affected voting and consider suspension or disqualification",
            "continued harassment after warning → personal participation suspension may be appropriate",
            "serious threats, deliberate account compromise or severe manipulation → long-term or permanent exclusion may be justified",
          ],
          tags: ["typical response", "vote trading", "harassment", "ineligible artist", "televote manipulation", "late jury"],
        },
      ],
      [
        {
          id: "11.8",
          title: "Who or What a Sanction Applies To",
          summary: "SSC distinguishes the real participant, delegation, fictional country, entry and individual votes when deciding what should be affected.",
          tone: "administrative",
          body: [
            "A finding shall identify the person, delegation, entry, ballot, account or other Contest object responsible for or affected by the violation. A sanction should attach to the appropriate subject rather than automatically applying to every associated SSC entity.",
            "A personal suspension does not permanently prohibit another eligible person from representing the same fictional country unless a separate rule or finding justifies that result. Likewise, invalidating a vote does not automatically disqualify the voter's country's entry.",
          ],
          important: "Fictional countries do not commit misconduct independently of the real participants acting through them.",
          tags: ["person", "country", "delegation", "entry", "vote", "scope of sanction", "future representative"],
          relatedRules: ["11.1", "11.2"],
        },
        {
          id: "11.9",
          title: "Decision Record",
          summary: "A serious sanction should identify the rule, finding, relevant evidence and reason the chosen measure is proportionate.",
          tone: "integrity",
          body: [
            "A serious sanction decision should record the rule or rules found to have been violated, the essential factual finding, the principal evidence relied upon, the measure imposed and why that measure is proportionate.",
            "Protected reporter identities, private technical information and security-sensitive material may be redacted where necessary, provided the affected participant receives enough information to respond fairly through the appeal process.",
          ],
          tags: ["decision", "reasoning", "evidence", "rule link", "proportionality", "redaction"],
          relatedRules: ["12.1", "14.10", "14.11"],
        },
      ],
    );
  }

  if (chapter.number === 12) {
    return patchRules(chapter, [
      {
        id: "12.3",
        title: "Independent Appeal Review",
        summary: "Serious appeals should receive fresh review by an eligible official who was not the sole original decision-maker whenever reasonably possible.",
        body: [
          "TSBC shall review the challenged decision, the evidence available at the time, the grounds of appeal and any admissible new information. The reviewer may request clarification from the participant or original decision-maker.",
          "For a serious sanction, at least one reviewer who was not the sole original decision-maker should participate where another eligible TSBC official is reasonably available. An official with a significant personal conflict should recuse themselves where replacement is possible.",
        ],
        important: "The purpose of an appeal is genuine reconsideration, not merely asking the original decision-maker whether they still agree with themselves.",
        tags: ["review", "conflict of interest", "recuse", "appeal reviewer", "fresh review", "two officials"],
      },
    ]);
  }

  if (chapter.number === 14) {
    return patchRules(
      chapter,
      [
        {
          id: "14.1",
          title: "Official Online Platforms & Channel Hierarchy",
          summary: "Solaris Studio is SSC's primary administration platform, while TSBC may designate fallback official channels when necessary.",
          body: [
            "Solaris Studio shall normally serve as SSC's primary system for accounts, confirmations, entries, voting, results, administration and Contest history. TSBC may designate another official channel where a function is unavailable or an emergency requires a fallback.",
            "Where two official channels accidentally publish conflicting operational information, TSBC shall clarify which instruction controls and, where necessary, take a fair corrective measure for participants who reasonably relied on the conflicting official information.",
          ],
          important: "A message in an unofficial private chat does not silently amend a published Solaris Studio rule or deadline.",
          tags: ["solaris studio", "platform", "official channel", "discord", "instagram", "conflicting information", "fallback"],
        },
      ],
      [
        {
          id: "14.13",
          title: "Technical Data Minimisation",
          summary: "SSC may process technical data needed for security and integrity, but access and disclosure should be limited to what the task requires.",
          tone: "integrity",
          body: [
            "Solaris Studio may process technical information reasonably necessary to operate the service, prevent duplicate participation or voting, investigate suspected abuse and protect system security. Access should be limited to authorised administrators or systems with a genuine need for the information.",
            "Technical data should not be published merely to prove that an investigation occurred. Public explanations should use anonymised, aggregated or redacted information where that can explain the decision adequately.",
          ],
          prohibited: ["publishing a participant's IP address as entertainment or punishment", "sharing private account-security data with unrelated participants", "collecting sensitive technical data with no operational or integrity purpose"],
          tags: ["privacy", "ip", "technical data", "logs", "minimisation", "admin access"],
          relatedRules: ["14.5", "14.6", "14.10"],
        },
      ],
    );
  }

  if (chapter.number === 15) {
    return patchRules(
      {
        ...chapter,
        title: "Edition Regulations, Amendments & Interpretation",
        shortTitle: "Edition Rules",
        description: "How permanent SSC law and edition-specific configuration work together, how changes are announced and which version controls.",
        atAGlance: [
          "General Regulations stay stable across editions.",
          "Each edition publishes its own dates, formats and configurable limits.",
          "Edition rules supplement rather than silently rewrite general law.",
          "Changes must identify when they take effect.",
        ],
      },
      [
        {
          id: "15.2",
          title: "Edition-Specific Regulations",
          summary: "Each edition may publish a compact regulation sheet containing the variables that genuinely change from edition to edition.",
          body: [
            "TSBC shall publish edition-specific regulations or an equivalent official edition configuration covering the matters that vary for that edition. These rules supplement the General Regulations and should be available before the relevant process begins.",
          ],
          bullets: [
            "confirmation opening time, available places and allocation method",
            "entry-submission deadline",
            "number of Semi-Finals or other qualification format",
            "automatic finalists or special qualification rights",
            "jury and televote formats",
            "point scales, vote limits and any bonus system",
            "voting opening and closing times",
            "results schedule",
            "host and creative details",
            "any clearly announced edition-specific exception expressly permitted by the General Regulations",
          ],
          important: "Edition configuration should not be buried across unrelated messages where participants must reconstruct the rules themselves.",
          tags: ["edition rules", "specific edition", "configuration", "voting format", "confirmation", "deadlines"],
        },
      ],
      [
        {
          id: "15.6",
          title: "Hierarchy of Rules",
          summary: "General Regulations control permanent principles; edition regulations control published edition variables; later informal messages do not silently override either.",
          tone: "administrative",
          body: [
            "Where the General Regulations expressly allow an edition-specific matter to vary, the published edition regulation controls that variable for the edition. In all other cases, the General Regulations remain controlling.",
            "If TSBC intentionally creates an exception to a General Regulation, the exception must be clearly identified as such, state its scope and be announced before it can fairly affect participants, except where an urgent integrity or technical correction is required under Rule 15.1.",
          ],
          important: "Silence, private custom or an old edition's practice does not override the current written regulations.",
          tags: ["hierarchy", "precedence", "general rules", "edition rules", "exception", "old precedent"],
          relatedRules: ["15.1", "15.2", "15.4"],
        },
      ],
    );
  }

  return chapter;
});

export const SSC_RULE_CHAPTERS: SscRuleChapter[] = chapters;

export const SSC_RULEBOOK = {
  title: "Solaris Song Contest Official Regulations",
  version: "3.0",
  status: "Online-first Studio edition",
  publisher: "Terra Solaris Broadcasting Coalition (TSBC)",
  description: "The permanent General Regulations for the completely online, fan-organised Solaris Song Contest, supplemented by edition-specific regulations for variables such as dates, formats and voting configuration.",
} as const;

export const SSC_RULES = SSC_RULE_CHAPTERS.flatMap((chapter) =>
  chapter.rules.map((rule) => ({ ...rule, chapterNumber: chapter.number, chapterTitle: chapter.title, chapterSlug: chapter.slug })),
);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  friend: ["friend voting", "coordination", "relationships", "alliance"],
  friends: ["friend voting", "coordination", "relationships", "alliance"],
  esc: ["eurovision"],
  ns: ["national selection"],
  late: ["deadline", "extension"],
  deadline: ["late", "schedule", "time", "server timestamp"],
  timer: ["countdown", "server time", "timestamp"],
  confirmation: ["slot", "place", "first come", "opening time"],
  slot: ["confirmation", "place", "first come"],
  ban: ["sanction", "suspension", "permanent exclusion"],
  cheating: ["integrity", "manipulation", "vote trading", "fake account"],
  cheat: ["integrity", "manipulation", "vote trading", "fake account"],
  report: ["anonymous", "integrity", "evidence"],
  anonymous: ["report", "confidential", "privacy", "recovery key"],
  bot: ["automation", "script"],
  bug: ["exploit", "technical", "vulnerability"],
  host: ["hosting", "creative director", "winner"],
  artist: ["eligibility", "spotify", "reuse", "eurovision"],
  copyright: ["third party", "rights holder", "music rights"],
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function getRuleById(id: string) {
  return SSC_RULES.find((rule) => rule.id === id) ?? null;
}

export function getChapterBySlug(slug: string) {
  return SSC_RULE_CHAPTERS.find((chapter) => chapter.slug === slug) ?? null;
}

export function searchSscRules(query: string) {
  const normalized = normalize(query);
  if (!normalized) return SSC_RULES;

  const words = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set(words);
  for (const word of words) {
    for (const synonym of SEARCH_SYNONYMS[word] ?? []) expanded.add(synonym);
  }

  return SSC_RULES
    .map((rule) => {
      const haystack = normalize([
        rule.id,
        rule.title,
        rule.summary,
        rule.chapterTitle,
        rule.tags.join(" "),
        rule.body.join(" "),
        (rule.bullets ?? []).join(" "),
        (rule.allowed ?? []).join(" "),
        (rule.prohibited ?? []).join(" "),
        (rule.examples ?? []).map((example) => `${example.title} ${example.detail}`).join(" "),
      ].join(" "));
      let score = 0;
      if (haystack.includes(normalized)) score += 12;
      for (const term of expanded) {
        if (haystack.includes(term)) score += term.includes(" ") ? 4 : 2;
        if (normalize(rule.title).includes(term)) score += 4;
        if (rule.tags.some((tag) => normalize(tag).includes(term))) score += 3;
      }
      return { rule, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true }))
    .map((item) => item.rule);
}

export const QUICK_RULE_IDS = ["4.4", "4.5", "4.6", "7.5", "7.7", "8.7", "11.2", "11.8", "14.4", "14.8", "15.2"] as const;
export const QUICK_RULES = QUICK_RULE_IDS.map((id) => getRuleById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getRuleById>>[];

export const RULEBOOK_STATS = {
  chapters: SSC_RULE_CHAPTERS.length,
  rules: SSC_RULES.length,
};
