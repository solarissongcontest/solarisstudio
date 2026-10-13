import { getRequestHeader } from "@tanstack/react-start/server";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  buildV3ResultsProjection,
  type V3ResultEntryInput,
  type V3ResultsProjection,
} from "@/lib/v3-results";

type RpcResult = {
  data: unknown;
  error: unknown;
};

type QueryResult = {
  data: any;
  error: unknown;
};

type ResultsClient = {
  auth?: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
};

type ResultsPayload = {
  edition?: unknown;
  show?: unknown;
  jury_published?: unknown;
  televote_published?: unknown;
  rows?: unknown;
};

type EditionPayload = {
  id?: unknown;
  edition_number?: unknown;
  name?: unknown;
};

type ShowPayload = {
  id?: unknown;
  name?: unknown;
};

type RowPayload = {
  country_id?: unknown;
  country_name?: unknown;
  flag_url?: unknown;
  rank?: unknown;
  points?: unknown;
  jury_points?: unknown;
  televote_points?: unknown;
};

export type V3ResultsServerBundle = {
  projection: V3ResultsProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  generatedAt: string;
};

function bearerToken() {
  const header = getRequestHeader("authorization")?.trim() ?? "";
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

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
  if (!normalized) throw new Error(`${label} is missing from the V3 Results projection.`);
  return normalized;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} is invalid in the V3 Results projection.`);
  }
  return number;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${label} is invalid in the V3 Results projection.`);
  }
  return number;
}

function optionalNonNegativeNumber(value: unknown, label: string): number | null {
  if (value == null) return null;
  return nonNegativeNumber(value, label);
}

function parseRows(value: unknown): V3ResultEntryInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Result row ${index + 1} is invalid in the V3 Results projection.`);
    }
    const row = raw as RowPayload;
    return {
      countryId: requiredString(row.country_id, `result row ${index + 1} identity`),
      countryName: requiredString(row.country_name, `result row ${index + 1} name`),
      flagUrl: stringOrNull(row.flag_url),
      rank: positiveInteger(row.rank, `result row ${index + 1} rank`),
      points: nonNegativeNumber(row.points, `result row ${index + 1} points`),
      juryPoints: optionalNonNegativeNumber(
        row.jury_points,
        `result row ${index + 1} jury points`,
      ),
      televotePoints: optionalNonNegativeNumber(
        row.televote_points,
        `result row ${index + 1} televote points`,
      ),
    };
  });
}

async function resolveViewer(): Promise<{
  id: string;
  client: ResultsClient;
} | null> {
  const token = bearerToken();
  if (!token) return null;

  try {
    const client = createSolarisAuthenticatedClientServer() as unknown as ResultsClient;
    const { data, error } = await client.auth!.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, client };
  } catch {
    return null;
  }
}

async function loadViewerResultContext(viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  if (!viewer) {
    return {
      hideSpoilers: false,
      delegationCountryId: null as string | null,
    };
  }

  const preferencePromise = viewer.client
    .from("notification_preferences")
    .select("spoiler_free")
    .eq("profile_id", viewer.id)
    .maybeSingle() as PromiseLike<QueryResult>;
  const delegationPromise = viewer.client
    .from("country_accounts")
    .select("country_id,status")
    .eq("user_id", viewer.id)
    .maybeSingle() as PromiseLike<QueryResult>;

  const [preference, delegation] = await Promise.all([
    preferencePromise,
    delegationPromise,
  ]);
  throwIfError(preference.error, "Could not load Solaris result disclosure preference");
  throwIfError(delegation.error, "Could not load Solaris delegation result context");

  return {
    hideSpoilers: preference.data?.spoiler_free === true,
    delegationCountryId:
      delegation.data?.status === "active" && typeof delegation.data?.country_id === "string"
        ? delegation.data.country_id
        : null,
  };
}

function editionLabel(edition: EditionPayload | null) {
  if (!edition) return "Solaris Song Contest";
  const name = stringOrNull(edition.name) ?? "Solaris Song Contest";
  const number = Number(edition.edition_number);
  return Number.isSafeInteger(number) && number > 0 ? `SSC ${number} · ${name}` : name;
}

/**
 * Server-owned V3 Results bootstrap. The browser receives exactly one bounded
 * official-result projection. Publication flags come from the database read
 * model; spoiler disclosure and personal delegation context are resolved on the
 * authenticated server request before the projection is serialized.
 */
export async function loadV3ResultsBundle(): Promise<V3ResultsServerBundle> {
  const publicClient =
    createConfirmationPublicRuntimeClient() as unknown as ResultsClient;
  const [result, viewer] = await Promise.all([
    publicClient.rpc("v3_public_results_root"),
    resolveViewer(),
  ]);
  throwIfError(result.error, "Could not load the public Solaris result projection");

  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new Error("The public Solaris result projection is invalid.");
  }

  const payload = result.data as ResultsPayload;
  const edition =
    payload.edition && typeof payload.edition === "object" && !Array.isArray(payload.edition)
      ? (payload.edition as EditionPayload)
      : null;
  const show =
    payload.show && typeof payload.show === "object" && !Array.isArray(payload.show)
      ? (payload.show as ShowPayload)
      : null;
  const context = await loadViewerResultContext(viewer);
  const showId = show ? requiredString(show.id, "result show id") : "unpublished";
  const showName = show ? requiredString(show.name, "result show name") : "Results";
  const editionId = edition ? requiredString(edition.id, "result edition id") : "unpublished";
  const label = editionLabel(edition);
  const publication = show ? "published" as const : "hidden" as const;

  const projection = buildV3ResultsProjection({
    editionId,
    editionName: label,
    showId,
    showName,
    publication,
    disclosure: context.hideSpoilers ? "withheld" : "revealed",
    rows: publication === "published" ? parseRows(payload.rows) : [],
    juryPublished: payload.jury_published === true,
    televotePublished: payload.televote_published === true,
    userDelegationCountryId: context.delegationCountryId,
    resultTools: show
      ? [
          { key: "scorechart", label: "Scorechart", href: "/scorecharts" },
          { key: "jury-vs-televote", label: "Jury vs televote", href: "/analysis" },
          {
            key: "country-breakdown",
            label: "Country breakdown",
            href: `/shows/${encodeURIComponent(showId)}?from=results`,
          },
        ]
      : [],
    advancedTools: show
      ? [
          { key: "relationships", label: "Voting relationships", href: "/relationships" },
          { key: "voting-dna", label: "Voting DNA", href: "/voting-dna" },
          { key: "records", label: "Records", href: "/records" },
          { key: "result-lab", label: "Result Lab", href: "/result-lab" },
        ]
      : [],
  });

  return {
    projection,
    shell: {
      editionLabel: label,
      phaseLabel: "Results",
    },
    generatedAt: new Date().toISOString(),
  };
}
