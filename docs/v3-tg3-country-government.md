# TG3 Country Government: public read-only vertical slice

## Scope and ownership

A dedicated public Government view at `/world/countries/:code/government`, using an **unnested** TanStack file route (`$code_.government.tsx`) to avoid modifying the active sibling International page in PR #1941. This slice is independent of TG1/TG2 migration #1888 and the World organization UI #1934. The sole shared-file edit is the explicitly classified public route in `src/lib/v3-public-capability-supplements.ts`. There are no new migrations, private permissions, or official state mutations.

Existing canonical `public.countries`, `public.country_profiles`, and `public.country_profile_sections` remain the sole owners of their respective data. The Government route only displays authored political articles when the existing section visibility controls explicitly publish them on the Country or Wiki surface; hidden-on-both sections never appear, and the database read excludes them before applying the bounded limit. This is not a second government registry. Public profile RLS is used. A government article is displayed only as **country-authored reference**, never promoted to an official constitutional fact, office, appointment or action. There is no auto-created Cabinet, head of government, Parliament or Court.

## User experience

- Real country identity and canonical 3:2 flag where available.
- Government system, recorded leader and capital only when the public profile contains them.
- Relevant explicitly country-authored political reference sections beneath separately labeled structured facts; no optional empty modules.
- Context back into the existing Country overview and Wiki, both working routes on main.
- Compact mobile single-column composition and restrained desktop context rail.
- Loading, error, retry, unavailable country, empty-profile and stale-cache states.
- Typed fail-closed parsing, exact country ID/route matching, zero profile writes, safe image URLs, bounded country-scoped reads and no polling. The existing profile extension is missing from checked-in generated Supabase types, so its two read calls use a confined compatibility cast before strict field validation.

## Verification and integration

Pure contract tests in `world-country-government.test.ts` cover ID isolation, empty records, optional modules, invalid input, safe assets and classification of country-authored text. Validate exact-SHA Vitest, typecheck, lint, build and mobile/desktop rendering before merge. The route needs to be linked by the Country route owner after #1941 or the Public visual cutover when that integration can be done without shared-file conflicts.

Future Terra Solaris government systems (separate heads of state/government, cabinet, constitutional versions, elections, domestic politics and judiciary) require canonical structured authority and dedicated System work. This page intentionally displays only existing trusted public fields until those contracts exist. Do not mark the whole Government domain at parity.