# TerraOS 3 maintenance visual assets

These local assets are used only by the temporary TerraOS 3 maintenance/product-story surface.

The maintenance experience deliberately serves its runtime visual assets locally. It does not hotlink third-party photography or depend on a remote image CDN.

## atmosphere.jpeg

- Source: existing Solaris Studio repository asset `public/IMG_8815.jpeg`
- Reuse/licensing status: existing project asset; reused within Solaris Studio under the source asset's existing rights/permissions
- Storage: copied by Git blob identity into `public/assets/terraos-maintenance/atmosphere.jpeg`
- Runtime use: hero atmosphere, first image-led chapter, contest-night chapter
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Transformation: filename/location only; source bytes unchanged

## moment-a.png

- Source artwork: original Solaris Studio artwork `public/terraos-maintenance/blue-motion.svg`
- Storage: rendered locally into `public/assets/terraos-maintenance/moment-a.png`
- Runtime use: immersive blue chapter and Me atmosphere
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Visual intent: luminous blue motion field with soft silhouettes; replaces the previous blank/incorrect project-image reuse

## moment-b.png

- Source artwork: original Solaris Studio artwork `public/terraos-maintenance/live-stage.svg`
- Storage: rendered locally into `public/assets/terraos-maintenance/moment-b.png`
- Runtime use: mid-story visual transition and Explore atmosphere
- Runtime hosting: local `/assets/` path; no third-party hotlink
- Visual intent: dark contest-stage environment with cyan/violet beams and a silhouetted audience; replaces the previous unrelated TSBC-logo reuse

## Licensed-photo candidates

The earlier visual review also identified optional Unsplash photography for the blue-motion and live-stage chapters. Those sources remain documented in `public/terraos-maintenance/ASSETS.md`, but they are not hotlinked or shipped by this fix. The locally rendered Solaris artwork remains the production-safe source until an approved photographic binary is deliberately added to the repository.

## Presentation assets

- `public/assets/terraos-maintenance.css` contains the responsive visual system, Classica Crastao product-wordmark treatment, rhythm-field animation, parallax presentation, readiness shimmer, contest-night light treatment and reduced-motion fallbacks.
- `public/assets/terraos-maintenance.js` contains the bounded scroll/motion coordinator, gallery controls, Live illustrative state choreography and relocation of the already-protected Confirmation portal into its editorial chapter.
- `public/assets/terraos-maintenance-story.css` contains the responsive full-screen Story View composition, mobile carousel treatment, before/after presentation and reduced-motion/reduced-transparency fallbacks.
- `public/assets/terraos-maintenance-story.js` contains hash/deep-link navigation, history/back behavior, scroll and focus restoration, fixture-only Story demonstrations and lazy Story preview creation.
- `public/assets/terraos-maintenance-story-polish.js` contains small fixture-presentation enhancements, direct-deep-link focus and transform-only Results reordering. It performs no network I/O.
- `src/lib/terraos-maintenance-stories.ts` is the canonical Story copy/fixture manifest embedded into the maintenance presentation as sanitized JSON.

No remote photography CDN is required at runtime. Story demonstrations use static/fixture data and do not read production contest data.
