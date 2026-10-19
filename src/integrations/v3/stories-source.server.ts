import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { SOLARIS_TIME_ZONE } from "@/lib/public-time";
import type {
  V3StoriesAnniversary,
  V3StoriesIndexBundle,
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

  const [storiesResult, anniversaryResult] = await Promise.all([
    client.rpc("studio2_public_storylines", { p_limit: 30 }),
    client.rpc("studio2_anniversary_engine", {
      p_reference_date: referenceDate,
      p_limit: 12,
    }),
  ]);

  throwIfError(storiesResult.error, "Could not load published Solaris stories");
  throwIfError(anniversaryResult.error, "Could not load Solaris anniversary stories");

  const stories = Array.isArray(storiesResult.data)
    ? storiesResult.data.map(parseStorySummary)
    : [];
  const anniversary = parseAnniversary(anniversaryResult.data);

  return {
    shell: { editionLabel: "Solaris Studio", phaseLabel: "Stories" },
    stories,
    anniversary,
    generatedAt: new Date().toISOString(),
  };
}

/** Published-only edition Story source. */
export async function loadV3StoryDetailBundle(
  editionSlug: string,
): Promise<V3StoryDetailBundle> {
  const cleanSlug = editionSlug.trim();
  if (!cleanSlug) {
    return {
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Stories" },
      story: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const client = createConfirmationPublicRuntimeClient() as unknown as StoriesSourceClient;
  const result = await client.rpc("studio2_public_storyline", {
    p_edition_slug: cleanSlug,
  });
  throwIfError(result.error, "Could not load published Solaris edition story");

  const story = parseStoryline(result.data);
  return {
    shell: {
      editionLabel:
        story?.editionNumber != null
          ? `SSC ${story.editionNumber} · ${story.editionName}`
          : story?.editionName ?? "Solaris Studio",
      phaseLabel: "Stories",
    },
    story,
    generatedAt: new Date().toISOString(),
  };
}
