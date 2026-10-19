import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { CountryIdentityModel } from "@/lib/country-semantic-model";
import type { Edition } from "@/lib/data";
import {
  buildV3CountryExploreProjection,
  type V3CountryExploreProjection,
} from "@/lib/v3-explore-entities";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";

type DelegationSourceClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type CountryPayload = {
  id?: unknown;
  name?: unknown;
  native_name?: unknown;
  short_code?: unknown;
  flag_image?: unknown;
  region?: unknown;
  accent_color?: unknown;
  description?: unknown;
};

type EntryPayload = {
  edition_id?: unknown;
  edition_number?: unknown;
  edition_name?: unknown;
  artist?: unknown;
  song?: unknown;
  participation_status?: unknown;
};

type ProfilePayload = {
  country?: unknown;
  entries?: unknown;
};

export type V3DelegationServerBundle = {
  projection: V3CountryExploreProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  generatedAt: string;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, label: string): string {
  const normalized = stringOrNull(value);
  if (!normalized) throw new Error(`${label} must be present in the public Delegation projection.`);
  return normalized;
}

function editionLabel(entry: EntryPayload): string {
  const number = typeof entry.edition_number === "number" ? entry.edition_number : null;
  const name = stringOrNull(entry.edition_name);
  if (number != null && name) return `SSC ${number} · ${name}`;
  if (number != null) return `SSC ${number}`;
  return name ?? "Solaris edition";
}

function parseProfile(
  value: unknown,
  currentEditionId: string | null,
): CountryIdentityModel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as ProfilePayload;
  if (!profile.country || typeof profile.country !== "object" || Array.isArray(profile.country)) {
    return null;
  }

  const country = profile.country as CountryPayload;
  const code = requiredString(country.short_code, "country code").toUpperCase();
  const name = requiredString(country.name, "country name");
  const entries = Array.isArray(profile.entries)
    ? profile.entries.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const entry = value as EntryPayload;
        const editionId = stringOrNull(entry.edition_id);
        if (!editionId) return [];
        return [{
          editionId,
          editionLabel: editionLabel(entry),
          artist: stringOrNull(entry.artist),
          song: stringOrNull(entry.song),
          status: stringOrNull(entry.participation_status),
        }];
      })
    : [];

  return {
    code,
    name,
    nativeName: stringOrNull(country.native_name),
    region: stringOrNull(country.region),
    description: stringOrNull(country.description),
    flag: {
      src: stringOrNull(country.flag_image),
      alt: `Flag of ${name}`,
      aspectRatio: 1.5,
    },
    colors: {
      primary: stringOrNull(country.accent_color),
      accent: stringOrNull(country.accent_color),
    },
    facts: [],
    statistics: [],
    currentEntry: currentEditionId
      ? (entries.find((entry) => entry.editionId === currentEditionId) ?? null)
      : null,
    history: entries,
    geography: null,
    actions: {
      wiki: { label: "Wiki", href: `/wiki/${code}` },
      compare: { label: "Compare", href: `/compare?a=${encodeURIComponent(code)}` },
    },
  };
}

/**
 * Publication-safe and bounded V3 Delegation source. The database RPC delegates
 * entry disclosure to public_safe_participants and returns one country only.
 * This server adapter owns no result, voting, ranking or participant mutation
 * logic and therefore cannot become a second archive authority.
 */
export async function loadV3DelegationBundle(input: {
  code: string;
}): Promise<V3DelegationServerBundle | null> {
  const code = input.code.trim().toUpperCase();
  if (!code) return null;

  const client = createConfirmationPublicRuntimeClient() as unknown as DelegationSourceClient;
  const [profileResult, editionsResult] = await Promise.all([
    client.rpc("v3_public_country_profile", { p_code: code }),
    client
      .from("editions")
      .select(EDITION_COLUMNS)
      .eq("published", true)
      .order("edition_number", { ascending: false }),
  ]);
  throwIfError(profileResult.error, "Could not load public Solaris delegation");
  throwIfError(editionsResult.error, "Could not resolve the current public Solaris edition");

  const currentEdition = resolveCurrentPublicEdition((editionsResult.data ?? []) as Edition[]);
  const identity = parseProfile(profileResult.data, currentEdition?.id ?? null);
  if (!identity) return null;

  return {
    projection: buildV3CountryExploreProjection(identity),
    shell: {
      editionLabel: "Solaris Studio",
      phaseLabel: "Delegation",
    },
    generatedAt: new Date().toISOString(),
  };
}
