# V3 Jury Share SVG renderer (swarm task 56)

This is a **visual-only**, independently testable implementation slice. It consumes the existing
canonical types from v3-jury-share-card-foundation.ts; it does not introduce a vote source,
change any results, perform a Supabase read, grant access or publish a sharing route.

## What is available

- renderJuryShareSvg(projection, options) returns a deterministic, standalone
  1080 × 1920 SVG Story card.
- JurySharePreview displays the same SVG in a responsive 9:16 image without
  requesting server PNGs during theme switching.
- **Default** uses the immutable Solaris palette/layout contract.
- **Liquid Glass** uses distinct translucent rows while preserving the Default information
  architecture and score order.
- **Edition** uses an explicit, versioned, edition-matched palette and optional faded raster
  artwork. Missing/invalid Edition tokens fail independently of Default.
- The render includes all ten official 12/10/8/7/6/5/4/3/2/1 rows, historical names,
  flags, points, show/edition identity, VOTES OF: and accessible text.
- Dynamic text is XML escaped. The compositor accepts only bounded, inline PNG/JPEG/WebP
  assets, never arbitrary URLs or SVG, to avoid network requests/active SVG content during
  later server image conversion.
- juryShareThemeVersion provides a version input for the System-owned render key.
- The renderer rejects non-shareable projections using the existing foundation gate,
  missing/malformed assets, invalid edition tokens and names that cannot fit safely.

## Integration boundary with task 55

The future server-owned getJuryShareProjection and export endpoint must:

1. Resolve the caller, delegation/public access, finalized ballot, exact current published
   result version and public jury-breakdown policy from canonical state.
2. Resolve historical identity and flags for the requested edition, then embed approved
   raster bytes with bounded size and trusted provenance. The renderer does **not** fetch
   remote flags, fonts or artwork.
3. For final **PNG/JPEG** export, re-authorize and reload the version after a user presses
   Share/Save. Do not export solely from an earlier browser preview.
4. Validate font glyph coverage with the actual installed render fonts, perform bounded
   SVG-to-PNG/JPEG conversion in isolated server infrastructure, and derive the cache identity
   from ballot/result/historical identity/theme/format versions.
5. Preserve V3_JURY_SHARE_FOUNDATION.uiEnabled=false and
   renderEndpointEnabled=false until the system/public integration is complete.

The preview is intentionally not wired into Results or Me yet. It is a reusable presentation
component, **not** a new publication authority or an independently accessible export path.
Neither unit tests nor previews connect to hosted Supabase.

## Focused verification

Run: bunx vitest run src/lib/v3-jury-share-svg.test.ts

Tests cover output geometry, score order, historical Unicode, alt text, XML escaping,
publication fail-closed behavior, asset safety, missing flags, theme independence and
invalid Edition configuration.

Full product acceptance still requires the upstream task 55 authority and exact-SHA
integration/browser/export checks. Do not mark user-facing Jury Share complete from this PR.
