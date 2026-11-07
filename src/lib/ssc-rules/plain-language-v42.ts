import type { SscRule } from "@/lib/ssc-rules/types";

/**
 * Proposed v4.2 plain-language wording. Every rule ID is preserved.
 * Only the current bundled draft uses these overrides; old release snapshots stay immutable.
 * Each row is <official rule ID> TAB <body paragraphs separated by §>.
 */
const BODY_ROWS = String.raw`
1.1	The Solaris Song Contest (SSC) is a fan-run online music competition. Real people represent fictional countries using real songs. Everything happens online: a host, stage or broadcast is part of the contest's online presentation, not a physical event. SSC is independent and is not officially connected to artists, broadcasters, record labels or streaming services.
2.1	These official words have the same meaning throughout SSC. § Edition: One complete SSC contest, including participation, song selection, voting and results. § Country: A fictional country registered in SSC, not a real-world government. § Participant: A real person taking part in the contest. § Delegation: The person or group officially representing a country. § Head of Delegation (HoD): The delegation's main representative and contact with TSBC. § Entry: The song and artist or performing act chosen to represent a country. § Confirmation: The process that officially secures a country's participation in an edition. § National Selection: When a country considers several songs or artists before choosing its entry. § Internal Selection: When the delegation chooses its entry directly. § Solaris Studio: The main online platform for SSC's entries, votes, messages and administration. § Official Contest Channel: Solaris Studio or another channel that TSBC announces for official SSC actions. § Official Deadline: The announced date and time by which a required action must be completed. § Submission: Material sent to TSBC through an official SSC channel. § Jury Vote: A delegation's official independent vote under the published voting rules. § Televote: A public vote submitted through SSC's official voting system. § Official Result: A contest result checked and confirmed by TSBC. § TSBC: The Terra Solaris Broadcasting Coalition, the organisation running SSC. § Appeal: A request for TSBC to review a decision. § Sanction: An official penalty imposed after a rule breach is found. § Disqualification: Removal of a country, entry, vote or participant because of a rule breach. § Withdrawal: When a country formally leaves an edition after confirming participation. § Force Majeure: An exceptional emergency outside reasonable control that stops or seriously disrupts normal contest activity. § Protected country: A country that cannot be permanently taken over, divided or eliminated without the required consent. Rules 22.4 and 22.5 explain its status. § Dormant country: A country that has had no active HoD during any part of six completed SSC editions in a row. Rule 22.5 explains the exact test. § Official map (canonical map): The version of the fictional Solaris world map recognised and recorded by TSBC. § Annexation: Taking another fictional country's land and making it part of your country. § Partition: Dividing a fictional country into separate parts. § Successor state: A new fictional country that continues some of an older country's identity or history. § Mitigating factors: Reasons that can justify a lighter penalty. § Aggravating factors: Reasons that can justify a stronger penalty.
3.1	The Terra Solaris Broadcasting Coalition (TSBC) runs SSC and is responsible for fair competition. It manages editions and official systems, checks entries and votes, investigates possible rule breaches, publishes verified results, applies justified penalties and explains the rules. If a situation is not covered, TSBC must make a fair, consistent and transparent decision and treat delegations equally.
3.2	The Contest Director manages each edition. This includes checking entries, setting deadlines, supervising voting and results, applying the rules and dealing with disputes. Delegations must be treated consistently.
3.3	The Creative Director usually is the Head of Delegation of the country that won the previous edition. They help suggest the slogan, artwork, stage ideas and entertainment. This is a creative role: they do not decide who can compete, control votes, issue penalties or change results.
4.1	Use Solaris Studio for official confirmations, entries, votes and contest information unless TSBC announces another official channel. If the main system is unavailable, TSBC may announce a replacement channel. If two official channels give conflicting instructions, TSBC must say which applies and fairly address any resulting disadvantage. An unofficial private message cannot quietly change an official rule or deadline.
4.2	Keep your Solaris Studio account reasonably secure. Do not pretend to be another participant, enter someone else's account without permission or use extra accounts to get more votes, places or other competitive rights. Approved administrative or testing accounts are allowed when they are not used to compete.
4.3	Do not use bots, scripts or other automated tools to gain an unfair advantage, such as submitting confirmations faster than human users, creating extra voting accounts or bypassing vote limits. Normal browser features and accessibility tools are allowed.
4.4	You may find a bug, test only enough to understand it and report it to TSBC. Do not deliberately use a bug to gain points, votes, confirmation places or access to someone else's information. Do not share a serious active exploit to help others abuse it.
4.5	If people disagree about when an online action happened, TSBC may use reliable server records, including submission times and audit records. A phone clock or screenshot does not automatically outweigh the official server's record.
4.6	Before a limited confirmation round opens, TSBC must publish its opening time, how many places are available and what information is required. Unless the published edition rules specify another fair method, valid confirmations are accepted in the order the official server receives them after opening. Your device's countdown or internet delay does not guarantee a place. If the official system fails, TSBC may take fair steps to correct the result.
4.7	Edition rules must distinguish information needed to reserve a place from information needed later and information that is optional. You do not have to provide a field early just because the website lets you type it. TSBC may lock important identity or eligibility information at a published deadline and require approval for later changes.
5.1	Every participating country has one Head of Delegation (HoD). This is the person who officially represents the country and contacts TSBC. The HoD handles confirmation, entries, required jury votes, deadlines and making sure their delegation follows the rules.
5.2	Joining SSC is a choice. Once you take part in an official contest process, you agree to follow these rules and the announced rules for that edition. Treat other people respectfully and compete fairly.
5.3	Each fictional country may have one SSC delegation and competes under its registered name. A change to the registered country name needs TSBC approval.
6.1	A participating country may submit one song-and-artist entry per edition. TSBC must check that it meets the requirements before the entry is officially accepted. Sending an entry does not guarantee acceptance.
6.2	The competing song must be available on Spotify in its original studio version, unless TSBC explicitly approves another version. Remixes, live recordings and other versions need approval. Songs previously entered in Eurovision, Junior Eurovision, American Song Contest or another competition TSBC has declared ineligible cannot be used.
6.3	Each entry must provide suitable video material. Use the official music video when one exists. If it does not, TSBC may accept the song's official visualiser, lyric video or another suitable approved song video. Unless an edition announces otherwise, Instagram previews can be at most 25 seconds and Grand Final presentation clips at most 90 seconds.
6.4	At the official eligibility check, the artist must have fewer than 25 million monthly Spotify listeners. The song's official music video must have fewer than 20 million YouTube views. If there is no official music video, check the YouTube video for the song instead. TSBC must use the relevant video and view count at its recorded check time, not a later figure. A correctly accepted entry stays eligible if its numbers rise afterwards. Calling an artist 'mainstream' is not enough to reject an entry that meets the published limits. Any different objective limit must be announced before the relevant selection or submission period begins.
6.5	An artist who has competed in the Eurovision Song Contest cannot compete in SSC. An artist who participated in a Eurovision National Selection in 2015 or any later year also cannot compete. Participation in a National Selection before 2015 may be allowed if the other requirements are met. Previous Junior Eurovision artists may be eligible if they are no longer underage and meet the other artist rules. Junior Eurovision songs themselves cannot be submitted.
6.6	An artist may compete in SSC no more than three times and cannot compete again after winning SSC. Usually, only the country they previously represented may choose them again. Another country needs permission from the previous country's delegation, but if that country has no active Head of Delegation, permission is not required. All other artist-eligibility rules still apply. These are internal SSC representation rules, not real-world ownership of an artist.
6.7	If a song credits several main or featured artists, TSBC may check each artist's eligibility and SSC history. An artist cannot avoid previous-appearance rules simply by changing their stage name.
6.8	SSC welcomes songs in any language or musical style. Originality and variety are encouraged, not an additional genre quota or an unstated eligibility requirement.
6.9	A country may hold a National Selection with several possible entries or choose an entry directly through an Internal Selection. Both methods are equally valid in SSC.
6.10	Check your entry's eligibility before submitting it. TSBC may check Spotify and YouTube figures, artist and song history, reuse limits and video availability, and ask for evidence if something cannot be verified. For numbers that change over time, the official check uses the value recorded at that time. Later changes do not normally undo acceptance, unless information was false or the original check was seriously wrong.
7.1	SSC uses numbered editions. An edition usually has two Semi-Finals and one Grand Final, but TSBC may add Semi-Finals when needed. The exact format must be announced before competition starts.
7.2	TSBC decides the order in which entries appear. It may consider musical variety, pacing and the overall show. No country has a guaranteed right to a certain position.
7.3	The published voting system for that edition decides the result. Unless its rules say otherwise, the country with the most total points wins.
7.4	If countries finish with the same number of points, compare them in this order until the tie is broken: first, jury points; second, the number of countries awarding points; third, the highest single score received; fourth, televote points; fifth, the earlier running-order position. If the countries are still tied, TSBC makes the final decision.
7.5	The country with the verified highest winning result is the official winner. It receives the SSC trophy and the first right to creatively host the next edition.
7.6	Results are not final until TSBC has checked the required votes, calculations and eligibility issues. TSBC may delay publication while doing this. If a serious error is discovered later, TSBC may correct the official result where justified.
8.1	The winning country gets the first chance to creatively host the next SSC edition online. Hosting does not require a physical event. The winner may host alone, host jointly or decline. If it declines, TSBC chooses an alternative; the runner-up does not automatically become host.
8.2	The Host Country works with TSBC on the edition's look and online presentation. This may include the theme, slogan, artwork, promotional activity and fictional host setting. TSBC still runs the contest, voting and official decisions.
8.3	The previous winner's Head of Delegation usually acts as Creative Director. They can propose artwork, branding, stage concepts, interval acts and other creative ideas, but this does not give them control over official competition decisions.
8.4	Each edition should normally have its own recognisable theme, slogan, logo, artwork, graphics and stage concept. Those elements should fit together across its presentation.
8.5	If the Host Country or Creative Director is unavailable or misses required creative work, TSBC may finish or take over those tasks so the edition can continue. This does not automatically remove the country's Host status.
9.1	Vote for songs based mainly on your genuine personal opinion. You may consider musical quality, creativity, originality, production and overall impact. Different people may use different musical criteria.
9.2	When an edition uses jury voting, each required delegation must submit one official jury ranking before the published deadline. The delegation must decide its ranking independently, not let another participant control it. The edition rules explain the voting format.
10.1	When public voting is used, TSBC must announce how it works before voting opens. Follow the published limits for total votes, how many countries to support and maximum votes per country. Only valid votes received through the official televoting system count. Duplicate, fraudulent or technically invalid votes may be rejected.
11.1	You cannot vote for your own country through the jury or public televote. You also cannot use another account to get around this restriction.
11.2	Make your own voting choices. Do not trade points, agree to coordinate rankings, use fake or duplicate accounts, automate votes, manipulate the televote or tell another delegation how it must rank entries. Giving false answers during an integrity check is also prohibited.
11.3	You may share your entry and ask people to support it if they enjoy it. You may not promise votes in return for votes, offer rewards for scores or make arrangements that tell a particular voter how to vote.
11.4	You may vote highly for a friend's entry if you genuinely like it. Friendships, alliances and shared communities are allowed. A relationship only becomes a voting concern when credible evidence suggests it controlled or coordinated the vote. Friendship or a voting pattern by itself is not proof of cheating.
11.5	Solaris Studio may flag unusual voting patterns for a person to review. Examples include repeated mutual high scores, sudden changes in voting habits or big jury-versus-televote differences. When looking at past editions, the system may give more weight to recent ones if it uses the same method consistently. A computer-generated flag is only a review signal. A human must consider the real context and evidence; software must never decide guilt or penalties by itself.
11.6	If TSBC asks you to confirm your vote was independent, answer truthfully. You may be asked to confirm that nobody traded votes with you, offered rewards or pressured you. Being asked for this declaration is not an accusation. Deliberately lying in it may itself be a rule breach.
11.7	TSBC may investigate suspected voting manipulation using messages, admissions, witness accounts, technical records and voting patterns. It must consider the evidence together and in context. Unusual statistics alone do not prove that someone deliberately cheated.
11.8	Before publishing results, TSBC may check jury ballots, televotes, calculations, rankings and entry eligibility. Results become official only after the necessary checks are complete.
12.1	TSBC must publish important times with the exact date, clock time and time zone or UTC offset. A local phone clock or countdown does not change an official deadline. If CET or CEST is used, the offset for that date applies.
12.2	The official server's recorded submission time decides when an online action arrived. A phone screenshot or browser countdown does not overrule reliable server records. If Solaris Studio showed the wrong time because of a confirmed problem, TSBC may take fair corrective action under Rules 12.5 and 19.4.
12.3	Submit your entry and any required jury vote before their published deadlines. TSBC may reject a late submission or apply a justified penalty if the delay disrupts the contest.
12.4	TSBC may extend deadlines for a justified reason. Everyone affected should normally receive the same extension, unless exceptional circumstances apply only to one person or delegation.
12.5	If a major problem with Solaris Studio or another official system prevents the contest from following its schedule, TSBC may delay a stage, extend a deadline, reopen a process or restore the correct state using server records. A problem with only your own phone or internet does not automatically entitle you to more time.
12.6	TSBC publishes official results after the necessary votes, calculations and any investigation needed before publication have been checked.
13.1	TSBC prepares SSC's official online presentation, including graphics, scoreboards, voting displays, videos, recaps, interval acts and other show material.
13.2	TSBC controls the official SSC logo and original contest branding. You may use official branding for genuine SSC activities, but must not change it in a way that misleads people.
13.3	Artists and other rights holders keep ownership of their songs, recordings, photos, names and videos. Sending a song to SSC does not give TSBC or a delegation ownership of it. SSC is a non-commercial fan contest, but platform rules and rights-holder requirements still apply. If material must be removed or restricted, TSBC may take reasonable action while trying to keep competition fair.
13.4	Unless an edition announces other limits, Instagram preview clips may be no longer than 25 seconds and Grand Final presentation clips no longer than 90 seconds. TSBC may edit clips to make the show consistent.
13.5	AI may help make promotional graphics, stage ideas and production material. AI-generated songs cannot compete, and unauthorised AI imitation of a real artist's singing voice is prohibited. TSBC may ask for disclosure when AI content plays a significant role in official material.
13.6	You may promote your entry on social media and criticise SSC in good faith. Do not harass people, impersonate someone, spread deliberate harmful misinformation or manipulate votes.
14.1	Treat other SSC participants with reasonable respect. Do not bully, threaten, harass, discriminate against or reveal someone else's private personal information. Repeated unwanted contact and targeted abuse are not allowed.
14.2	You may say you dislike a song, disagree with a result or criticise a TSBC decision. Strong criticism is allowed when made in good faith. It must not become harassment, threats, knowingly invented harmful accusations or discriminatory abuse.
14.3	SSC welcomes people from different backgrounds. Do not discriminate against or abuse people because of their nationality, ethnicity, race, religion, gender, sexual orientation, disability or similar personal characteristics.
14.4	Compete honestly. Do not cheat with voting, false information, fake accounts or deliberately exploited bugs. Rules about voting integrity and fair account use give more detail.
14.5	SSC encourages friendships, creative country stories and discovering music together. Friendships are allowed, but your competitive votes still must be your own independent choices.
14.6	SSC community rules apply in official SSC spaces. TSBC may consider behaviour elsewhere only when it has a clear and serious link to participant safety, contest administration, voting manipulation or SSC integrity. TSBC does not control participants' unrelated private lives.
14.7	TSBC may use account and technical records when reasonably needed to run SSC safely and fairly. Information such as IP addresses, private account details and security data must not normally be made public.
14.8	Solaris Studio may use the minimum technical information reasonably needed for security, preventing duplicate participation or voting and investigating suspected abuse. Only authorised people or systems with a genuine need should access it. Public explanations should hide identifying details whenever possible.
15.1	A delegation may withdraw from an edition. If it withdraws before the entry-submission deadline, there is no penalty for withdrawing. It should inform TSBC as soon as reasonably possible. A country may also withdraw after that deadline but before its entry is published; that withdrawal is recorded and is not automatically punished only because the deadline passed.
15.2	If a country withdraws after its entry has been officially published, TSBC may apply a penalty only when the withdrawal seriously disrupts the edition. TSBC may decide not to penalise it because of exceptional circumstances.
15.3	Before the submission deadline, a country may replace its entry if the new song and artist meet every eligibility rule. After that deadline, a replacement normally requires TSBC approval.
15.4	If a Host Country stops hosting or withdraws from participation, TSBC arranges another host. The runner-up does not automatically inherit hosting rights.
15.5	If a country withdraws because of an exceptional event outside its reasonable control, TSBC must consider the unexpected-emergency (Force Majeure) rules.
16.1	Before applying a penalty, TSBC may collect evidence, ask questions and hear from the people involved. The person accused should normally have a fair chance to respond. Temporary protective action may be taken immediately if necessary for safety or voting integrity; an investigation alone does not prove a rule was broken.
16.2	You may report a genuine concern about a rule breach, safety problem or technical weakness without having to prove guilt first. An honest report is not a false report just because the concern later turns out to be unproven. Deliberately invented reports or evidence are prohibited.
16.3	When Solaris Studio offers different reporting privacy options, it must clearly say who can see the reporter's identity. A fully anonymous report must not be linked to the reporter's account in the case record. A confidential report may show the reporter's identity only to authorised reviewers according to the selected option. Do not promise full anonymity if normal reviewers can identify the reporter from stored account details.
16.4	When the system supports it, someone who reported anonymously can use a private recovery code to see updates, answer TSBC's questions and send more information without connecting the report to their SSC account. Retaliation and attempts to expose protected reporters are not allowed.
16.5	TSBC may preserve evidence and relevant records during an investigation. It can hide private or identifying information when sharing evidence. The person accused must still get enough information to respond fairly.
16.6	A report, accusation or automated flag is not proof that someone broke a rule. TSBC must review the facts before deciding that misconduct happened.
17.1	TSBC should choose a response that fits the actual problem and its impact. Where possible, it should first fix an invalid vote or other correctable problem instead of applying an unrelated penalty. Any penalty must take account of intent, harm, previous conduct and efforts to correct the mistake.
17.2	SSC has ten official penalty levels, from a warning to a lifetime ban. TSBC chooses the level based on how serious the proven breach was and the relevant circumstances. Fixed contest-point penalties are subtracted directly from the country's points. Bonus-point penalties apply to bonus points; where an edition awards no bonus points, TSBC must choose an applicable effective measure rather than pretend a bonus deduction removed regular contest points. Aggravating or mitigating factors may justify a different level. The exact ten levels are listed below.
17.3	The listed violation levels are normal starting points rather than automatic outcomes. TSBC may choose a stronger or lighter penalty when aggravating or mitigating factors (reasons to increase or reduce it) justify that choice. The examples below include vote trading, which normally starts at Level 9.
17.4	A penalty may be stronger if someone repeatedly breaks the rules, hides evidence, encourages others to cheat or deliberately causes major disruption.
17.5	A penalty may be lighter if someone admits a mistake, cooperates, fixes the problem quickly or shows that the breach was genuinely unintentional.
17.6	An Official Warning is a formal notice that a similar future breach may lead to a stronger penalty. TSBC may take earlier relevant warnings into account in later editions.
17.7	A penalty should apply to the person, delegation, entry, vote or account actually involved. A fictional country cannot personally choose to break rules. Banning one participant does not automatically prevent a different eligible person representing the country. Invalidating a vote does not automatically disqualify that country's entry.
17.8	For a serious penalty, TSBC should record which rule was broken, what happened, the main evidence and why the chosen penalty fits. Private evidence may be hidden where necessary, but the affected participant must have enough information to appeal fairly.
18.1	A participant or delegation that receives an official penalty may appeal. The normal deadline is 48 hours after TSBC communicates the decision. TSBC may extend that deadline in exceptional circumstances.
18.2	An appeal should say which decision you challenge, why you think it is wrong, what evidence supports you and what result you want. An appeal with no meaningful explanation may be dismissed.
18.3	TSBC must genuinely reconsider the decision, available evidence and relevant new information. For serious penalties, another eligible official should join the review when possible instead of leaving it entirely to the original decision-maker. An official with a serious personal conflict should step away when a suitable replacement is available.
18.4	After reviewing an appeal, TSBC may keep the penalty, make it lighter, remove it or make it stronger if important new evidence justifies this. The appeal decision is final under SSC's normal process.
18.5	You may make a genuine appeal even if TSBC later rejects it. Do not use appeals only to spam, harass people or deliberately delay a case.
18.6	An official who is closely involved in a case or has a serious personal conflict should not decide it when another eligible reviewer can take over. A complaint about an official should not normally be decided only by that same official.
19.1	Force Majeure means an unexpected exceptional event outside reasonable control that prevents SSC from running normally. Examples include major platform outages, widespread internet failures, disasters, serious illness affecting essential organisers and a previously accepted video being removed by a platform.
19.2	During an emergency outside reasonable control, TSBC may extend deadlines, postpone votes, reopen an affected process, replace unavailable material, pause an edition or cancel it when necessary. TSBC should announce its decision as soon as reasonably possible.
19.3	If an accepted song's video or other media disappears for reasons outside the delegation's control, TSBC may approve a suitable replacement video or another fair way for the entry to remain in the competition.
19.4	An emergency adjustment should reduce disruption and treat affected countries fairly. Its purpose is to restore the situation that would reasonably have existed without the emergency, not give anyone a new advantage.
20.1	For each edition, TSBC must publish a single clear set of edition-specific details, such as confirmation places, opening times, deadlines, competition format, jury and televote rules, points, results dates and hosting arrangements. Publish these before they become relevant. Players should not have to reconstruct them from scattered messages.
20.2	The General Regulations apply to every edition. An edition may set different details only where the General Regulations allow it. An exception to a General Regulation must be clearly announced, explain what it covers and be made known before it can fairly affect participants, except for urgent corrections allowed under Rule 21.1. Private habits or old edition practices do not quietly override the written rules.
21.1	TSBC may improve or update the rules between editions. A major competitive rule should not normally change after the relevant competition stage starts. An urgent change is allowed to fix a serious error, technical problem, manipulation risk or other issue threatening fairness.
21.2	If a rule is genuinely unclear, TSBC must explain how it applies using fairness, consistency, transparency, equal treatment and the contest's integrity as guiding principles.
21.3	The rulebook version marked Current in Solaris Studio is the official version. Older versions remain available as history and normally stop applying when replaced.
21.4	An updated rulebook or amendment starts applying on the effective date and time announced by TSBC, and remains in place until it is replaced or changed.
22.1	You control your own fictional country's normal stories, including its government, culture, cities, internal politics and military. You cannot decide major permanent outcomes for another represented country without the permission required by these rules. A claim in roleplay does not itself change official Solaris records.
22.2	If a shared story would permanently change another Protected country in an important way, its active Head of Delegation must normally agree to that specific outcome. Silence, temporary absence or withdrawing from one edition is not permission. Agreeing to play out a war does not automatically mean agreeing to annexation or destruction.
22.3	You can tell stories about wars, invasions, battles and peace agreements, and decide what your own fictional forces do. But starting a war does not let you permanently conquer, annex or erase another Protected country without its required permission. A temporary occupation can be part of an agreed story without changing the official map.
22.4	A country is Protected if it has an active Head of Delegation, or if it has had fewer than six consecutive completed editions with no active HoD at any point in each edition. Withdrawal, suspension, temporary absence and missing an edition do not immediately remove this protection. If it had an active HoD at any time during an edition, that edition does not count toward the six. You cannot permanently take over a Protected country without the required consent.
22.5	A country becomes Dormant after six consecutive SSC Editions have fully finished with no active Head of Delegation at any point in any of those editions. Count completed editions, not months. Having an active HoD even briefly in an edition breaks the count. TSBC records settle disputes about the count. A new HoD before official elimination restores protection immediately. Dormant does not mean the country's past entries or scores disappear.
22.6	Once a country is Dormant, other countries may conquer, annex (take over), partition (divide), absorb or completely eliminate it from the present-day fictional Solaris map, following the official map process in Rule 22.7. They cannot do this to a still-Protected country. The former country's historical entries, votes and results remain untouched.
22.7	A public claim or unofficial map image does not automatically change the official Solaris world map. Changes to borders or the existence of countries must be recorded through TSBC's map process. TSBC checks status, resolves competing claims, records the recognised outcome and keeps official maps consistent. Posting first does not automatically win a disputed claim.
22.8	If a new HoD takes over a Dormant country before it is officially eliminated, that country becomes Protected immediately. If it was already eliminated, a returning HoD cannot automatically reclaim borders now belonging to other countries. A restored country or successor state needs a new official map outcome.
22.9	You may split, merge or dissolve fictional areas you control, including creating new states or autonomous regions. If another Protected country's land would change, its HoD must agree. TSBC must be able to record the updated map and country identities without rewriting past contest history.
22.10	An annexation, merger or elimination today does not change who competed in past editions. Old entries, points, votes, flags, hosting records and results stay with the country that held them at the time, even if that country no longer exists on today's map.
22.11	Fictional rivalry does not permit real-life harassment, threats, forged permission, impersonation or tampering with accounts and country records. Roleplay cannot be used to force someone out of SSC or falsely make a Protected country appear Dormant.
`;

const SUMMARY_ROWS = String.raw`
1.1|SSC is an independent online fan contest where real people represent fictional countries with real music.
2.1|These words tell you exactly what common SSC terms mean.
3.1|TSBC runs SSC, checks competition fairness and makes official decisions.
3.2|The Contest Director manages each SSC edition and its official decisions.
3.3|The Creative Director helps with the next edition's look, but does not control voting or penalties.
4.1|Use Solaris Studio for official actions unless TSBC announces another official channel.
4.2|Protect your account and never use extra accounts to gain extra voting or participation rights.
4.3|You cannot use bots or scripts to beat other participants or bypass contest limits.
4.4|You may report a bug, but you cannot exploit it to gain an unfair advantage.
4.5|Trusted server records help settle disagreements about online submissions and times.
4.6|Limited confirmation places usually go to valid submissions in the order the server receives them.
4.7|Edition rules say which confirmation details are needed now and which you can provide later.
5.1|Every participating country has one official representative called a Head of Delegation (HoD).
5.2|Joining is voluntary, but official participants must follow SSC's rules.
5.3|Each registered fictional country has one delegation and uses its official SSC name.
6.1|Each participating country can submit one eligible entry, subject to TSBC checks.
6.2|Submit an eligible song in its original Spotify studio version unless another version is approved.
6.3|Every entry needs a suitable song video; an approved alternative may be used.
6.4|At the official check, the artist must be under 25 million Spotify listeners and the song video under 20 million YouTube views.
6.5|Artists who entered Eurovision or a Eurovision National Selection in 2015 or later cannot compete.
6.6|Artists have a three-appearance limit, and reuse by another country may need permission.
6.7|TSBC may check every credited main or featured artist, including their past SSC appearances.
6.8|All musical styles and languages are welcome; variety is encouraged, not required.
6.9|Countries may choose their entries directly or hold their own song selection.
6.10|TSBC checks entry eligibility using the information available at a recorded official time.
7.1|An edition usually has two Semi-Finals and a Grand Final; TSBC announces its exact format.
7.2|TSBC chooses the order of performances for the edition's presentation.
7.3|The published voting system decides the results, and the highest score normally wins.
7.4|Tied countries are separated using SSC's published sequence of tie-break steps.
7.5|The verified winning country receives the trophy and first right to host the next edition.
7.6|TSBC checks results before making them final and may correct serious errors.
8.1|The winner may creatively host the next online edition, host jointly or decline.
8.2|The host helps create the theme, artwork and presentation, while TSBC runs the contest.
8.3|The previous winner's HoD normally helps design the next edition as Creative Director.
8.4|Each edition should have a recognisable theme and a consistent look.
8.5|TSBC may finish the host's unfinished creative tasks without removing its Host status.
9.1|Rank songs according to your genuine musical opinions, not someone else's instructions.
9.2|A required jury ranking must be made independently and submitted before the deadline.
10.1|Only valid public votes within the edition's published limits are counted.
11.1|You cannot vote for your own country, including through another account.
11.2|Voting agreements, fake accounts, automated votes and ballot manipulation are prohibited.
11.3|You may promote your song, but you cannot trade votes or offer rewards for scores.
11.4|Voting for a friend's song is allowed when it is genuinely your choice.
11.5|Automated voting alerts can trigger a human review, but cannot decide guilt themselves.
11.6|TSBC may ask you to confirm that your voting choices were your own.
11.7|TSBC reviews voting evidence fairly; unusual statistics alone do not prove cheating.
11.8|TSBC checks votes and scores before publishing official results.
12.1|Official deadlines must show the exact date, time and time zone.
12.2|The official server's recorded time decides when an online action arrived.
12.3|Submit entries and required jury votes before their deadlines.
12.4|TSBC may extend a deadline for a justified reason and must treat affected countries fairly.
12.5|Major official-platform failures may justify postponing or reopening affected actions.
12.6|Results become public only after the required checks are complete.
13.1|TSBC creates SSC's official online show materials and presentation.
13.2|You may use official SSC branding appropriately, but cannot alter it misleadingly.
13.3|Artists and rights holders keep ownership of their music and images used in SSC.
13.4|Preview and Grand Final clips have published maximum lengths unless announced otherwise.
13.5|AI may help with visuals, but AI-generated competing songs and unauthorised imitation vocals are prohibited.
13.6|You may promote entries and criticise SSC, but cannot harass, impersonate or manipulate votes.
14.1|Treat participants respectfully; bullying, threats and revealing private details are prohibited.
14.2|You may criticise songs, rules and decisions, but not harass or threaten people.
14.3|Discrimination and discriminatory abuse are prohibited in SSC.
14.4|All participants must compete honestly without cheating or exploiting bugs.
14.5|Friendship and creative collaboration are welcome as long as votes stay independent.
14.6|SSC rules cover SSC spaces, and outside behaviour only when it seriously affects SSC.
14.7|Private account and technical information should not be made public.
14.8|Solaris Studio should only use and share technical information needed for legitimate SSC tasks.
15.1|Countries may withdraw, including after the submission deadline but before publication.
15.2|After an entry is published, a seriously disruptive withdrawal may lead to a penalty.
15.3|Entries may normally be replaced before the deadline; later changes need approval.
15.4|If the host withdraws, TSBC chooses another arrangement.
15.5|Withdrawals caused by serious unexpected problems are considered under emergency rules.
16.1|TSBC gathers evidence and normally gives participants a chance to respond before penalising them.
16.2|You can report a genuine concern without proving guilt yourself.
16.3|Reporting options must explain whether your identity is anonymous or confidential, and who can see it.
16.4|Anonymous reporters may use a private code to follow their case; retaliation is prohibited.
16.5|Investigators may hide private details while still giving accused participants a fair chance to respond.
16.6|A report or automated alert is not proof of a rule breach.
17.1|Penalties should fit the proven problem, and correctable problems should be fixed where possible.
17.2|SSC has ten possible penalty levels, from a warning to a lifetime ban.
17.3|Common violations have suggested penalty levels, but those levels are not automatic.
17.4|Repeated or deliberately harmful behaviour can justify a stronger penalty.
17.5|Honest mistakes, cooperation and quick fixes can justify a lighter penalty.
17.6|A formal warning means similar future misconduct may receive a stronger penalty.
17.7|A penalty should affect the person, vote, entry or delegation actually responsible.
17.8|A serious penalty decision must explain what happened, the evidence and the reason for the penalty.
18.1|You normally have 48 hours after receiving a penalty to appeal it.
18.2|An appeal should identify the decision, explain why you disagree and provide any evidence.
18.3|A serious appeal should receive a genuine review with another eligible official where possible.
18.4|An appeal can keep, reduce, remove or sometimes increase a penalty.
18.5|Genuine appeals are allowed, but appeals cannot be used to harass or stall a case.
18.6|An official with a serious personal conflict should not be the only person deciding a case.
19.1|Major events outside anyone's reasonable control may require emergency contest changes.
19.2|During an emergency, TSBC may delay, reopen, pause or cancel affected contest processes.
19.3|If accepted media becomes unavailable unexpectedly, TSBC may approve a replacement.
19.4|Emergency changes should restore fairness, not give a country an extra advantage.
20.1|Each edition must publish its own dates, formats, voting limits and other changeable details.
20.2|General rules apply to all editions; edition rules can change only permitted details.
21.1|TSBC may update rules, but major competition changes should not normally happen mid-stage.
21.2|TSBC decides genuinely unclear cases fairly and consistently.
21.3|The version marked Current in Solaris Studio is the official rulebook.
21.4|New or amended rules start applying from the effective date and time TSBC announces.
22.1|You may shape your own country's fictional story, but not permanently rewrite someone else's.
22.2|Permanent changes to another Protected country normally need that country's HoD to agree.
22.3|You may roleplay wars, but an invasion alone does not let you permanently take another country's land.
22.4|A country stays Protected until it has completed six editions in a row with no active HoD.
22.5|A country becomes Dormant after six completed editions in a row without any active HoD.
22.6|A Dormant country may be taken over, divided or eliminated from today's map, but its past scores remain.
22.7|Permanent border changes must be recorded by TSBC; unofficial claims do not change the map.
22.8|A returning HoD restores protection before elimination, but not automatically the borders of an eliminated country.
22.9|You may split or merge fictional countries you control, but need consent for another Protected country's land.
22.10|Changes to today's countries never change past SSC entries, votes or results.
22.11|Fictional wars never justify real harassment, impersonation or forged consent.
`;

export const PLAIN_SUMMARIES: Record<string, string> = Object.fromEntries(
  SUMMARY_ROWS.trim().split("\n").map((row) => {
    const split = row.indexOf("|");
    if (split < 0) throw new Error("Missing v4.2 rule summary separator");
    return [row.slice(0, split), row.slice(split + 1)];
  }),
);

type RuleWordingPatch = Partial<Pick<SscRule, "summary" | "important" | "allowed" | "prohibited" | "bullets" | "examples">>;
const SPECIFIC_CHANGES: Record<string, RuleWordingPatch> = {
  "4.6": {
    "important": "Device latency or a phone countdown reaching zero first does not guarantee a place. If a confirmed Solaris Studio fault affected fairness, TSBC can correct the round under Rules 12.5 and 19.4."
  },
  "6.4": {
    "summary": "The artist must have under 25 million Spotify monthly listeners and the song video under 20 million YouTube views at the official check.",
    "important": "If the song has no official music video, use the song's YouTube video instead. The checked video and figures must be recorded so everyone knows which figures applied.",
    "examples": [
      {"title":"Official song video","outcome":"information","detail":"If the song has an official music video, use that video's YouTube view count at the recorded check time."},
      {"title":"No official music video","outcome":"information","detail":"Use a YouTube video for the song instead and record the exact video checked. The selection procedure for multiple song videos still needs an official decision."}
    ]
  },
  "6.5": {
    "summary": "Artists who entered Eurovision, or a Eurovision National Selection in 2015 or later, cannot compete.",
    "allowed": [
      "An artist who took part in a Eurovision National Selection before 2015, if otherwise eligible.",
      "A former Junior Eurovision artist who is no longer underage and meets the other requirements."
    ],
    "prohibited": [
      "An artist who previously competed in the Eurovision Song Contest.",
      "An artist who competed in a Eurovision National Selection in 2015 or later.",
      "Submitting a song from Junior Eurovision."
    ]
  },
  "6.6": {
    "summary": "An artist can compete at most three times, cannot return after winning, and needs no prior-country permission if that country has no active HoD.",
    "important": "If the former country has an active HoD, another country needs its delegation's permission. If it does not have an active HoD, no permission is needed. This is an SSC-only rule, not ownership of the artist.",
    "examples": [
      {"title":"Same country returns","outcome":"allowed","detail":"An artist represented Oland once. Oland may choose them again if they remain eligible and have not won SSC."},
      {"title":"Previous country's HoD is active","outcome":"depends","detail":"An artist represented Oland, and Oland still has an active HoD. Vendia needs the previous delegation's permission to use that artist."},
      {"title":"Previous country has no active HoD","outcome":"allowed","detail":"An artist represented Oland, but Oland has no active Head of Delegation. Vendia does not need Oland's permission, although other eligibility rules still apply."}
    ]
  },
  "12.2": {
    "important": "If an official platform fault shows the wrong time, TSBC may take fair corrective action under Rules 12.5 and 19.4."
  },
  "15.1": {
    "summary": "A country may withdraw. Withdrawal before the submission deadline has no penalty; after the deadline but before publication it is still permitted.",
    "important": "A withdrawal after the submission deadline but before publication is not automatically penalised only because that deadline passed. After publication, Rule 15.2 applies if the withdrawal seriously disrupts the edition."
  },
  "17.2": {
    "important": "Fixed point penalties are subtracted from contest points. Levels 2 and 3 affect bonus points only. If there are no bonus points, TSBC should select a different applicable sanction rather than silently convert a bonus penalty. Aggravating or mitigating factors (reasons for a stronger or lighter penalty) still matter."
  },
  "20.2": {
    "important": "A private message, an older edition's custom or silence cannot silently change the published rules. Urgent exceptions must follow Rule 21.1."
  },
  "22.4": {
    "summary": "Your country stays protected while it has an active HoD or has not yet completed six whole editions in a row without one.",
    "important": "Not competing in one edition, losing an HoD temporarily or withdrawing does not mean that someone else may annex your country."
  },
  "22.5": {
    "summary": "Dormant means six completed SSC editions in a row with no active Head of Delegation at any point.",
    "important": "Dormant status allows permanent fictional map changes under Rule 22.6 but does not delete old entries, scores or results. A new HoD before official elimination immediately restores protection.",
    "bullets": [
      "0 to 5 completed editions in a row without an active HoD: the country is still Protected.",
      "6 completed editions in a row without an active HoD: the country becomes Dormant.",
      "If an HoD is active even once during an edition, that edition does not count toward the six.",
      "A new active HoD before official elimination makes the country Protected immediately."
    ]
  },
  "22.6": {
    "important": "This applies only after the exact six-edition Dormant test in Rule 22.5 and the map-recording steps in Rule 22.7. Old SSC results cannot be deleted.",
    "allowed": [
      "Take over all or part of a Dormant country's fictional territory.",
      "Divide its land between other countries.",
      "Remove it as a country on today's map, while keeping its past SSC history.",
      "Create new fictional territories or states from its former land if the official map remains clear."
    ],
    "prohibited": [
      "Take over a country before it completes the six-edition Dormant test.",
      "Delete or rewrite the former country's past SSC songs, votes, results or hosting records."
    ]
  }
};

export const CLEAR_RULE_BODIES: Record<string, string[]> = Object.fromEntries(
  BODY_ROWS.trim().split("\n").map((row) => {
    const separator = row.indexOf("\t");
    if (separator < 0) throw new Error("Missing rule ID separator in v4.2 wording");
    return [row.slice(0, separator), row.slice(separator + 1).split(" § ")];
  }),
);

/** Keep examples, official thresholds, exact sanction levels and search tags intact. */
export function withPlainLanguage<T extends SscRule>(rule: T): T {
  const body = CLEAR_RULE_BODIES[rule.id];
  if (!body) throw new Error(`Missing plain-English wording for SSC Rule ${rule.id}`);
  const extra = SPECIFIC_CHANGES[rule.id] ?? {};
  return {
    ...rule,
    ...extra,
    summary: extra.summary ?? PLAIN_SUMMARIES[rule.id] ?? rule.summary,
    body: [...body],
    allowed: extra.allowed ?? rule.allowed,
    prohibited: extra.prohibited ?? rule.prohibited,
    bullets: extra.bullets ?? rule.bullets,
    examples: extra.examples ?? rule.examples,
  };
}
