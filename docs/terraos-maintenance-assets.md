# TerraOS 3 maintenance visual assets

These local assets are used only by the temporary TerraOS 3 maintenance/product-story surface.

The three photographic/image-led assets below are **existing Solaris Studio project assets** reused inside the same repository and product. This maintenance change does not introduce a new third-party image source, hotlink, or external licensing dependency. Any underlying ownership/licensing record for the original project asset remains authoritative; this document records the maintenance-page reuse rather than inventing a new license claim.

## atmosphere.jpeg

- Source: existing Solaris Studio repository asset `public/IMG_8815.jpeg`
- Reuse/licensing status: existing project asset; reused within Solaris Studio under the source asset's existing rights/permissions
- Storage: copied by Git blob identity into `public/assets/terraos-maintenance/atmosphere.jpeg`
- Runtime use: hero atmosphere, first image-led chapter, contest-night chapter
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Transformation: filename/location only; source bytes unchanged

## moment-a.png

- Source: existing Solaris Studio repository asset `public/IMG_6171.png`
- Reuse/licensing status: existing project asset; reused within Solaris Studio under the source asset's existing rights/permissions
- Storage: copied by Git blob identity into `public/assets/terraos-maintenance/moment-a.png`
- Runtime use: immersive blue chapter and Me atmosphere
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Transformation: filename/location only; source bytes unchanged

## moment-b.png

- Source: existing Solaris Studio repository asset `public/IMG_9177.png`
- Reuse/licensing status: existing project asset; reused within Solaris Studio under the source asset's existing rights/permissions
- Storage: copied by Git blob identity into `public/assets/terraos-maintenance/moment-b.png`
- Runtime use: mid-story visual transition and Explore atmosphere
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Transformation: filename/location only; source bytes unchanged

## Presentation assets

- `public/assets/terraos-maintenance.css` contains the responsive visual system, Classica Crastao product-wordmark treatment, rhythm-field animation, parallax presentation, readiness shimmer, contest-night light treatment and reduced-motion fallbacks.
- `public/assets/terraos-maintenance.js` contains the bounded scroll/motion coordinator, gallery controls, Live illustrative state choreography and relocation of the already-protected Confirmation portal into its editorial chapter.
- `public/assets/terraos-maintenance-story.css` contains the responsive full-screen Story View composition, mobile carousel treatment, before/after presentation and reduced-motion/reduced-transparency fallbacks.
- `public/assets/terraos-maintenance-story.js` contains hash/deep-link navigation, history/back behavior, scroll and focus restoration, fixture-only Story demonstrations and lazy Story preview creation.
- `public/assets/terraos-maintenance-story-polish.js` contains small fixture-presentation enhancements, direct-deep-link focus and transform-only Results reordering. It performs no network I/O.
- `src/lib/terraos-maintenance-stories.ts` is the canonical Story copy/fixture manifest embedded into the maintenance presentation as sanitized JSON.

No remote photography CDN is required at runtime. Story demonstrations use static/fixture data and do not read production contest data.
