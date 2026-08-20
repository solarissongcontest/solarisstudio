import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { CountryHeroLayout } from "@/lib/visual-theme";

const supabase = typedSupabase as any;

export type CountryHeroVisualMode = "auto" | "flag" | "soft-flag" | "none";
export type CountryHeroDecoration =
  | "auto"
  | "none"
  | "glow"
  | "ribbon"
  | "lines"
  | "seal"
  | "starburst"
  | "contours"
  | "glass";

export type CountryHeroArtRow = {
  country_id: string;
  hero_visual_mode?: CountryHeroVisualMode | null;
  hero_decoration?: CountryHeroDecoration | null;
};

export const HERO_VISUAL_MODES: Array<{
  value: CountryHeroVisualMode;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Recommended",
    description: "Solaris decides whether the flag actually improves this personality.",
  },
  {
    value: "flag",
    label: "Use flag",
    description: "Make the flag an important part of the hero design.",
  },
  {
    value: "soft-flag",
    label: "Soft flag",
    description: "Keep the flag subtle so it does not overpower the page.",
  },
  {
    value: "none",
    label: "No flag",
    description: "Do not show the flag in the hero. Other decoration can still be used.",
  },
];

export const HERO_DECORATIONS: Array<{
  value: CountryHeroDecoration;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "Recommended", description: "Choose a decoration that suits the selected personality." },
  { value: "none", label: "None", description: "Keep the hero clean with no extra graphic decoration." },
  { value: "glow", label: "Glow", description: "Soft overlapping light fields and colour blooms." },
  { value: "ribbon", label: "Ribbon", description: "A bold diagonal or horizontal graphic band." },
  { value: "lines", label: "Lines", description: "Fine editorial lines and subtle grid-like structure." },
  { value: "seal", label: "Seal", description: "A large official-looking circular emblem pattern." },
  { value: "starburst", label: "Starburst", description: "Radiating graphic wedges for a stronger poster feel." },
  { value: "contours", label: "Contours", description: "Layered map-like rings and flowing lines." },
  { value: "glass", label: "Glass", description: "Liquid translucent shapes and reflected highlights." },
];

const visualModes = new Set(HERO_VISUAL_MODES.map((item) => item.value));
const decorations = new Set(HERO_DECORATIONS.map((item) => item.value));

export function normaliseHeroVisualMode(value: unknown): CountryHeroVisualMode {
  return visualModes.has(value as CountryHeroVisualMode)
    ? (value as CountryHeroVisualMode)
    : "auto";
}

export function normaliseHeroDecoration(value: unknown): CountryHeroDecoration {
  return decorations.has(value as CountryHeroDecoration)
    ? (value as CountryHeroDecoration)
    : "auto";
}

export function resolveHeroVisualMode(
  layout: CountryHeroLayout,
  requested: CountryHeroVisualMode,
): Exclude<CountryHeroVisualMode, "auto"> {
  if (requested !== "auto") return requested;

  if (layout === "flag-focus" || layout === "split") return "flag";
  if (layout === "classic" || layout === "spotlight" || layout === "passport") {
    return "soft-flag";
  }
  return "none";
}

export function resolveHeroDecoration(
  layout: CountryHeroLayout,
  requested: CountryHeroDecoration,
): Exclude<CountryHeroDecoration, "auto"> {
  if (requested !== "auto") return requested;

  const recommended: Record<CountryHeroLayout, Exclude<CountryHeroDecoration, "auto">> = {
    classic: "glow",
    editorial: "lines",
    minimal: "none",
    "flag-focus": "none",
    poster: "starburst",
    split: "none",
    spotlight: "glow",
    broadcast: "lines",
    panorama: "contours",
    monument: "seal",
    "glass-card": "glass",
    newspaper: "lines",
    ribbon: "ribbon",
    duotone: "starburst",
    passport: "seal",
    horizon: "contours",
  };

  return recommended[layout];
}

export function useCountryHeroArt(countryId?: string | null) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-hero-art", countryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_themes")
        .select("country_id, hero_visual_mode, hero_decoration")
        .eq("country_id", countryId)
        .maybeSingle();
      if (error) throw error;
      return (data as CountryHeroArtRow | null) ?? null;
    },
    staleTime: 30_000,
  });
}

export function useSaveCountryHeroArt(countryId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      visualMode: CountryHeroVisualMode;
      decoration: CountryHeroDecoration;
    }) => {
      if (!countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase
        .from("country_themes")
        .update({
          hero_visual_mode: normaliseHeroVisualMode(input.visualMode),
          hero_decoration: normaliseHeroDecoration(input.decoration),
        })
        .eq("country_id", countryId)
        .select("country_id, hero_visual_mode, hero_decoration")
        .single();
      if (error) throw error;
      return data as CountryHeroArtRow;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-hero-art", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-theme", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-themes"] }),
      ]);
    },
  });
}
