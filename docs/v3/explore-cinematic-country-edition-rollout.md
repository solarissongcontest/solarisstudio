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

## Whole-Explore directory convergence
- Explore projection now carries explicit existing destinations `/archive` and `/tools`; public availability remains enforced by the shared presentation link and existing top-level feature/maintenance gates.
- Archive and Site Directory share one responsive, divided editorial desktop list rather than inconsistent isolated cards, without changing their search, URL, area filters, source registry or permissions. Mobile and installed app keep their own control models.
- No new Supabase client, data fanout, or parallel search route is created.

## Country Hero Studio: private local image rehearsal
- Authorized Country designer now permits selecting an image **for a local-only object URL preview** (JPEG/PNG/WebP <= 5 MB); selection never writes to Supabase or registers public media.
- Accessible keyboard range inputs adjust local focal X/Y 0–100 without changing Country V2 design or current published background. Remove private preview to return to the existing image or color fallback; blob URLs are revoked on replacement/unmount.
- The shared cinematic hero keeps its safe color gradient rendered underneath media and restores it on asset decode/load failure; non-visible MySolaris preview uses lazy rather than LCP-priority loading.
- This is **not** a secure ready-draft/upload/publish feature. Media/System contract and revised authorization checks remain required.

## Edition artwork vs logo: final visual source split
- Existing publication-safe edition reads already select both official `artwork_url` and `logo`; project them as separate `artworkUrl` and `logoUrl` fields.
- Full-bleed cinematic background uses **artwork only**. The official logo is presented as a separate contained image in the Edition identity row; Explore current edition uses the logo as a compact graphic if full artwork is absent.
- No migration, extra Supabase query, or invented image fallbacks. The absence of artwork uses the designed abstract hero, never an enlarged edition logo.

## Stories editorial release slice
- Installed V3 Stories index uses one visually emphasized **current published Story** and flat historical Story links instead of stacking nested raised cards; the unclassified publication-safe fallback remains.
- The six published "On this day" previews use clean article-like rows; the existing canonical Solaris time, event context, links and local spoiler-reveal boundary are retained.
- Ordinary mobile and desktop Stories archives keep existing published RPC/query ownership but swap boxed listing cards and moment tiles to bounded editorial reading rows.
- No new Story/Media fetch, image inference, authoring authority, or World overlap. Story images are intentionally **not** invented on index listings without a published image projection.

## Cinematic published Story detail (installed PWA)
- Released Story detail now puts server-supplied, published-Edition artwork behind its editorial headline in a large, responsive and bottom-fading masthead. When artwork is absent or fails, it shows a calm abstract fallback rather than stretching an edition logo or fabricating scenery.
- The spoiler-hidden route returns **before** any artwork/title/timeline sharing content renders. Existing public story and edition ID mapping, share, canonical Solaris times, related links and publication security are unchanged.
- Timeline moments use divided article entries with proper chronology and comfortable reading line-height, not nested floating cards. Related published Stories use direct quiet rows.
- Mobile-web and desktop Story-detail parity remain future slices; no new queries, rights, schema or Story writer was added here.

## Shows broadcast-first directory design pass
- Live/paused broadcast material is still the only highlighted show surface; Upcoming, Recent, Current Edition, archive and filtered browsing use flat, predictable editorial rows instead of repeated rounded cards.
- Installed app keeps its single filter sheet and keyboard-operable search; mobile website keeps border-separated native-style rows; desktop keeps a left filter rail and one wide scannable list.
- Existing publication-status badges, official published Results hints, Show links, safely exposed broadcast links, fixed page window and chronological event formatting are retained. No Results/Show data refetch added.

## Stories detail: ordinary mobile + desktop web editorial parity
- Website Stories detail keeps the existing public `loadPublicStoryline` and its stable published Edition slug reader, but replaces the overloaded text header with a generous, adaptive text-led editorial masthead and the scattered timeline tile cards with continuous chronological narrative rows.
- No speculative artwork is loaded: the website public Storyline result does not supply an authorized image, whereas the installed V3 published detail has a separately verified Edition artwork projection.
- The installed PWA gate/legacy fallback and Story metadata contract remain unmodified.

## Terra Solaris World: TG3 search + public editorial organization surface
- Selectively forward-ported from existing [#2163](https://github.com/solarissongcontest/solarisstudio/pull/2163): hardened **published institution reader**, strict fresh publication proof in World landing/directory/organization and country-label lookup, and a **bounded, URL-addressable unified World Search** with country/organization filters, independent pages and publication-safe RLS-backed fields. Not a blind merge of #2163's stale route tree.
- World Home has a large **text-led cinematic world hero** (no invented map/art), searchable directory links and real GUARD/UNITY institutional profile previews only after fresh verified public reads. Only the server-backed published identities are rendered.
- Organization pages add a restrained institutional hero, responsive offices/history-friendly rows, and live dedicated **Public bodies** navigation; their existing authoritative leadership/membership and body readers remain source of truth.
- Explore offers World Search, World Countries and Organizations as secondary links only after the same strictly verified World rollout and central public-availability policy. No sixth PWA bottom tab.
- Search and publication contract tests are ported from the donor where applicable. This is **TG3 product progress**; TG4 documents, TG5 membership actions, TG6–9 sessions/proposals/votes/resolutions, TG10 private follower/task events and TG14 Court are NOT complete. They require independent System adoption, secured projections, permissioned workflows and exact-head release evidence before any public buttons.

## World deep-route visual continuity / only published facts
- World Countries directory and each verified International country detail get a calm editorial layout with a strong text-led identity and separate current versus former memberships and in-page semantic nav.
- World search results now link to canonical `/world/countries/:code` (not SSC-only Country pages), with published country affiliation context; institution member rows also link to international country details.
- World public bodies directory and real body details get matching institutional headings, without changing their independently verified, paginated public body/source readers.
- No speculative country-photo upload, World Court, Sessions, Measures or Resolutions routes. Those remain blocked on missing authoritative System projections.

## World organization historical membership view (true public projection only)
- Official organization page now supports direct-link `?tab=history` and a distinct completed-memberships section, only where the currently verified World projection contains concluded terms. This is TG3/TG5 published history **presentation**, not a new authoring authority.
- Historical rows retain publication-verified member identity reads and strict bounded 24-row paging; they cannot be used to infer current governance, proxy, elections or votes. Current member and leadership sections remain unchanged.

## World organization institution/assembly and leadership previews
- Organization Overview now gives a bounded preview of current recorded officeholders (up to three) and a dedicated **General Assembly** link when the currently verified public institution projection explicitly identifies an `active` assembly organ.
- The Assembly link goes to the already existing **public body details reader**, not a fabricated session, agenda or voting page. No live quorum, measures, votes, executive decisions or private room content is inferred.

## Strict World Explore subroute availability
- Web Explore now checks `allowsReleased` for each World Search, World Organizations and World Countries secondary link individually, not merely the World root; this avoids advertising subroutes excluded from restricted/maintenance public policy.
- Installed Explore's shared editorial link primitive is checked for equivalent subroute availability before release.

- All V3 Explore editorial route rows now rely on central `allowsReleased(href)` rather than a weaker generic `allows(href)`, so restricted/maintenance paths (including World subroutes) cannot be advertised as released navigation.
