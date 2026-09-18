# Country + Wiki personality reference lock

The canonical source-driven personality system has four reference views for each
of the 17 personalities:

- `canonical-mobile-country.png` at 390×844
- `canonical-desktop-country.png` at 1440×900
- `canonical-mobile-wiki.png` at 390×844
- `canonical-desktop-wiki.png` at 1440×900

The images are intentionally generated from the rendered application, not
hand-authored placeholders. The **Browser audit** automatically captures the
canonical 390px and 1440px Country/Wiki views on pull requests. The
`personality-contract.e2e.ts` suite captures all 68 rendered reference images
as Playwright attachments in the browser-audit artifact. Manual full-audit
dispatches run the same capture against the exhaustive viewport inventory.

After human source-fidelity, independent-quality and collection-quality review,
approved images become the visual baselines. Screenshot changes are never
auto-accepted. A changed image requires deliberate review against the upstream
source and the previous approved Solaris baseline.

This directory documents the lock protocol; the actual approved PNGs are added
only from a rendered audit artifact after visual approval so the repository
never contains fabricated or stale reference images.
