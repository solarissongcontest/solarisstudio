import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  DEFAULT_COUNTRY_THEME,
  countryThemeToVisual,
  extractThemeFromImage,
  getThemeColourReport,
  type CountryThemeRow,
  type CountryVisualTheme,
} from "@/lib/visual-theme";

const supabase = typedSupabase as any;

export type CountrySurfaceStyle =
  | "opaque"
  | "transparent"
  | "glass"
  | "gradient"
  | "elevated"
  | "editorial";

export type CountryHeroV2Layout =
  | "centered"
  | "left"
  | "split"
  | "cinematic"
  | "poster"
  | "compact";

export type CountryContentLayout =
  | "wiki"
  | "encyclopedia"
  | "magazine"
  | "dashboard"
  | "showcase"
  | "timeline";

export type CountryAccentStyle =
  | "minimal"
  | "soft"
  | "bold"
  | "luxury"
  | "futuristic"
  | "playful"
  | "retro"
  | "organic"
  | "brutalist";

export type CountryMotionIntensity = "subtle" | "medium" | "heavy";

export type CountryFontChoice = {
  id: string;
  label: string;
  category: string;
  family: string;
  source: "solaris" | "google" | "system" | "custom";
  cssUrl?: string | null;
  fileUrl?: string | null;
};

export type CountryDesignV2 = {
  version: 2;
  surface: CountrySurfaceStyle;
  typography: {
    display: CountryFontChoice;
    heading: CountryFontChoice;
    body: CountryFontChoice;
  };
  hero: {
    layout: CountryHeroV2Layout;
    alignment: "left" | "center" | "right";
    showFlag: boolean;
    showNativeName: boolean;
    showMotto: boolean;
  };
  content: {
    defaultLayout: CountryContentLayout;
  };
  accent: CountryAccentStyle;
  motion: CountryMotionIntensity;
  palette: {
    backgroundPrimary: string;
    backgroundSecondary: string;
    backgroundTertiary: string | null;
    accent: string;
    textPrimary: string;
    textMuted: string;
    surface: string;
  };
  background: {
    mode: "solid" | "gradient" | "image";
    gradientStyle: "linear" | "radial" | "aurora";
    gradientAngle: number;
    imageUrl: string | null;
    imageStoragePath: string | null;
    positionX: number;
    positionY: number;
    overlay: number;
    blur: number;
  };
  tuning: {
    radius: number;
    spacing: number;
    contentWidth: number;
    shadowDepth: number;
    transparency: number;
  };
};

export type CountryDesignThemeRow = CountryThemeRow & {
  design_version?: number | null;
  design_v2?: unknown;
};

export type CountryDesignPreset = {
  id: string;
  owner_user_id: string;
  source_country_id: string | null;
  name: string;
  is_public: boolean;
  design_json: CountryDesignV2;
  created_at: string;
  updated_at: string;
};

export type CountryFontAsset = {
  id: string;
  owner_user_id: string;
  country_id: string;
  name: string;
  family_key: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  created_at: string;
};

export const COUNTRY_SURFACE_OPTIONS = [
  { id: "opaque", label: "Opaque", description: "Solid, readable cards with a clear material hierarchy." },
  { id: "transparent", label: "Transparent", description: "Light framing with the page atmosphere visible through content." },
  { id: "glass", label: "Glass", description: "Translucent surfaces, blur and controlled specular depth." },
  { id: "gradient", label: "Gradient", description: "Colour-rich surfaces driven by the country palette." },
  { id: "elevated", label: "3D / Elevated", description: "Floating surfaces with stronger depth and layered shadows." },
  { id: "editorial", label: "Editorial", description: "Typography-first pages with restrained cards and fine rules." },
] as const satisfies readonly { id: CountrySurfaceStyle; label: string; description: string }[];

export const COUNTRY_HERO_V2_OPTIONS = [
  { id: "centered", label: "Centered" },
  { id: "left", label: "Left" },
  { id: "split", label: "Split" },
  { id: "cinematic", label: "Cinematic" },
  { id: "poster", label: "Poster" },
  { id: "compact", label: "Compact" },
] as const satisfies readonly { id: CountryHeroV2Layout; label: string }[];

export const COUNTRY_CONTENT_LAYOUT_OPTIONS = [
  { id: "wiki", label: "Wiki" },
  { id: "encyclopedia", label: "Encyclopedia" },
  { id: "magazine", label: "Magazine" },
  { id: "dashboard", label: "Dashboard" },
  { id: "showcase", label: "Showcase" },
  { id: "timeline", label: "Timeline" },
] as const satisfies readonly { id: CountryContentLayout; label: string }[];

export const COUNTRY_ACCENT_OPTIONS = [
  { id: "minimal", label: "Minimal" },
  { id: "soft", label: "Soft" },
  { id: "bold", label: "Bold" },
  { id: "luxury", label: "Luxury" },
  { id: "futuristic", label: "Futuristic" },
  { id: "playful", label: "Playful" },
  { id: "retro", label: "Retro" },
  { id: "organic", label: "Organic" },
  { id: "brutalist", label: "Brutalist" },
] as const satisfies readonly { id: CountryAccentStyle; label: string }[];

const google = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replaceAll("%20", "+")}:wght@400;500;600;700&display=swap`;

export const COUNTRY_FONT_OPTIONS: CountryFontChoice[] = [
  {
    id: "crastao",
    label: "Classica Crastao",
    category: "Solaris recommended",
    family: '"Classica Crastao", Georgia, serif',
    source: "solaris",
  },
  {
    id: "gotham",
    label: "Gotham",
    category: "Solaris recommended",
    family: '"Gotham", ui-sans-serif, system-ui, sans-serif',
    source: "solaris",
  },
  {
    id: "inter",
    label: "Inter",
    category: "Modern",
    family: '"Inter", ui-sans-serif, system-ui, sans-serif',
    source: "google",
    cssUrl: google("Inter"),
  },
  {
    id: "manrope",
    label: "Manrope",
    category: "Minimal",
    family: '"Manrope", ui-sans-serif, system-ui, sans-serif',
    source: "google",
    cssUrl: google("Manrope"),
  },
  {
    id: "playfair",
    label: "Playfair Display",
    category: "Editorial",
    family: '"Playfair Display", Georgia, serif',
    source: "google",
    cssUrl: google("Playfair Display"),
  },
  {
    id: "cormorant",
    label: "Cormorant Garamond",
    category: "Elegant",
    family: '"Cormorant Garamond", Georgia, serif',
    source: "google",
    cssUrl: google("Cormorant Garamond"),
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    category: "Futuristic",
    family: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    source: "google",
    cssUrl: google("Space Grotesk"),
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    category: "Classic",
    family: '"Libre Baskerville", Georgia, serif',
    source: "google",
    cssUrl: google("Libre Baskerville"),
  },
  {
    id: "bodoni-moda",
    label: "Bodoni Moda",
    category: "Luxury",
    family: '"Bodoni Moda", "Times New Roman", serif',
    source: "google",
    cssUrl: google("Bodoni Moda"),
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    category: "Technical",
    family: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    source: "google",
    cssUrl: google("IBM Plex Mono"),
  },
  {
    id: "system-serif",
    label: "System Serif",
    category: "Classic",
    family: 'Georgia, "Times New Roman", serif',
    source: "system",
  },
  {
    id: "system-sans",
    label: "System Sans",
    category: "Modern",
    family: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    source: "system",
  },
];

const fontById = (id: string, fallback: CountryFontChoice) =>
  COUNTRY_FONT_OPTIONS.find((font) => font.id === id) ?? fallback;

const crastao = COUNTRY_FONT_OPTIONS[0];
const gotham = COUNTRY_FONT_OPTIONS[1];

function bounded(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function enumValue<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

function validHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

export function defaultCountryDesignV2(theme: CountryVisualTheme = DEFAULT_COUNTRY_THEME): CountryDesignV2 {
  return {
    version: 2,
    surface: "opaque",
    typography: {
      display: crastao,
      heading: gotham,
      body: gotham,
    },
    hero: {
      layout: "centered",
      alignment: "center",
      showFlag: true,
      showNativeName: true,
      showMotto: true,
    },
    content: {
      defaultLayout: "wiki",
    },
    accent: "minimal",
    motion: "subtle",
    palette: {
      backgroundPrimary: theme.backgroundPrimary,
      backgroundSecondary: theme.backgroundSecondary,
      backgroundTertiary: theme.backgroundTertiary,
      accent: theme.accent,
      textPrimary: theme.textPrimary,
      textMuted: theme.textMuted,
      surface: theme.surface,
    },
    background: {
      mode: theme.backgroundMode,
      gradientStyle: theme.gradientStyle,
      gradientAngle: theme.gradientAngle,
      imageUrl: theme.backgroundImageUrl,
      imageStoragePath: theme.backgroundImageStoragePath,
      positionX: theme.backgroundPositionX,
      positionY: theme.backgroundPositionY,
      overlay: theme.backgroundOverlay,
      blur: theme.backgroundBlur,
    },
    tuning: {
      radius: 18,
      spacing: 1,
      contentWidth: 1180,
      shadowDepth: 0.42,
      transparency: 0.78,
    },
  };
}

const LEGACY_MAP: Record<string, Partial<Pick<CountryDesignV2, "surface" | "accent">> & { hero?: CountryHeroV2Layout; content?: CountryContentLayout }> = {
  "glass-card": { surface: "glass", accent: "soft", hero: "centered", content: "showcase" },
  "water-drop": { surface: "glass", accent: "futuristic", hero: "split", content: "showcase" },
  editorial: { surface: "editorial", accent: "minimal", hero: "left", content: "magazine" },
  newspaper: { surface: "editorial", accent: "minimal", hero: "left", content: "encyclopedia" },
  monument: { surface: "editorial", accent: "luxury", hero: "split", content: "magazine" },
  heritage: { surface: "opaque", accent: "luxury", hero: "left", content: "encyclopedia" },
  poster: { surface: "opaque", accent: "bold", hero: "poster", content: "showcase" },
  ribbon: { surface: "transparent", accent: "bold", hero: "poster", content: "magazine" },
  duotone: { surface: "opaque", accent: "brutalist", hero: "split", content: "dashboard" },
  minimal: { surface: "transparent", accent: "minimal", hero: "compact", content: "wiki" },
  spotlight: { surface: "gradient", accent: "bold", hero: "cinematic", content: "showcase" },
  broadcast: { surface: "opaque", accent: "bold", hero: "split", content: "dashboard" },
  panorama: { surface: "transparent", accent: "organic", hero: "split", content: "showcase" },
  passport: { surface: "opaque", accent: "retro", hero: "split", content: "encyclopedia" },
  horizon: { surface: "opaque", accent: "futuristic", hero: "split", content: "dashboard" },
  "sci-fi": { surface: "glass", accent: "futuristic", hero: "split", content: "dashboard" },
  "flag-focus": { surface: "opaque", accent: "minimal", hero: "left", content: "wiki" },
  classic: { surface: "opaque", accent: "minimal", hero: "split", content: "wiki" },
  split: { surface: "opaque", accent: "minimal", hero: "split", content: "wiki" },
};

export function legacyThemeToCountryDesignV2(row?: CountryDesignThemeRow | null): CountryDesignV2 {
  const legacy = countryThemeToVisual(row ?? null) ?? DEFAULT_COUNTRY_THEME;
  const design = defaultCountryDesignV2(legacy);
  const mapped = LEGACY_MAP[legacy.heroLayout] ?? LEGACY_MAP.classic;
  return {
    ...design,
    surface: mapped.surface ?? design.surface,
    accent: mapped.accent ?? design.accent,
    hero: {
      ...design.hero,
      layout: mapped.hero ?? design.hero.layout,
      alignment: mapped.hero === "centered" ? "center" : "left",
    },
    content: { defaultLayout: mapped.content ?? design.content.defaultLayout },
  };
}

function normalizeFont(input: unknown, fallback: CountryFontChoice): CountryFontChoice {
  if (!input || typeof input !== "object") return fallback;
  const candidate = input as Partial<CountryFontChoice>;
  if (candidate.source === "custom" && candidate.family && candidate.fileUrl) {
    return {
      id: String(candidate.id || candidate.family),
      label: String(candidate.label || "Custom font"),
      category: String(candidate.category || "Custom"),
      family: String(candidate.family),
      source: "custom",
      fileUrl: String(candidate.fileUrl),
    };
  }
  if (candidate.id) return fontById(String(candidate.id), fallback);
  return fallback;
}

export function normalizeCountryDesignV2(input: unknown, fallbackTheme?: CountryVisualTheme): CountryDesignV2 {
  const fallback = defaultCountryDesignV2(fallbackTheme ?? DEFAULT_COUNTRY_THEME);
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Record<string, any>;
  const palette = raw.palette && typeof raw.palette === "object" ? raw.palette : {};
  const background = raw.background && typeof raw.background === "object" ? raw.background : {};
  const hero = raw.hero && typeof raw.hero === "object" ? raw.hero : {};
  const tuning = raw.tuning && typeof raw.tuning === "object" ? raw.tuning : {};
  const typography = raw.typography && typeof raw.typography === "object" ? raw.typography : {};
  const content = raw.content && typeof raw.content === "object" ? raw.content : {};

  const requestedPalette = {
    backgroundPrimary: validHex(palette.backgroundPrimary, fallback.palette.backgroundPrimary),
    backgroundSecondary: validHex(palette.backgroundSecondary, fallback.palette.backgroundSecondary),
    backgroundTertiary: palette.backgroundTertiary == null ? null : validHex(palette.backgroundTertiary, fallback.palette.accent),
    accent: validHex(palette.accent, fallback.palette.accent),
    textPrimary: validHex(palette.textPrimary, fallback.palette.textPrimary),
    textMuted: validHex(palette.textMuted, fallback.palette.textMuted),
    surface: validHex(palette.surface, fallback.palette.surface),
  };
  const safeColours = getThemeColourReport({
    backgroundPrimary: requestedPalette.backgroundPrimary,
    backgroundSecondary: requestedPalette.backgroundSecondary,
    accent: requestedPalette.accent,
    textPrimary: requestedPalette.textPrimary,
    textMuted: requestedPalette.textMuted,
    surface: requestedPalette.surface,
  });

  return {
    version: 2,
    surface: enumValue(raw.surface, COUNTRY_SURFACE_OPTIONS.map((option) => option.id), fallback.surface),
    typography: {
      display: normalizeFont(typography.display, fallback.typography.display),
      heading: normalizeFont(typography.heading, fallback.typography.heading),
      body: normalizeFont(typography.body, fallback.typography.body),
    },
    hero: {
      layout: enumValue(hero.layout, COUNTRY_HERO_V2_OPTIONS.map((option) => option.id), fallback.hero.layout),
      alignment: enumValue(hero.alignment, ["left", "center", "right"] as const, fallback.hero.alignment),
      showFlag: hero.showFlag !== false,
      showNativeName: hero.showNativeName !== false,
      showMotto: hero.showMotto !== false,
    },
    content: {
      defaultLayout: enumValue(content.defaultLayout, COUNTRY_CONTENT_LAYOUT_OPTIONS.map((option) => option.id), fallback.content.defaultLayout),
    },
    accent: enumValue(raw.accent, COUNTRY_ACCENT_OPTIONS.map((option) => option.id), fallback.accent),
    motion: enumValue(raw.motion, ["subtle", "medium", "heavy"] as const, fallback.motion),
    palette: {
      ...requestedPalette,
      textPrimary: safeColours.foreground,
      textMuted: safeColours.mutedForeground,
      surface: safeColours.surface,
    },
    background: {
      mode: enumValue(background.mode, ["solid", "gradient", "image"] as const, fallback.background.mode),
      gradientStyle: enumValue(background.gradientStyle, ["linear", "radial", "aurora"] as const, fallback.background.gradientStyle),
      gradientAngle: bounded(background.gradientAngle, 0, 360, fallback.background.gradientAngle),
      imageUrl: typeof background.imageUrl === "string" ? background.imageUrl : null,
      imageStoragePath: typeof background.imageStoragePath === "string" ? background.imageStoragePath : null,
      positionX: bounded(background.positionX, 0, 100, fallback.background.positionX),
      positionY: bounded(background.positionY, 0, 100, fallback.background.positionY),
      overlay: bounded(background.overlay, 0, 0.9, fallback.background.overlay),
      blur: bounded(background.blur, 0, 30, fallback.background.blur),
    },
    tuning: {
      radius: bounded(tuning.radius, 0, 40, fallback.tuning.radius),
      spacing: bounded(tuning.spacing, 0.72, 1.45, fallback.tuning.spacing),
      contentWidth: bounded(tuning.contentWidth, 760, 1600, fallback.tuning.contentWidth),
      shadowDepth: bounded(tuning.shadowDepth, 0, 1, fallback.tuning.shadowDepth),
      transparency: bounded(tuning.transparency, 0.35, 1, fallback.tuning.transparency),
    },
  };
}

export function countryDesignToLegacyTheme(design: CountryDesignV2): CountryVisualTheme {
  return {
    backgroundPrimary: design.palette.backgroundPrimary,
    backgroundSecondary: design.palette.backgroundSecondary,
    backgroundTertiary: design.palette.backgroundTertiary,
    accent: design.palette.accent,
    textPrimary: design.palette.textPrimary,
    textMuted: design.palette.textMuted,
    surface: design.palette.surface,
    backgroundMode: design.background.mode,
    gradientStyle: design.background.gradientStyle,
    gradientAngle: design.background.gradientAngle,
    backgroundImageUrl: design.background.imageUrl,
    backgroundImageStoragePath: design.background.imageStoragePath,
    backgroundPositionX: design.background.positionX,
    backgroundPositionY: design.background.positionY,
    backgroundOverlay: design.background.overlay,
    backgroundBlur: design.background.blur,
    heroLayout: "classic",
    decorationStyle: "none",
  };
}

export function countryDesignCssVariables(design: CountryDesignV2): CSSProperties {
  const p = design.palette;
  const b = design.background;
  const background =
    b.mode === "image" && b.imageUrl
      ? `linear-gradient(rgba(0,0,0,${b.overlay}), rgba(0,0,0,${b.overlay})), url(${JSON.stringify(b.imageUrl)})`
      : b.mode === "solid"
        ? p.backgroundPrimary
        : b.gradientStyle === "radial"
          ? `radial-gradient(circle at ${b.positionX}% ${b.positionY}%, ${p.backgroundSecondary}, ${p.backgroundPrimary} 72%)`
          : b.gradientStyle === "aurora"
            ? `radial-gradient(circle at ${b.positionX}% ${b.positionY}%, ${p.backgroundSecondary}cc, transparent 44%), linear-gradient(${b.gradientAngle}deg, ${p.backgroundPrimary}, ${p.backgroundSecondary})`
            : `linear-gradient(${b.gradientAngle}deg, ${p.backgroundPrimary}, ${p.backgroundSecondary})`;

  return {
    "--country-v2-bg-primary": p.backgroundPrimary,
    "--country-v2-bg-secondary": p.backgroundSecondary,
    "--country-v2-accent": p.accent,
    "--country-v2-text": p.textPrimary,
    "--country-v2-muted": p.textMuted,
    "--country-v2-surface": p.surface,
    "--country-v2-page-background": background,
    "--country-v2-bg-position": `${b.positionX}% ${b.positionY}%`,
    "--country-v2-bg-blur": `${b.blur}px`,
    "--country-v2-font-display": design.typography.display.family,
    "--country-v2-font-heading": design.typography.heading.family,
    "--country-v2-font-body": design.typography.body.family,
    "--country-v2-radius": `${design.tuning.radius}px`,
    "--country-v2-spacing": String(design.tuning.spacing),
    "--country-v2-content-width": `${design.tuning.contentWidth}px`,
    "--country-v2-shadow-depth": String(design.tuning.shadowDepth),
    "--country-v2-shadow-y": `${8 + 20 * design.tuning.shadowDepth}px`,
    "--country-v2-shadow-blur": `${18 + 42 * design.tuning.shadowDepth}px`,
    "--country-v2-shadow-alpha": `${8 + 20 * design.tuning.shadowDepth}%`,
    "--country-v2-transparency": `${Math.round(design.tuning.transparency * 100)}%`,
  } as CSSProperties;
}

export function countryDesignFontCss(design: CountryDesignV2) {
  const fonts = [design.typography.display, design.typography.heading, design.typography.body];
  const imports = [...new Set(fonts.map((font) => font.cssUrl).filter(Boolean))] as string[];
  const customs = [...new Map(fonts.filter((font) => font.source === "custom" && font.fileUrl).map((font) => [font.family, font])).values()];
  return [
    ...imports.map((url) => `@import url("${url}");`),
    ...customs.map((font) => `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.fileUrl)});font-display:swap;font-style:normal;font-weight:100 900;}`),
  ].join("\n");
}

export function useCountryDesignV2(countryId?: string | null) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-design-v2", countryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_themes")
        .select("*")
        .eq("country_id", countryId)
        .maybeSingle();
      if (error) throw error;
      const row = (data as CountryDesignThemeRow | null) ?? null;
      const legacy = countryThemeToVisual(row);
      const draft = row?.design_v2
        ? normalizeCountryDesignV2(row.design_v2, legacy ?? undefined)
        : legacyThemeToCountryDesignV2(row);
      return {
        row,
        designVersion: Number(row?.design_version ?? 1) === 2 ? 2 as const : 1 as const,
        design: draft,
        isPublishedV2: Number(row?.design_version ?? 1) === 2 && Boolean(row?.design_v2),
      };
    },
    staleTime: 30_000,
  });
}

export function usePublishCountryDesignV2(countryId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (designInput: CountryDesignV2) => {
      if (!countryId) throw new Error("No country is selected.");
      const design = normalizeCountryDesignV2(designInput);
      const legacy = countryDesignToLegacyTheme(design);
      const payload = {
        country_id: countryId,
        design_version: 2,
        design_v2: design,
        background_primary: legacy.backgroundPrimary,
        background_secondary: legacy.backgroundSecondary,
        background_tertiary: legacy.backgroundTertiary,
        accent: legacy.accent,
        text_primary: legacy.textPrimary,
        text_muted: legacy.textMuted,
        surface: legacy.surface,
        background_mode: legacy.backgroundMode,
        gradient_style: legacy.gradientStyle,
        gradient_angle: Math.round(legacy.gradientAngle),
        background_image_url: legacy.backgroundImageUrl,
        background_image_storage_path: legacy.backgroundImageStoragePath,
        background_position_x: Math.round(legacy.backgroundPositionX),
        background_position_y: Math.round(legacy.backgroundPositionY),
        background_overlay: legacy.backgroundOverlay,
        background_blur: Math.round(legacy.backgroundBlur),
      };
      const { data, error } = await supabase
        .from("country_themes")
        .upsert(payload, { onConflict: "country_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as CountryDesignThemeRow;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["country-design-v2", countryId] }),
        qc.invalidateQueries({ queryKey: ["country-theme", countryId] }),
        qc.invalidateQueries({ queryKey: ["country-themes"] }),
      ]);
    },
  });
}

export function useCountryDesignPresets() {
  return useQuery({
    queryKey: ["country-design-presets"],
    queryFn: async () => {
      const { data: auth } = await typedSupabase.auth.getUser();
      let query = supabase
        .from("country_design_presets")
        .select("*")
        .order("updated_at", { ascending: false });
      query = auth.user
        ? query.or(`is_public.eq.true,owner_user_id.eq.${auth.user.id}`)
        : query.eq("is_public", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row: CountryDesignPreset) => ({
        ...row,
        design_json: normalizeCountryDesignV2(row.design_json),
      })) as CountryDesignPreset[];
    },
    staleTime: 20_000,
  });
}

export function useSaveCountryDesignPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      countryId?: string | null;
      name: string;
      isPublic: boolean;
      design: CountryDesignV2;
    }) => {
      const { data: auth, error: authError } = await typedSupabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to save a design.");
      const payload = {
        owner_user_id: auth.user.id,
        source_country_id: input.countryId ?? null,
        name: input.name.trim(),
        is_public: input.isPublic,
        design_json: normalizeCountryDesignV2(input.design),
        updated_at: new Date().toISOString(),
      };
      const query = input.id
        ? supabase.from("country_design_presets").update(payload).eq("id", input.id)
        : supabase.from("country_design_presets").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as CountryDesignPreset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["country-design-presets"] }),
  });
}

export function copyCountryDesignPart(
  current: CountryDesignV2,
  source: CountryDesignV2,
  part: "all" | "surface" | "typography" | "hero" | "content" | "colors" | "motion",
): CountryDesignV2 {
  if (part === "all") return normalizeCountryDesignV2(source);
  if (part === "surface") return { ...current, surface: source.surface, accent: source.accent, tuning: { ...source.tuning } };
  if (part === "typography") return { ...current, typography: { ...source.typography } };
  if (part === "hero") return { ...current, hero: { ...source.hero } };
  if (part === "content") return { ...current, content: { ...source.content } };
  if (part === "colors") return { ...current, palette: { ...source.palette }, background: { ...source.background } };
  return { ...current, motion: source.motion };
}

export function useCountryFontAssets(countryId?: string | null) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-font-assets", countryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_font_assets")
        .select("*")
        .eq("country_id", countryId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CountryFontAsset[];
    },
  });
}

export async function uploadCountryFont(countryId: string, file: File, label?: string): Promise<CountryFontChoice> {
  const { data: auth, error: authError } = await typedSupabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to upload a font.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["woff2", "woff", "ttf", "otf"].includes(extension)) {
    throw new Error("Use WOFF2, WOFF, TTF or OTF font files.");
  }
  if (file.size > 4 * 1024 * 1024) throw new Error("Custom fonts must be 4 MB or smaller.");

  const id = crypto.randomUUID();
  const family = `Solaris Custom ${id.slice(0, 8)}`;
  const storagePath = `${auth.user.id}/${countryId}/${id}.${extension}`;
  const { error: uploadError } = await typedSupabase.storage
    .from("country-fonts")
    .upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) throw uploadError;
  const { data: publicData } = typedSupabase.storage.from("country-fonts").getPublicUrl(storagePath);
  const { data, error } = await supabase
    .from("country_font_assets")
    .insert({
      owner_user_id: auth.user.id,
      country_id: countryId,
      name: (label || file.name.replace(/\.[^.]+$/, "")).slice(0, 80),
      family_key: family,
      storage_path: storagePath,
      public_url: publicData.publicUrl,
      mime_type: file.type || "application/octet-stream",
    })
    .select("*")
    .single();
  if (error) {
    await typedSupabase.storage.from("country-fonts").remove([storagePath]);
    throw error;
  }
  const asset = data as CountryFontAsset;
  return {
    id: `custom:${asset.id}`,
    label: asset.name,
    category: "Custom",
    family: asset.family_key,
    source: "custom",
    fileUrl: asset.public_url,
  };
}

export function fontChoiceFromAsset(asset: CountryFontAsset): CountryFontChoice {
  return {
    id: `custom:${asset.id}`,
    label: asset.name,
    category: "Custom",
    family: asset.family_key,
    source: "custom",
    fileUrl: asset.public_url,
  };
}

export async function suggestCountryPaletteFromImageUrl(url: string, base: CountryDesignV2) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Could not load the flag image.");
  const blob = await response.blob();
  const file = new File([blob], "country-flag", { type: blob.type || "image/png" });
  const { theme } = await extractThemeFromImage(file);
  return {
    ...base,
    palette: {
      ...base.palette,
      backgroundPrimary: theme.backgroundPrimary,
      backgroundSecondary: theme.backgroundSecondary,
      accent: theme.accent,
      textPrimary: theme.textPrimary,
      textMuted: theme.textMuted,
      surface: theme.surface,
    },
  } satisfies CountryDesignV2;
}
