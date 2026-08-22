import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type {
  CountryMedia,
  CountryProfile,
  CountryProfileSection,
} from "@/lib/country-account";
import type { Country } from "@/lib/data";

const supabase = typedSupabase as any;

export type CountrySectionType =
  | "rich_text"
  | "image"
  | "quote"
  | "facts"
  | "gallery"
  | "divider";
export type CountrySectionContentMode = "manual" | "auto";
export type CountrySectionImageLayout = "wide" | "split" | "left" | "right" | "full";
export type CountrySectionWidth = "narrow" | "standard" | "wide" | "full";
export type CountrySectionPanelStyle = "glass" | "solid" | "outline" | "transparent" | "accent";
export type CountrySectionTextAlign = "left" | "center";
export type CountrySectionSpacing = "compact" | "normal" | "spacious";
export type CountrySectionImageAspect = "auto" | "16:9" | "4:3" | "square" | "portrait";
export type CountrySectionImageFit = "cover" | "contain";
export type CountrySectionImageSize = "small" | "medium" | "large" | "full";
export type CountrySectionImageFade = "none" | "top" | "right" | "bottom" | "left";
export type CountrySectionDividerStyle = "line" | "glow" | "dots";

export type CountryCustomFactRow = {
  label: string;
  value: string;
};

export type CountrySectionPresentation = {
  width: CountrySectionWidth;
  panelStyle: CountrySectionPanelStyle;
  textAlign: CountrySectionTextAlign;
  spacing: CountrySectionSpacing;
  imageAspect: CountrySectionImageAspect;
  imageFit: CountrySectionImageFit;
  imageSize: CountrySectionImageSize;
  imageFade: CountrySectionImageFade;
  focalX: number;
  focalY: number;
  galleryColumns: 2 | 3 | 4;
  dividerStyle: CountrySectionDividerStyle;
  factMode: "auto" | "manual";
  customFacts: CountryCustomFactRow[];
};

export type CountryPageSection = CountryProfileSection & {
  section_type?: CountrySectionType | null;
  kicker?: string | null;
  content_mode?: CountrySectionContentMode | null;
  visible_on_country?: boolean | null;
  visible_on_wiki?: boolean | null;
  image_layout?: CountrySectionImageLayout | null;
  background_tint?: string | null;
  content_json?: Record<string, unknown> | null;
};

type NormalizedCountryPageSection = Omit<
  CountryPageSection,
  "section_type" | "content_mode" | "visible_on_country" | "visible_on_wiki" | "image_layout"
> & {
  section_type: CountrySectionType;
  content_mode: CountrySectionContentMode;
  visible_on_country: boolean;
  visible_on_wiki: boolean;
  image_layout: CountrySectionImageLayout;
};

export type CountryPageSectionInput = {
  id?: string;
  heading: string;
  body: string;
  sectionType: CountrySectionType;
  kicker?: string;
  contentMode: CountrySectionContentMode;
  visibleOnCountry: boolean;
  visibleOnWiki: boolean;
  imageUrl?: string | null;
  imageCaption?: string | null;
  imageLayout: CountrySectionImageLayout;
  backgroundTint?: string | null;
  contentJson?: Record<string, unknown>;
  sortOrder?: number;
};

export type CountrySectionTemplate = {
  id: string;
  label: string;
  description: string;
  sectionType: CountrySectionType;
  heading: string;
  kicker?: string;
  autoKind?: string;
  contentJson?: Record<string, unknown>;
};

export const COUNTRY_SECTION_TEMPLATES: CountrySectionTemplate[] = [
  {
    id: "story",
    label: "National story",
    description: "A free-form article section for history, culture, politics or lore.",
    sectionType: "rich_text",
    heading: "About the country",
  },
  {
    id: "overview-auto",
    label: "Smart overview",
    description: "Build editable prose only from the structured facts already saved for the country.",
    sectionType: "rich_text",
    heading: "Overview",
    kicker: "National profile",
    autoKind: "overview",
  },
  {
    id: "government-auto",
    label: "Government & leadership",
    description: "Create an editable paragraph from government and leader fields you already supplied.",
    sectionType: "rich_text",
    heading: "Government and leadership",
    autoKind: "government",
  },
  {
    id: "culture-auto",
    label: "Culture & identity",
    description: "Create editable copy from language, demonym, currency and motto fields.",
    sectionType: "rich_text",
    heading: "Culture and identity",
    autoKind: "culture",
  },
  {
    id: "facts",
    label: "Quick facts",
    description: "A compact fact block generated from your populated national profile fields.",
    sectionType: "facts",
    heading: "Quick facts",
    autoKind: "facts",
  },
  {
    id: "custom-facts",
    label: "Editable fun facts / stats",
    description: "Write every label and value yourself for fun facts, lore, geography, rankings or statistics.",
    sectionType: "facts",
    heading: "Fun facts",
    contentJson: {
      factMode: "manual",
      customFacts: [
        { label: "Fact 01", value: "Write a fun fact" },
        { label: "Fact 02", value: "Write another fun fact" },
      ],
    },
  },
  {
    id: "image",
    label: "Image feature",
    description: "An image with optional heading, caption, text, size and directional fade.",
    sectionType: "image",
    heading: "Featured image",
    contentJson: { imageSize: "medium", imageFade: "none" },
  },
  {
    id: "editorial-feature",
    label: "Editorial feature",
    description: "A wider magazine-style story block ready for a strong image and longer text.",
    sectionType: "rich_text",
    heading: "Feature",
    contentJson: {
      width: "wide",
      panelStyle: "transparent",
      spacing: "spacious",
      imageAspect: "16:9",
      imageSize: "large",
      imageFade: "none",
    },
  },
  {
    id: "quote",
    label: "Quote / statement",
    description: "A prominent national quote, slogan, lyric-free motto or statement.",
    sectionType: "quote",
    heading: "Statement",
    contentJson: { width: "narrow", textAlign: "center" },
  },
  {
    id: "divider",
    label: "Visual divider",
    description: "Add breathing room and a visual break between larger sections.",
    sectionType: "divider",
    heading: "Section break",
    contentJson: { dividerStyle: "glow" },
  },
];

function clean(value?: string | null) {
  return value?.trim() || null;
}

function enumValue<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? (value as T) : fallback;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function countrySectionPresentation(
  sectionOrJson?: Pick<CountryPageSection, "content_json"> | Record<string, unknown> | null,
): CountrySectionPresentation {
  const raw = sectionOrJson && "content_json" in sectionOrJson
    ? sectionOrJson.content_json ?? {}
    : sectionOrJson ?? {};
  const json = raw as Record<string, unknown>;
  const customFacts = Array.isArray(json.customFacts)
    ? json.customFacts
        .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
        .map((row) => ({ label: String(row.label ?? "").trim(), value: String(row.value ?? "").trim() }))
        .filter((row) => row.label || row.value)
        .slice(0, 24)
    : [];
  const columns = Math.round(boundedNumber(json.galleryColumns, 2, 4, 3));

  return {
    width: enumValue(json.width, ["narrow", "standard", "wide", "full"] as const, "standard"),
    panelStyle: enumValue(json.panelStyle, ["glass", "solid", "outline", "transparent", "accent"] as const, "glass"),
    textAlign: enumValue(json.textAlign, ["left", "center"] as const, "left"),
    spacing: enumValue(json.spacing, ["compact", "normal", "spacious"] as const, "normal"),
    imageAspect: enumValue(json.imageAspect, ["auto", "16:9", "4:3", "square", "portrait"] as const, "auto"),
    imageFit: enumValue(json.imageFit, ["cover", "contain"] as const, "cover"),
    imageSize: enumValue(json.imageSize, ["small", "medium", "large", "full"] as const, "large"),
    imageFade: enumValue(json.imageFade, ["none", "top", "right", "bottom", "left"] as const, "none"),
    focalX: Math.round(boundedNumber(json.focalX, 0, 100, 50)),
    focalY: Math.round(boundedNumber(json.focalY, 0, 100, 50)),
    galleryColumns: (columns === 2 || columns === 4 ? columns : 3) as 2 | 3 | 4,
    dividerStyle: enumValue(json.dividerStyle, ["line", "glow", "dots"] as const, "line"),
    factMode: enumValue(json.factMode, ["auto", "manual"] as const, "auto"),
    customFacts,
  };
}

export function buildCountryAutoSection(
  kind: string,
  country: Country,
  profile?: CountryProfile | null,
) {
  const capital = clean(profile?.capital);
  const government = clean(profile?.government_type);
  const leader = [clean(profile?.leader_title), clean(profile?.leader_name)].filter(Boolean).join(" ");
  const languages = clean(profile?.official_languages);
  const demonym = clean(profile?.demonym);
  const currency = clean(profile?.currency);
  const motto = clean(profile?.motto);
  const established = clean(profile?.established);
  const population = clean(profile?.population);

  if (kind === "government") {
    const sentences: string[] = [];
    if (government) sentences.push(`${country.name}'s government is described as ${government}.`);
    if (leader) sentences.push(`The country's recorded leader is ${leader}.`);
    if (!sentences.length) sentences.push(`Add a government type or leader in National facts and Solaris can draft this section from those details.`);
    return sentences.join(" ");
  }

  if (kind === "culture") {
    const sentences: string[] = [];
    if (demonym) sentences.push(`People from ${country.name} are known as ${demonym}.`);
    if (languages) sentences.push(`The recorded official language${languages.includes(",") ? "s are" : " is"} ${languages}.`);
    if (currency) sentences.push(`The country's currency is ${currency}.`);
    if (motto) sentences.push(`Its recorded motto is “${motto}”.`);
    if (!sentences.length) sentences.push(`Add language, demonym, currency or motto details in National facts and Solaris can draft this section from them.`);
    return sentences.join(" ");
  }

  if (kind === "facts") return "";

  const sentences = [`${country.name} is part of ${country.region || "Terra Solaris"}.`];
  if (capital) sentences.push(`Its capital is ${capital}.`);
  if (government) sentences.push(`Its government is described as ${government}.`);
  if (leader) sentences.push(`The recorded national leader is ${leader}.`);
  if (population) sentences.push(`Its recorded population is ${population}.`);
  if (established) sentences.push(`The national profile lists ${established} as its establishment date or era.`);
  return sentences.join(" ");
}

export function autoFactRows(profile?: CountryProfile | null) {
  if (!profile) return [] as Array<{ label: string; value: string }>;
  return [
    ["Capital", profile.capital],
    ["Government", profile.government_type],
    ["Leader", [profile.leader_title, profile.leader_name].filter(Boolean).join(" ")],
    ["Demonym", profile.demonym],
    ["Languages", profile.official_languages],
    ["Currency", profile.currency],
    ["Population", profile.population],
    ["Established", profile.established],
    ["Motto", profile.motto],
  ]
    .filter((row): row is [string, string] => Boolean(row[1]?.trim()))
    .map(([label, value]) => ({ label, value }));
}

export function factRowsForSection(section: CountryPageSection, profile?: CountryProfile | null) {
  const presentation = countrySectionPresentation(section);
  return presentation.factMode === "manual" ? presentation.customFacts : autoFactRows(profile);
}

export function normalizeCountryPageSection(section: CountryPageSection): NormalizedCountryPageSection {
  return {
    ...section,
    section_type: section.section_type ?? "rich_text",
    content_mode: section.content_mode ?? "manual",
    visible_on_country: section.visible_on_country ?? true,
    visible_on_wiki: section.visible_on_wiki ?? true,
    image_layout: section.image_layout ?? "wide",
  };
}

export function sectionVisibleOn(section: CountryPageSection, surface: "country" | "wiki") {
  const normalized = normalizeCountryPageSection(section);
  return surface === "country" ? normalized.visible_on_country : normalized.visible_on_wiki;
}

export function useSaveCountryPageSection(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: CountryPageSectionInput) => {
      if (!countryId) throw new Error("No country is selected.");
      const backgroundTint = section.backgroundTint?.trim() || null;
      if (backgroundTint && !/^#[0-9a-f]{6}$/i.test(backgroundTint)) {
        throw new Error("Section tint must be a six-digit hex colour.");
      }

      const payload = {
        country_id: countryId,
        heading: section.heading.trim() || (section.sectionType === "divider" ? "Section break" : "Untitled section"),
        body: section.body,
        section_type: section.sectionType,
        kicker: section.kicker?.trim() || null,
        content_mode: section.contentMode,
        visible_on_country: section.visibleOnCountry,
        visible_on_wiki: section.visibleOnWiki,
        image_url: section.imageUrl ?? null,
        image_caption: section.imageCaption?.trim() || null,
        image_layout: section.imageLayout,
        background_tint: backgroundTint,
        content_json: section.contentJson ?? {},
        sort_order: section.sortOrder ?? 0,
      };

      const query = section.id
        ? supabase
            .from("country_profile_sections")
            .update(payload)
            .eq("id", section.id)
            .eq("country_id", countryId)
        : supabase.from("country_profile_sections").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as CountryPageSection;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function useReorderCountryPageSections(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sectionIds: string[]) => {
      if (!countryId) throw new Error("No country is selected.");
      const { error } = await supabase.rpc("reorder_country_profile_sections", {
        _country_id: countryId,
        _section_ids: sectionIds,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function visibleCountryMedia(media: CountryMedia[]) {
  return media.filter((item) => Boolean(item.public_url));
}
