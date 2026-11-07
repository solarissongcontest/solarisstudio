# SSC Rules v4.2 Plain-English Candidate

Status: draft code change for organizer review, **not an automatically published change to the official Rules**.

## Scope

- Keeps all **22 chapter identifiers** and **113 current rule IDs** intact.
- Gives all 113 rules new, simpler participant-facing body text.
- Reuses the shared official rule data for search, chapter browsing, rule details and guided rules.
- Adds a common plain-English summary and relevant definitions to rule detail pages.
- Cleans up hard-to-understand terminology in Roleplay & Worldbuilding visual help and quick answers.
- Repairs embedded old references in **12.2** (now **12.5 and 19.4**) and **20.2** (now **21.1**).
- Leaves voting enforcement, eligibility algorithms, score calculation, Supabase tables and publication RPCs unchanged.

## Reader-first wording requirement (ages 15–18)

The official v4.2 candidate should be understandable to an ordinary 15–18-year-old SSC participant who has never read a legal document.

- Use short, direct sentences, familiar words, and one idea at a time. Explain any unavoidable SSC term when it first appears.
- Explain what the participant **can do**, **cannot do**, and **must do**, including deadlines and exceptions.
- The name **Dormant country** is replaced in the v4.2 candidate by **Unprotected country**. This is a wording change only, **not** a change to the six-completed-edition test. An HoD active at any time in an edition breaks the run; a new active HoD before official map removal restores protection.
- Use **penalty** instead of **sanction**, **major emergency** instead of **Force Majeure**, and **taking over land** instead of **annexation** in participant-facing draft text. Old names remain valid search keywords and in the untouched historical v4.1 release.
- The revised candidate applies to all **113 rule bodies and 113 short summaries**. Plain wording also covers important notes, examples, headings and help text where the draft includes them.
- Automated tests check for old jargon, overlong summary and sentence text, 113-rule completeness and key numerical/permission rules. These are **guardrails**, not proof that people understand the rules.
- Before final approval, ask several real 15–18-year-old readers to explain a small selection of rules without help: who may act, when it is allowed, what needs approval, and what happens if the rule is broken. Revise anything they misunderstand. An organizer must verify that no simplification changed the legal meaning.

**Publication rule:** Do not treat a clearer GitHub draft, a passing test, or a static preview as an official new rule. v4.1 stays Current until the governed release is approved and published.

## Specific decisions supplied by the contest owner

1. **6.5:** Participating in a Eurovision National Selection **in 2015 or later** is disqualifying. Before 2015 remains permissible if other conditions are met.
2. **6.3–6.4:** When no official music video exists, use the **song's YouTube video** for the popularity check. The proposed tie-break is the most-viewed existing full-song upload from the artist/label official channel before the submission deadline; if none exists, use the most-viewed identifiable pre-deadline full-song video. Record the selected URL and figures. Official checks must retain their selected video and timestamp to make the result reviewable.
3. **6.6:** When the artist's previous country has **no active HoD**, another country may use the artist without that country's permission. The three-appearance cap and ban on previous winning artists remain.
4. **15.1:** A delegation may withdraw after the submission deadline but before entry publication. Simply passing that deadline does not automatically create a penalty. Serious disruptive withdrawal **after** publication remains covered by **15.2**.
5. **17.2:** The owner confirmed that fixed contest-point penalties should come directly off the country’s score. The user recorded approval in principle for the proposed bonus-point wording in [issue #2379](https://github.com/solarissongcontest/solarisstudio/issues/2379#issuecomment-6708975596), but formal TSBC ratification evidence and release checks are still required. The candidate uses making Levels 2 and 3 inapplicable without bonuses, and requiring TSBC to select another existing appropriate level with recorded reasons rather than silently converting bonus penalties. TSBC must approve or revise that proposal.

## Review points that must not be guessed

- **Formal TSBC ratification still required:** The user approved in principle the deterministic YouTube selection order in issue #2379. Confirm formal approval and preserve the recorded video and check time before publication.
- **Results integration verification still required:** The user approved in principle, but scoring and ranking have not been verified. The candidate proposes applying fixed point deductions in full, including negative final scores (35 - 50 = -15), reflecting the existing admin note that negative vote totals can represent sanctions. This does not implement new scoring or leaderboard algorithms; check the final-result pipeline before publishing.
- Rule 6.6's no-HoD permission waiver should be reconciled with any account ownership or country status controls. It must not accidentally grant a participant account access.
- **Publication gate:** Current production is v4.1 (confirmed 7 November 2026). The v4.2 candidate must remain separate from the bundled Current canon until an official Rules Manager v4.2 release carries the full 113 after-snapshots, with an effective time and organizer approval. A GitHub merge is **not** itself a formal TSBC rulebook publication.
- Confirm that the runtime release overlay has not published newer rule wording; don't overwrite newer published regulations with this candidate.
- Run offline/unit checks first. Any CI browser test must use a locally isolated Supabase stack and must fail closed if hosted endpoints are configured.

## Release checks

1. Compare each of the 113 revised bodies and notes against the current approved release for changed obligations, exceptions and penalties.
2. Check Rule 6.5 boundary (2014 versus 2015), video fallback, artist reuse without an active HoD, post-deadline pre-publication withdrawal and bonus versus regular points.
3. Validate wrong-number references have been removed and related-rule links still resolve.
4. Confirm the six completed editions with no active HoD rule is unchanged in its effect.
5. Run the unit tests `src/lib/ssc-rules-plain-language.test.ts`, `src/lib/ssc-rules-v3.test.ts`, `src/lib/ssc-rules-canon-audit.test.ts`, and `src/lib/ssc-roleplay-rules.contract.test.ts`.
6. Have several participants aged 15–18 read rules from every major chapter, including selection, votes, penalties and worldbuilding. Ask them to explain their responsibilities without organizer hints; revise wording they misunderstand.
7. Approve and publish the final release through Rules Manager, then confirm the live release metadata and search results.

Source: `src/lib/ssc-rules/plain-language-v42.ts`. The older source texts are deliberately retained in earlier source modules for history and migration; the current v4.2 data composes the reviewed wording without rewriting immutable historical migrations.

## Publication boundary

The bundled `SSC_RULEBOOK` remains v4.1 until the governed Rules Manager publishes a 4.2 release. The 113 plain-language revisions are held in `src/lib/ssc-rules/plain-language-v42.ts` as a candidate, with tests that explicitly verify its contents. A runtime release v4.2 must carry the approved changed snapshots through the official governance API. Never label a draft synthetic history row as Current.
