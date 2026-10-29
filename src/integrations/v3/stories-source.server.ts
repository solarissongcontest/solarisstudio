import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import { SOLARIS_TIME_ZONE } from "@/lib/public-time";
import type {
  V3StoriesAnniversary,
  V3StoriesIndexBundle,
  V3StoryArtwork,
  V3StoryDetailBundle,
  V3StoryMoment,
  V3StorySummary,
  V3Storyline,
} from "@/lib/v3-stories";

type StoriesSourceClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
  from(table: string): any;
};

type CurrentStoryEditionContext = {
  resolved: boolean;
  editionId: string | null;
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

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoment(value: unknown): V3StoryMoment {
  const row = object(value, "public story moment");
  return {
    id: nullableString(row.id) ?? undefined,
    sourceEventType: nullableString(row.sourceEventType),
    occurredAt: stringValue(row.occurredAt, "story moment occurredAt"),
    importance: numberValue(row.importance, "story moment importance"),
    headline: stringValue(row.headline, "story moment headline"),
    summary: stringValue(row.summary, "story moment summary"),
    sortOrder: nullableNumber(row.sortOrder) ?? undefined,
    yearsAgo: nullableNumber(row.yearsAgo) ?? undefined,
    editionSlug: nullableString(row.editionSlug) ?? undefined,
    editionName: nullableString(row.editionName) ?? undefined,
    editionNumber: nullableNumber(row.editionNumber),
  };
}

function parseStorySummary(value: unknown): V3StorySummary {
  const row = object(value, "public story summary");
  return {
    editionId: stringValue(row.editionId, "story edition id"),
    editionSlug: stringValue(row.editionSlug, "story edition slug"),
    editionName: stringValue(row.editionName, "story edition name"),
    editionNumber: nullableNumber(row.editionNumber),
    eventDate: nullableString(row.eventDate),
    title: stringValue(row.title, "story title"),
    subtitle: nullableString(row.subtitle),
    introduction: nullableString(row.introduction),
    publishedAt: stringValue(row.publishedAt, "story publishedAt"),
    itemCount: numberValue(row.itemCount ?? 0, "story item count"),
    heroMoment: row.heroMoment ? parseMoment(row.heroMoment) : null,
  };
}

function parseStoryline(value: unknown): V3Storyline | null {
  if (value == null) return null;
  const row = object(value, "public storyline");
  return {
    editionId: stringValue(row.editionId, "story edition id"),
    editionSlug: stringValue(row.editionSlug, "story edition slug"),
    editionName: stringValue(row.editionName, "story edition name"),
    editionNumber: nullableNumber(row.editionNumber),
    eventDate: nullableString(row.eventDate),
    title: stringValue(row.title, "story title"),
    subtitle: nullableString(row.subtitle),
    introduction: nullableString(row.introduction),
    publishedAt: stringValue(row.publishedAt, "story publishedAt"),
    items: Array.isArray(row.items) ? row.items.map(parseMoment) : [],
  };
}

function parseAnniversary(value: unknown): V3StoriesAnniversary {
  const row = object(value, "anniversary engine");
  const ssc = row.sscAnniversary ? object(row.sscAnniversary, "SSC anniversary") : null;
  return {
    referenceDate: stringValue(row.referenceDate, "anniversary reference date"),
    timeZone: stringValue(row.timeZone, "anniversary time zone"),
    sscAnniversary: ssc
      ? {
          birthDate: stringValue(ssc.birthDate, "SSC birth date"),
          years: numberValue(ssc.years, "SSC anniversary years"),
          label: stringValue(ssc.label, "SSC anniversary label"),
        }
      : null,
    onThisDay: Array.isArray(row.onThisDay) ? row.onThisDay.map(parseMoment) : [],
  };
}

function todayInSolaris() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SOLARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function loadCurrentStoryEditionContext(
  client: StoriesSourceClient,
): Promise<CurrentStoryEditionContext> {
  try {
    const { data, error } = await client
      .from("editions")
      .select("id,edition_number,status,published")
      .eq("published", true)
      .order("edition_number", { ascending: false })
      .limit(50);

    if (error || !Array.isArray(data)) return { resolved: false, editionId: null };

    const current = resolveCurrentPublicEdition(data as Edition[]);
    if (!current) return { resolved: true, editionId: null };

    const lifecycle = normalizeLegacyEditionStatus(current.status);
    if (lifecycle === "post_edition" || lifecycle === "archived") {
      return { resolved: true, editionId: null };
    }

    return {
      resolved: true,
      editionId: nullableString(current.id),
    };
  } catch {
    // Directory classification is supplemental. If lifecycle cannot be resolved,
    // keep every published Story available in an unclassified archive section.
    return { resolved: false, editionId: null };
  }
}

async function loadPublishedEditionArtwork(
  client: StoriesSourceClient,
  story: V3Storyline,
): Promise<V3StoryArtwork | null> {
  try {
    const { data, error } = await client
      .from("editions")
      .select("id,artwork_url")
      .eq("id", story.editionId)
      .eq("published", true)
      .maybeSingle();

    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const row = data as Record<string, unknown>;
    const editionId = nullableString(row.id);
    const src = nullableString(row.artwork_url);
    if (editionId !== story.editionId || !src) return null;

    return {
      src,
      alt: `${story.editionName} official artwork`,
    };
  } catch {
    // Artwork is presentation-only. Never hide an authoritative published Story
    // merely because supplemental Edition artwork is missing or unavailable.
    return null;
  }
}

/**
 * Published-only Stories archive source.
 *
 * The browser supplies no publication status, date authority or draft selector.
 * Both RPCs are the existing public Storytelling projections and generated/draft
 * storylines remain outside this boundary.
 */
export async function loadV3StoriesIndexBundle(): Promise<V3StoriesIndexBundle> {
  const client = createConfirmationPublicRuntimeClient() as unknown as StoriesSourceClient;
  const referenceDate = todayInSolaris();

  const [storiesResult, anniversaryResult, currentEditionContext] = await Promise.all([
    client.rpc("studio2_public_storylines", { p_limit: 30 }),
    client.rpc("studio2_anniversary_engine", {
      p_reference_date: referenceDate,
      p_limit: 12,
    }),
    loadCurrentStoryEditionContext(client),
  ]);

  throwIfError(storiesResult.error, "Could not load published Solaris stories");
  throwIfError(anniversaryResult.error, "Could not load Solaris anniversary stories");

  const stories = Array.isArray(storiesResult.data)
    ? storiesResult.data.map(parseStorySummary)
    : [];
  const anniversary = parseAnniversary(anniversaryResult.data);
  const currentStory = currentEditionContext.editionId
    ? stories.find((story) => story.editionId === currentEditionContext.editionId) ?? null
    : null;
  const historicalStories = currentEditionContext.resolved
    ? stories.filter((story) => story.editionId !== currentEditionContext.editionId)
    : [];

  return {
    shell: { editionLabel: "Solaris Studio", phaseLabel: "Stories" },
    stories,
    currentStory,
    historicalStories,
    anniversary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Published-only edition Story source.
 *
 * Related stories and Edition artwork are optional continuity/presentation data.
 * Failure to load either supplemental source must never turn a valid published
 * Story into an unavailable page.
 */
export async function loadV3StoryDetailBundle(
  editionSlug: string,
): Promise<V3StoryDetailBundle> {
  const cleanSlug = editionSlug.trim();
  if (!cleanSlug) {
    return {
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Stories" },
      story: null,
      artwork: null,
      relatedEdition: null,
      relatedStories: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const client = createConfirmationPublicRuntimeClient() as unknown as StoriesSourceClient;
  const result = await client.rpc("studio2_public_storyline", {
    p_edition_slug: cleanSlug,
  });
  throwIfError(result.error, "Could not load published Solaris edition story");

  const story = parseStoryline(result.data);
  let artwork: V3StoryArtwork | null = null;
  let relatedStories: V3StorySummary[] = [];

  if (story) {
    const [resolvedArtwork, relatedResult] = await Promise.all([
      loadPublishedEditionArtwork(client, story),
      Promise.resolve(client.rpc("studio2_public_storylines", { p_limit: 12 })).catch(() => null),
    ]);
    artwork = resolvedArtwork;

    if (relatedResult && !relatedResult.error && Array.isArray(relatedResult.data)) {
      try {
        relatedStories = relatedResult.data
          .map(parseStorySummary)
          .filter((candidate) => candidate.editionId !== story.editionId)
          .slice(0, 3);
      } catch {
        // Related continuity is optional. The authoritative published Story remains usable.
        relatedStories = [];
      }
    }
  }

  return {
    shell: {
      editionLabel:
        story?.editionNumber != null
          ? `SSC ${story.editionNumber} · ${story.editionName}`
          : story?.editionName ?? "Solaris Studio",
      phaseLabel: "Stories",
    },
    story,
    artwork,
    relatedEdition: story
      ? {
          label: story.editionName,
          href: `/editions/${encodeURIComponent(story.editionSlug)}`,
        }
      : null,
    relatedStories,
    generatedAt: new Date().toISOString(),
  };
}
