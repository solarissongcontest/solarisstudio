# Anniversary launch readiness — 17 September 2026

This checklist is intentionally tied to the canonical production archive so the public anniversary cannot silently drift back to insertion-order or placeholder-result behavior.

## Expected anniversary-year facts

For the exact period `2025-09-17 <= event_date < 2026-09-17`:

- 7 contest chapters
- 22 public shows
- 307 canonical edition participations
- 61 distinct participating countries
- closest Grand Final: Oland over Ørnådal by 14 points in SSC 17
- biggest winning score: Diaria, 611 points, SSC 21
- latest champion: Diaria, SSC 21, 611 points

## Required invariants

- Anniversary winner ordering follows `event_date`, then `edition_number`; API row order is irrelevant.
- A Grand Final is historical only when its results publication gate is open and the ranking is resolved.
- A zero-point placeholder ranking is never a champion, record, closest finish, or historical win.
- SSC 22 is therefore excluded from historical anniversary results until its result publication gate opens and real scores exist.
- MySolaris renders its personalized anniversary recap inside its normal route tree. The removed portal-based anniversary modules must not be restored.
- Country anniversary/debut calculation deduplicates legacy show-specific participant rows by country and edition; it must not require `participants.show_id IS NULL`.
- Countries and Records preview labels describe the route-native content that actually exists rather than promising disabled deep-injection modules.

## Final deployed verification

After merge/deploy, verify the public Worker in a fresh session with `?anniversary=active` at 390 px, 430 px, desktop, and reduced motion. Check Home, Anniversary Hub, Countries, Records, MySolaris, and Archive Games through both direct reload and client-side navigation.
