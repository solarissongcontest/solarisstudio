import type { CountryHeroLayout } from "@/lib/visual-theme";

export type CountryCompositionFamily =
  | "material"
  | "document"
  | "official-document"
  | "institutional"
  | "grid-graphic"
  | "information"
  | "event"
  | "geographic"
  | "software"
  | "semantic";

export type CountryBackgroundPolicy =
  | "ambient"
  | "contained"
  | "disabled"
  | "desktop-wallpaper";

export type CountrySourceImportMode =
  | "package"
  | "vendored-css"
  | "vendored-scss"
  | "vendored-source"
  | "translated-components"
  | "remote-esm";

export type CountrySourceStatus = "prototype" | "planned";
export type CountryBackgroundMode = "solid" | "gradient" | "image";

export type FlagBounds = {
  desktop: readonly [width: number, height: number];
  mobile: readonly [width: number, height: number];
};

export type CountryPersonalityCompanionSource = {
  sourceName: string;
  repository: string;
  pinnedRef: string;
  license: string;
};

export type CountryPersonalitySource = {
  id: CountryHeroLayout;
  sourceName: string;
  repository: string | null;
  pinnedRef: string | null;
  sourceUrl?: string;
  companionSources?: readonly CountryPersonalityCompanionSource[];
  version: string | null;
  license: string;
  importMode: CountrySourceImportMode;
  visualAuthority: string;
  compositionFamily: CountryCompositionFamily;
  backgroundPolicy: CountryBackgroundPolicy;
  backgroundModes: readonly CountryBackgroundMode[];
  flag: FlagBounds;
  density: "low" | "medium-low" | "medium" | "medium-high" | "high";
  status: CountrySourceStatus;
};

/**
 * Canonical source-driven personality registry.
 *
 * A personality is not a Solaris-invented skin. Its visual grammar comes from
 * the human-designed source named here. Source substitutions are design changes
 * and must update this registry deliberately.
 *
 * Source pins and adapter status are explicit. A "prototype" source already
 * has a live Solaris translation; a "planned" source is pinned and licensed
 * but may not yet alter the rendered Country/Wiki surfaces.
 */
export const COUNTRY_PERSONALITY_SOURCES = [
  {
    id: "glass-card",
    sourceName: "Sam Asante liquid-glass",
    repository: "samasante/liquid-glass",
    pinnedRef: "4e7b769e1df7e5a7d3669fef22417fe3d2f79ade",
    version: "0.1.1",
    license: "MIT",
    importMode: "vendored-source",
    visualAuthority: "Apple Liquid Glass",
    compositionFamily: "material",
    backgroundPolicy: "ambient",
    backgroundModes: ["solid","gradient","image"],
    flag: { desktop: [176, 118], mobile: [144, 96] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "editorial",
    sourceName: "Tufte CSS",
    repository: "edwardtufte/tufte-css",
    pinnedRef: "b5d7b7bbe5ce9c4c50fcfad4f19ee3646cfd7ae1",
    version: "1.9.0",
    license: "MIT",
    importMode: "translated-components",
    visualAuthority: "Edward Tufte editorial publishing",
    compositionFamily: "document",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [144, 96], mobile: [120, 80] },
    density: "medium-low",
    status: "prototype",
  },
  {
    id: "passport",
    sourceName: "Jesus Ramirez International Airline Ticket CSS",
    repository: null,
    pinnedRef: "codehim-2024-03-04",
    sourceUrl: "https://codehim.com/html5-css3/international-airline-ticket-in-html-css/",
    version: "2024-03-04",
    license: "MIT",
    importMode: "translated-components",
    visualAuthority: "ICAO Doc 9303 document zoning",
    compositionFamily: "official-document",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [152, 100], mobile: [136, 90] },
    density: "high",
    status: "prototype",
  },
  {
    id: "poster",
    sourceName: "RampStack Swiss Style Theme",
    repository: "rampstackco/swiss-style-theme",
    pinnedRef: "55e82b52f2c4c2893f79628c77ed31418d5975e6",
    version: null,
    license: "MIT",
    importMode: "vendored-css",
    visualAuthority: "International Typographic Style",
    compositionFamily: "grid-graphic",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [184, 122], mobile: [160, 106] },
    density: "medium-low",
    status: "prototype",
  },
  {
    id: "heritage",
    sourceName: "The National Archives Design System",
    repository: "nationalarchives/design-system",
    pinnedRef: "86202aabc033da76bb8a5171c39737bc1a6fef1d",
    version: null,
    license: "MIT",
    importMode: "vendored-scss",
    visualAuthority: "Archival and catalogue publishing",
    compositionFamily: "document",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [160, 106], mobile: [144, 96] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "broadcast",
    sourceName: "BBC GEL Grid + GEL Typography",
    repository: "bbc/gel-grid",
    pinnedRef: "65c2b3f878a3999104c7e17f989602075f9f6e22",
    companionSources: [
      {
        sourceName: "BBC GEL Typography",
        repository: "bbc/gel-typography",
        pinnedRef: "d4fea6fc03586bc7fa066cd22abbae9fbd7005a6",
        license: "MIT",
      },
    ],
    version: null,
    license: "MIT",
    importMode: "vendored-scss",
    visualAuthority: "BBC Global Experience Language",
    compositionFamily: "information",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [160, 106], mobile: [144, 96] },
    density: "medium-high",
    status: "prototype",
  },
  {
    id: "minimal",
    sourceName: "Pico CSS",
    repository: "picocss/pico",
    pinnedRef: "1039a4788d6abc368d5485ae6bac84a8f0e3096f",
    version: "2.1.1",
    license: "MIT",
    importMode: "translated-components",
    visualAuthority: "Pico semantic minimalist UI",
    compositionFamily: "semantic",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [120, 80], mobile: [104, 70] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "panorama",
    sourceName: "MapLibre GL JS",
    repository: "maplibre/maplibre-gl-js",
    pinnedRef: "d1934699ed3159f1e5d689078dd2e677f3ed34e3",
    version: "6.10.0",
    license: "BSD-3-Clause",
    importMode: "remote-esm",
    visualAuthority: "Modern digital cartography",
    compositionFamily: "geographic",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [152, 100], mobile: [136, 90] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "classic",
    sourceName: "GOV.UK Frontend",
    repository: "alphagov/govuk-frontend",
    pinnedRef: "b4a7543f133932fb04575b045330e8a01ab5c250",
    version: null,
    license: "MIT",
    importMode: "vendored-scss",
    visualAuthority: "Institutional and government publishing",
    compositionFamily: "institutional",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [136, 90], mobile: [120, 80] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "spotlight",
    sourceName: "GDG-X Hoverboard",
    repository: "gdg-x/hoverboard",
    pinnedRef: "80395b0ccc6e08cc1f0cdff50186ee119aad0b24",
    version: null,
    license: "MIT",
    importMode: "translated-components",
    visualAuthority: "Contemporary event-site composition",
    compositionFamily: "event",
    backgroundPolicy: "ambient",
    backgroundModes: ["solid","gradient","image"],
    flag: { desktop: [176, 118], mobile: [156, 104] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "duotone",
    sourceName: "RampStack Brutalist Web Theme",
    repository: "rampstackco/brutalist-web-theme",
    pinnedRef: "2ad20824755fb00b3d2c30d01df67ea63f2d9427",
    version: null,
    license: "MIT",
    importMode: "vendored-css",
    visualAuthority: "Web brutalism",
    compositionFamily: "grid-graphic",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [176, 118], mobile: [156, 104] },
    density: "medium-high",
    status: "prototype",
  },
  {
    id: "sci-fi",
    sourceName: "98.css",
    repository: "jdan/98.css",
    pinnedRef: "b1d7a907371bbe523d6f64e3af97f714fdbd6d6a",
    version: "0.1.21",
    license: "MIT",
    importMode: "translated-components",
    visualAuthority: "Classic Windows 98 UI grammar",
    compositionFamily: "software",
    backgroundPolicy: "desktop-wallpaper",
    backgroundModes: ["solid","image"],
    flag: { desktop: [144, 96], mobile: [128, 86] },
    density: "high",
    status: "prototype",
  },
  {
    id: "monument",
    sourceName: "Aimeos Pagible Luxury",
    repository: "aimeos/pagible-themes-luxury",
    pinnedRef: "df0764db7057cc631dd2dea1bd466a8e995a3637",
    version: null,
    license: "MIT",
    importMode: "vendored-css",
    visualAuthority: "High-fashion editorial publishing",
    compositionFamily: "document",
    backgroundPolicy: "ambient",
    backgroundModes: ["solid","image"],
    flag: { desktop: [128, 86], mobile: [120, 80] },
    density: "low",
    status: "prototype",
  },
  {
    id: "newspaper",
    sourceName: "Guardian Source / Interactive Style Library",
    repository: "guardian/source",
    pinnedRef: "d84c25d67ed51545994f53986eb4487d35c1aab4",
    companionSources: [
      {
        sourceName: "Guardian Interactive Style Library",
        repository: "guardian/interactive-style-library",
        pinnedRef: "19533f580cfa7ff6f5e2db6ffc75334cd9cf02a8",
        license: "Apache-2.0",
      },
    ],
    version: null,
    license: "Apache-2.0",
    importMode: "vendored-scss",
    visualAuthority: "Newspaper and editorial hierarchy",
    compositionFamily: "document",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [128, 86], mobile: [112, 74] },
    density: "medium-high",
    status: "prototype",
  },
  {
    id: "horizon",
    sourceName: "IBM Carbon",
    repository: "carbon-design-system/carbon",
    pinnedRef: "717c76d8b81c0ece1ce845caffe70f6d64a1a6bb",
    version: null,
    license: "Apache-2.0",
    importMode: "vendored-scss",
    visualAuthority: "Technical and data-oriented interface design",
    compositionFamily: "information",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [136, 90], mobile: [120, 80] },
    density: "high",
    status: "prototype",
  },
  {
    id: "flag-focus",
    sourceName: "USWDS",
    repository: "uswds/uswds",
    pinnedRef: "fca24584304e836f1314a98b8847985b801503c3",
    version: null,
    license: "CC0-1.0 + audited third-party notices",
    importMode: "vendored-scss",
    visualAuthority: "Civic and public-service information design",
    compositionFamily: "institutional",
    backgroundPolicy: "disabled",
    backgroundModes: ["solid"],
    flag: { desktop: [144, 96], mobile: [128, 86] },
    density: "medium",
    status: "prototype",
  },
  {
    id: "ribbon",
    sourceName: "Superilles Grid System",
    repository: "zetareticoli/superilles",
    pinnedRef: "b4404a655115f030c0bedec45cf5693169d03470",
    version: null,
    license: "ISC",
    importMode: "vendored-css",
    visualAuthority: "Wim Crouwel modular-grid experimentation",
    compositionFamily: "grid-graphic",
    backgroundPolicy: "contained",
    backgroundModes: ["solid"],
    flag: { desktop: [168, 112], mobile: [152, 100] },
    density: "medium-low",
    status: "prototype",
  },
] as const satisfies readonly CountryPersonalitySource[];

const SOURCE_BY_ID = Object.fromEntries(
  COUNTRY_PERSONALITY_SOURCES.map((source) => [source.id, source]),
) as Partial<Record<CountryHeroLayout, CountryPersonalitySource>>;

export function countryPersonalitySource(id: CountryHeroLayout): CountryPersonalitySource {
  const source = SOURCE_BY_ID[id];
  if (source) return source;
  return SOURCE_BY_ID.classic ?? COUNTRY_PERSONALITY_SOURCES[8];
}
