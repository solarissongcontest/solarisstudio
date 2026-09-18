# Third-party Country / Wiki design sources

Solaris Studio's source-driven Country/Wiki personality system adapts established
human-designed systems instead of inventing seventeen unrelated visual skins.

This register tracks source provenance. Upstream brand marks, proprietary fonts,
photography and demo assets are excluded unless separately licensed.

## Architecture prototypes

### Glass
- Source: Sam Asante `liquid-glass`
- Repository: `samasante/liquid-glass`
- Version: 0.1.1
- Commit: `4e7b769e1df7e5a7d3669fef22417fe3d2f79ade`
- License: MIT
- Use: package-backed liquid-glass optics and fallback material
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

## Canonical sources still to be pinned during their implementation phase

- Passport: Jesus Ramirez International Airline Ticket CSS, MIT; ICAO Doc 9303 is the structural authority.
- Poster: RampStack Swiss Style Theme, MIT.
- Heritage: The National Archives Design System, MIT.
- Broadcast: BBC GEL Grid + GEL Typography, MIT.
- Atlas: MapLibre GL JS, BSD-3-Clause.
- Diplomatic: GOV.UK Frontend, MIT.
- Festival: GDG-X Hoverboard, MIT.
- Brutalist: RampStack Brutalist Web Theme, MIT.
- Luxury: Aimeos Pagible Luxury, MIT.
- Newspaper: Guardian Source / Interactive Style Library, Apache-2.0 for Source.
- Scientific: IBM Carbon, Apache-2.0.
- Civic: USWDS, CC0-1.0 for GSA work plus audited third-party notices.
- Avant-Garde: Superilles Grid System, MIT.

Each remaining source must receive an exact version/commit and file-level license
audit before its source layer is merged.
