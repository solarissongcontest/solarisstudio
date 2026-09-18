# Third-party Country / Wiki design sources

Solaris Studio's source-driven Country/Wiki personality system adapts established
human-designed systems instead of inventing seventeen unrelated visual skins.

This register tracks source provenance. Upstream brand marks, proprietary fonts,
photography and demo assets are excluded unless separately licensed.

## Implemented source-driven personalities

### Glass
- Source: Sam Asante `liquid-glass`
- Repository: `samasante/liquid-glass`
- Version: 0.1.1
- Commit: `4e7b769e1df7e5a7d3669fef22417fe3d2f79ade`
- License: MIT
- Use: vendored `GlassMaterial`, displacement and signal engine, wrapped around the shared Country identity grid
- Excluded: demo/site branding and media

### Editorial
- Source: Tufte CSS
- Repository: `edwardtufte/tufte-css`
- Version: 1.9.0
- Commit: `b5d7b7bbe5ce9c4c50fcfad4f19ee3646cfd7ae1`
- License: MIT
- Use: article measure, margin relationship, vertical rhythm, figure/caption logic
- Excluded: ET Book font files

### Minimal
- Source: Pico CSS
- Repository: `picocss/pico`
- Version: 2.1.1
- Commit: `1039a4788d6abc368d5485ae6bac84a8f0e3096f`
- License: MIT
- Use: semantic spacing, compact radius, body/type leading and control rhythm
- Excluded: source icons, fonts and demo assets

### Retro Digital
- Source: 98.css
- Repository: `jdan/98.css`
- Version: 0.1.21
- Commit: `b1d7a907371bbe523d6f64e3af97f714fdbd6d6a`
- License: MIT
- Use: window chrome, bevel recipes, status/control grammar
- Excluded: Pixelated MS Sans Serif font files and docs assets

## Implemented translated adapters

Every source below is pinned and now has a rendered Country/Wiki adapter plus a
file-level manifest under `src/styles/personality-sources/`. The implementation
translates layout, typography, spacing and surface grammar while excluding
upstream brand marks, proprietary fonts, photography and demo content.

- Passport: Jesus Ramirez International Airline Ticket CSS, MIT. Source snapshot: https://codehim.com/html5-css3/international-airline-ticket-in-html-css/ . ICAO Doc 9303 remains the structural authority.
- Poster: RampStack Swiss Style Theme, MIT, commit `55e82b52f2c4c2893f79628c77ed31418d5975e6`.
- Heritage: The National Archives Design System, MIT, `nationalarchives/design-system` commit `86202aabc033da76bb8a5171c39737bc1a6fef1d`.
- Broadcast: BBC GEL Grid, MIT, commit `65c2b3f878a3999104c7e17f989602075f9f6e22`; BBC GEL Typography, MIT, commit `d4fea6fc03586bc7fa066cd22abbae9fbd7005a6`.
- Atlas: MapLibre GL JS, BSD-3-Clause, commit `a55db8271998f1156f82a63726ef9c56bd9c5093`.
- Diplomatic: GOV.UK Frontend, MIT, commit `b4a7543f133932fb04575b045330e8a01ab5c250`.
- Festival: GDG-X Hoverboard, MIT, commit `80395b0ccc6e08cc1f0cdff50186ee119aad0b24`.
- Brutalist: RampStack Brutalist Web Theme, MIT, commit `2ad20824755fb00b3d2c30d01df67ea63f2d9427`.
- Luxury: Aimeos Pagible Luxury, MIT, commit `df0764db7057cc631dd2dea1bd466a8e995a3637`.
- Newspaper: Guardian Source, Apache-2.0, commit `d84c25d67ed51545994f53986eb4487d35c1aab4`; Guardian Interactive Style Library, commit `19533f580cfa7ff6f5e2db6ffc75334cd9cf02a8`.
- Scientific: IBM Carbon, Apache-2.0, commit `717c76d8b81c0ece1ce845caffe70f6d64a1a6bb`.
- Civic: USWDS, CC0-1.0 for GSA work plus audited third-party notices, commit `fca24584304e836f1314a98b8847985b801503c3`.
- Avant-Garde: Superilles Grid System, ISC (verified from the pinned `package.json`; no standalone licence file exists at this ref), commit `b4404a655115f030c0bedec45cf5693169d03470`.

A pinned commit is not permission to import everything in that repository.
Fonts, logos, imagery and nested third-party assets remain excluded unless their
individual licensing is verified. The Glass engine is the sole exception where
selected MIT-licensed upstream source files are vendored verbatim and preserved
with their upstream license in `src/vendor/liquid-glass/`.
