import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { loadV3ResultsBundle } from "@/integrations/v3/results-source.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { CountryIdentityModel } from "@/lib/country-semantic-model";
import type { Edition } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import {
  buildV3CountryExploreProjection,
  type V3CountryCurrentResult,
  type V3CountryExploreProjection,
} from "@/lib/v3-explore-entities";

const EDITION_COLUMNS = "id,edition_number,slug,status,published";

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

type ParsedProfile = {
  countryId: string;
  identity: CountryIdentityModel;
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

/**
 * `resolveCurrentPublicEdition()` deliberately falls back to the latest
 * published edition between contest cycles. That fallback is useful for global
 * archive presentation, but it is not permission to call a completed entry
 * current participation.
 */
export function resolveV3DelegationCurrentParticipationEdition(
  editions: readonly Edition[],
): Edition | null {
  const current = resolveCurrentPublicEdition(editions);
  if (!current) return null;

  const lifecycle = normalizeLegacyEditionStatus(current.status);
  if (lifecycle === "post_edition" || lifecycle === "archived") {
    return null;
  }

  return current;
}

/**
 * A completed edition can still be the latest public result context after the
 * show ends. Only an archived fallback stops being a current/latest result.
 */
export function resolveV3DelegationCurrentResultEdition(
  editions: readonly Edition[],
): Edition | null {
  const current = resolveCurrentPublicEdition(editions);
  if (!current) return null;
  return normalizeLegacyEditionStatus(current.status) === "archived"
    ? null
    : current;
}

function parseProfile(
  value: unknown,
  currentEditionId: string | null,
): ParsedProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as ProfilePayload;
  if (!profile.country || typeof profile.country !== "object" || Array.isArray(profile.country)) {
    return null;
  }

  const country = profile.country as CountryPayload;
  const countryId = requiredString(country.id, "country id");
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
    countryId,
    identity: {
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
    },
  };
}

async function loadCurrentPublishedResult(input: {
  currentEdition: Edition | null;
  countryId: string;
  editionHrefById: ReadonlyMap<string, string>;
}): Promise<V3CountryCurrentResult | null> {
  if (!input.currentEdition) return null;

  try {
    const resultsBundle = await loadV3ResultsBundle();
    if (
      resultsBundle.input.publication !== "published" ||
      resultsBundle.input.editionId !== input.currentEdition.id ||
      !resultsBundle.input.showId
    ) {
      return null;
    }

    const row = resultsBundle.input.rows.find(
      (candidate) => candidate.canonicalCountryId === input.countryId,
    );
    if (!row) return null;

    return {
      editionId: resultsBundle.input.editionId,
      editionLabel: resultsBundle.input.editionName,
      editionHref: input.editionHrefById.get(resultsBundle.input.editionId) ?? null,
      showId: resultsBundle.input.showId,
      showName: resultsBundle.input.showName,
      showHref: `/shows/${encodeURIComponent(resultsBundle.input.showId)}?from=results`,
      rank: row.rank,
      points: row.points,
      juryPoints: resultsBundle.input.juryPublished ? (row.juryPoints ?? null) : null,
      televotePoints: resultsBundle.input.televotePublished ? (row.televotePoints ?? null) : null,
    };
  } catch {
    // Current result is supplemental to the canonical Delegation identity.
    // If the Results source is temporarily unavailable, keep the country page
    // usable and fail closed by omitting the result summary.
    return null;
  }
}

/**
 * Publication-safe and bounded V3 Delegation source. The country-profile RPC
 * remains identity/entry authority only. Current result context is composed
 * separately from the canonical publication-gated Results read model, so the
 * Delegation RPC never becomes a second result or voting authority.
 *
 * Historical/current continuity is explicit: completed/archived participation
 * remains history, while a completed but not yet archived edition may still
 * supply the latest published result. Archived fallback state is never promoted
 * into either current surface.
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

  const publishedEditions = (editionsResult.data ?? []) as Edition[];
  const currentParticipationEdition =
    resolveV3DelegationCurrentParticipationEdition(publishedEditions);
  const currentResultEdition =
    resolveV3DelegationCurrentResultEdition(publishedEditions);
  const editionHrefById = new Map<string, string>();
  for (const edition of publishedEditions) {
    const id = stringOrNull(edition.id);
    const slug = stringOrNull(edition.slug);
    if (id && slug) editionHrefById.set(id, `/editions/${encodeURIComponent(slug)}`);
  }

  const profile = parseProfile(
    profileResult.data,
    currentParticipationEdition?.id ?? null,
  );
  if (!profile) return null;

  const currentResult = await loadCurrentPublishedResult({
    currentEdition: currentResultEdition,
    countryId: profile.countryId,
    editionHrefById,
  });

  return {
    projection: buildV3CountryExploreProjection(
      profile.identity,
      editionHrefById,
      currentResult,
    ),
    shell: {
      editionLabel: "Solaris Studio",
      phaseLabel: "Delegation",
    },
    generatedAt: new Date().toISOString(),
  };
}
