import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

function validHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function channelHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function mixHex(first: string, second: string, secondWeight: number) {
  const a = rgb(first);
  const b = rgb(second);
  const weight = Math.max(0, Math.min(1, secondWeight));
  return `#${a
    .map((value, index) => channelHex(value * (1 - weight) + b[index] * weight))
    .join("")}`;
}

function luminance(hex: string) {
  const channels = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function bestButtonText(buttonColor: string) {
  const dark = "#07131f";
  const light = "#ffffff";
  return contrast(dark, buttonColor) >= contrast(light, buttonColor) ? dark : light;
}

/**
 * Builds an action colour that belongs to the page palette but still separates
 * itself from the page. Bright accents become a deeper version; very dark
 * accents become lighter. Country owners can override this completely.
 */
export function deriveCountryButtonColor(accent: string) {
  const safe = validHex(accent) ? accent.toLowerCase() : "#86c9d7";
  const lightness = luminance(safe);

  if (lightness >= 0.55) return mixHex(safe, "#07131f", 0.52);
  if (lightness >= 0.24) return mixHex(safe, "#07131f", 0.30);
  return mixHex(safe, "#ffffff", 0.30);
}

export function resolveCountryButtonTheme(
  row: unknown,
  accentFallback: string,
): { buttonColor: string; buttonForeground: string; custom: boolean } {
  const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const saved = validHex(record.button_color) ? record.button_color.toLowerCase() : null;
  const fallback = validHex(accentFallback) ? accentFallback.toLowerCase() : "#86c9d7";
  const buttonColor = saved ?? deriveCountryButtonColor(fallback);
  return {
    buttonColor,
    buttonForeground: bestButtonText(buttonColor),
    custom: Boolean(saved),
  };
}

export function useSaveCountryButtonColour(countryId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (buttonColor: string | null) => {
      if (!countryId) throw new Error("No country is selected.");
      const value = buttonColor === null ? null : buttonColor.trim().toLowerCase();
      if (value !== null && !validHex(value)) throw new Error("Choose a valid button colour.");

      const { data, error } = await supabase
        .from("country_themes")
        .upsert({ country_id: countryId, button_color: value }, { onConflict: "country_id" })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-theme", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-themes"] }),
      ]);
    },
  });
}
