import type { SscRule } from "@/lib/ssc-rules/types";

/**
 * Proposed v4.2 plain-language wording. Every rule ID is preserved.
 * Only the current bundled draft uses these overrides; old release snapshots stay immutable.
 * Each row is <official rule ID> TAB <body paragraphs separated by §>.
 */
const BODY_ROWS = String.raw`
1.1	The Solaris Song Contest (SSC) is a fan-run online music competition. Real people represent fictional countries using real songs. SSC takes place online. A host country, stage or broadcast is part of the online show, not a physical event. SSC is independent and is not officially connected to artists, broadcasters, record labels or streaming services.
2.1	These official words have the same meaning throughout SSC. § Edition: One complete SSC contest, including participation, song selection, voting and results. § Country: A fictional country registered in SSC, not a real-world government. § Participant: A real person taking part in the contest. § Delegation: The person or group officially representing a country. § Head of Delegation (HoD): The delegation's main representative and contact with TSBC. § Entry: The song and artist or performing act chosen to represent a country. § Confirmation: The process that officially secures a country's participation in an edition. § National Selection: When a country considers several songs or artists before choosing its entry. § Internal Selection: When the delegation chooses its entry directly. § Solaris Studio: The main online platform for SSC's entries, votes, messages and administration. § Official Contest Channel: Solaris Studio or another channel that TSBC announces for official SSC actions. § Official Deadline: The announced date and time by which a required action must be completed. § Submission: Material sent to TSBC through an official SSC channel. § Jury Vote: A delegation's official independent vote under the published voting rules. § Televote: A public vote submitted through SSC's official voting system. § Official Result: A contest result checked and confirmed by TSBC. § TSBC: The Terra Solaris Broadcasting Coalition, the organisation running SSC. § Appeal: A request for TSBC to review a decision. § Penalty: A punishment given after TSBC finds that someone broke a rule. § Removed from the contest: A country, entry, vote or person is taken out because a rule was broken. § Withdrawal: When a country formally leaves an edition after confirming participation. § Major emergency: A serious unexpected problem that people cannot control and that stops the contest from running normally. § Protected country: A country that cannot be permanently taken over, divided or eliminated without the required consent. Rules 22.4 and 22.5 explain its status. § Unprotected country: A country with no active HoD at any time across six completed SSC editions in a row. Its protection ends only after all six have finished. See Rule 22.5. § Official map: The version of the fictional Solaris world map recognised and recorded by TSBC. § Taking over land: Making another fictional country's land part of your country. § Dividing a country: Splitting its fictional land into parts. § New country replacing an older one: A country that keeps part of the old country's identity or history. § Reasons for a lighter penalty: Facts that may make a penalty less serious. § Reasons for a stronger penalty: Facts that may make a penalty more serious.
3.1	The Terra Solaris Broadcasting Coalition (TSBC) runs SSC and makes sure the contest is fair. TSBC manages editions and the official systems, checks entries and votes, investigates possible cheating, publishes checked results, applies penalties when justified and explains its decisions. If the rules do not cover a situation, TSBC must make a fair decision, explain why and treat delegations equally.
3.2	The Contest Director runs each edition. They check entries, set deadlines, oversee voting and results, apply the rules and handle disagreements. Delegations must be treated consistently.
3.3	The Creative Director is usually the HoD of the country that won the previous edition. They help plan the slogan, artwork, stage ideas and entertainment. This is a creative role: they do not decide who can compete, control votes, issue penalties or change results.
4.1	Use Solaris Studio for official confirmations, entries, votes and contest information unless TSBC announces another official channel. If the main system is unavailable, TSBC may announce a replacement channel. If two official channels give different instructions, TSBC must say which one to follow and deal fairly with anyone affected. An unofficial private message cannot change an official rule or deadline.
4.2	Keep your Solaris Studio account and login details safe. Do not pretend to be another participant, enter someone else's account without permission or use extra accounts to get more votes, places or other competitive rights. Approved administrative or testing accounts are allowed when they are not used to compete.
4.3	Do not use bots, scripts or other tools to get an unfair advantage. For example, you cannot use them to unfairly grab confirmation places, create extra voting accounts or get around voting limits. Normal browser features and tools that help people with disabilities are allowed.
4.4	If you find a bug, you may check what it does so you can report it to TSBC. Do not test it beyond what is needed to explain the problem. Do not deliberately use a bug to gain points, votes, confirmation places or access to someone else's information. Do not share a serious bug in a way that helps other people misuse it.
4.5	If people disagree about when an online action happened, TSBC may check the system's records, including when a submission arrived and what the system recorded. A phone clock or screenshot does not automatically outweigh the official server's record.
4.6	Before confirmation opens for a limited number of places, TSBC must announce when it opens, how many places are available and what information HoDs need to provide. Unless the edition rules announce another fair way to choose countries, valid confirmations get places in the order the official server receives them after opening. Your phone's countdown reaching zero first does not guarantee a place. If the official system fails, TSBC may take fair steps to correct the result.
4.7	The edition rules must say what information is needed to reserve a place, what can be sent later and what is optional. A field appearing on the website does not mean you must fill it in early. TSBC may set a published deadline after which changes to important identity or eligibility details need approval.
5.1	Every participating country has one Head of Delegation (HoD). The HoD represents the country and is its main contact with TSBC. The HoD handles confirmation, entries, required jury votes, deadlines and making sure their delegation follows the rules.
5.2	Joining SSC is a choice. Once you take part in an official contest process, you agree to follow these rules and the announced rules for that edition. Treat other people respectfully and compete fairly.
5.3	Each fictional country may have one SSC delegation and competes under its registered name. A change to the registered country name needs TSBC approval.
6.1	Each participating country may submit one entry (a song and its artist) per edition. TSBC must check that it meets the requirements before the entry is officially accepted. Sending an entry does not guarantee acceptance.
6.2	The competing song must be available on Spotify in its original studio version, unless TSBC explicitly approves another version. Remixes, live recordings and other versions need approval. Songs previously entered in Eurovision, Junior Eurovision, American Song Contest or another competition TSBC has declared ineligible cannot be used.
6.3	Each entry must provide suitable video material. Use the official music video when one exists. If it does not, TSBC may accept the song's official visualiser, lyric video or another suitable approved song video. Unless an edition announces otherwise, Instagram previews can be at most 25 seconds and Grand Final presentation clips at most 90 seconds.
6.4	At the official check, the artist must have fewer than 25 million monthly Spotify listeners. The song's official music video must have fewer than 20 million YouTube views. If there is no official music video, TSBC checks a full-song YouTube upload instead. § First, check full-song videos uploaded before the entry deadline on the artist's or record label's official YouTube channel. If there is more than one, use the video with the most views. § If neither official channel has a suitable full-song video, use the most-viewed full-song upload from another channel that clearly identifies the song and was available before the entry deadline. A fan upload does not take priority over an official artist or label upload just because it has more views. § TSBC must save the chosen video's link, upload date, view count and the time of the check. The 20-million-view limit applies to that video at the recorded check time. TSBC must not switch to a less-viewed upload just to make the song pass. A song that was correctly accepted stays allowed if its views or listeners rise later. A country cannot post a new video to get around the limit. TSBC cannot reject an entry just because someone calls the artist 'mainstream'. Any other set limit must be announced before the selection or entry period begins.
6.5	An artist who has competed in the Eurovision Song Contest cannot compete in SSC. An artist who participated in a Eurovision National Selection in 2015 or any later year also cannot compete. Participation in a National Selection before 2015 may be allowed if the other requirements are met. Previous Junior Eurovision artists may be eligible if they are no longer underage and meet the other artist rules. Junior Eurovision songs themselves cannot be submitted.
6.6	An artist may compete in SSC no more than three times and cannot compete again after winning SSC. Usually, only the country they previously represented may choose them again. Another country needs permission from the previous country's delegation, but if that country has no active Head of Delegation, permission is not required. All other artist-eligibility rules still apply. These are internal SSC representation rules, not real-world ownership of an artist.
6.7	When a song has more than one main or featured artist, TSBC may check whether each of them meets the rules and has competed in SSC before. An artist cannot avoid previous-appearance rules simply by changing their stage name.
6.8	SSC welcomes songs in any language or musical style. Originality and variety are encouraged, not an additional genre quota or an unstated eligibility requirement.
6.9	A country may hold a National Selection with several possible entries or choose an entry directly through an Internal Selection. Both methods are equally valid in SSC.
6.10	Make sure your entry meets the rules before submitting it. TSBC may check Spotify and YouTube figures, artist and song history, reuse limits and video availability, and ask for evidence if something cannot be verified. For Spotify and YouTube numbers that change, TSBC uses the figures recorded at the official check. Later changes do not normally undo acceptance, unless information was false or the original check was seriously wrong.
7.1	SSC uses numbered editions. An edition usually has two Semi-Finals and one Grand Final, but TSBC may add Semi-Finals when needed. The exact format must be announced before competition starts.
7.2	TSBC decides the running order. It may put songs in an order that makes the show varied and enjoyable. No country has a guaranteed right to a certain position.
7.3	The published voting system for that edition decides the result. Unless its rules say otherwise, the country with the most total points wins.
7.4	If two countries have the same total points, use these steps in order. Stop as soon as one country is ahead. § First, compare jury points. § Next, count how many countries gave each entry points. § Next, compare the highest single score each entry received. § Next, compare televote points. § Next, the country that appeared earlier in the running order wins the tie. § If the tie still cannot be broken, TSBC makes the final decision.
7.5	The country with the verified highest winning result is the official winner. It receives the SSC trophy and the first right to creatively host the next edition.
7.6	Results are not final until TSBC has checked the votes, score calculations and any entry eligibility problems. TSBC may delay publication while doing this. If a serious error is discovered later, TSBC may correct the official result where justified.
8.1	The winning country gets the first chance to host the next SSC edition. Hosting means helping create the online show, not holding a physical event. The winner may host alone, host jointly or decline. If it declines, TSBC chooses an alternative; the runner-up does not automatically become host.
8.2	The Host Country works with TSBC on the edition's look and online presentation. This may include the theme, slogan, artwork, promotional activity and fictional host setting. TSBC still runs the contest, voting and official decisions.
8.3	The previous winner's Head of Delegation usually acts as Creative Director. They can propose artwork, branding, stage concepts, interval acts and other creative ideas, but this does not give them control over official competition decisions.
8.4	Each edition should normally have its own theme, slogan, logo, artwork, graphics and stage design. They should look and feel like parts of the same show.
8.5	If the Host Country or Creative Director is unavailable or misses required creative work, TSBC may finish or take over those tasks so the edition can continue. This does not automatically remove the country's Host status.
9.1	Vote mainly for the songs you honestly prefer. You may consider musical quality, creativity, originality, production and overall impact. You do not have to judge songs in the same way as someone else.
9.2	When an edition uses jury voting, each required delegation must submit one official jury ranking before the published deadline. The delegation must choose its own ranking. It cannot let another person decide its votes. The edition rules explain the voting format.
10.1	If an edition has public voting, TSBC must explain the rules before voting opens. Follow the announced limits on how many votes you may cast, how many countries you may support and how many votes one country may receive from you. Only valid votes received through the official televoting system count. TSBC may reject duplicate votes, fake votes or votes that do not meet the technical requirements.
11.1	You cannot vote for your own country, either as a jury member or in the public televote. You also cannot use another account to get around this restriction.
11.2	Make your own voting choices. You cannot trade points or agree with someone else how to rank songs. You also cannot use fake or extra accounts, automate votes, interfere with the televote or tell another delegation how it must vote. Giving false answers during an integrity check is also prohibited.
11.3	You may promote your entry and ask people to vote for it if they like it. You cannot promise to vote for someone in return for their vote, offer rewards for points or arrange for someone to vote a certain way.
11.4	An HoD can give a friend's entry high points if they genuinely like it. HoDs can be friends or part of the same group, but each must choose their votes independently. TSBC needs reliable evidence of an agreement about votes, or that someone controlled another HoD's vote, before calling it cheating. Friendship or similar voting patterns alone are not proof.
11.5	Solaris Studio may alert TSBC to unusual voting patterns. Examples include two countries repeatedly giving each other high points, sudden changes in how an HoD votes or large differences between jury and public votes. The system may give more weight to recent editions, as long as it uses that method consistently. An alert is a reason for a person to review the votes, not proof of cheating. A real person must consider the evidence; software cannot decide guilt or penalties on its own.
11.6	If TSBC asks whether you chose your votes yourself, answer honestly. TSBC may also ask whether anyone offered to trade votes, promised rewards or pressured you. These questions do not mean you are accused of cheating. Deliberately lying in your answer may itself break the rules.
11.7	TSBC may investigate suspected cheating using messages, what people involved have said, witness reports, system records and voting patterns. It must consider the evidence together and in context. Unusual voting patterns alone do not prove cheating.
11.8	Before publishing results, TSBC may check jury ballots, televotes, calculations, rankings and entry eligibility. Results become official only after the necessary checks are complete.
12.1	TSBC must announce important times with the date, time and time zone (or its offset from UTC). A local phone clock or countdown does not change an official deadline. If an announcement uses CET or CEST, the correct time for that date applies.
12.2	The time saved by the official server decides when an online action arrived. Your phone's clock, a screenshot or a countdown cannot replace a reliable server record. If Solaris Studio showed the wrong time because of a confirmed problem, TSBC may take fair corrective action under Rules 12.5 and 19.4.
12.3	Submit your entry and any required jury vote before their published deadlines. TSBC may reject a late submission. If the delay disrupts the contest, TSBC may also give a penalty when justified.
12.4	TSBC may extend a deadline for a good reason. Everyone affected should normally get the same extra time, unless the problem affects only one person or delegation.
12.5	If Solaris Studio or another official SSC system has a serious problem that disrupts the contest schedule, TSBC may extend a deadline, delay part of the contest, or reopen a stage. TSBC may also use records saved by the system to correct mistakes. § If the problem is only with your own phone or internet, you do not automatically get extra time. For example, losing Wi-Fi just before voting closes does not guarantee an extension.
12.6	TSBC publishes results after checking the votes and scores and finishing any investigation needed before publication.
13.1	TSBC puts together SSC's online show, including graphics, scoreboards, voting displays, videos, recaps, interval acts and other show material.
13.2	TSBC controls the official SSC logo and original contest branding. You may use SSC branding for SSC activities, but you cannot change it to mislead people.
13.3	Artists and anyone else who owns the rights to songs, recordings, photos, names or videos keep those rights. Sending a song to SSC does not give TSBC or a delegation ownership of it. SSC is a non-commercial fan contest, but copyright rules and the rules of platforms such as YouTube still apply. If material has to be removed or restricted, TSBC may make changes while trying to keep the competition fair.
13.4	Unless the edition rules set different limits, Instagram previews may last up to 25 seconds and Grand Final clips up to 90 seconds. TSBC may edit clips to make the show consistent.
13.5	You may use AI to help make promotional graphics, stage ideas and other show material. AI-generated songs cannot compete. You also cannot use AI to copy a real artist's singing voice without permission. TSBC may ask you to say when AI played a major part in official material.
13.6	You may promote your entry on social media and criticise SSC honestly. You cannot harass people, pretend to be someone else, deliberately spread harmful false claims or interfere with votes.
14.1	Treat other people in SSC with respect. You cannot bully, threaten, harass or discriminate against someone, or share their private information without permission. Repeated unwanted contact and targeted abuse are not allowed.
14.2	You may say you dislike a song, disagree with a result or criticise a TSBC decision. Strong criticism is allowed. It cannot turn into harassment, threats, knowingly false and harmful accusations or discrimination.
14.3	SSC welcomes people from different backgrounds. Do not discriminate against or abuse people because of their nationality, ethnicity, race, religion, gender, sexual orientation, disability or similar personal characteristics.
14.4	Compete honestly. Do not cheat with voting, false information, fake accounts or deliberately exploited bugs. Rules about voting integrity and fair account use give more detail.
14.5	SSC is for sharing music, friendships and fictional country stories. You can be friends with other HoDs, but your votes must still be your own choices.
14.6	SSC community rules apply in official SSC spaces. TSBC may consider something that happens elsewhere only when it seriously affects safety, the running of SSC or fair voting. TSBC has no authority over participants' unrelated private lives.
14.7	TSBC may use account and system records when needed to keep SSC safe and fair. IP addresses, account details and security data must normally stay private.
14.8	Solaris Studio may use only the technical information needed to protect accounts, prevent duplicate entries or votes, and investigate suspected abuse. Only authorised people or systems that need the information should have access. Public explanations should hide identifying details whenever possible.
15.1	A delegation may withdraw from an edition. There is no penalty for withdrawing before the entry deadline. Tell TSBC as soon as you can. A country may also withdraw after the entry deadline but before TSBC publishes its song. TSBC records the withdrawal, and missing the deadline alone is not a reason to issue a penalty.
15.2	If a country withdraws after its entry has been officially published, TSBC may apply a penalty only when the withdrawal seriously disrupts the edition. TSBC may decide not to give a penalty when there is a serious reason beyond the country's control.
15.3	Before the submission deadline, a country may replace its entry if the new song and artist meet every eligibility rule. After that deadline, a replacement normally requires TSBC approval.
15.4	If a Host Country stops hosting or withdraws from participation, TSBC arranges another host. The runner-up does not automatically inherit hosting rights.
15.5	If a country has to withdraw because of a serious event it could not reasonably control, TSBC must consider the major emergency rules.
16.1	Before deciding on a penalty, TSBC may gather evidence, ask questions and hear from everyone involved. A person accused of breaking a rule should normally have a fair chance to respond. TSBC may act immediately to protect people or fair voting if needed. An investigation alone does not prove anyone broke a rule.
16.2	You can report a suspected rule break, safety problem or security bug without having to prove it yourself. An honest report is not a false report just because the concern later turns out to be unproven. Deliberately invented reports or evidence are prohibited.
16.3	When Solaris Studio lets you choose how private a report will be, it must explain who can see your identity. § For an anonymous report, the case record must not link the report to your SSC account. § For a confidential report, only the authorised reviewers allowed by your chosen setting may see your name. The system must not call a report anonymous if reviewers can identify you through account details.
16.4	If the system offers it, someone who reported a problem anonymously may receive a private recovery code. That code lets them check updates, answer TSBC's questions and add details without linking the report to an SSC account. Nobody may punish or expose someone for making a protected report.
16.5	TSBC may keep evidence and records while investigating a report. It may hide private details when sharing evidence, but the person accused must still get enough information to respond fairly.
16.6	A report, accusation or automated flag is not proof that someone broke a rule. TSBC must review the facts before deciding that misconduct happened.
17.1	TSBC should respond to a rule break in a way that fits what happened. If a bad vote or another mistake can be corrected, TSBC should try to fix that first rather than give an unrelated penalty. When choosing a penalty, TSBC must consider whether the act was deliberate, the harm it caused, earlier rule breaks and efforts to put things right.
17.2	SSC has ten penalty levels, from an official warning to a lifetime ban. TSBC must choose a penalty that fits the proven rule break and the facts of the case. § If a penalty removes a fixed number of contest points, TSBC must subtract all those points from the country's score. A negative score is allowed. For example, a country with 35 points and a 50-point penalty finishes with -15 points, not zero. § Penalties that remove bonus points affect bonus points only. If an edition has no bonus points, TSBC cannot use Levels 2 or 3 because those penalties remove bonus points. TSBC must choose a different penalty from the ten existing levels and explain its choice in writing. It must not replace a bonus-point penalty with a regular contest-point deduction. § TSBC may choose a stronger or lighter penalty when the facts justify it. The ten levels are listed below.
17.3	The listed penalty levels are a guide, not an automatic punishment. TSBC may choose a stronger or lighter level if it explains why. Vote trading, for example, normally starts at Level 9.
17.4	TSBC may give a stronger penalty when someone breaks the rules repeatedly, hides evidence, encourages cheating or deliberately causes serious disruption.
17.5	TSBC may give a lighter penalty when someone admits a mistake, helps with the investigation, fixes the problem quickly or shows the rule break was genuinely accidental.
17.6	An Official Warning tells someone that breaking a similar rule again may lead to a stronger penalty. TSBC may consider earlier relevant warnings, even in later editions.
17.7	A penalty should affect whoever or whatever was involved in the rule break: a person, delegation, entry, vote or account. A fictional country cannot act by itself, so TSBC must consider who was responsible. Banning one HoD does not automatically ban another eligible HoD from representing that country. Cancelling a vote does not automatically remove the country's entry.
17.8	For a serious penalty, TSBC should record the rule that was broken, what happened, the main evidence and why it chose that penalty. TSBC may hide private details when needed, but the affected person must receive enough information to make a fair appeal.
18.1	A person or delegation who receives an official penalty may ask TSBC to review it. This is called an appeal. Normally, you have 48 hours from when TSBC tells you its decision. TSBC may allow more time in exceptional circumstances.
18.2	If you appeal, explain which decision you disagree with, why, what evidence you have and what you want TSBC to change. TSBC may reject an appeal that gives no real reason.
18.3	TSBC must look at the decision again, including the evidence and any important new information. If the penalty is serious, another eligible TSBC official should help review the appeal where possible. An official who is personally involved or cannot be fair should step aside when someone suitable can take over.
18.4	After reviewing an appeal, TSBC may keep, reduce or remove the penalty. It may also make the penalty stronger if important new evidence justifies it. The decision on the appeal is final under SSC's usual process.
18.5	You may appeal in good faith, even if TSBC later rejects your appeal. You cannot use appeals to spam or harass people or deliberately delay a case.
18.6	If a TSBC official is closely involved in a case or has a serious personal conflict, someone else should decide it where an eligible reviewer is available. An official should not normally be the only person deciding a complaint about their own conduct.
19.1	A major emergency is an unexpected problem outside people's reasonable control that stops SSC from running normally. Examples include a major website failure, an internet outage affecting many HoDs, a natural disaster, serious illness affecting essential organisers or a platform removing an accepted entry's video.
19.2	During a major emergency, TSBC may extend deadlines, postpone voting, reopen an affected stage, replace unavailable material, pause the edition or cancel it if necessary. TSBC should announce its decision as soon as it reasonably can.
19.3	If a video or other media for an accepted entry is removed through no fault of its delegation, TSBC may approve replacement material. TSBC may also find another fair way to keep the entry in the contest.
19.4	Changes made during an emergency should limit disruption and treat affected countries fairly. TSBC should try to put the contest back where it would have been without the problem, not give anyone an unfair advantage.
20.1	For every edition, TSBC must publish one clear list of that edition's special rules and details. The list must include confirmation places, opening times, deadlines, the show format, voting rules, points, result dates and hosting plans. TSBC must publish each detail before the part of the contest it affects. HoDs should not have to search through private messages to find official rules.
20.2	The General Regulations apply to every edition. An edition's special rules can change something only if the General Regulations allow it. TSBC must explain an allowed change before it affects HoDs. An urgent fix under Rule 21.1 is the only exception to that timing rule. Private messages and practices from past editions cannot change the written rules.
21.1	TSBC may update the rules between editions. Once a stage starts, a major rule that affects the competition should normally stay the same. TSBC may make an urgent change to fix a serious mistake, system problem, cheating risk or another threat to fairness.
21.2	If a rule is unclear, TSBC must explain what it means. It must treat similar situations consistently, give reasons for its decisions and be fair to all countries.
21.3	The rulebook marked Current in Solaris Studio is the official version. Older versions remain available to read, but normally stop applying once a new version replaces them.
21.4	A new rulebook or rule change starts applying on the date and time TSBC announces. It stays in effect until TSBC changes or replaces it.
22.1	You decide the normal stories about your fictional country, including its government, culture, cities, politics and army. But you cannot make lasting changes to another country's land or future without the permission required by these rules. Telling a story does not change the official Solaris records.
22.2	If your story would permanently and significantly change another Protected country, its active HoD must normally agree to that specific change. Silence, being away for a short time or withdrawing from one edition is not permission. Agreeing to a fictional war is not the same as agreeing to lose land or be destroyed.
22.3	You can write stories about wars, battles and peace deals, and decide what your own fictional forces do. But starting a war does not give you permission to take land from, divide or erase a Protected country. HoDs can agree to a temporary takeover as part of a story without changing the official map.
22.4	A country is Protected while it has an active Head of Delegation (HoD). It remains Protected until six SSC editions in a row have ended with no active HoD at any time during any of those editions. An active HoD, even briefly during one edition, breaks that count. Withdrawing from one edition, skipping an edition or being without an HoD for a short time does not end protection by itself. You cannot take over a Protected country without the permission these rules require.
22.5	A country becomes Unprotected only after six SSC editions in a row have fully ended without an active Head of Delegation (HoD) at any point during any of them. Count the number of completed SSC editions without an HoD, not the number of months. If an HoD is active even briefly during an edition, the count starts over. If HoDs disagree about the count, TSBC checks the official records. If a new HoD becomes active before the country is removed from the official map, its protection returns immediately. Its past entries and scores never disappear.
22.6	After a country becomes Unprotected under Rule 22.5, other countries may take over its land, divide it, add it to their own country or remove that country from the current Solaris map. They must follow the official map process in Rule 22.7. They cannot do this to a Protected country. Past SSC songs, votes, results and hosting records stay unchanged.
22.7	Posting a claim or drawing a new map does not make a border change official. TSBC must approve and record changes to countries and borders through the official map process. TSBC checks which countries are Protected, reviews competing claims and records what changes are accepted. Making a claim before someone else gives you no automatic right to the land.
22.8	If an Unprotected country gets a new HoD before it is removed from the official map, it becomes Protected immediately. If the country was already removed, its former HoD cannot automatically take back land now held by other countries. Bringing the old country back, or creating a new country to replace it, needs a new official map decision.
22.9	You may divide, join or remove the fictional areas you control. You may also create new countries or regions with their own local government. If this would change a Protected country's land, its HoD must agree. TSBC must record the map change. Past contest results do not change.
22.10	Changing a country's borders or removing it today does not change SSC history. Songs, points, votes, flags, hosting records and results still belong to the country that had them when they happened. This remains true even if the country no longer exists on today's map.
22.11	A fictional rivalry does not excuse real bullying, threats, faking someone's permission, pretending to be someone else or changing accounts or country records without permission. You cannot use roleplay to force someone out of SSC or falsely claim a Protected country is Unprotected.
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
6.4|Spotify listeners and YouTube views must be below the limits when TSBC checks the entry.
6.5|Artists who entered Eurovision or a Eurovision National Selection in 2015 or later cannot compete.
6.6|Artists have a three-appearance limit, and reuse by another country may need permission.
6.7|TSBC may check every credited main or featured artist, including their past SSC appearances.
6.8|All musical styles and languages are welcome; variety is encouraged, not required.
6.9|Countries may choose their entries directly or hold their own song selection.
6.10|TSBC checks entry eligibility using the information available at a recorded official time.
7.1|An edition usually has two Semi-Finals and a Grand Final; TSBC announces its exact format.
7.2|TSBC chooses the order of performances for the edition's presentation.
7.3|The published voting system decides the results, and the highest score normally wins.
7.4|If two countries have the same points, check the five tie-break steps in order.
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
12.5|If an official system fails, TSBC can delay or reopen affected tasks fairly.
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
16.4|People who report problems without their names may get a private code to follow updates.
16.5|Investigators may hide private details while still giving accused participants a fair chance to respond.
16.6|A report or automated alert is not proof of a rule breach.
17.1|Penalties should fit the proven problem, and correctable problems should be fixed where possible.
17.2|SSC has ten penalty levels. Point penalties may bring scores below zero.
17.3|Penalty levels are starting points. TSBC may change the level for a good reason.
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
19.1|A major emergency is an unexpected problem that seriously affects SSC.
19.2|During an emergency, TSBC may delay, reopen, pause or cancel affected contest processes.
19.3|TSBC may allow a new video if an accepted one disappears through no fault of the country.
19.4|Emergency changes should restore fairness, not give a country an extra advantage.
20.1|Each edition must publish its special dates, places, voting limits and other details.
20.2|Edition rules can change the general rules only when the general rules allow it.
21.1|TSBC may update rules, but major competition changes should not normally happen mid-stage.
21.2|When a rule is unclear, TSBC must give a fair, clear answer.
21.3|The version marked Current in Solaris Studio is the official rulebook.
21.4|New or amended rules start applying from the effective date and time TSBC announces.
22.1|You may shape your own country's fictional story, but not permanently rewrite someone else's.
22.2|Permanent changes to another Protected country normally need that country's HoD to agree.
22.3|You may roleplay wars, but an invasion alone does not let you permanently take another country's land.
22.4|A country stays Protected until six completed editions in a row pass without an active HoD.
22.5|A country becomes Unprotected only after six finished editions in a row without an active HoD at any time.
22.6|An Unprotected country may be taken over or divided, but its past SSC results stay.
22.7|Permanent border changes must be recorded by TSBC; unofficial claims do not change the map.
22.8|A new HoD restores protection before the country is removed from the official map.
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
    "important": "If the song has no official music video, use the song's YouTube video instead. Use the most-viewed existing eligible full-song upload under the stated priority and record its URL and figures.",
    "examples": [
      {"title":"Official song video","outcome":"information","detail":"If the song has an official music video, use that video's YouTube view count at the recorded check time."},
      {"title":"No official music video","outcome":"information","detail":"Use a YouTube video for the song instead and record the exact video checked. When there are several qualifying uploads, use the highest view count under Rule 6.4 and record its URL and check time."}
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
    "important": "Take away the full number of contest points listed in a penalty, even if the final score is negative. Levels 2 and 3 remove bonus points only. If there are no bonus points, TSBC must choose another existing penalty level and explain the decision in writing. TSBC must not replace a bonus-point penalty with a normal contest-point deduction. The facts of the case can justify a stronger or lighter penalty."
  },
  "20.2": {
    "important": "Private messages, practices from past editions, and a lack of response do not change the published rules. Urgent exceptions must follow Rule 21.1."
  },
  "22.4": {
    "summary": "Your country stays protected while it has an active HoD or has not yet completed six whole editions in a row without one.",
    "important": "Not competing in one edition, losing an HoD temporarily or withdrawing does not mean that someone else may take over your country.",
    "examples": [
      {
        "title": "The HoD leaves during SSC 30",
        "outcome": "not-allowed",
        "detail": "Other countries cannot take over just because the HoD left. SSC 30 still had an active HoD for part of the edition, so it does not count toward the six-edition limit. The first edition that could count is SSC 31."
      },
      {
        "title": "A country skips two editions",
        "outcome": "not-allowed",
        "detail": "Two completed editions without an active HoD are not enough. The country is still Protected."
      }
    ]
  },
  "22.5": {
    "summary": "Unprotected means six completed SSC editions in a row with no active Head of Delegation at any point.",
    "important": "Rule 22.6 allows lasting map changes after a country becomes Unprotected. Old songs, votes and results must still be kept. If a new HoD joins before the country is removed from the official map, protection returns immediately.",
    "bullets": [
      "0 to 5 completed editions in a row without an active HoD: the country stays Protected.",
      "After 6 completed editions in a row without an active HoD at any time: the country becomes Unprotected.",
      "If a country has an active HoD at any time during an edition, the count starts over.",
      "A new active HoD before official elimination makes the country Protected immediately."
    ]
  },
  "22.6": {
    "important": "This applies only after six finished editions in a row without an active HoD, as Rule 22.5 explains. Changes must also be recorded under Rule 22.7. Old SSC results cannot be deleted.",
    "allowed": [
      "Take over all or part of an Unprotected country's fictional land.",
      "Divide its land between other countries.",
      "Remove it as a country on today's map, while keeping its past SSC history.",
      "Create new fictional territories or states from its former land if the official map remains clear."
    ],
    "prohibited": [
      "Take over a Protected country before it has met the six-edition test in Rule 22.5.",
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


// Titles and help examples from the current rulebook are also shown on v4.2 pages.
// Change labels here only in the v4.2 draft; never rewrite official v4.1 history.
const TEEN_FRIENDLY_TITLES: Record<string, string> = {
  "6.4": "Spotify and YouTube limits",
  "7.4": "What happens when scores are tied",
  "17.2": "The ten penalty levels",
  "17.3": "How TSBC chooses a penalty",
  "17.4": "When TSBC can give a stronger penalty",
  "17.5": "When TSBC can give a lighter penalty",
  "19.1": "What counts as a major emergency",
  "22.4": "When a country stays Protected",
  "22.5": "When a country becomes Unprotected",
  "22.6": "What can happen to an Unprotected country",
  "22.7": "How changes to the official map work",
  "22.8": "When an Unprotected country gets a new HoD",
};
function simplifyOlderDisplayText(value: string): string {
  return value
    .replace(/\bDormant\b/g, "Unprotected")
    .replace(/\bdormant\b/g, "unprotected")
    .replace(/\bDormancy\b/g, "Time without an HoD")
    .replace(/\bdormancy\b/g, "time without an HoD")
    .replace(/\bForce Majeure\b/g, "major emergency")
    .replace(/\bAnnexation\b/g, "Taking over land")
    .replace(/\bannexation\b/g, "taking over land")
    .replace(/\bMitigating factors\b/gi, "Reasons for a lighter penalty")
    .replace(/\bAggravating factors\b/gi, "Reasons for a stronger penalty")
    .replace(/\bmitigating factors\b/g, "reasons for a lighter penalty")
    .replace(/\baggravating factors\b/g, "reasons for a stronger penalty")
    .replace(/\bSanctions\b/g, "Penalties")
    .replace(/\bSanction\b/g, "Penalty")
    .replace(/\bsanctions\b/g, "penalties")
    .replace(/\bsanction\b/g, "penalty")
    .replace(/\bAnnex\b/g, "Take over")
    .replace(/\bannex\b/g, "take over");
}

/** Keep examples, official thresholds, exact penalty levels and search tags intact. */
export function withPlainLanguage<T extends SscRule>(rule: T): T {
  const body = CLEAR_RULE_BODIES[rule.id];
  if (!body) throw new Error(`Missing plain-English wording for SSC Rule ${rule.id}`);
  const extra = SPECIFIC_CHANGES[rule.id] ?? {};
  return {
    ...rule,
    ...extra,
    title: TEEN_FRIENDLY_TITLES[rule.id] ?? simplifyOlderDisplayText(rule.title),
    summary: simplifyOlderDisplayText(extra.summary ?? PLAIN_SUMMARIES[rule.id] ?? rule.summary),
    body: [...body],
    important: (extra.important ?? rule.important) ? simplifyOlderDisplayText((extra.important ?? rule.important)!) : undefined,
    allowed: (extra.allowed ?? rule.allowed)?.map(simplifyOlderDisplayText),
    prohibited: (extra.prohibited ?? rule.prohibited)?.map(simplifyOlderDisplayText),
    bullets: (extra.bullets ?? rule.bullets)?.map(simplifyOlderDisplayText),
    examples: (extra.examples ?? rule.examples)?.map((example) => ({
      ...example,
      title: simplifyOlderDisplayText(example.title),
      detail: simplifyOlderDisplayText(example.detail),
    })),
  };
}
