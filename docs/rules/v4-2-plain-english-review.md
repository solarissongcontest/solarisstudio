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

## Specific decisions supplied by the contest owner

1. **6.5:** Participating in a Eurovision National Selection **in 2015 or later** is disqualifying. Before 2015 remains permissible if other conditions are met.
2. **6.3–6.4:** When no official music video exists, use the **song's YouTube video** for the popularity check. Official checks must retain their selected video and timestamp to make the result reviewable.
3. **6.6:** When the artist's previous country has **no active HoD**, another country may use the artist without that country's permission. The three-appearance cap and ban on previous winning artists remain.
4. **15.1:** A delegation may withdraw after the submission deadline but before entry publication. Simply passing that deadline does not automatically create a penalty. Serious disruptive withdrawal **after** publication remains covered by **15.2**.
5. **17.2:** The owner confirmed that fixed contest-point penalties should come directly off the country’s score. The treatment of bonus-point sanctions in editions that have no bonuses was **not explicitly settled**. This draft proposes choosing an otherwise applicable sanction instead of silently converting bonus penalties into regular-point deductions. TSBC must approve or revise that proposal.

## Review points that must not be guessed

- If several song videos exist without an official music video, the team should set a predictable **video-selection and recording procedure** before entries open. This patch says to use the song video, but does not invent an undisclosed popularity formula.
- The proposed text does **not** decide whether a point deduction larger than an existing score creates a negative score, bottoms out at zero, or is recorded as a separate penalty. That requires a documented scoring-policy choice and should not silently change the scoreboard calculation.
- Rule 6.6's no-HoD permission waiver should be reconciled with any account ownership or country status controls. It must not accidentally grant a participant account access.
- v4.2 must be published through the existing governed release process, with a recorded effective time and any needed organizer approval. A GitHub merge is **not** itself a formal TSBC rulebook publication.
- Confirm that the runtime release overlay has not published newer rule wording; don't overwrite newer published regulations with this candidate.
- Run offline/unit checks first. Any CI browser test must use a locally isolated Supabase stack and must fail closed if hosted endpoints are configured.

## Release checks

1. Compare each of the 113 revised bodies and notes against the current approved release for changed obligations, exceptions and penalties.
2. Check Rule 6.5 boundary (2014 versus 2015), video fallback, artist reuse without an active HoD, post-deadline pre-publication withdrawal and bonus versus regular points.
3. Validate wrong-number references have been removed and related-rule links still resolve.
4. Confirm the six completed editions with no active HoD rule is unchanged in its effect.
5. Run the unit tests `src/lib/ssc-rules-plain-language.test.ts`, `src/lib/ssc-rules-v3.test.ts`, `src/lib/ssc-rules-canon-audit.test.ts`, and `src/lib/ssc-roleplay-rules.contract.test.ts`.
6. Have participants aged 16–18 read the revised definitions and explain key actions back, without organizer hints.
7. Approve and publish the final release through Rules Manager, then confirm the live release metadata and search results.

Source: `src/lib/ssc-rules/plain-language-v42.ts`. The older source texts are deliberately retained in earlier source modules for history and migration; the current v4.2 data composes the reviewed wording without rewriting immutable historical migrations.
