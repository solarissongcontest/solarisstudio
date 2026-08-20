import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type VisualTheme = {
  backgroundPrimary: string;
  backgroundSecondary: string;
  accent: string;
  textPrimary: string;
  textMuted: string;
  surface: string;
};

export type CountryHeroLayout =
  | "classic"
  | "editorial"
  | "minimal"
  | "flag-focus"
  | "poster"
  | "split"
  | "spotlight"
  | "broadcast"
  | "panorama"
  | "monument"
  | "glass-card"
  | "newspaper"
  | "ribbon"
  | "duotone"
  | "passport"
  | "horizon";

export const COUNTRY_HERO_LAYOUTS: CountryHeroLayout[] = [
  "classic",
  "editorial",
  "minimal",
  "flag-focus",
  "poster",
  "split",
  "spotlight",
  "broadcast",
  "panorama",
  "monument",
  "glass-card",
  "newspaper",
  "ribbon",
  "duotone",
  "passport",
  "horizon",
];

export type CountryDecorationStyle =
  | "auto"
  | "none"
  | "flag"
  | "orbits"
  | "rays"
  | "grid"
  | "waves"
  | "aurora"
  | "constellation"
  | "facets"
  | "topography"
  | "eclipse";

export const COUNTRY_DECORATION_STYLES: CountryDecorationStyle[] = [
  "auto",
  "none",
  "flag",
  "orbits",
  "rays",
  "grid",
  "waves",
  "aurora",
  "constellation",
  "facets",
  "topography",
  "eclipse",
];

export type CountryVisualTheme = VisualTheme & {
  backgroundTertiary: string | null;
  backgroundMode: "solid" | "gradient" | "image";
  gradientStyle: "linear" | "radial" | "aurora";
  gradientAngle: number;
  backgroundImageUrl: string | null;
  backgroundImageStoragePath: string | null;
  backgroundPositionX: number;
  backgroundPositionY: number;
  backgroundOverlay: number;
  backgroundBlur: number;
  heroLayout: CountryHeroLayout;
  decorationStyle: CountryDecorationStyle;
};

export type CountryThemeRow = {
  country_id: string;
  background_primary: string;
  background_secondary: string;
  background_tertiary?: string | null;
  accent: string;
  text_primary: string;
  text_muted: string;
  surface: string;
  background_mode?: CountryVisualTheme["backgroundMode"] | null;
  gradient_style?: CountryVisualTheme["gradientStyle"] | null;
  gradient_angle?: number | null;
  background_image_url?: string | null;
  background_image_storage_path?: string | null;
  background_position_x?: number | null;
  background_position_y?: number | null;
  background_overlay?: number | null;
  background_blur?: number | null;
  hero_layout?: CountryVisualTheme["heroLayout"] | null;
  decoration_style?: CountryVisualTheme["decorationStyle"] | null;
  updated_at: string;
};

export type EditionThemeColors = Partial<VisualTheme> & {
  palette?: string[];
  generatedFromArtwork?: boolean;
};

export const DEFAULT_THEME: VisualTheme = {
  backgroundPrimary: "#071a2b",
  backgroundSecondary: "#123a49",
  accent: "#86c9d7",
  textPrimary: "#f6f8fa",
  textMuted: "#b8c3ca",
  surface: "#0d2634",
};

export const DEFAULT_COUNTRY_THEME: CountryVisualTheme = {
  ...DEFAULT_THEME,
  backgroundTertiary: null,
  backgroundMode: "gradient",
  gradientStyle: "aurora",
  gradientAngle: 145,
  backgroundImageUrl: null,
  backgroundImageStoragePath: null,
  backgroundPositionX: 50,
  backgroundPositionY: 50,
  backgroundOverlay: 0.36,
  backgroundBlur: 0,
  heroLayout: "classic",
  decorationStyle: "auto",
};

function normaliseHex(value: string | undefined | null, fallback: string) {
  const text = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function countryThemeToVisual(row?: CountryThemeRow | null): CountryVisualTheme | null {
  if (!row) return null;
  const backgroundMode = ["solid", "gradient", "image"].includes(String(row.background_mode))
    ? (row.background_mode as CountryVisualTheme["backgroundMode"])
    : DEFAULT_COUNTRY_THEME.backgroundMode;
  const gradientStyle = ["linear", "radial", "aurora"].includes(String(row.gradient_style))
    ? (row.gradient_style as CountryVisualTheme["gradientStyle"])
    : DEFAULT_COUNTRY_THEME.gradientStyle;
  const heroLayout = COUNTRY_HERO_LAYOUTS.includes(row.hero_layout as CountryHeroLayout)
    ? (row.hero_layout as CountryHeroLayout)
    : DEFAULT_COUNTRY_THEME.heroLayout;
  const decorationStyle = COUNTRY_DECORATION_STYLES.includes(
    row.decoration_style as CountryDecorationStyle,
  )
    ? (row.decoration_style as CountryDecorationStyle)
    : DEFAULT_COUNTRY_THEME.decorationStyle;

  return {
    backgroundPrimary: normaliseHex(row.background_primary, DEFAULT_THEME.backgroundPrimary),
    backgroundSecondary: normaliseHex(row.background_secondary, DEFAULT_THEME.backgroundSecondary),
    backgroundTertiary: row.background_tertiary
      ? normaliseHex(row.background_tertiary, DEFAULT_THEME.accent)
      : null,
    accent: normaliseHex(row.accent, DEFAULT_THEME.accent),
    textPrimary: normaliseHex(row.text_primary, DEFAULT_THEME.textPrimary),
    textMuted: normaliseHex(row.text_muted, DEFAULT_THEME.textMuted),
    surface: normaliseHex(row.surface, DEFAULT_THEME.surface),
    backgroundMode,
    gradientStyle,
    gradientAngle: clampNumber(row.gradient_angle, 0, 360, DEFAULT_COUNTRY_THEME.gradientAngle),
    backgroundImageUrl: row.background_image_url ?? null,
    backgroundImageStoragePath: row.background_image_storage_path ?? null,
    backgroundPositionX: clampNumber(row.background_position_x, 0, 100, 50),
    backgroundPositionY: clampNumber(row.background_position_y, 0, 100, 50),
    backgroundOverlay: clampNumber(row.background_overlay, 0, 0.9, DEFAULT_COUNTRY_THEME.backgroundOverlay),
    backgroundBlur: clampNumber(row.background_blur, 0, 30, 0),
    heroLayout,
    decorationStyle,
  };
}

export function editionThemeToVisual(input: unknown): VisualTheme | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const get = (camel: string, snake: string, fallback: string) =>
    normaliseHex(
      typeof value[camel] === "string"
        ? (value[camel] as string)
        : typeof value[snake] === "string"
          ? (value[snake] as string)
          : null,
      fallback,
    );
  return {
    backgroundPrimary: get("backgroundPrimary", "background_primary", DEFAULT_THEME.backgroundPrimary),
    backgroundSecondary: get("backgroundSecondary", "background_secondary", DEFAULT_THEME.backgroundSecondary),
    accent: get("accent", "accent", DEFAULT_THEME.accent),
    textPrimary: get("textPrimary", "text_primary", DEFAULT_THEME.textPrimary),
    textMuted: get("textMuted", "text_muted", DEFAULT_THEME.textMuted),
    surface: get("surface", "surface", DEFAULT_THEME.surface),
  };
}

export function countryBackgroundCss(theme: CountryVisualTheme) {
  if (theme.backgroundMode === "solid") return theme.backgroundPrimary;
  if (theme.backgroundMode === "image" && theme.backgroundImageUrl) {
    const overlay = Math.round(theme.backgroundOverlay * 1000) / 1000;
    return `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url(${JSON.stringify(theme.backgroundImageUrl)})`;
  }
  if (theme.gradientStyle === "linear") {
    return theme.backgroundTertiary
      ? `linear-gradient(${theme.gradientAngle}deg, ${theme.backgroundPrimary} 0%, ${theme.backgroundSecondary} 52%, ${theme.backgroundTertiary} 100%)`
      : `linear-gradient(${theme.gradientAngle}deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`;
  }
  if (theme.gradientStyle === "radial") {
    return theme.backgroundTertiary
      ? `radial-gradient(circle at ${theme.backgroundPositionX}% ${theme.backgroundPositionY}%, ${theme.backgroundSecondary}, transparent 48%), radial-gradient(circle at ${100 - theme.backgroundPositionX}% ${100 - theme.backgroundPositionY}%, ${theme.backgroundTertiary}, ${theme.backgroundPrimary} 72%)`
      : `radial-gradient(circle at ${theme.backgroundPositionX}% ${theme.backgroundPositionY}%, ${theme.backgroundSecondary}, ${theme.backgroundPrimary} 72%)`;
  }
  const thirdGlow = theme.backgroundTertiary
    ? `radial-gradient(circle at ${100 - theme.backgroundPositionX}% ${Math.min(100, theme.backgroundPositionY + 24)}%, ${theme.backgroundTertiary}b8, transparent 46%), `
    : "";
  return `radial-gradient(circle at ${theme.backgroundPositionX}% ${theme.backgroundPositionY}%, ${theme.backgroundSecondary}cc, transparent 44%), ${thirdGlow}linear-gradient(${theme.gradientAngle}deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`;
}

export function useCountryThemes() {
  return useQuery({
    queryKey: ["country-themes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("country_themes").select("*");
      if (error) throw error;
      return (data ?? []) as CountryThemeRow[];
    },
    staleTime: 60_000,
  });
}

export function useCountryTheme(countryId?: string | null) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-theme", countryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_themes")
        .select("*")
        .eq("country_id", countryId)
        .maybeSingle();
      if (error) throw error;
      return (data as CountryThemeRow | null) ?? null;
    },
    staleTime: 30_000,
  });
}

export function useSaveCountryTheme(countryId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (theme: CountryVisualTheme) => {
      if (!countryId) throw new Error("No country is selected.");
      const payload = {
        country_id: countryId,
        background_primary: normaliseHex(theme.backgroundPrimary, DEFAULT_THEME.backgroundPrimary),
        background_secondary: normaliseHex(theme.backgroundSecondary, DEFAULT_THEME.backgroundSecondary),
        background_tertiary: theme.backgroundTertiary
          ? normaliseHex(theme.backgroundTertiary, DEFAULT_THEME.accent)
          : null,
        accent: normaliseHex(theme.accent, DEFAULT_THEME.accent),
        text_primary: normaliseHex(theme.textPrimary, DEFAULT_THEME.textPrimary),
        text_muted: normaliseHex(theme.textMuted, DEFAULT_THEME.textMuted),
        surface: normaliseHex(theme.surface, DEFAULT_THEME.surface),
        background_mode: theme.backgroundMode,
        gradient_style: theme.gradientStyle,
        gradient_angle: Math.round(clampNumber(theme.gradientAngle, 0, 360, 145)),
        background_image_url: theme.backgroundImageUrl,
        background_image_storage_path: theme.backgroundImageStoragePath,
        background_position_x: Math.round(clampNumber(theme.backgroundPositionX, 0, 100, 50)),
        background_position_y: Math.round(clampNumber(theme.backgroundPositionY, 0, 100, 50)),
        background_overlay: clampNumber(theme.backgroundOverlay, 0, 0.9, 0.36),
        background_blur: Math.round(clampNumber(theme.backgroundBlur, 0, 30, 0)),
        hero_layout: theme.heroLayout,
        decoration_style: theme.decorationStyle,
      };
      const { data, error } = await supabase
        .from("country_themes")
        .upsert(payload, { onConflict: "country_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as CountryThemeRow;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["country-theme", countryId] }),
        qc.invalidateQueries({ queryKey: ["country-themes"] }),
      ]);
    },
  });
}

export async function uploadEditionArtwork(editionId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `${editionId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await typedSupabase.storage
    .from("edition-artwork")
    .upload(storagePath, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = typedSupabase.storage.from("edition-artwork").getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

export async function saveEditionVisualTheme(input: {
  editionId: string;
  artworkUrl: string | null;
  artworkStoragePath: string | null;
  theme: VisualTheme;
  palette?: string[];
  generatedFromArtwork?: boolean;
}) {
  const themeColors: EditionThemeColors = {
    ...input.theme,
    palette: input.palette ?? [],
    generatedFromArtwork: Boolean(input.generatedFromArtwork),
  };
  const { data, error } = await supabase
    .from("editions")
    .update({
      artwork_url: input.artworkUrl,
      artwork_storage_path: input.artworkStoragePath,
      theme_colors: themeColors,
    })
    .eq("id", input.editionId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function extractThemeFromImage(file: File): Promise<{ theme: VisualTheme; palette: string[] }> {
  const bitmap = await createImageBitmap(file);
  const max = 120;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not analyse the artwork.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, width, height).data;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < pixels.length; i += 16) {
    const alpha = pixels[i + 3];
    if (alpha < 180) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    if (maxChannel > 246 && minChannel > 238) continue;
    const qr = Math.round(r / 24) * 24;
    const qg = Math.round(g / 24) * 24;
    const qb = Math.round(b / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    const current = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    current.r += r;
    current.g += g;
    current.b += b;
    current.count += 1;
    buckets.set(key, current);
  }

  const candidates = [...buckets.values()]
    .filter((item) => item.count >= 2)
    .map((item) => {
      const r = Math.round(item.r / item.count);
      const g = Math.round(item.g / item.count);
      const b = Math.round(item.b / item.count);
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const luminance = relativeLuminance(r, g, b);
      return { r, g, b, count: item.count, saturation, luminance };
    })
    .sort((a, b) => b.count * (1 + b.saturation / 180) - a.count * (1 + a.saturation / 180));

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.every((existing) => colorDistance(existing, candidate) > 70)) selected.push(candidate);
    if (selected.length >= 6) break;
  }
  if (!selected.length) selected.push({ r: 45, g: 105, b: 140, count: 1, saturation: 95, luminance: .13 });

  const primary = selected.find((c) => c.luminance > .08 && c.luminance < .55) ?? selected[0];
  const accent = selected
    .filter((c) => c !== primary)
    .sort((a, b) => b.saturation - a.saturation)[0] ?? primary;
  const secondary = selected.find((c) => c !== primary && c !== accent) ?? primary;

  const backgroundPrimary = rgbToHex(...darken(primary, .36));
  const backgroundSecondary = rgbToHex(...darken(secondary, .48));
  const surface = rgbToHex(...mix(darken(primary, .28), [10, 20, 31], .62));
  const accentHex = rgbToHex(...liftAccent(accent));
  const backgroundLum = hexLuminance(backgroundPrimary);
  const textPrimary = backgroundLum > .34 ? "#10151b" : "#f7f8fa";
  const textMuted = backgroundLum > .34 ? "#3f4952" : "#b8c1c9";

  return {
    theme: { backgroundPrimary, backgroundSecondary, accent: accentHex, textPrimary, textMuted, surface },
    palette: selected.map((c) => rgbToHex(c.r, c.g, c.b)),
  };
}

function relativeLuminance(r: number, g: number, b: number) {
  const convert = (value: number) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
  };
  return .2126 * convert(r) + .7152 * convert(g) + .0722 * convert(b);
}

function hexLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return relativeLuminance(r, g, b);
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function darken(color: { r: number; g: number; b: number }, factor: number): [number, number, number] {
  return [Math.round(color.r * factor), Math.round(color.g * factor), Math.round(color.b * factor)];
}

function mix(a: [number, number, number], b: [number, number, number], weight: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(a[i] * (1 - weight) + b[i] * weight)) as [number, number, number];
}

function liftAccent(color: { r: number; g: number; b: number }): [number, number, number] {
  const max = Math.max(color.r, color.g, color.b);
  if (max >= 150) return [color.r, color.g, color.b];
  const factor = 150 / Math.max(1, max);
  return [Math.min(235, Math.round(color.r * factor)), Math.min(235, Math.round(color.g * factor)), Math.min(235, Math.round(color.b * factor))];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixHex(first: string, second: string, secondWeight: number) {
  const [r, g, b] = mix(hexToRgb(first), hexToRgb(second), secondWeight);
  return rgbToHex(r, g, b);
}

export function contrastRatio(first: string, second: string) {
  const lighter = Math.max(hexLuminance(first), hexLuminance(second));
  const darker = Math.min(hexLuminance(first), hexLuminance(second));
  return (lighter + .05) / (darker + .05);
}

function bestContrastText(background: string) {
  const ink = "#07131f";
  const light = "#ffffff";
  return contrastRatio(ink, background) >= contrastRatio(light, background) ? ink : light;
}

function readableText(text: string, background: string, minimum: number) {
  if (contrastRatio(text, background) >= minimum) return text;
  const target = bestContrastText(background);
  let adjusted = text;
  for (let weight = .16; weight <= 1; weight += .16) {
    adjusted = mixHex(text, target, Math.min(1, weight));
    if (contrastRatio(adjusted, background) >= minimum) return adjusted;
  }
  return target;
}

function balancedSurface(theme: VisualTheme) {
  // Owner colours still tint the cards, but large surfaces remain calm enough
  // for long Wiki text instead of becoming a solid block of saturated colour.
  const related = mixHex(theme.surface, theme.backgroundPrimary, .18);
  return mixHex(related, "#07131f", .58);
}

export function suggestThirdBackground(theme: VisualTheme) {
  const accentBridge = mixHex(theme.backgroundSecondary, theme.accent, .34);
  return mixHex(accentBridge, theme.backgroundPrimary, .18);
}

export function getThemeColourReport(theme: VisualTheme) {
  const surface = balancedSurface(theme);
  const foreground = readableText(theme.textPrimary, surface, 4.5);
  const mutedForeground = readableText(theme.textMuted, surface, 3.4);
  const accentForeground = bestContrastText(theme.accent);
  return {
    surface,
    foreground,
    mutedForeground,
    accentForeground,
    mainTextContrast: contrastRatio(foreground, surface),
    mutedTextContrast: contrastRatio(mutedForeground, surface),
    buttonContrast: contrastRatio(accentForeground, theme.accent),
  };
}

export function themeStyleProperties(theme: VisualTheme): Record<string, string> {
  const hexToTriplet = (hex: string) => hexToRgb(hex).join(" ");
  const tertiary = (theme as Partial<CountryVisualTheme>).backgroundTertiary || theme.accent;
  const report = getThemeColourReport(theme);
  const surface = report.surface;
  const raisedSurface = mixHex(surface, "#ffffff", .065);
  return {
    "--solaris-bg-primary": hexToTriplet(theme.backgroundPrimary),
    "--solaris-bg-secondary": hexToTriplet(theme.backgroundSecondary),
    "--solaris-bg-tertiary": hexToTriplet(tertiary),
    "--solaris-bg-deep": hexToTriplet(darkenHex(theme.backgroundPrimary, .34)),
    "--solaris-bg-deep-2": hexToTriplet(darkenHex(theme.backgroundSecondary, .52)),
    "--solaris-accent": hexToTriplet(theme.accent),
    "--solaris-accent-foreground": report.accentForeground,
    "--solaris-owner-surface": theme.surface,
    "--solaris-card-surface": surface,
    "--solaris-card-raised": raisedSurface,
    "--foreground": report.foreground,
    "--muted-foreground": report.mutedForeground,
    "--surface": surface,
  };
}

function darkenHex(hex: string, factor: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor));
}
