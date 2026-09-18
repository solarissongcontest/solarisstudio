import type { CountryHeroLayout } from "@/lib/visual-theme";

export type SourceDivergenceDecision = {
  keep: readonly string[];
  remap: readonly string[];
  removeForSafety: readonly string[];
  solarisAdd: readonly string[];
  budgetStatus: "review-required" | "approved";
  note: string;
};

/**
 * Design divergence evidence.
 *
 * These entries classify the adapter decisions required by the canonical
 * contract. They deliberately do not invent a percentage. Structural and
 * visual replacement percentages become "approved" only after the rendered
 * source-vs-Solaris review has measured them.
 */
export const COUNTRY_PERSONALITY_DIVERGENCE: Partial<Record<CountryHeroLayout, SourceDivergenceDecision>> = {
  "glass-card": {
    keep: ["DOM material/refraction engine", "lens edge response", "browser fallbacks"],
    remap: ["material tint to country palette", "typography to Solaris roles"],
    removeForSafety: ["demo video/WebGL surfaces", "upstream demo branding/assets"],
    solarisAdd: ["official flag zone", "country metadata", "Solaris actions"],
    budgetStatus: "review-required",
    note: "One real liquid-glass plate is preserved; semantic Country content remains Solaris-owned.",
  },
  editorial: {
    keep: ["55/40 document-to-margin relationship", "editorial measure", "marginal rhythm"],
    remap: ["ET Book roles to licensed Solaris/system fonts", "ink/accent to country tokens"],
    removeForSafety: ["negative-margin sidenote collision behavior", "upstream font files"],
    solarisAdd: ["official flag margin region", "country actions", "SSC data modules"],
    budgetStatus: "review-required",
    note: "Tufte composition is translated to collision-safe grid while preserving its reading hierarchy.",
  },
  passport: {
    keep: ["segmented document zones", "field/value hierarchy", "compact record density"],
    remap: ["airline fields to Country identity facts", "document colors to country tokens"],
    removeForSafety: ["airline branding", "seat/gate metaphors", "boarding icons", "realistic security imitation"],
    solarisAdd: ["official flag", "Country code", "Solaris actions"],
    budgetStatus: "review-required",
    note: "The ticket source supplies document grammar; ICAO zoning is structural authority, not a fake passport.",
  },
  poster: {
    keep: ["12-column grid", "8px baseline", "modular type scale", "hairline hierarchy"],
    remap: ["single source accent to accessible country primary", "source grotesque to system/Solaris grotesque"],
    removeForSafety: ["development grid overlays", "demo assets"],
    solarisAdd: ["official flag cell", "Country metadata", "actions"],
    budgetStatus: "review-required",
    note: "Swiss structure remains the visual authority; Solaris content is placed into its grid rather than painted over it.",
  },
  heritage: {
    keep: ["archive heading groups", "record metadata hierarchy", "formal list/grid rhythm"],
    remap: ["source typography to available Solaris/system fonts", "institutional accent to country palette"],
    removeForSafety: ["National Archives branding", "site-specific navigation and assets"],
    solarisAdd: ["official flag", "SSC chronology", "Country actions"],
    budgetStatus: "review-required",
    note: "Archival information design is retained without parchment cosplay or borrowed institutional identity.",
  },
  broadcast: {
    keep: ["GEL responsive grid", "GEL spacing rhythm", "broadcast information hierarchy"],
    remap: ["BBC font roles to Solaris/system fonts", "brand color to country primary"],
    removeForSafety: ["BBC marks", "programme branding", "media/demo assets"],
    solarisAdd: ["official flag", "country identity copy", "Solaris controls"],
    budgetStatus: "review-required",
    note: "The adapter preserves GEL's information cadence rather than inventing television-looking decoration.",
  },
  minimal: {
    keep: ["Pico semantic spacing", "plain control grammar", "minimal border/radius logic"],
    remap: ["Pico variables to Solaris tokens", "font stack to Solaris/system stack"],
    removeForSafety: ["global reset ownership", "full-document defaults outside Country scope"],
    solarisAdd: ["official flag", "country-specific actions", "SSC data"],
    budgetStatus: "review-required",
    note: "Minimal stays source-semantic and intentionally low-ornament instead of merely deleting UI.",
  },
  panorama: {
    keep: ["MapLibre map runtime", "map control geometry", "real geographic layer behavior"],
    remap: ["country geometry layer styling", "control placement within the bounded identity module"],
    removeForSafety: ["unverified geographic datasets", "demo sprites/assets", "invented coordinate wallpaper"],
    solarisAdd: ["verified Country geometry contract", "geographic-facts fallback", "official flag/actions"],
    budgetStatus: "review-required",
    note: "A real map renders only from verified coordinates/bounds/GeoJSON; absence of geography is explicit.",
  },
  classic: {
    keep: ["GOV.UK spacing scale", "summary-list relationships", "institutional information hierarchy"],
    remap: ["GOV.UK typography to Solaris/system fonts", "government blue to country primary"],
    removeForSafety: ["Crown/GOV.UK marks", "service-specific navigation and branding"],
    solarisAdd: ["official flag", "Country identity", "SSC actions/data"],
    budgetStatus: "review-required",
    note: "Institutional clarity is preserved while all governmental identity remains excluded.",
  },
  spotlight: {
    keep: ["Hoverboard event hierarchy", "hero-to-content rhythm", "event section density"],
    remap: ["event palette to country colors", "source typography to Solaris/system roles"],
    removeForSafety: ["ticket/social/demo content", "conference branding", "decorative motion where accessibility forbids it"],
    solarisAdd: ["official flag", "country metadata", "Solaris actions"],
    budgetStatus: "review-required",
    note: "Festival borrows a real event-system hierarchy, not generic neon gradients.",
  },
  duotone: {
    keep: ["source exposed grid", "hard-cell composition", "square rule language"],
    remap: ["source accent fields to country palette", "type roles to Solaris/system fonts"],
    removeForSafety: ["demo content", "non-semantic decorative controls"],
    solarisAdd: ["official flag", "accessible actions", "Country facts"],
    budgetStatus: "review-required",
    note: "Brutalist structure stays explicit while functional controls retain modern accessibility.",
  },
  "sci-fi": {
    keep: ["98.css window chrome", "bevel recipes", "classic control grouping"],
    remap: ["title-bar accent where appropriate", "font sizing for modern legibility"],
    removeForSafety: ["tiny original hit targets", "OS-specific product branding"],
    solarisAdd: ["44px-safe actions", "official flag", "Country/SSC content"],
    budgetStatus: "review-required",
    note: "Retro uses actual Windows-98-era application grammar rather than green monospace shorthand.",
  },
  monument: {
    keep: ["luxury editorial whitespace", "centered proportion", "tracked label hierarchy"],
    remap: ["external luxury webfonts to licensed/system fallbacks", "antique-gold accent to country primary"],
    removeForSafety: ["CMS templates", "demo imagery", "external font payloads"],
    solarisAdd: ["official flag", "Country facts", "Solaris actions"],
    budgetStatus: "review-required",
    note: "Luxury is carried by proportion and restraint, not black-and-gold decoration.",
  },
  newspaper: {
    keep: ["Guardian spacing relationships", "headline hierarchy", "newsroom information density"],
    remap: ["proprietary Guardian fonts to system/Solaris serif/sans roles", "brand color to country accent"],
    removeForSafety: ["Guardian logos", "proprietary font files", "brand graphics"],
    solarisAdd: ["official flag", "Country actions", "SSC records"],
    budgetStatus: "review-required",
    note: "Publication grammar survives without copying Guardian brand identity.",
  },
  horizon: {
    keep: ["Carbon spacing increments", "square data surfaces", "technical table/grid hierarchy"],
    remap: ["IBM/Carbon color roles to country/Solaris tokens", "typeface to licensed/system roles"],
    removeForSafety: ["IBM marks", "product-specific icons", "brand assets"],
    solarisAdd: ["official flag", "Country identity", "SSC statistics"],
    budgetStatus: "review-required",
    note: "Scientific stays data-first and technical rather than decorating the page with invented science motifs.",
  },
  "flag-focus": {
    keep: ["USWDS summary-box grammar", "site margins", "public-service information hierarchy"],
    remap: ["US civic color roles to country palette", "source type to Solaris/system fonts"],
    removeForSafety: ["government marks", "third-party fonts/icons", "agency branding"],
    solarisAdd: ["official country flag", "SSC facts", "Solaris actions"],
    budgetStatus: "review-required",
    note: "Civic preserves service clarity without impersonating a U.S. government site.",
  },
  ribbon: {
    keep: ["Superilles 12-track grid", "12/24px gap rhythm", "asymmetric editorial occupancy"],
    remap: ["source palette/type to accessible country and system roles", "story geometry to bounded Country regions"],
    removeForSafety: ["demo content", "full-viewport mobile story heights", "non-semantic interventions"],
    solarisAdd: ["official flag", "Country actions", "SSC modules"],
    budgetStatus: "review-required",
    note: "Avant-Garde keeps modular tension while semantic reading order remains conventional and safe.",
  },
};

export function countryPersonalityDivergence(id: CountryHeroLayout) {
  return COUNTRY_PERSONALITY_DIVERGENCE[id] ?? COUNTRY_PERSONALITY_DIVERGENCE.classic!;
}
