# Explore V3 cinematic redesign: first unmerged implementation slice

**Source:** owner-provided `SOLARIS-STUDIO-V3-COUNTRY-EDITION-CINEMATIC-REDESIGN-CANONICAL-SPEC.md` (19 November 2026). This is a partial implementation of that specification, **not** design parity, Hero Studio completion or permission for production rollout.

## Current slice
- One shared, presentation-only Country/Edition cinematic hero with a large media surface, responsive focal-point positioning, accessible headline and multi-stop gradient-to-canvas fade.
- The installed V3 Country/Delegation detail begins using cinematic identity composition, a real 3:2 flag strip, follows, accessible in-page anchor navigation and its existing publication-safe entry/history/results data.
- The installed V3 Edition Overview uses published artwork in the same visual family. Spoiler-free mode shows no artwork until explicit reveal and retains canonical Results/entry publication gates.
- A small spacing and responsive visual contract is isolated to these pages, rather than patching global AppShell, mobile dock or existing production-safe web routes.
- No new Supabase queries, media mutations, permissions, migrations, background image fetches on Country (no published media projection yet), or rollout flags.

## Intentional unfinished requirements (do not label as DONE)
1. **Country media authority (System/Media owner):** inspect `country_profiles`, `country_media`, storage and RLS; implement server-authoritative private draft + upload/validation + derivative generation + immutable published revision + idempotent CAS publish/revert. Do not invent another current-hero store, publicize draft URLs, or change `supabase/migrations/**` from this Public design lane.
2. **MySolaris Hero Studio:** add controlled crop/focal preview for installed PWA, mobile web and desktop, keyboard alternatives, image rights/alt/credit, conflict and receipt handling after step 1 is approved. Keep `Me → My Country → Public Country Profile → Appearance` and the existing legacy MySolaris entrance convergent.
3. **Country V3 public projection:** only after the media contract exists, expose the currently published optimized image and normalized focal point (not a draft URL). The current country hero intentionally displays an attractive fallback; it does not stretch the flag into a fake landscape or claim uploads work.
4. **Complete three-experience redesign:** ordinary phone browser and desktop currently use the correctly gated legacy experience. Replace them deliberately, **not** by bypassing `V3DelegationRouteGate` / `V3EditionRouteGate`; unify canonical reads without tripling query traffic.
5. **All downstream sections:** finish Country World/Entries/Results/History/Voting/Stories and Edition Participants/Songs/Shows/Schedule/Stories/Results as complete tailored page compositions, including compact list rhythm and no accidental visual double headers.
6. **Design QA:** capture top/middle/bottom at 360, 390, 430, tablet, 1280/1440 widths; verify bright/dark/busy media, long names, zoom, keyboard, reduced motion, zero clipped tabs, dock clearance, final-item accessibility and published-content-only behavior.
7. **Release:** exact-head typecheck, lint, unit tests, bundle check and isolated browser tests; approval separately for migrations, production deployment and staged rollout.

## Invariants
- Keep existing production maintenance, feature gates, app vs mobile-web vs desktop identity, iOS top safe zone and floating app dock intact.
- No automated connection to hosted Supabase; local isolated test only, fail closed.
- No competing country controller, historical identity, World-state, entry, voting, Results or publication authority.
- This draft PR must **not** be merged by the implementing session; the owner is actively changing `main`.

## Integrated partial forward-ports from older PRs (separate branches remain untouched)

- [#2251](https://github.com/solarissongcontest/solarisstudio/pull/2251): narrow **published edition/archive root queries**, limit expensive Show and winner/Results reads to the four visible historical previews, isolate current full Show Mode data from minimal published finals and result proof; carry over associated contract tests. This is a *selective source forward-port* of the existing PR's four changed files, NOT a Git merge of its stale history. Validate against the PR's current base and new CI head before any release.
- [#2163](https://github.com/solarissongcontest/solarisstudio/pull/2163) / [#1991](https://github.com/solarissongcontest/solarisstudio/pull/1991): take **only** the World Explore entry pattern, adapted to the present soft-launch route availability and canonical World rollout query. Do not import its overlapping World data readers or public security mutations.
- **No merge into main**; original old PRs retain their independent ownership until upstream integrator decides whether they are superseded.

## MySolaris first visual integration (non-publishing)
- The existing authorized `MySolarisDesignV2Module` embeds the **Country Hero Studio V3 preview**. It consumes the current Country V2 background selection and existing focal-position sliders as *local editor draft state only*.
- Preview modes: installed app, mobile browser website and desktop, with a separate official 3:2 flag identity strip and the shared cinematic fading title.
- **No new Publish V3 control**: existing `Publish V2` is explicitly not the V3 Hero publish authority. The next server-authoritative System/Media slice must establish published hero revision and private draft lifecycle before activation.

## Second visual implementation pass
- Country now exposes World section/navigation only after a verified and centrally allowed World rollout; no country politics or GUARD/UNITY membership is fabricated.
- Country published history and related destinations use separated editorial rows rather than repeated boxed cards. Existing full history and canonical result paths remain.
- Edition dedicated navigation now sits immediately after the hero introduction, overview statistics are a semantic flat fact strip, and Participant/Song previews become bounded editorial list rows.
- Continue to treat World Country deep links as independently gated; no claimed country-specific World detail yet.
