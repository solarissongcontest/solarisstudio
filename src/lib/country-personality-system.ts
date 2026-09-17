import type { CountryDecorationStyle, CountryHeroLayout } from "@/lib/visual-theme";

export type CountryWikiStyle = "editorial" | "chronicle" | "modern";
export type CountryPersonalityDensity = "compact" | "balanced" | "airy";

export type CountryPersonalityDefinition = {
  id: CountryHeroLayout;
  name: string;
  category: string;
  concept: string;
  density: CountryPersonalityDensity;
  wikiStyle: CountryWikiStyle;
  signature: readonly string[];
  decorations: readonly CountryDecorationStyle[];
};

/**
 * V7 intentionally uses existing persisted hero-layout values as stable
 * storage keys. Keeping those keys avoids a schema migration and preserves
 * every already-saved country theme while the presentation layer becomes a
 * coherent, human-designed system.
 */
export const COUNTRY_PERSONALITIES = [
  {
    id: "glass-card",
    name: "Glass",
    category: "Material",
    concept: "Layered translucent surfaces, controlled blur and luminous depth without nested glass clutter.",
    density: "balanced",
    wikiStyle: "modern",
    signature: ["refraction", "edge-light", "atmosphere"],
    decorations: ["auto", "flag", "aurora", "none"],
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "Editorial",
    concept: "High-end cultural magazine composition with strong type, captions and quiet rules.",
    density: "airy",
    wikiStyle: "editorial",
    signature: ["masthead", "fact-rail", "hairline"],
    decorations: ["auto", "grid", "none"],
  },
  {
    id: "passport",
    name: "Passport",
    category: "Document",
    concept: "A disciplined national identity document with security marks, fields and one restrained seal.",
    density: "compact",
    wikiStyle: "modern",
    signature: ["document-code", "security-grid", "seal"],
    decorations: ["auto", "grid", "none"],
  },
  {
    id: "poster",
    name: "Poster",
    category: "Graphic",
    concept: "Cultural-poster art direction with oversized typography, asymmetric rhythm and protected overlap zones.",
    density: "airy",
    wikiStyle: "modern",
    signature: ["display-type", "offset-mark", "poster-index"],
    decorations: ["auto", "rays", "flag", "none"],
  },
  {
    id: "heritage",
    name: "Heritage",
    category: "Cultural",
    concept: "Archival and ceremonial presentation with book-like rules, restrained ornament and formal typography.",
    density: "balanced",
    wikiStyle: "chronicle",
    signature: ["archival-rule", "ornament", "formal-frame"],
    decorations: ["auto", "topography", "none"],
  },
  {
    id: "broadcast",
    name: "Broadcast",
    category: "Media",
    concept: "On-air identity graphics with lower thirds, number rails and compact broadcast information blocks.",
    density: "compact",
    wikiStyle: "modern",
    signature: ["lower-third", "ticker", "channel-bug"],
    decorations: ["auto", "grid", "flag", "none"],
  },
  {
    id: "minimal",
    name: "Minimal",
    category: "Clean",
    concept: "Museum-like restraint where typography, proportion and whitespace carry the entire identity.",
    density: "airy",
    wikiStyle: "editorial",
    signature: ["white-space", "hairline", "quiet-meta"],
    decorations: ["none"],
  },
  {
    id: "panorama",
    name: "Atlas",
    category: "Geographic",
    concept: "Cartographic identity with region indexing, map-grid language and geographic reference marks.",
    density: "balanced",
    wikiStyle: "editorial",
    signature: ["map-grid", "compass", "region-index"],
    decorations: ["auto", "topography", "grid", "none"],
  },
  {
    id: "classic",
    name: "Diplomatic",
    category: "Formal",
    concept: "Embassy and treaty-document restraint with official hierarchy, seal geometry and conservative spacing.",
    density: "balanced",
    wikiStyle: "chronicle",
    signature: ["official-rule", "seal-ring", "document-header"],
    decorations: ["auto", "none"],
  },
  {
    id: "spotlight",
    name: "Festival",
    category: "Culture",
    concept: "Music and cultural-event energy with ticket details, rhythmic forms and confident display typography.",
    density: "balanced",
    wikiStyle: "modern",
    signature: ["ticket-notch", "rhythm-bars", "event-mark"],
    decorations: ["auto", "rays", "aurora", "none"],
  },
  {
    id: "duotone",
    name: "Brutalist",
    category: "Graphic",
    concept: "Hard-edged graphic design with raw blocks, visible grid logic and deliberately uncompromising typography.",
    density: "compact",
    wikiStyle: "modern",
    signature: ["heavy-rule", "raw-block", "index-number"],
    decorations: ["auto", "facets", "none"],
  },
  {
    id: "sci-fi",
    name: "Retro Digital",
    category: "Digital",
    concept: "Late-90s technical interface language with terminal labels, scanlines and restrained signal graphics.",
    density: "compact",
    wikiStyle: "modern",
    signature: ["terminal-label", "scanline", "signal-meter"],
    decorations: ["auto", "grid", "constellation", "none"],
  },
  {
    id: "monument",
    name: "Luxury",
    category: "Editorial",
    concept: "Fashion-editorial restraint with dramatic scale, fine rules and ceremonial negative space.",
    density: "airy",
    wikiStyle: "editorial",
    signature: ["fine-keyline", "monogram", "feature-space"],
    decorations: ["auto", "topography", "none"],
  },
  {
    id: "newspaper",
    name: "Newspaper",
    category: "Editorial",
    concept: "Print-journalism hierarchy with masthead logic, datelines, compact columns and tabular facts.",
    density: "compact",
    wikiStyle: "editorial",
    signature: ["masthead", "dateline", "column-rule"],
    decorations: ["auto", "grid", "none"],
  },
  {
    id: "horizon",
    name: "Scientific",
    category: "Data",
    concept: "Research-dossier precision with measurement marks, technical captions and disciplined data alignment.",
    density: "compact",
    wikiStyle: "editorial",
    signature: ["measurement", "reference-line", "specimen-index"],
    decorations: ["auto", "grid", "topography", "none"],
  },
  {
    id: "flag-focus",
    name: "Civic",
    category: "Public",
    concept: "Clear public-information design with accessible hierarchy, civic bands and practical fact presentation.",
    density: "balanced",
    wikiStyle: "modern",
    signature: ["civic-band", "status-line", "public-mark"],
    decorations: ["auto", "flag", "none"],
  },
  {
    id: "ribbon",
    name: "Avant-Garde",
    category: "Experimental",
    concept: "Controlled experimental composition with offset labels and graphic tension inside strict content safe zones.",
    density: "balanced",
    wikiStyle: "modern",
    signature: ["offset-label", "graphic-slash", "edge-index"],
    decorations: ["auto", "facets", "rays", "none"],
  },
] as const satisfies readonly CountryPersonalityDefinition[];

/**
 * These two values existed before V7 and remain valid in the database. They
 * resolve to the closest deliberate V7 personality so older saved countries
 * never fall into an unstyled or partially styled state.
 */
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
