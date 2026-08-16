import { createServerFn } from "@tanstack/react-start";

export type MergedRoundEntry = {
  id: string;
  round_id: string;
  entry_type: "country" | "custom";
  entry_key: string;
  country_code: string | null;
  custom_name: string | null;
  short_name: string | null;
  entry_code: string | null;
  subtitle: string | null;
  image_url: string | null;
  description: string | null;
  display_order: number;
  country?: { code: string; name: string; flag: string | null; flag_url: string | null } | null;
};

function cleanOptionalText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error(`Value is too long (maximum ${maxLength} characters)`);
  return text;
}

function cleanImageUrl(value: unknown) {
  const text = cleanOptionalText(value, 1000);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Image URL must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Image URL must use http or https");
  return parsed.toString();
}

export const getMergedRoundEntries = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { getMergedRoundEntriesServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return getMergedRoundEntriesServer(data.roundId);
  });

export const saveMergedRoundCountries = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string; countryCodes: string[] }) => {
    if (!data?.roundId) throw new Error("Missing round");
    if (!Array.isArray(data.countryCodes)) throw new Error("Invalid countries");
    if (data.countryCodes.length < 2 || data.countryCodes.length > 50) throw new Error("Pick between 2 and 50 countries");
    const clean = data.countryCodes.map((code) => String(code).trim()).filter(Boolean);
    if (new Set(clean).size !== clean.length) throw new Error("Duplicate country in selection");
    return { roundId: data.roundId, countryCodes: clean };
  })
  .handler(async ({ data }) => {
    const { saveMergedRoundCountriesServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return saveMergedRoundCountriesServer(data);
  });

export const saveMergedCustomRoundEntry = createServerFn({ method: "POST" })
  .inputValidator((data: {
    roundId: string;
    id?: string | null;
    customName: string;
    shortName?: string | null;
    entryCode?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
    description?: string | null;
  }) => {
    if (!data?.roundId) throw new Error("Missing round");
    const customName = String(data.customName ?? "").trim();
    if (!customName) throw new Error("Display name is required");
    if (customName.length > 120) throw new Error("Display name is too long");
    return {
      roundId: data.roundId,
      id: data.id || null,
      customName,
      shortName: cleanOptionalText(data.shortName, 60),
      entryCode: cleanOptionalText(data.entryCode, 24),
      subtitle: cleanOptionalText(data.subtitle, 120),
      imageUrl: cleanImageUrl(data.imageUrl),
      description: cleanOptionalText(data.description, 1000),
    };
  })
  .handler(async ({ data }) => {
    const { saveMergedCustomRoundEntryServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return saveMergedCustomRoundEntryServer(data);
  });

export const deleteMergedCustomRoundEntry = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string; entryId: string }) => {
    if (!data?.roundId || !data?.entryId) throw new Error("Missing round or entry");
    return data;
  })
  .handler(async ({ data }) => {
    const { deleteMergedCustomRoundEntryServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return deleteMergedCustomRoundEntryServer(data);
  });

export const reorderMergedRoundEntries = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string; entryIds: string[] }) => {
    if (!data?.roundId || !Array.isArray(data.entryIds)) throw new Error("Invalid entry order");
    if (new Set(data.entryIds).size !== data.entryIds.length) throw new Error("Duplicate entry in order");
    return data;
  })
  .handler(async ({ data }) => {
    const { reorderMergedRoundEntriesServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return reorderMergedRoundEntriesServer(data);
  });

export const setMergedRoundSelfVotingMode = createServerFn({ method: "POST" })
  .inputValidator((data: {
    roundId: string;
    mode: "country_match" | "linked_identity" | "disabled" | "unrestricted";
  }) => {
    if (!data?.roundId) throw new Error("Missing round");
    if (!["country_match", "linked_identity", "disabled", "unrestricted"].includes(data.mode)) {
      throw new Error("Invalid self-voting mode");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { setMergedRoundSelfVotingModeServer } = await import(
      "@/integrations/televoting/entries.server"
    );
    return setMergedRoundSelfVotingModeServer(data);
  });
