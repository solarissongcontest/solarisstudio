import type { CountryDecorationStyle, CountryHeroLayout } from "@/lib/visual-theme";

export type CountryWikiStyle = "editorial" | "chronicle" | "modern";
export type CountryPersonalityDensity = "compact" | "balanced" | "airy";
export type CountryPersonalityLayout =
  | "material-glass"
  | "editorial-split"
  | "document-zones"
  | "poster-grid"
  | "archive-page"
  | "broadcast-grid"
  | "minimal-stack"
  | "atlas-grid"
  | "institutional-grid"
  | "festival-grid"
  | "brutalist-grid"
  | "retro-window"
  | "luxury-editorial"
  | "newspaper-grid"
  | "technical-grid"
  | "civic-grid"
  | "avant-garde-grid";

export type CountryPersonalityDefinition = {
  id: CountryHeroLayout;
  name: string;
  category: string;
  concept: string;
  density: CountryPersonalityDensity;
  wikiStyle: CountryWikiStyle;
  layout: CountryPersonalityLayout;
  referenceFamily: string;
  implementationReference: string;
  signature: readonly string[];
  decorations: readonly CountryDecorationStyle[];
  allowsGraphicArt: boolean;
  rules: readonly string[];
  rejects: readonly string[];
};

/**
 * Country Personality System V8
 *
 * Persisted hero-layout values remain stable to avoid a database migration, but
 * each value now maps to a concrete design lineage and an explicit structural
 * contract. The personality layer is visual art direction only: semantic order,
 * official-flag fitting, action geometry, responsive reflow and accessibility
 * remain owned by the shared CountryIdentityHero foundation.
 */
export const COUNTRY_PERSONALITIES = [
  {
    id: "glass-card",
    name: "Glass",
    category: "Material",
    concept: "A single floating Liquid Glass identity plate over a visible country atmosphere.",
    density: "balanced",
    wikiStyle: "modern",
    layout: "material-glass",
    referenceFamily: "Sam Asante liquid-glass / Apple Liquid Glass",
    implementationReference: "Sam Asante liquid-glass provides the web optics; Apple Liquid Glass remains the visual authority for the material hierarchy.",
    signature: ["single-glass-plate", "specular-edge", "adaptive-refraction"],
    decorations: ["auto", "flag", "aurora", "none"],
    allowsGraphicArt: false,
    rules: [
      "The outer hero is the visual scene; only the inner identity plate is glass.",
      "Use one glass surface, one specular highlight and one subtle refracted atmosphere.",
      "Keep official flag media fully contained and opaque enough to remain factual media.",
    ],
    rejects: ["glass-inside-glass", "milky-grey-card-stack", "hard-lines-through-controls", "article-body-glass"],
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "Editorial",
    concept: "High-end cultural magazine layout driven by headline scale, whitespace and an asymmetric editorial grid.",
    density: "airy",
    wikiStyle: "editorial",
    layout: "editorial-split",
    referenceFamily: "Tufte CSS editorial system",
    implementationReference: "Tufte CSS document measure, margin relationship, figure rhythm and responsive editorial composition adapted to Solaris.",
    signature: ["masthead", "fact-rail", "hairline"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Use typography and proportion before borders.", "Keep the flag as a clean editorial image plate.", "Allow at most one structural hairline in the hero."],
    rejects: ["rounded-card-stack", "glow", "decorative-grid-behind-copy", "floating-symbols"],
  },
  {
    id: "passport",
    name: "Passport",
    category: "Document",
    concept: "An official identity-document composition built from stable information zones rather than decorative stamps.",
    density: "compact",
    wikiStyle: "modern",
    layout: "document-zones",
    referenceFamily: "Jesus Ramirez International Airline Ticket CSS + ICAO Doc 9303",
    implementationReference: "Jesus Ramirez ticket geometry provides the web layout while ICAO Doc 9303 provides the identity-document zoning logic.",
    signature: ["document-code", "field-grid", "single-seal"],
    decorations: ["auto", "grid", "none"],
    allowsGraphicArt: true,
    rules: ["Align labels and values to a document grid.", "Permit one restrained seal inside its own art cell.", "Security patterning must remain low contrast."],
    rejects: ["rotated-stamps-over-data", "fake-mrz-noise", "ornamental-frame-maze", "seal-over-actions"],
  },
  {
    id: "poster",
    name: "Poster",
    category: "Graphic",
    concept: "Swiss-inspired poster composition using scale, asymmetry and a strict modular grid with zero content overlap.",
    density: "airy",
    wikiStyle: "modern",
    layout: "poster-grid",
    referenceFamily: "RampStack Swiss Style Theme",
    implementationReference: "RampStack Swiss Style Theme supplies the 12-column grid, modular type hierarchy and restrained International Typographic Style grammar.",
    signature: ["display-type", "index-number", "colour-block"],
    decorations: ["auto", "none"],
    allowsGraphicArt: true,
    rules: ["Create tension with grid occupancy and scale, never collision.", "Keep actions in their own footer row.", "Use a single graphic colour field inside the art region."],
    rejects: ["text-over-flag", "diagonal-line-through-actions", "random-rays", "centered-generic-hero"],
  },
  {
    id: "heritage",
    name: "Heritage",
    category: "Cultural",
    concept: "Archival catalogue elegance with formal typography, book-like margins and restrained institutional ornament.",
    density: "balanced",
    wikiStyle: "chronicle",
    layout: "archive-page",
    referenceFamily: "The National Archives Design System",
    implementationReference: "The National Archives Design System supplies the archival grid, metadata hierarchy, tables and record-style presentation.",
    signature: ["archival-rule", "catalogue-label", "formal-type"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Use generous page-like margins.", "Use a single archive rule or ornament, not multiple frames.", "Keep decorative material outside controls."],
    rejects: ["medieval-fantasy", "gold-filigree", "corner-ornament-stack", "frame-inside-frame"],
  },
  {
    id: "broadcast",
    name: "Broadcast",
    category: "Media",
    concept: "BBC-style on-air information graphics with bold hierarchy, stable lower-third grammar and aligned data.",
    density: "compact",
    wikiStyle: "modern",
    layout: "broadcast-grid",
    referenceFamily: "BBC Global Experience Language (GEL)",
    implementationReference: "BBC GEL Grid and GEL Typography supply responsive fractions, gutters, type roles and broadcast information hierarchy.",
    signature: ["lower-third", "channel-bug", "data-strap"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Use one solid metadata strap.", "Keep all numbers tabular.", "Use rectangular hierarchy instead of HUD ornament."],
    rejects: ["sci-fi-hud", "signal-lines-over-content", "ticker-over-actions", "neon-glow"],
  },
  {
    id: "minimal",
    name: "Minimal",
    category: "Clean",
    concept: "A museum-like identity where typography, proportion, whitespace and one quiet divider do all the work.",
    density: "airy",
    wikiStyle: "editorial",
    layout: "minimal-stack",
    referenceFamily: "Pico CSS semantic system",
    implementationReference: "Pico CSS supplies the semantic spacing, typography, controls and minimalist responsive grammar.",
    signature: ["whitespace", "quiet-meta", "single-divider"],
    decorations: ["none"],
    allowsGraphicArt: false,
    rules: ["No background art.", "No enclosing card.", "Use one divider maximum."],
    rejects: ["gradient", "glow", "motif", "decorative-card"],
  },
  {
    id: "panorama",
    name: "Atlas",
    category: "Geographic",
    concept: "Cartographic identity using map-index typography, contained reference geometry and geographic hierarchy.",
    density: "balanced",
    wikiStyle: "editorial",
    layout: "atlas-grid",
    referenceFamily: "MapLibre GL JS",
    implementationReference: "MapLibre GL JS supplies real cartographic rendering and control grammar; Solaris never fabricates geographic data.",
    signature: ["map-index", "coordinate-label", "contour-cell"],
    decorations: ["auto", "topography", "grid", "none"],
    allowsGraphicArt: true,
    rules: ["All contour/grid graphics remain inside the art region.", "Coordinates are metadata, not body decoration.", "Official flag remains a separate factual image."],
    rejects: ["contours-behind-buttons", "compass-over-flag", "fake-map-texture-under-copy", "full-hero-grid"],
  },
  {
    id: "classic",
    name: "Diplomatic",
    category: "Formal",
    concept: "Formal institutional country profile with restrained government-service hierarchy and conservative spacing.",
    density: "balanced",
    wikiStyle: "chronicle",
    layout: "institutional-grid",
    referenceFamily: "GOV.UK Frontend",
    implementationReference: "GOV.UK Frontend supplies summary lists, tables, actions, navigation and institutional information hierarchy.",
    signature: ["official-heading", "fact-grid", "single-rule"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Prioritise clarity over ceremony.", "Use one official divider.", "Keep action placement conventional."],
    rejects: ["luxury-invitation", "giant-crest", "symmetrical-ornament", "serif-everything"],
  },
  {
    id: "spotlight",
    name: "Festival",
    category: "Culture",
    concept: "Energetic event identity with a bounded rhythm graphic, bold type and clear ticket-like metadata.",
    density: "balanced",
    wikiStyle: "modern",
    layout: "festival-grid",
    referenceFamily: "GDG-X Hoverboard",
    implementationReference: "GDG-X Hoverboard supplies event hero, feature-card, schedule and responsive event-content structure.",
    signature: ["event-mark", "rhythm-cell", "ticket-meta"],
    decorations: ["auto", "none"],
    allowsGraphicArt: true,
    rules: ["Keep the rhythm graphic in one dedicated cell.", "Use country colours boldly but preserve readable controls.", "Actions sit on a solid surface."],
    rejects: ["literal-stage-lights", "neon-rings", "glow-over-copy", "lines-through-cta"],
  },
  {
    id: "duotone",
    name: "Brutalist",
    category: "Graphic",
    concept: "Hard-edged graphic composition built from a visible structural grid, thick rules and uncompromising type.",
    density: "compact",
    wikiStyle: "modern",
    layout: "brutalist-grid",
    referenceFamily: "RampStack Brutalist Web Theme",
    implementationReference: "RampStack Brutalist Web Theme supplies the raw structural grid, hard borders and anti-polish visual grammar.",
    signature: ["heavy-rule", "raw-cell", "index-number"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Every heavy line must be a real grid boundary.", "Use at most two major colours.", "Keep semantic content aligned to explicit cells."],
    rejects: ["random-diagonal-polygons", "bad-legibility-as-style", "floating-border", "content-collision"],
  },
  {
    id: "sci-fi",
    name: "Retro Digital",
    category: "Digital",
    concept: "Late-90s information terminal styling with window chrome, monospace metadata and restrained status readouts.",
    density: "compact",
    wikiStyle: "modern",
    layout: "retro-window",
    referenceFamily: "98.css retro UI system",
    implementationReference: "98.css supplies window chrome, bevel recipes, group-box and classic control grammar while Solaris preserves modern accessibility.",
    signature: ["window-chrome", "status-row", "terminal-label"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Keep controls modern-sized even when visually retro.", "Use monospace for metadata only.", "Keep scanline texture optional and extremely subtle."],
    rejects: ["hologram", "cyan-triangle-hud", "tiny-controls", "monospace-body-copy"],
  },
  {
    id: "monument",
    name: "Luxury",
    category: "Editorial",
    concept: "High-fashion editorial restraint with dramatic negative space, fine keylines and a single display statement.",
    density: "airy",
    wikiStyle: "editorial",
    layout: "luxury-editorial",
    referenceFamily: "Aimeos Pagible Luxury",
    implementationReference: "Aimeos Pagible Luxury supplies high-fashion editorial whitespace, sharp edges, hairlines and document rhythm.",
    signature: ["negative-space", "fine-keyline", "display-statement"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Use whitespace as the primary luxury signal.", "One fine keyline maximum.", "Keep actions visually quiet but fully legible."],
    rejects: ["gold-gradient", "gem-icon", "multiple-frames", "luxury-label-copy"],
  },
  {
    id: "newspaper",
    name: "Newspaper",
    category: "Editorial",
    concept: "Print-journalism hierarchy with masthead, dateline, column rhythm and factual tabular metadata.",
    density: "compact",
    wikiStyle: "editorial",
    layout: "newspaper-grid",
    referenceFamily: "Guardian Source / Interactive Style Library",
    implementationReference: "Guardian Source and Interactive Style Library supply editorial headline roles, labels, breakpoints and newsroom hierarchy.",
    signature: ["masthead", "dateline", "column-rule"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["No rounded corners.", "Use print-like rules only as section boundaries.", "Keep metadata aligned and compact."],
    rejects: ["rounded-newspaper-card", "glass", "sepia-noise", "boxed-every-section"],
  },
  {
    id: "horizon",
    name: "Scientific",
    category: "Data",
    concept: "Research-dossier precision with tabular facts, measurement language and a tightly controlled technical grid.",
    density: "compact",
    wikiStyle: "editorial",
    layout: "technical-grid",
    referenceFamily: "IBM Carbon",
    implementationReference: "IBM Carbon supplies the technical grid, data tables, spacing hierarchy and component-state grammar.",
    signature: ["reference-id", "measurement-row", "technical-caption"],
    decorations: ["auto", "grid", "none"],
    allowsGraphicArt: true,
    rules: ["Keep measurement marks inside the art cell.", "Use tabular numerals for data.", "Use one accent colour over a neutral technical surface."],
    rejects: ["radar", "scan-beam", "futuristic-glow", "dense-tiny-text"],
  },
  {
    id: "flag-focus",
    name: "Civic",
    category: "Public",
    concept: "Accessible public-information design with a strong civic band, direct facts and conventional actions.",
    density: "balanced",
    wikiStyle: "modern",
    layout: "civic-grid",
    referenceFamily: "USWDS civic system",
    implementationReference: "USWDS supplies summary lists, civic navigation, tables, accessible actions and public-service spacing.",
    signature: ["civic-band", "public-facts", "solid-actions"],
    decorations: ["auto", "none"],
    allowsGraphicArt: false,
    rules: ["Use a single civic accent band.", "Keep the flag prominent but never as text background.", "Prefer clarity to ornament."],
    rejects: ["patriotic-rays", "full-background-flag-under-text", "giant-emblem", "oversaturated-ui"],
  },
  {
    id: "ribbon",
    name: "Avant-Garde",
    category: "Experimental",
    concept: "Post-Swiss asymmetry and modular tension inside a strict collision-free grid.",
    density: "balanced",
    wikiStyle: "modern",
    layout: "avant-garde-grid",
    referenceFamily: "Superilles Grid System / Wim Crouwel",
    implementationReference: "Superilles supplies the responsive editorial grid; Wim Crouwel remains the authority for controlled modular experimentation.",
    signature: ["offset-type", "modular-art-cell", "edge-index"],
    decorations: ["auto", "none"],
    allowsGraphicArt: true,
    rules: ["All experimentation stays inside grid cells.", "Use one art move only.", "Asymmetry comes from scale and alignment, not overlap."],
    rejects: ["ribbon-across-controls", "rotated-body-copy", "random-z-index", "semantic-overlap"],
  },
] as const satisfies readonly CountryPersonalityDefinition[];

/** Older persisted values remain valid and resolve to the closest deliberate V8 concept. */
export const LEGACY_PERSONALITY_ALIASES: Partial<Record<CountryHeroLayout, CountryHeroLayout>> = {
  split: "classic",
  "water-drop": "glass-card",
};

const COUNTRY_PERSONALITY_BY_ID = Object.fromEntries(
  COUNTRY_PERSONALITIES.map((personality) => [personality.id, personality]),
) as Partial<Record<CountryHeroLayout, CountryPersonalityDefinition>>;

export function canonicalCountryPersonalityId(id: CountryHeroLayout): CountryHeroLayout {
  const resolved = LEGACY_PERSONALITY_ALIASES[id] ?? id;
  return COUNTRY_PERSONALITY_BY_ID[resolved] ? resolved : "classic";
}

export function countryPersonality(id: CountryHeroLayout): CountryPersonalityDefinition {
  const resolved = canonicalCountryPersonalityId(id);
  return COUNTRY_PERSONALITY_BY_ID[resolved] ?? COUNTRY_PERSONALITIES[8];
}

export function wikiStyleForPersonality(id: CountryHeroLayout): CountryWikiStyle {
  return countryPersonality(id).wikiStyle;
}

export function personalityDecorations(id: CountryHeroLayout): readonly CountryDecorationStyle[] {
  return countryPersonality(id).decorations;
}
