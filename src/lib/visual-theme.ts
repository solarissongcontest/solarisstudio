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

export type CountryThemeRow = {
  country_id: string;
  background_primary: string;
  background_secondary: string;
  accent: string;
  text_primary: string;
  text_muted: string;
  surface: string;
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

function normaliseHex(value: string | undefined | null, fallback: string) {
  const text = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

export function countryThemeToVisual(row?: CountryThemeRow | null): VisualTheme | null {
  if (!row) return null;
  return {
    backgroundPrimary: normaliseHex(row.background_primary, DEFAULT_THEME.backgroundPrimary),
    backgroundSecondary: normaliseHex(row.background_secondary, DEFAULT_THEME.backgroundSecondary),
    accent: normaliseHex(row.accent, DEFAULT_THEME.accent),
    textPrimary: normaliseHex(row.text_primary, DEFAULT_THEME.textPrimary),
    textMuted: normaliseHex(row.text_muted, DEFAULT_THEME.textMuted),
    surface: normaliseHex(row.surface, DEFAULT_THEME.surface),
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
    mutationFn: async (theme: VisualTheme) => {
      if (!countryId) throw new Error("No country is selected.");
      const payload = {
        country_id: countryId,
        background_primary: normaliseHex(theme.backgroundPrimary, DEFAULT_THEME.backgroundPrimary),
        background_secondary: normaliseHex(theme.backgroundSecondary, DEFAULT_THEME.backgroundSecondary),
        accent: normaliseHex(theme.accent, DEFAULT_THEME.accent),
        text_primary: normaliseHex(theme.textPrimary, DEFAULT_THEME.textPrimary),
        text_muted: normaliseHex(theme.textMuted, DEFAULT_THEME.textMuted),
        surface: normaliseHex(theme.surface, DEFAULT_THEME.surface),
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

export function themeStyleProperties(theme: VisualTheme): Record<string, string> {
  const hexToTriplet = (hex: string) => hexToRgb(hex).join(" ");
  return {
    "--solaris-bg-primary": hexToTriplet(theme.backgroundPrimary),
    "--solaris-bg-secondary": hexToTriplet(theme.backgroundSecondary),
    "--solaris-bg-tertiary": hexToTriplet(theme.accent),
    "--solaris-bg-deep": hexToTriplet(darkenHex(theme.backgroundPrimary, .34)),
    "--solaris-bg-deep-2": hexToTriplet(darkenHex(theme.backgroundSecondary, .52)),
    "--solaris-accent": hexToTriplet(theme.accent),
    "--foreground": theme.textPrimary,
    "--muted-foreground": theme.textMuted,
    "--surface": theme.surface,
  };
}

function darkenHex(hex: string, factor: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor));
}
