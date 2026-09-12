export type RuleTone =
  | "allowed"
  | "prohibited"
  | "conditional"
  | "integrity"
  | "administrative"
  | "information";

export type RuleExample = {
  title: string;
  outcome: "allowed" | "not-allowed" | "depends" | "information";
  detail: string;
};

export type SscRule = {
  id: string;
  title: string;
  summary: string;
  tone: RuleTone;
  body: string[];
  bullets?: string[];
  allowed?: string[];
  prohibited?: string[];
  important?: string;
  examples?: RuleExample[];
  tags: string[];
  relatedRules?: string[];
};

export type SscRuleChapter = {
  number: number;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  accent: "sky" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "indigo";
  atAGlance: string[];
  rules: SscRule[];
};

export const SSC_RULEBOOK = {
  title: "Solaris Song Contest Official Regulations",
  version: "2.0",
  status: "Studio edition",
  publisher: "Terra Solaris Broadcasting Coalition (TSBC)",
  description:
    "The official rules for participating in, voting in, hosting and administering the completely online Solaris Song Contest.",
} as const;

export const SSC_RULE_CHAPTERS: SscRuleChapter[] = [
  {
    number: 1,
    slug: "governance",
    title: "Governance",
    shortTitle: "Governance",
    description: "Who runs SSC, who makes decisions and what each official role is responsible for.",
    icon: "Landmark",
    accent: "sky",
    atAGlance: [
      "TSBC organises and protects the integrity of SSC.",
      "The Contest Director manages each edition.",
      "The previous winning delegation normally provides the Creative Director.",
      "Every participating country has one Head of Delegation.",
    ],
    rules: [
      {
        id: "1.1",
        title: "Nature of the Contest",
        summary: "SSC is an independent, completely online fan-organised music contest using fictional countries and real-world music.",
        tone: "information",
        body: [
          "The Solaris Song Contest (SSC) is an international online fan-organised music competition involving fictional countries and real-world music.",
          "The Contest is conducted entirely online. References to hosting, broadcasts, stages, delegations, countries or televoting describe SSC and its fictional contest universe and do not imply the existence of a physical event.",
          "SSC is an independent fan project. Participation does not imply an official relationship with any real-world artist, broadcaster, record label, streaming service or other music organisation.",
        ],
        tags: ["online", "fan contest", "fictional countries", "status", "what is ssc"],
        relatedRules: ["1.2", "10.3"],
      },
      {
        id: "1.2",
        title: "TSBC Authority",
        summary: "TSBC is responsible for running SSC fairly, verifying entries and results, and interpreting the regulations.",
        tone: "administrative",
        body: [
          "The Solaris Song Contest is organised by the Terra Solaris Broadcasting Coalition (TSBC). TSBC is responsible for protecting the Contest's integrity, ensuring fair competition and maintaining these Regulations.",
        ],
        bullets: [
          "organise each edition of the Contest",
          "administer Solaris Studio and official Contest systems",
          "verify entries and eligibility",
          "supervise jury voting and televoting",
          "verify and publish official results",
          "investigate alleged rule violations",
          "issue sanctions where appropriate",
          "resolve administrative disputes",
          "interpret these Regulations where necessary",
        ],
        important:
          "Where the Regulations do not expressly cover a situation, TSBC shall decide it using fairness, consistency, transparency and equal treatment as guiding principles.",
        tags: ["tsbc", "authority", "administration", "decisions", "interpretation"],
        relatedRules: ["1.3", "12.1", "15.3"],
      },
      {
        id: "1.3",
        title: "Contest Director",
        summary: "The Contest Director has overall responsibility for the administration of each SSC edition.",
        tone: "administrative",
        body: [
          "The Contest Director is responsible for the overall administration of the Solaris Song Contest and for ensuring that delegations are treated consistently.",
        ],
        bullets: [
          "supervise the Contest",
          "approve or reject entries",
          "publish deadlines and instructions",
          "verify results",
          "enforce these Regulations",
          "resolve disputes",
          "ensure equal treatment of delegations",
        ],
        tags: ["contest director", "director", "administration", "official"],
        relatedRules: ["1.2", "12.3"],
      },
      {
        id: "1.4",
        title: "Creative Director",
        summary: "The previous winning Head of Delegation normally helps shape the next edition's creative identity.",
        tone: "administrative",
        body: [
          "The Creative Director shall normally be the Head of Delegation representing the previous winning country. The role is creative rather than disciplinary or electoral.",
        ],
        bullets: [
          "propose the Contest slogan",
          "develop the visual identity and artwork ideas",
          "contribute to the stage concept",
          "suggest interval acts and promotional ideas",
          "propose innovations for future editions",
        ],
        important: "The Creative Director does not control voting, sanctions, entry eligibility or official results.",
        tags: ["creative director", "winner", "host", "visual identity", "stage"],
        relatedRules: ["6.3"],
      },
      {
        id: "1.5",
        title: "Heads of Delegation",
        summary: "Every participating country has one HoD who represents the delegation in official Contest matters.",
        tone: "administrative",
        body: [
          "Each participating country shall have one Head of Delegation (HoD). The HoD represents their country in official SSC matters and is the primary contact between the delegation and TSBC.",
        ],
        bullets: [
          "confirm participation",
          "submit and verify entries",
          "meet Contest deadlines",
          "submit required jury votes where applicable",
          "communicate with TSBC",
          "ensure the delegation follows these Regulations",
        ],
        tags: ["hod", "head of delegation", "delegation", "responsibility"],
        relatedRules: ["1.6", "8.1"],
      },
      {
        id: "1.6",
        title: "Participants",
        summary: "Participation is voluntary, but taking part means agreeing to follow the applicable SSC rules.",
        tone: "information",
        body: [
          "Participation in SSC is voluntary. Once a participant or delegation takes part in an official Contest process, they agree to comply with the Regulations and applicable edition-specific instructions.",
        ],
        bullets: ["act respectfully", "compete fairly", "follow the Regulations", "contribute to a welcoming community"],
        tags: ["participants", "participation", "agreement", "community"],
        relatedRules: ["3.1", "3.3"],
      },
    ],
  },
  {
    number: 2,
    slug: "definitions",
    title: "Definitions",
    shortTitle: "Definitions",
    description: "The terms used throughout the official SSC rules and Solaris Studio.",
    icon: "BookOpen",
    accent: "indigo",
    atAGlance: ["The same terms mean the same thing throughout SSC.", "A country is fictional; a participant is a real person.", "Solaris Studio is SSC's primary online administration platform."],
    rules: [
      {
        id: "2.1",
        title: "Official Terms",
        summary: "Key terms are defined consistently across the Rulebook and Solaris Studio.",
        tone: "information",
        body: [
          "SSC means the Solaris Song Contest. TSBC means the Terra Solaris Broadcasting Coalition. An Edition is one complete occurrence of SSC.",
          "A Participant is a real person taking part in SSC. A Country is a fictional country registered within SSC. A Delegation is the participant or participants representing that country. The Head of Delegation is the delegation's primary official representative.",
          "An Entry is the song and artist officially representing a country. A Confirmation is the process through which a country secures or declares participation in an edition. A National Selection is a delegation-run selection process, while an Internal Selection is made directly by the delegation.",
          "Solaris Studio is SSC's primary online administration platform. An Official Contest Channel is Solaris Studio or another channel expressly designated by TSBC. A Jury Vote is the official delegation vote. A Televote is an individual vote submitted through the official public voting system.",
          "An Official Deadline is the date and time published by TSBC for an action. An Official Result is a result verified and formally published by TSBC. Force Majeure is an exceptional circumstance beyond reasonable control that prevents normal Contest operation.",
        ],
        tags: ["definition", "terms", "country", "delegation", "entry", "jury", "televote", "deadline"],
      },
    ],
  },
  {
    number: 3,
    slug: "community",
    title: "Community & Fair Play",
    shortTitle: "Community",
    description: "Respect, inclusivity and the line between healthy competition and misconduct.",
    icon: "UsersRound",
    accent: "emerald",
    atAGlance: ["Criticism of songs and decisions is allowed.", "Harassment and discrimination are not allowed.", "Friendship is welcome; manipulation is not.", "Outside conduct is relevant only when it clearly affects SSC."],
    rules: [
      {
        id: "3.1",
        title: "Respect",
        summary: "Participants must treat each other with reasonable respect in SSC spaces.",
        tone: "prohibited",
        body: ["SSC is a community built around music, creativity and competition. Participants shall treat one another with courtesy and reasonable respect."],
        prohibited: ["bullying or harassment", "personal threats or intimidation", "hate speech or discrimination", "doxxing", "repeated unwanted contact", "targeted abuse", "deliberately provoking serious conflict"],
        tags: ["respect", "harassment", "bullying", "threats", "doxxing", "conduct"],
        relatedRules: ["3.2", "3.6", "11.3"],
      },
      {
        id: "3.2",
        title: "Criticism & Disagreement",
        summary: "Songs, rules, results and TSBC decisions may be criticised in good faith.",
        tone: "allowed",
        body: [
          "Participants are free to criticise songs, rankings, rules, decisions and the organisation of SSC in good faith. Criticism does not become misconduct merely because it is negative or strongly expressed.",
        ],
        allowed: ["saying that you dislike a song", "disagreeing with a TSBC decision", "arguing that a rule should change", "discussing voting or results"],
        prohibited: ["turning criticism into targeted harassment", "threatening a participant", "knowingly fabricating harmful factual claims", "discriminatory abuse"],
        tags: ["criticism", "free speech", "songs", "tsbc", "disagreement"],
        relatedRules: ["3.1", "10.6"],
      },
      {
        id: "3.3",
        title: "Inclusivity",
        summary: "Participants must not be discriminated against because of who they are.",
        tone: "prohibited",
        body: ["SSC welcomes participants from all backgrounds. Discriminatory treatment or abuse is prohibited."],
        prohibited: ["discrimination based on nationality, ethnicity or race", "religious discrimination", "gender or sexual-orientation discrimination", "disability discrimination", "other comparable protected-characteristic discrimination"],
        tags: ["inclusivity", "discrimination", "hate speech", "community"],
        relatedRules: ["3.1"],
      },
      {
        id: "3.4",
        title: "Fair Competition",
        summary: "Every delegation must compete honestly and may not seek an artificial competitive advantage.",
        tone: "integrity",
        body: ["Participants and delegations shall compete honestly and shall not intentionally undermine the fairness of SSC."],
        prohibited: ["manipulating results", "coordinating votes improperly", "submitting deliberately false information", "using fake accounts for competitive advantage", "knowingly exploiting a loophole or technical vulnerability for competitive benefit"],
        tags: ["fair play", "manipulation", "loophole", "fake account", "competition"],
        relatedRules: ["7.5", "14.4"],
      },
      {
        id: "3.5",
        title: "Community Spirit",
        summary: "Friendship, collaboration, discovery and fictional country culture are encouraged.",
        tone: "allowed",
        body: ["SSC encourages friendship, creativity and collaboration provided that these do not compromise competitive independence."],
        allowed: ["supporting other delegations", "discovering and recommending music", "creating fictional country culture", "welcoming new delegations", "being friends with other participants"],
        tags: ["community", "friends", "collaboration", "music discovery"],
        relatedRules: ["7.7"],
      },
      {
        id: "3.6",
        title: "Scope of Community Rules",
        summary: "Outside conduct is relevant only when it has a clear and substantial SSC connection.",
        tone: "conditional",
        body: [
          "These community standards apply within official SSC spaces. Conduct outside official channels may be considered only where it has a clear and substantial connection to participant safety, Contest administration, voting manipulation or another material SSC integrity issue.",
        ],
        important: "TSBC does not claim general authority over participants' unrelated private lives or unrelated online activity.",
        tags: ["jurisdiction", "outside conduct", "discord", "social media", "scope"],
        relatedRules: ["3.1", "10.6"],
      },
    ],
  },
  {
    number: 4,
    slug: "entries",
    title: "Entry Requirements",
    shortTitle: "Entries",
    description: "Song, artist, video, popularity, Eurovision history and artist-reuse requirements.",
    icon: "Music2",
    accent: "violet",
    atAGlance: ["One entry per country.", "Spotify availability and suitable video material are required.", "Artist popularity and Eurovision-history limits apply.", "An artist may appear in SSC no more than three times."],
    rules: [
      {
        id: "4.1",
        title: "General Eligibility",
        summary: "Each participating country may submit one eligible entry per edition.",
        tone: "administrative",
        body: ["Each participating country may submit one entry per edition. Submission does not itself guarantee acceptance; TSBC verifies eligibility before the entry becomes official."],
        tags: ["entry", "one song", "submission", "eligibility"],
        relatedRules: ["4.9"],
      },
      {
        id: "4.2",
        title: "Song Requirements",
        summary: "The original studio version must be available on Spotify and must not come from an ineligible Eurovision-related competition.",
        tone: "conditional",
        body: ["Each entry shall be available on Spotify and submitted in its original studio version unless TSBC expressly authorises another version."],
        prohibited: ["remixes without approval", "live versions without approval", "alternative versions without approval", "songs previously entered in Eurovision", "Junior Eurovision songs", "American Song Contest entries", "songs from another Eurovision-related competition designated ineligible by TSBC"],
        tags: ["spotify", "song", "remix", "live version", "eurovision", "jesc", "american song contest"],
        relatedRules: ["4.3", "4.5"],
      },
      {
        id: "4.3",
        title: "Music Video",
        summary: "Every entry needs suitable video material for SSC presentation.",
        tone: "conditional",
        body: ["Every entry shall include suitable accompanying video material. An official music video is preferred, but alternatives may be accepted where no official music video exists."],
        allowed: ["official music video", "official visualiser", "official lyric video", "another suitable video approved by TSBC", "an SSC edit approved or prepared by TSBC"],
        important: "Unless otherwise announced, Instagram previews may be up to 25 seconds and Grand Final presentation clips up to 90 seconds.",
        tags: ["video", "music video", "visualizer", "visualiser", "lyric video", "clip"],
        relatedRules: ["10.4"],
      },
      {
        id: "4.4",
        title: "Artist Popularity",
        summary: "Artists normally need fewer than 25M monthly Spotify listeners and fewer than 20M views on the relevant official YouTube video.",
        tone: "conditional",
        body: [
          "At the time eligibility is checked, an artist must normally have fewer than 25 million monthly Spotify listeners and the relevant official music video must normally have fewer than 20 million YouTube views.",
          "The artist must also not be considered excessively mainstream or excessively used under the Contest's music-discovery standards. TSBC may reject an artist whose popularity is clearly inconsistent with the spirit of SSC.",
        ],
        important: "A later increase in listeners or views does not normally make an already accepted entry retroactively ineligible.",
        examples: [
          { title: "Artist grows after acceptance", outcome: "allowed", detail: "An artist has 23.8M monthly listeners when accepted and later passes 25M. The accepted entry normally remains eligible." },
          { title: "Threshold already exceeded", outcome: "not-allowed", detail: "An artist has 27M monthly listeners when checked. The entry does not meet the normal popularity requirement." },
        ],
        tags: ["spotify", "monthly listeners", "25 million", "youtube", "20 million", "mainstream", "overused", "popular artist"],
        relatedRules: ["4.5", "4.9"],
      },
      {
        id: "4.5",
        title: "Previous Eurovision Participation",
        summary: "Eurovision artists and post-2015 National Selection artists are not eligible under the current system.",
        tone: "conditional",
        body: ["Previous participation in Eurovision-related competitions affects artist eligibility as follows."],
        allowed: ["National Selection participation before 2015", "former Junior Eurovision artists who are no longer underage and are not overused"],
        prohibited: ["artists who participated in the Eurovision Song Contest", "artists who participated in a National Selection after 2015", "Junior Eurovision songs themselves"],
        tags: ["eurovision", "esc", "national selection", "ns", "2015", "junior eurovision", "jesc"],
        relatedRules: ["4.2", "4.4"],
      },
      {
        id: "4.6",
        title: "Artist Reuse & Representation Rights",
        summary: "An artist may appear at most three times and normally remains associated with the country they previously represented.",
        tone: "conditional",
        body: [
          "An artist may represent SSC a maximum of three times. If an artist has previously represented a country, they may normally only represent that same country again unless the original delegation expressly grants another country permission to use the artist.",
          "Representation rights are an internal SSC competition mechanic only. They do not imply real-world ownership, endorsement or control of the artist.",
        ],
        important: "Previous SSC winning artists may not compete again.",
        allowed: ["the same country using its previous artist again, within the three-appearance limit", "another country using the artist after valid permission is granted"],
        prohibited: ["a fourth SSC appearance", "a previous SSC winning artist returning as a competing artist", "another country using an associated artist without required permission"],
        examples: [
          { title: "Returning artist", outcome: "allowed", detail: "An artist represented Oland once. Oland may select the artist again, provided the artist remains otherwise eligible and has not won SSC." },
          { title: "Different country", outcome: "depends", detail: "An artist previously represented Oland. Vendia may use the artist only if the required permission is granted." },
        ],
        tags: ["artist reuse", "artist rights", "representation rights", "permission", "three times", "3 times", "returning artist", "previous winner"],
        relatedRules: ["4.4", "4.7", "11.4"],
      },
      {
        id: "4.7",
        title: "Collaborations & Artist Identity",
        summary: "Credited primary and featured artists may each be checked for eligibility and past SSC participation.",
        tone: "conditional",
        body: ["Where an entry has several officially credited primary or featured artists, TSBC may assess the eligibility and SSC participation history of each credited artist."],
        important: "Changing a stage name does not reset an artist's SSC history or representation status.",
        tags: ["collaboration", "featured artist", "feat", "stage name", "group", "artist identity"],
        relatedRules: ["4.6"],
      },
      {
        id: "4.8",
        title: "Originality & Diversity",
        summary: "All genres and languages are welcome, while discovery and originality are strongly encouraged.",
        tone: "allowed",
        body: ["SSC encourages diverse entries representing different genres, languages, cultures and creative approaches. No genre quota applies."],
        tags: ["genre", "language", "originality", "diversity", "music discovery"],
      },
      {
        id: "4.9",
        title: "Selection Methods",
        summary: "National Selections and Internal Selections have equal status in SSC.",
        tone: "allowed",
        body: ["Countries may choose their entries through a National Selection or an Internal Selection. Both methods are equally recognised by TSBC."],
        tags: ["national selection", "internal selection", "selection method"],
      },
      {
        id: "4.10",
        title: "Entry Verification",
        summary: "Delegations should check eligibility before submission; TSBC may independently verify any entry.",
        tone: "administrative",
        body: ["Delegations are expected to verify their entry before submission. TSBC may request additional evidence or conduct its own checks before acceptance."],
        bullets: ["Spotify availability and listener count", "YouTube statistics", "artist eligibility", "previous contest participation", "artist-reuse status", "video availability"],
        tags: ["verify", "entry checker", "eligibility check", "statistics"],
        relatedRules: ["4.2", "4.4", "4.5", "4.6"],
      },
    ],
  },
  {
    number: 5,
    slug: "format",
    title: "Contest Format",
    shortTitle: "Format",
    description: "Editions, semi-finals, running order, official results and tie-breaks.",
    icon: "PanelsTopLeft",
    accent: "cyan",
    atAGlance: ["SSC runs in numbered editions.", "Two Semi-Finals and one Grand Final are the normal format.", "TSBC determines the running order.", "Results are final only after verification."],
    rules: [
      { id: "5.1", title: "General Format", summary: "SSC normally consists of two Semi-Finals and one Grand Final.", tone: "administrative", body: ["The Solaris Song Contest operates in numbered editions and shall normally consist of two Semi-Finals and one Grand Final. TSBC may organise more Semi-Finals where participation numbers require it."], important: "The format of an edition shall be announced before the competitive stage begins.", tags: ["format", "semi final", "semifinal", "grand final", "edition"] },
      { id: "5.2", title: "Participating Countries", summary: "Each fictional country may submit one delegation and competes under its registered name.", tone: "administrative", body: ["Each fictional country may submit one delegation. Countries compete under their registered SSC name. A country-name change requires TSBC approval."], tags: ["country", "fictional country", "country name", "delegation"] },
      { id: "5.3", title: "Running Order", summary: "TSBC creates the running order with musical variety and the overall show in mind.", tone: "administrative", body: ["The official running order is determined by TSBC. Musical variety, pacing and overall entertainment value may be considered when placing entries."], important: "A running-order position does not create a separate competitive right or guarantee of advantage.", tags: ["running order", "draw", "position", "pacing"] },
      { id: "5.4", title: "Official Results", summary: "The announced voting system determines the result; the highest total score normally wins.", tone: "administrative", body: ["Results shall be determined using the official voting system announced for the edition. Unless otherwise specified, the country receiving the highest total score wins."], tags: ["results", "winner", "points", "score"] },
      { id: "5.5", title: "Tie-Break", summary: "Equal totals are separated using the official SSC tie-break order.", tone: "administrative", body: ["Where two or more countries finish on equal points, the tie shall be broken in the following order."], bullets: ["highest jury vote score", "highest number of countries awarding points", "highest individual score received", "highest televote score", "earliest running-order position", "final TSBC determination if equality remains"], tags: ["tie", "tie break", "tiebreak", "equal points"], relatedRules: ["7.11"] },
      { id: "5.6", title: "Official Winner", summary: "The winner receives the SSC title, trophy and hosting rights for the following edition.", tone: "information", body: ["The country with the verified winning result is declared the official winner of that edition and receives hosting rights for the following edition together with the official SSC Trophy."], tags: ["winner", "trophy", "hosting rights"], relatedRules: ["6.1"] },
      { id: "5.7", title: "Result Verification", summary: "Results remain provisional until required verification has finished.", tone: "integrity", body: ["TSBC may delay publication while votes, calculations, eligibility or suspected irregularities are checked. If a material error is discovered after publication, TSBC may correct the official result where justified."], tags: ["verification", "result correction", "provisional", "investigation"], relatedRules: ["7.11"] },
    ],
  },
  {
    number: 6,
    slug: "hosting",
    title: "Hosting",
    shortTitle: "Hosting",
    description: "What online hosting means and how the winner helps shape the next SSC edition.",
    icon: "Trophy",
    accent: "amber",
    atAGlance: ["The winner receives first right to host the next edition.", "Hosting is entirely online and creative.", "Joint hosting and declining hosting are possible.", "TSBC retains operational authority."],
    rules: [
      { id: "6.1", title: "Hosting Rights", summary: "The winning delegation receives the right to host the next edition online.", tone: "allowed", body: ["The winner of each edition receives the first right to host the following Solaris Song Contest. Hosting is a creative online role and does not require a physical event."], allowed: ["host independently", "host jointly with another delegation", "decline hosting rights"], important: "If hosting is declined, TSBC appoints an alternative host. Hosting rights do not automatically pass to the runner-up.", tags: ["host", "hosting rights", "winner", "cohost", "co-host", "decline"] },
      { id: "6.2", title: "Host Responsibilities", summary: "The Host Country works with TSBC on the edition's creative presentation.", tone: "administrative", body: ["The Host Country shall work alongside TSBC to organise the creative presentation of the edition."], bullets: ["visual identity", "Contest theme and slogan", "promotional activity", "interval acts", "online presentation and fictional host setting"], important: "Operational authority remains with TSBC.", tags: ["host responsibilities", "theme", "artwork", "promotion", "interval act"] },
      { id: "6.3", title: "Creative Director", summary: "The previous winner's HoD normally becomes Creative Director for the next edition.", tone: "administrative", body: ["The Head of Delegation of the previous winning country shall normally serve as Creative Director and contribute ideas for artwork, branding, stage concepts, interval acts, promotional events and future innovation."], tags: ["creative director", "winner", "stage", "artwork"], relatedRules: ["1.4"] },
      { id: "6.4", title: "Contest Identity", summary: "Each edition has its own coherent slogan, artwork, branding and stage concept.", tone: "information", body: ["Each edition shall normally feature its own slogan, artwork, visual identity, logo package, stage concept and promotional graphics. These elements should remain coherent throughout the edition."], tags: ["identity", "slogan", "logo", "artwork", "stage"] },
      { id: "6.5", title: "Host Inactivity", summary: "TSBC may take over unfinished creative responsibilities if the host becomes unavailable.", tone: "conditional", body: ["If the Host Country or Creative Director becomes unavailable or does not provide necessary creative material within the required timeframe, TSBC may assume those responsibilities so the edition can continue."], important: "Taking over unfinished tasks does not automatically remove the country's status as Host Country.", tags: ["inactive host", "host unavailable", "deadline", "creative director"] },
    ],
  },
  {
    number: 7,
    slug: "voting",
    title: "Voting",
    shortTitle: "Voting",
    description: "Jury voting, televoting, promotion, friend voting and integrity checks.",
    icon: "Vote",
    accent: "violet",
    atAGlance: ["Vote according to your genuine opinion.", "No self-voting or vote trading.", "Friendships are allowed.", "Statistical flags may trigger review but are not proof by themselves."],
    rules: [
      { id: "7.1", title: "Voting Principles", summary: "Votes should reflect each voter's own genuine assessment of the entries.", tone: "integrity", body: ["Votes shall be based primarily on the voter's genuine opinion of the competing entries. Participants may consider originality, musical quality, creativity, production and overall impact, but no participant is required to use exactly the same criteria as another."], tags: ["voting", "genuine preference", "criteria", "quality"] },
      { id: "7.2", title: "Self-Voting", summary: "A country may not vote for itself through jury voting or televoting.", tone: "prohibited", body: ["A country may not award points or votes to itself. Solaris Studio may technically prevent self-voting, and attempts to bypass that restriction are prohibited."], prohibited: ["jury self-voting", "televote self-voting", "using another account to bypass self-voting restrictions"], tags: ["self vote", "self-voting", "own country"], relatedRules: ["7.5"] },
      { id: "7.3", title: "Jury Voting", summary: "Every required delegation jury ballot must be independent and submitted before the deadline.", tone: "administrative", body: ["Where jury voting is used, each required delegation shall submit one official jury ranking before the published deadline. The ranking must be determined independently by that delegation."], tags: ["jury", "jury vote", "ranking", "deadline"], relatedRules: ["7.5", "8.3"] },
      { id: "7.4", title: "Televoting", summary: "Only votes submitted through the official televoting system and within its limits are accepted.", tone: "administrative", body: ["Where public voting is used, TSBC shall publish the official voting procedure before voting opens. Solaris Studio may define the number of votes, minimum number of supported countries, maximum support per country and other round-specific limits."], important: "Fraudulent, duplicated or technically invalid votes may be rejected.", tags: ["televote", "public voting", "vote limit", "voters"], relatedRules: ["7.5", "14.3"] },
      { id: "7.5", title: "Voting Integrity", summary: "Vote trading, coordinated voting, fake accounts and attempts to control another voter's ballot are prohibited.", tone: "integrity", body: ["Every voter and delegation must make voting decisions independently. No participant may arrange, fabricate or manipulate votes in a way that undermines independent competition."], prohibited: ["vote trading", "coordinated voting agreements", "asking participants to exchange votes", "using fake accounts", "duplicate voting", "automated voting", "manipulating public voting", "determining another delegation's independent ranking", "intentionally false information during an integrity check"], tags: ["vote trading", "coordination", "collusion", "fake account", "duplicate vote", "manipulation", "friend voting"], relatedRules: ["7.6", "7.7", "7.8", "11.4"] },
      { id: "7.6", title: "Promotion vs Manipulation", summary: "General promotion is welcome; reciprocal or targeted voting deals are not.", tone: "conditional", body: ["Delegations may promote their entries and ask for support. Promotion becomes prohibited voting manipulation when it includes reciprocal voting arrangements, rewards or instructions designed to control a specific person's ballot."], allowed: ["sharing your entry", "asking people to support the entry if they enjoy it", "encouraging people to participate in the televote"], prohibited: ["promising points in return for points", "offering a benefit for a particular score", "telling a specific voter how to rank entries as part of an agreement"], examples: [{ title: "Normal promotion", outcome: "allowed", detail: "‘Vote for Oland if you enjoyed our entry’ is ordinary promotion." }, { title: "Reciprocal deal", outcome: "not-allowed", detail: "‘Give us 10 and we will give you 10’ is vote trading." }], tags: ["promotion", "campaigning", "vote for", "exchange votes", "10 points"], relatedRules: ["7.5"] },
      { id: "7.7", title: "Friend Voting", summary: "Friendship does not invalidate a vote; the vote must still be the voter's genuine independent preference.", tone: "integrity", body: ["Friendships between SSC participants are permitted and expected. A participant may genuinely prefer a friend's entry and award it a high score. Personal relationships become an integrity concern only where they improperly replace or coordinate genuine independent voting."], important: "A voting pattern alone shall not constitute sufficient evidence of misconduct.", examples: [{ title: "Friend's song is your favourite", outcome: "allowed", detail: "You genuinely rank a friend's entry first because it is your favourite song. Friendship alone does not invalidate the vote." }, { title: "Friends agree to support each other", outcome: "not-allowed", detail: "Two participants agree beforehand to give each other high scores regardless of their entries. That is coordinated voting." }], tags: ["friend", "friends", "friend voting", "relationships", "favouritism", "favoritism"], relatedRules: ["7.5", "7.8", "7.9", "7.10"] },
      { id: "7.8", title: "Automated Integrity Analysis", summary: "Solaris Studio may detect unusual patterns, but an automated flag is a review signal rather than a verdict.", tone: "integrity", body: ["Solaris Studio may analyse voting behaviour for indicators such as unusual reciprocity, concentration, historical relationships and other statistical patterns. These systems help prioritise review and do not independently determine whether misconduct occurred."], important: "Automated risk scores and statistical anomalies are evidence signals, not proof of intent or guilt.", tags: ["algorithm", "automated", "flag", "friend voting model", "risk score", "analysis"], relatedRules: ["7.7", "7.9", "7.10"],
      },
      { id: "7.9", title: "Voting Integrity Declaration", summary: "A flagged ballot may require the voter to confirm that it was genuine and independently made.", tone: "conditional", body: ["Where a ballot is selected for additional verification, TSBC may ask the voter to confirm that the ballot reflects genuine preferences, was made independently and was not part of a voting arrangement."], important: "Being asked for a declaration does not mean that a rule violation has already been found.", tags: ["declaration", "contract", "verification", "flagged ballot", "friend voting"], relatedRules: ["7.8", "7.10"] },
      { id: "7.10", title: "Voting Investigations & Evidence", summary: "Messages, admissions, witness information, technical evidence and statistics may all contribute to an investigation.", tone: "integrity", body: ["TSBC may investigate suspected voting irregularities where credible information exists. Evidence is assessed together and in context."], bullets: ["screenshots and messages", "direct admissions", "coordinated voting plans", "credible witness statements", "technical evidence", "voting statistics and historical patterns"], important: "Voting statistics may support an investigation but shall not, by themselves, establish deliberate misconduct.", tags: ["evidence", "screenshots", "investigation", "statistics", "witness"], relatedRules: ["7.8", "11.3"] },
      { id: "7.11", title: "Vote & Result Verification", summary: "TSBC may verify ballots, calculations, rankings and eligibility before results become final.", tone: "administrative", body: ["Before official publication, TSBC may verify jury votes, televotes, calculations, rankings and eligibility. Official results become final only after required verification is complete."], tags: ["verification", "results", "ballots", "calculations"], relatedRules: ["5.5", "5.7"] },
    ],
  },
  {
    number: 8,
    slug: "deadlines",
    title: "Schedule & Deadlines",
    shortTitle: "Deadlines",
    description: "Official times, extensions, late submissions and technical delays.",
    icon: "Clock3",
    accent: "cyan",
    atAGlance: ["Published deadlines are binding.", "Official server-side time controls where a visual timer disagrees.", "Extensions may be granted where justified.", "Widespread platform failures may justify reopening or postponement."],
    rules: [
      { id: "8.1", title: "Official Schedule", summary: "TSBC publishes the edition timetable through Solaris Studio or another official Contest channel.", tone: "administrative", body: ["TSBC shall publish the relevant timetable for each edition, including entry, voting and other administrative deadlines."], important: "Important deadlines should identify the date, time and time zone clearly.", tags: ["schedule", "calendar", "deadline", "time zone"] },
      { id: "8.2", title: "Official Time", summary: "If a visual countdown is wrong, the officially stored deadline and server-side timestamp control.", tone: "administrative", body: ["Countdown timers are provided for convenience. Where a visual countdown conflicts with the official stored deadline, the official deadline and server-side submission timestamp take priority."], tags: ["countdown", "timer", "server time", "timezone", "deadline bug"] },
      { id: "8.3", title: "Entry & Jury Deadlines", summary: "Entries and required jury ballots must be submitted before their published deadlines.", tone: "conditional", body: ["Every delegation shall submit its entry and required jury ranking before the corresponding announced deadline. Late submissions may be rejected or sanctioned where they disrupt the Contest."], tags: ["late", "entry deadline", "jury deadline", "missed deadline"] },
      { id: "8.4", title: "Extensions", summary: "TSBC may extend deadlines where circumstances justify doing so.", tone: "conditional", body: ["TSBC may grant deadline extensions where justified. Extensions should normally apply equally to all affected delegations unless exceptional circumstances affect only a particular participant."], tags: ["extension", "extra time", "deadline"] },
      { id: "8.5", title: "Technical Delays", summary: "A widespread Solaris Studio or platform failure may cause a deadline or process to be reopened or postponed.", tone: "conditional", body: ["Where a significant technical problem prevents the Contest from following the published timetable, TSBC may postpone a stage, extend a deadline, reopen an affected process or use reliable server records to restore the correct state."], important: "An individual device or internet problem does not automatically create a right to an extension.", tags: ["technical problem", "outage", "internet", "reopen", "delay"] },
      { id: "8.6", title: "Publication of Results", summary: "Results are published only after the necessary checks and investigations are complete.", tone: "administrative", body: ["Official results shall be published after required votes and calculations have been verified and any investigation that must be resolved before publication has concluded."], tags: ["publish results", "verification", "investigation"] },
    ],
  },
  {
    number: 9,
    slug: "withdrawals",
    title: "Withdrawal & Replacement",
    shortTitle: "Withdrawals",
    description: "When a delegation may withdraw or replace its entry and what happens after deadlines.",
    icon: "RefreshCcw",
    accent: "amber",
    atAGlance: ["Withdrawal before the entry deadline is normally penalty-free.", "Late withdrawals may be sanctioned if they materially disrupt SSC.", "Entries may normally be replaced before the deadline.", "Post-deadline replacement needs TSBC approval."],
    rules: [
      { id: "9.1", title: "Voluntary Withdrawal", summary: "A delegation may withdraw before the official submission deadline without penalty.", tone: "allowed", body: ["A delegation may withdraw from the Contest before the official submission deadline without penalty and should inform TSBC as soon as reasonably possible."], tags: ["withdraw", "withdrawal", "before deadline"] },
      { id: "9.2", title: "Withdrawal After Publication", summary: "A late withdrawal may be sanctioned if it significantly disrupts the edition.", tone: "conditional", body: ["A delegation withdrawing after its entry has been officially published may be subject to sanctions where the withdrawal significantly disrupts the Contest. TSBC may waive a sanction where exceptional circumstances exist."], tags: ["late withdrawal", "published entry", "sanction"] },
      { id: "9.3", title: "Replacement Entries", summary: "A compliant replacement is normally allowed before the deadline; later changes need authorisation.", tone: "conditional", body: ["Before the submission deadline, a delegation may replace its entry provided the replacement meets all eligibility requirements. After the deadline, replacement entries are not normally permitted without TSBC approval."], tags: ["replace", "replacement", "change song", "change entry"] },
      { id: "9.4", title: "Host Withdrawal", summary: "If the host withdraws, TSBC appoints or arranges an alternative host.", tone: "administrative", body: ["If the Host Country withdraws from hosting or participating, TSBC shall determine alternative hosting arrangements. Hosting rights do not automatically transfer to the runner-up."], tags: ["host withdrawal", "alternative host", "runner up"] },
      { id: "9.5", title: "Exceptional Circumstances", summary: "Withdrawals outside a participant's reasonable control are considered under Force Majeure.", tone: "conditional", body: ["A withdrawal caused by circumstances beyond the reasonable control of a participant shall be assessed under the Force Majeure rules."], tags: ["force majeure", "illness", "emergency", "withdrawal"], relatedRules: ["13.1"] },
    ],
  },
  {
    number: 10,
    slug: "media-ai",
    title: "Media, Branding & AI",
    shortTitle: "Media & AI",
    description: "Official presentation, SSC branding, third-party music, social media and artificial intelligence.",
    icon: "Sparkles",
    accent: "indigo",
    atAGlance: ["TSBC controls the official SSC presentation and branding.", "Real-world music remains owned by its rights holders.", "AI may assist production but may not replace the competing song.", "Promotion is allowed if it does not manipulate voting."],
    rules: [
      { id: "10.1", title: "Official Presentation", summary: "TSBC is responsible for SSC's official online presentation.", tone: "administrative", body: ["TSBC is responsible for the official presentation of SSC. Official material may include announcement graphics, scoreboards, voting sequences, promotional videos, recap clips, interval acts and online show presentation."], tags: ["broadcast", "presentation", "graphics", "scoreboard", "recap"] },
      { id: "10.2", title: "Contest Branding", summary: "Official SSC logos and original branding remain under TSBC control.", tone: "administrative", body: ["Official SSC logos, artwork and original Contest branding remain under the control of TSBC. Participants may use official branding for legitimate SSC-related activity but may not alter it in a misleading way."], tags: ["branding", "logo", "artwork", "tsbc"] },
      { id: "10.3", title: "Third-Party Music & Artists", summary: "SSC representation rights are contest mechanics and do not create real-world ownership of music or artists.", tone: "information", body: ["Rights in submitted songs, recordings, videos, artist names and other third-party material remain with their respective rights holders. Submission to SSC does not transfer real-world ownership to TSBC or a delegation."], important: "Internal artist-representation rights under Rule 4.6 apply only within SSC.", tags: ["copyright", "rights", "artist ownership", "music", "record label"], relatedRules: ["4.6"] },
      { id: "10.4", title: "Contest Clips", summary: "TSBC may edit entry clips for consistent timing and presentation.", tone: "administrative", body: ["Unless otherwise announced, Instagram preview clips shall not exceed 25 seconds and Grand Final presentation clips shall not exceed 90 seconds. TSBC may edit clips for consistency, production quality and timing."], tags: ["clip", "instagram", "90 seconds", "25 seconds", "recap"] },
      { id: "10.5", title: "Artificial Intelligence", summary: "AI may support visuals and production, but AI-generated competing songs and unauthorised imitation vocals are prohibited.", tone: "conditional", body: ["Artificial Intelligence may be used for promotional graphics, visual concepts, stage concepts and production assistance. TSBC may require disclosure where AI-generated content is materially used in official Contest material."], allowed: ["promotional graphics", "visual concepts", "stage concepts", "production assistance"], prohibited: ["AI-generated competing songs", "AI vocals intended to imitate a real artist without authorisation"], tags: ["ai", "artificial intelligence", "generated song", "ai vocals", "visuals"] },
      { id: "10.6", title: "Social Media & Public Conduct", summary: "Entry promotion is encouraged, but harassment, impersonation, misinformation and voting manipulation are prohibited.", tone: "conditional", body: ["Participants may promote their entries and SSC through social media. Public criticism of SSC is permitted in good faith."], prohibited: ["harassment", "impersonation", "deliberate misinformation designed to harm participants or manipulate SSC", "voting manipulation"], tags: ["social media", "instagram", "promotion", "media conduct", "criticism"], relatedRules: ["3.2", "7.6"] },
    ],
  },
  {
    number: 11,
    slug: "sanctions",
    title: "Sanctions",
    shortTitle: "Sanctions",
    description: "How SSC responds to rule violations and how penalty levels are chosen.",
    icon: "Scale",
    accent: "rose",
    atAGlance: ["Sanctions should be proportional.", "Intent, history, cooperation and impact matter.", "The existing ten-level SSC penalty scale remains in use.", "A report or investigation is not itself a finding of misconduct."],
    rules: [
      { id: "11.1", title: "Sanction Principles", summary: "Every case is considered individually and penalties should protect Contest fairness proportionately.", tone: "administrative", body: ["Sanctions exist to protect the fairness, credibility and safety of SSC. Every case shall be considered individually."], bullets: ["seriousness of the violation", "intent", "previous conduct", "cooperation during investigation", "competitive or community impact"], tags: ["sanction", "penalty", "proportional", "intent"] },
      { id: "11.2", title: "Sanction Levels", summary: "SSC uses a ten-level scale from an Official Warning to a Lifetime Ban.", tone: "administrative", body: ["The standard sanction scale is retained. TSBC may impose a lesser or greater sanction where the circumstances justify a different outcome."], bullets: ["Level 1 · Official Warning", "Level 2 · Loss of 50% of Bonus Points", "Level 3 · No Bonus Points Awarded", "Level 4 · −5 Contest Points", "Level 5 · −25 Contest Points", "Level 6 · −50 Contest Points", "Level 7 · −100 Contest Points", "Level 8 · Disqualification", "Level 9 · Disqualification + One-Edition Ban", "Level 10 · Lifetime Ban"], tags: ["levels", "warning", "bonus points", "minus points", "disqualification", "ban", "lifetime ban"] },
      { id: "11.3", title: "Investigation Procedure", summary: "TSBC may gather evidence and request explanations before a sanction is imposed.", tone: "integrity", body: ["Before imposing a sanction, TSBC may gather evidence, request explanations, review relevant material and consult participants. The person concerned should normally receive a reasonable opportunity to respond."], important: "Immediate temporary action may be taken where necessary to protect Contest integrity or participant safety. An investigation does not itself mean that a violation has been established.", tags: ["investigation", "evidence", "response", "due process"], relatedRules: ["12.1", "14.8"] },
      { id: "11.4", title: "Typical Violations", summary: "The rulebook gives normal starting levels for recurring types of misconduct.", tone: "administrative", body: ["The following are typical starting points rather than automatic outcomes."], bullets: ["Minor misconduct · Level 1", "Repeated spam · Level 3", "Failure to vote on time · Level 4", "Late submission materially disrupting SSC · Level 5", "Falsifying Spotify or YouTube statistics · Level 6", "Continued harassment following warning · Level 7", "Submitting an ineligible artist · Level 8", "Submitting an ineligible Eurovision song · Level 8", "Vote trading or coordinated voting · Level 9", "Manipulating the televote · Level 9", "Serious threats toward SSC or participants · Level 10"], tags: ["typical level", "vote trading", "harassment", "ineligible artist", "televote manipulation"] },
      { id: "11.5", title: "Aggravating Factors", summary: "Repeated, concealed or deliberately disruptive misconduct may increase a sanction.", tone: "conditional", body: ["A sanction may be increased where a participant repeats previous misconduct, attempts to conceal evidence, encourages others to break the Regulations or causes significant disruption."], tags: ["aggravating", "repeat", "conceal evidence", "increase penalty"] },
      { id: "11.6", title: "Mitigating Factors", summary: "Cooperation, prompt correction and genuine mistakes may reduce a sanction.", tone: "conditional", body: ["A sanction may be reduced where a participant admits responsibility, cooperates fully, promptly corrects an honest mistake or demonstrates that a breach was unintentional."], tags: ["mitigating", "cooperate", "honest mistake", "self report", "reduce penalty"] },
      { id: "11.7", title: "Official Warnings", summary: "An Official Warning records that future similar misconduct may receive a stronger response.", tone: "administrative", body: ["An Official Warning serves as notice that future violations may result in more severe sanctions. Warnings may remain relevant in later editions at TSBC's discretion."], tags: ["warning", "record", "future sanction"] },
    ],
  },
  {
    number: 12,
    slug: "appeals",
    title: "Appeals",
    shortTitle: "Appeals",
    description: "How a participant can challenge an official sanction and how TSBC reviews it.",
    icon: "Gavel",
    accent: "amber",
    atAGlance: ["Official sanctions can be appealed.", "The normal appeal window is 48 hours.", "Evidence and a requested outcome should be included.", "A serious appeal should involve fresh review where reasonably possible."],
    rules: [
      { id: "12.1", title: "Right to Appeal", summary: "A participant or delegation may appeal an official sanction within 48 hours unless an extension is granted.", tone: "allowed", body: ["A delegation or participant subject to an official sanction may request review. Appeals must normally be submitted within 48 hours of the sanction being communicated unless TSBC grants an extension due to exceptional circumstances."], tags: ["appeal", "48 hours", "sanction", "deadline"] },
      { id: "12.2", title: "Appeal Submission", summary: "An appeal should identify the decision, explain the challenge, provide evidence and state the requested outcome.", tone: "administrative", body: ["An appeal shall identify the sanction being challenged, explain the reasons for the appeal, include supporting evidence where available and state the outcome requested. Appeals without meaningful reasoning may be dismissed."], tags: ["appeal form", "evidence", "requested outcome"] },
      { id: "12.3", title: "Review Process", summary: "TSBC reviews the available evidence and may request additional information before deciding the appeal.", tone: "administrative", body: ["TSBC may review all available evidence, request additional information, consult relevant participants and reconsider the original decision."], important: "Where reasonably possible, a person who was not the sole original decision-maker should participate in reviewing a serious appeal. Officials with a significant conflict of interest should recuse themselves where another eligible reviewer is available.", tags: ["review", "conflict of interest", "recuse", "appeal reviewer"] },
      { id: "12.4", title: "Appeal Outcome", summary: "An appeal may uphold, reduce, increase or overturn the original sanction.", tone: "administrative", body: ["Following review, TSBC may uphold the original sanction, reduce it, increase it where significant new evidence justifies doing so, or overturn it entirely. The decision issued following the appeal is final under the ordinary SSC process."], tags: ["uphold", "reduce", "increase", "overturn", "final decision"] },
      { id: "12.5", title: "Good-Faith Appeals", summary: "Appeals must be genuine and may not be used solely to harass administrators or delay proceedings.", tone: "prohibited", body: ["Appeals shall be submitted in good faith. Frivolous or abusive appeals intended solely to delay proceedings, spam the system or harass participants or administrators may constitute misconduct."], tags: ["good faith", "frivolous appeal", "abuse"] },
    ],
  },
  {
    number: 13,
    slug: "force-majeure",
    title: "Force Majeure",
    shortTitle: "Emergencies",
    description: "Exceptional events, outages and emergency powers needed to keep the online Contest fair.",
    icon: "CloudLightning",
    accent: "rose",
    atAGlance: ["Major technical and real-world emergencies may require changes.", "TSBC may extend, postpone, reopen, suspend or cancel where necessary.", "Unavailable accepted media may be replaced.", "Emergency action should minimise disruption and preserve equal treatment."],
    rules: [
      { id: "13.1", title: "Exceptional Circumstances", summary: "Force Majeure covers extraordinary circumstances beyond reasonable control that prevent normal Contest operation.", tone: "conditional", body: ["Force Majeure includes extraordinary circumstances beyond the reasonable control of TSBC or participating delegations that prevent normal operation of the Contest."], bullets: ["major technical failures", "prolonged outages of an official platform", "Spotify or YouTube removing an accepted entry", "widespread internet disruption", "natural disasters", "serious illness affecting essential organisers", "other comparable unforeseen events"], tags: ["force majeure", "outage", "emergency", "illness", "internet"] },
      { id: "13.2", title: "Emergency Powers", summary: "TSBC may change the timetable or affected process where an emergency makes normal operation impossible.", tone: "administrative", body: ["Where Force Majeure occurs, TSBC may extend deadlines, postpone voting, reopen an affected process, replace unavailable media, alter the Contest schedule, suspend an edition or cancel it where necessary."], important: "Emergency decisions should be communicated as soon as reasonably possible.", tags: ["extend", "postpone", "cancel edition", "suspend", "emergency"] },
      { id: "13.3", title: "Entry Availability", summary: "If accepted media disappears for reasons outside the delegation's control, TSBC may authorise a reasonable replacement.", tone: "conditional", body: ["If an accepted entry becomes unavailable due to circumstances beyond the delegation's reasonable control, TSBC may authorise replacement video material or another reasonable measure to preserve participation."], tags: ["removed song", "removed video", "replacement media"] },
      { id: "13.4", title: "Fairness During Emergencies", summary: "Emergency action should restore fair conditions rather than create a new competitive advantage.", tone: "integrity", body: ["Any action under this chapter shall aim to minimise disruption while maintaining equal treatment of delegations and restoring the position that would reasonably have existed without the emergency."], tags: ["fairness", "equal treatment", "restore"] },
    ],
  },
  {
    number: 14,
    slug: "online-integrity",
    title: "Solaris Studio & Online Integrity",
    shortTitle: "Online Integrity",
    description: "Accounts, technical exploits, anonymous reporting, evidence, privacy and the integrity case process.",
    icon: "ShieldCheck",
    accent: "emerald",
    atAGlance: ["Solaris Studio is the primary Contest platform.", "Accounts and automation may not be used for unfair advantage.", "Discovering a bug is not misconduct; exploiting it can be.", "Reports are information, not verdicts.", "Anonymous and confidential reporting must protect reporter identity as promised."],
    rules: [
      { id: "14.1", title: "Official Online Platform", summary: "Solaris Studio is SSC's primary platform for participation, entries, voting, results and administration.", tone: "information", body: ["Solaris Studio shall normally serve as SSC's primary system for accounts, confirmations, participating countries, entries, voting, results, administration and Contest history. TSBC may designate additional official platforms where necessary."], tags: ["solaris studio", "platform", "official channel"] },
      { id: "14.2", title: "Account Responsibility", summary: "Participants must keep accounts secure and may not use additional accounts to obtain extra competitive rights.", tone: "prohibited", body: ["Participants are responsible for taking reasonable steps to keep their Solaris Studio accounts secure."], prohibited: ["impersonating another participant", "accessing another account without permission", "sharing accounts for the purpose of manipulating SSC", "creating additional accounts to obtain extra votes, confirmations or other competitive rights"], important: "Authorised testing and administrative accounts are permitted where they are not used competitively.", tags: ["account", "fake account", "duplicate account", "security", "impersonation"] },
      { id: "14.3", title: "Automation & Unfair Technical Advantage", summary: "Bots and scripts may not be used to manipulate confirmations, voting or other competitive processes.", tone: "prohibited", body: ["Bots, scripts or automated systems shall not be used to obtain an unfair competitive advantage in SSC."], prohibited: ["automated confirmation submissions designed to beat human users", "automated or duplicated voting", "automated account creation for competitive use", "scripts designed to bypass Contest limits"], important: "Ordinary browser features and legitimate accessibility tools are permitted.", tags: ["bot", "script", "automation", "confirmation", "voting"] },
      { id: "14.4", title: "Bugs & Exploits", summary: "Finding a bug is not a violation; knowingly exploiting it for competitive benefit is.", tone: "conditional", body: ["Participants who discover a bug or vulnerability are encouraged to report it to TSBC. Discovery, testing sufficient to understand the problem, or good-faith reporting is not misconduct by itself."], allowed: ["reporting a bug", "providing enough information for TSBC to reproduce a problem", "using normal features as intended"], prohibited: ["knowingly exploiting a vulnerability for points, votes, confirmations or other competitive advantage", "using a vulnerability to access another person's private information", "sharing an active serious exploit for the purpose of abuse"], tags: ["bug", "exploit", "vulnerability", "security", "technical report"], relatedRules: ["14.7"] },
      { id: "14.5", title: "Technical Records", summary: "Reliable server records may be used to resolve disputes about online actions and timestamps.", tone: "administrative", body: ["Where an online action is disputed, TSBC may rely on appropriate server-side records, including timestamps, submission records and audit information. A user's local device display does not automatically override reliable server data."], tags: ["server logs", "timestamp", "audit", "technical evidence"] },
      { id: "14.6", title: "Privacy & Sensitive Technical Data", summary: "Sensitive account and technical information should be accessible only where needed and should not be publicly exposed.", tone: "integrity", body: ["Technical information reasonably necessary to operate, secure and investigate SSC may be processed by authorised systems and administrators. Sensitive information such as IP addresses, private account data or security details shall not normally be publicly disclosed."], important: "Public integrity explanations should use anonymised, aggregated or otherwise limited information where possible.", tags: ["privacy", "ip address", "personal data", "security", "anonymous"] },
      { id: "14.7", title: "Reporting Concerns", summary: "Participants may report possible rule violations without needing to prove the case themselves.", tone: "allowed", body: ["Any participant or community member may report information they genuinely believe may be relevant to an SSC rule violation, safety concern or technical vulnerability. The reporter is not required to establish guilt before reporting."], important: "A good-faith report that is ultimately unproven is not a false report. Knowingly fabricated reports or falsified evidence are prohibited.", tags: ["report", "anonymous report", "whistleblower", "evidence", "false report"] },
      { id: "14.8", title: "Anonymous & Confidential Reporting", summary: "Solaris Studio may offer fully anonymous, protected/sealed and confidential reporting with clearly different privacy promises.", tone: "integrity", body: ["Where Solaris Studio offers reporting identity modes, the interface must explain who can access the reporter's identity. Fully anonymous cases must not be linked to the reporter's Solaris account in the case record. Confidential cases may identify the reporter only to the authorised reviewers described by the chosen mode."], important: "TSBC shall not describe a reporting method as fully anonymous if ordinary case reviewers can identify the reporter from stored account information.", tags: ["anonymous", "confidential", "sealed identity", "reporter", "privacy"], relatedRules: ["14.6", "14.9"] },
      { id: "14.9", title: "Reporter Communication & Protection", summary: "Anonymous reporters may continue a secure two-way case conversation without revealing their identity.", tone: "integrity", body: ["Where technically supported, an anonymous reporter may use a private recovery credential to read case updates, respond to TSBC questions and provide additional information without attaching an SSC account identity."], prohibited: ["retaliating against someone for reporting or cooperating with an investigation", "attempting to identify an anonymous reporter for the purpose of retaliation", "unnecessarily disclosing information likely to expose a protected reporter"], tags: ["anonymous messages", "recovery key", "follow up", "retaliation", "whistleblower protection"] },
      { id: "14.10", title: "Evidence & Disclosure", summary: "Evidence should be preserved, while information shared with an involved participant should avoid unnecessarily identifying protected reporters or witnesses.", tone: "integrity", body: ["TSBC may preserve evidence, its source category and relevant timestamps as part of an integrity case. Internal evidence and the information disclosed to an involved participant need not be identical where redaction is reasonably necessary to protect privacy, security or a reporter's identity."], important: "A participant accused of misconduct should receive enough information to respond fairly, but not unnecessary identifying details about a protected source.", tags: ["evidence", "redaction", "disclosure", "screenshots", "reporter identity"] },
      { id: "14.11", title: "Integrity Case Fairness", summary: "A report, automated flag or investigation does not by itself establish that anyone broke a rule.", tone: "integrity", body: ["Reports, automated signals and allegations are information for review. A participant shall not be treated as having violated a rule solely because a report was submitted or an automated system flagged activity."], important: "A report is information, not a verdict. An investigation is not a finding of guilt.", tags: ["presumption", "report is not proof", "investigation", "fairness", "flag"] },
      { id: "14.12", title: "Conflicts of Interest", summary: "Serious cases should not be decided solely by an official with a significant personal conflict where another reviewer is available.", tone: "administrative", body: ["A TSBC official with a significant personal involvement or conflict concerning a case should recuse themselves where another eligible reviewer is reasonably available. A complaint concerning a TSBC official should not normally be handled solely by the official concerned."], tags: ["conflict of interest", "recuse", "tsbc complaint", "reviewer"] },
    ],
  },
  {
    number: 15,
    slug: "amendments",
    title: "Amendments & Interpretation",
    shortTitle: "Amendments",
    description: "How rules change, how edition-specific instructions fit in and which version is official.",
    icon: "FileClock",
    accent: "sky",
    atAGlance: ["Rules may be improved between editions.", "Major competitive rules should normally stay stable during an active phase.", "Edition-specific instructions may supplement the general rules.", "Solaris Studio should identify the current official version clearly."],
    rules: [
      { id: "15.1", title: "Amendments", summary: "TSBC may amend the regulations to improve SSC or address situations not previously covered.", tone: "administrative", body: ["TSBC may amend these Regulations between editions where necessary to improve the Contest or address matters not previously covered. Substantial competitive rules should not normally change after the relevant competitive phase has begun."], important: "An urgent change may be made where necessary to correct an obvious error, fix a serious technical problem, prevent manipulation or preserve Contest integrity.", tags: ["rule change", "amendment", "update rules", "mid edition"] },
      { id: "15.2", title: "Edition-Specific Rules", summary: "Each edition may publish its own format, dates and configuration without rewriting the permanent rulebook.", tone: "administrative", body: ["TSBC may publish edition-specific instructions covering matters such as confirmation procedures, participation limits, qualification format, voting format, point allocation and deadlines. These instructions supplement the General Regulations."], important: "An edition-specific instruction should not silently override a fundamental general rule; any intended exception must be clearly announced.", tags: ["edition rules", "specific edition", "configuration", "voting format"] },
      { id: "15.3", title: "Interpretation", summary: "TSBC resolves genuine ambiguity using fairness, consistency, transparency and Contest integrity.", tone: "administrative", body: ["Where uncertainty exists regarding the interpretation of these Regulations, TSBC shall determine the appropriate interpretation guided by fairness, consistency, transparency, equal treatment and the integrity of SSC."], tags: ["interpretation", "unclear rule", "ambiguity", "tsbc decision"] },
      { id: "15.4", title: "Official Version", summary: "The version published as current in Solaris Studio is the authoritative SSC rulebook.", tone: "information", body: ["The Rulebook identified as current in Solaris Studio constitutes the official Regulations governing SSC. Archived versions remain available for historical reference but cease to apply when replaced unless otherwise stated."], tags: ["official version", "archive", "old rules", "current rules"] },
      { id: "15.5", title: "Entry into Force", summary: "A new rulebook or amendment applies from the effective time stated by TSBC.", tone: "administrative", body: ["These Regulations and later amendments enter into force on the effective date or time announced by TSBC and continue to apply until replaced or amended."], tags: ["effective date", "entry into force", "publication"] },
    ],
  },
];

export const SSC_RULES = SSC_RULE_CHAPTERS.flatMap((chapter) =>
  chapter.rules.map((rule) => ({ ...rule, chapterNumber: chapter.number, chapterTitle: chapter.title, chapterSlug: chapter.slug })),
);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  friend: ["friend voting", "coordination", "relationships"],
  friends: ["friend voting", "coordination", "relationships"],
  esc: ["eurovision"],
  ns: ["national selection"],
  late: ["deadline", "extension"],
  deadline: ["late", "schedule", "time"],
  ban: ["sanction", "disqualification", "lifetime ban"],
  cheating: ["integrity", "manipulation", "vote trading", "fake account"],
  cheat: ["integrity", "manipulation", "vote trading", "fake account"],
  report: ["anonymous", "integrity", "evidence"],
  anonymous: ["report", "confidential", "privacy", "recovery key"],
  bot: ["automation", "script"],
  bug: ["exploit", "technical", "vulnerability"],
  host: ["hosting", "creative director", "winner"],
  artist: ["eligibility", "spotify", "reuse", "eurovision"],
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

export const QUICK_RULE_IDS = ["4.4", "4.5", "4.6", "7.5", "7.7", "8.2", "9.3", "11.2", "14.4", "14.8"] as const;
export const QUICK_RULES = QUICK_RULE_IDS.map((id) => getRuleById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getRuleById>>[];

export const RULEBOOK_STATS = {
  chapters: SSC_RULE_CHAPTERS.length,
  rules: SSC_RULES.length,
};
