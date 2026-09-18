# Country + Wiki personality reference lock

The canonical source-driven personality system has four reference views for each
of the 17 personalities:

- `canonical-mobile-country.png` at 390×844
- `canonical-desktop-country.png` at 1440×900
- `canonical-mobile-wiki.png` at 390×844
- `canonical-desktop-wiki.png` at 1440×900

The images are intentionally generated from the rendered application, not
hand-authored placeholders. Run the **Browser audit** workflow manually. Manual
dispatch enables `PERSONALITY_REFERENCE_CAPTURE=1`; the
`personality-contract.e2e.ts` suite then captures all 68 rendered reference
images as Playwright attachments in the browser-audit artifact.

After human source-fidelity, independent-quality and collection-quality review,
approved images become the visual baselines. Screenshot changes are never
auto-accepted. A changed image requires deliberate review against the upstream
source and the previous approved Solaris baseline.

This directory documents the lock protocol; the actual approved PNGs are added
only from a rendered audit artifact after visual approval so the repository
never contains fabricated or stale reference images.
