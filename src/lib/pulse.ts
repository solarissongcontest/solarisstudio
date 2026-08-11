import type { ContentEventRow, FanFollowRow } from "@/integrations/supabase/app-types";
import type { Edition, Participant, ResultRow, Show } from "@/lib/data";

export type PulseCategory =
  | "entries"
  | "running_orders"
  | "predictions"
  | "results"
  | "records";

export const PULSE_CATEGORY_OPTIONS: ReadonlyArray<readonly [PulseCategory, string]> = [
  ["entries", "Entries"],
  ["running_orders", "Running orders"],
  ["predictions", "Predictions"],
  ["results", "Results"],
  ["records", "Records"],
];

export function eventCategory(eventType: string): PulseCategory | null {
  if (eventType === "entry_published") return "entries";
  if (eventType === "running_order_published") return "running_orders";
  if (eventType.startsWith("prediction_")) return "predictions";
  if (eventType === "results_published") return "results";
  if (eventType === "record_broken" || eventType === "record_threat") return "records";
  return null;
}

export function eventTypeLabel(eventType: string) {
  return eventType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type EventPayload = Record<string, unknown>;

function asPayload(payload: ContentEventRow["payload"]): EventPayload {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return {};
  return payload as EventPayload;
}

function payloadString(payload: EventPayload, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function payloadStringArray(payload: EventPayload, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [] as string[];
}

export function eventMatchesFollow(event: ContentEventRow, follow: FanFollowRow) {
  if (event.entity_type === follow.entity_type && event.entity_id === follow.entity_id) {
    return true;
  }

  const payload = asPayload(event.payload);

  if (follow.entity_type === "country") {
    const directCountry = payloadString(
      payload,
      "countryId",
      "country_id",
      "contestEntityId",
      "contest_entity_id",
    );
    const countries = payloadStringArray(
      payload,
      "countryIds",
      "country_ids",
      "contestEntityIds",
      "contest_entity_ids",
    );
    return directCountry === follow.entity_id || countries.includes(follow.entity_id);
  }

  if (follow.entity_type === "edition") {
    return payloadString(payload, "editionId", "edition_id") === follow.entity_id;
  }

  if (follow.entity_type === "show") {
    return payloadString(payload, "showId", "show_id") === follow.entity_id;
  }

  return false;
}

function followAllowsEvent(follow: FanFollowRow, event: ContentEventRow) {
  if (follow.notification_level === "none") return false;
  if (follow.notification_level === "important" && event.importance !== "important") {
    return false;
  }
  return eventMatchesFollow(event, follow);
}

export function buildPulseInbox({
  events,
  follows,
  categories,
  signedIn,
  inAppEnabled,
}: {
  events: ContentEventRow[];
  follows: FanFollowRow[];
  categories: readonly string[];
  signedIn: boolean;
  inAppEnabled: boolean;
}) {
  const categoryFiltered = events.filter((event) => {
    const category = eventCategory(event.event_type);
    return category === null || categories.includes(category);
  });

  if (!signedIn) return categoryFiltered;
  if (!inAppEnabled) return [];
  if (!follows.length) return categoryFiltered;

  return categoryFiltered.filter((event) =>
    follows.some((follow) => followAllowsEvent(follow, event)),
  );
}

export type PredictionSnapshot = {
  capturedAt: string;
  sampleSize: number;
  items: Record<string, { count: number; percentage: number }>;
};

export type PredictionMovementPayload = {
  ready: boolean;
  minimum: number;
  snapshots: PredictionSnapshot[];
};

export type PredictionLeaderMovement = {
  predictionType: string;
  currentCountryId: string;
  currentPercentage: number;
  previousCountryId: string | null;
  previousPercentage: number | null;
  leaderChanged: boolean;
  percentageDelta: number | null;
  sampleSize: number;
  previousSampleSize: number | null;
};

function leaderForType(snapshot: PredictionSnapshot, predictionType: string) {
  return Object.entries(snapshot.items)
    .filter(([key]) => key.startsWith(`${predictionType}:`))
    .map(([key, value]) => ({
      countryId: key.slice(predictionType.length + 1),
      count: value.count,
      percentage: value.percentage,
    }))
    .sort((a, b) => b.count - a.count || b.percentage - a.percentage || a.countryId.localeCompare(b.countryId))[0];
}

export function predictionLeaderMovements(
  payload: PredictionMovementPayload | null | undefined,
): PredictionLeaderMovement[] {
  if (!payload?.ready || payload.snapshots.length < 2) return [];

  const [current, previous] = payload.snapshots;
  if (!current || !previous) return [];

  const predictionTypes = new Set(
    Object.keys(current.items).map((key) => key.split(":", 1)[0]).filter(Boolean),
  );

  const movements: PredictionLeaderMovement[] = [];

  for (const predictionType of predictionTypes) {
    const currentLeader = leaderForType(current, predictionType);
    if (!currentLeader) continue;

    const previousLeader = leaderForType(previous, predictionType);
    const previousSameCountry = previous.items[`${predictionType}:${currentLeader.countryId}`];

    movements.push({
      predictionType,
      currentCountryId: currentLeader.countryId,
      currentPercentage: currentLeader.percentage,
      previousCountryId: previousLeader?.countryId ?? null,
      previousPercentage: previousSameCountry?.percentage ?? null,
      leaderChanged: Boolean(
        previousLeader && previousLeader.countryId !== currentLeader.countryId,
      ),
      percentageDelta:
        previousSameCountry == null
          ? null
          : Number((currentLeader.percentage - previousSameCountry.percentage).toFixed(1)),
      sampleSize: current.sampleSize,
      previousSampleSize: previous.sampleSize,
    });
  }

  return movements.sort((a, b) => {
    if (a.leaderChanged !== b.leaderChanged) return a.leaderChanged ? -1 : 1;
    return Math.abs(b.percentageDelta ?? 0) - Math.abs(a.percentageDelta ?? 0);
  });
}

export type RecordInsight = {
  id: string;
  kind: "broken" | "threat" | "personal_best";
  title: string;
  summary: string;
  route: string;
  importance: number;
};

type BuildRecordInsightsArgs = {
  editions: Edition[];
  shows: Show[];
  results: ResultRow[];
  participants: Participant[];
  nameForEntity: (id: string) => string;
};

function showBucket(show: Show | undefined) {
  return show?.kind ?? "edition";
}

function resultIdentity(result: ResultRow) {
  return result.country_id;
}

export function buildRecordInsights({
  editions,
  shows,
  results,
  participants,
  nameForEntity,
}: BuildRecordInsightsArgs): RecordInsight[] {
  const latestEdition = [...editions]
    .filter((edition) => edition.published)
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0];
  if (!latestEdition) return [];

  const showMap = new Map(shows.map((show) => [show.id, show]));
  const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
  const participantMap = new Map(
    participants.map((participant) => [
      `${participant.show_id ?? "edition"}:${participant.country_id}`,
      participant,
    ]),
  );

  const current = results.filter((result) => result.edition_id === latestEdition.id);
  const historical = results.filter((result) => result.edition_id !== latestEdition.id);
  const insights: RecordInsight[] = [];

  const metricDefinitions = [
    ["jury_points", "jury score"] as const,
    ["televote_points", "televote score"] as const,
    ["total_points", "total score"] as const,
  ];

  for (const result of current) {
    const identity = resultIdentity(result);
    const name = nameForEntity(identity);
    const currentShow = result.show_id ? showMap.get(result.show_id) : undefined;
    const bucket = showBucket(currentShow);
    const route = result.show_id
      ? `/shows/${result.show_id}`
      : `/editions/${editionMap.get(result.edition_id)?.slug ?? latestEdition.slug}`;

    const comparable = historical.filter((candidate) => {
      const candidateShow = candidate.show_id ? showMap.get(candidate.show_id) : undefined;
      return showBucket(candidateShow) === bucket;
    });

    for (const [metric, label] of metricDefinitions) {
      const value = result[metric];
      const historicalValues = comparable.map((candidate) => candidate[metric]).filter((score) => score > 0);
      if (historicalValues.length < 3 || value <= 0) continue;
      const record = Math.max(...historicalValues);
      if (record <= 0) continue;

      if (value > record) {
        insights.push({
          id: `${result.id}:${metric}:broken`,
          kind: "broken",
          title: `${name} has passed the all-time ${label} record`,
          summary: `${value} points is above the previous benchmark of ${record}.`,
          route,
          importance: 100 + (value - record),
        });
      } else if (value >= record * 0.9) {
        const gap = record - value;
        insights.push({
          id: `${result.id}:${metric}:threat`,
          kind: "threat",
          title: `${name} is close to the all-time ${label} record`,
          summary: `${value} points, ${gap} behind the current record of ${record}.`,
          route,
          importance: 70 + Math.round((value / record) * 20),
        });
      }
    }

    if (result.final_rank != null) {
      const previousRanks = historical
        .filter((candidate) => resultIdentity(candidate) === identity && candidate.final_rank != null)
        .map((candidate) => candidate.final_rank as number);
      if (previousRanks.length) {
        const best = Math.min(...previousRanks);
        if (result.final_rank < best) {
          insights.push({
            id: `${result.id}:personal-best`,
            kind: "personal_best",
            title: `${name} has a new best-ever placement`,
            summary: `Rank ${result.final_rank} improves on the previous best of ${best}.`,
            route,
            importance: 85 + Math.max(0, best - result.final_rank),
          });
        }
      }
    }

    if (result.final_rank != null && result.show_id) {
      const participant = participantMap.get(`${result.show_id}:${identity}`);
      const runningOrder = participant?.running_order;
      if (runningOrder != null) {
        const climb = runningOrder - result.final_rank;
        const historicalClimbs = historical
          .filter((candidate) => {
            if (candidate.final_rank == null || !candidate.show_id) return false;
            const candidateShow = showMap.get(candidate.show_id);
            if (showBucket(candidateShow) !== bucket) return false;
            const candidateIdentity = resultIdentity(candidate);
            const candidateParticipant = participantMap.get(`${candidate.show_id}:${candidateIdentity}`);
            return candidateParticipant?.running_order != null;
          })
          .map((candidate) => {
            const candidateIdentity = resultIdentity(candidate);
            const candidateParticipant = participantMap.get(`${candidate.show_id}:${candidateIdentity}`)!;
            return (candidateParticipant.running_order as number) - (candidate.final_rank as number);
          });

        if (historicalClimbs.length >= 3) {
          const recordClimb = Math.max(...historicalClimbs);
          if (climb > recordClimb && climb > 0) {
            insights.push({
              id: `${result.id}:climb-record`,
              kind: "broken",
              title: `${name} has the biggest running-order climb on record`,
              summary: `From slot ${runningOrder} to rank ${result.final_rank}, a climb of ${climb} places.`,
              route,
              importance: 95 + climb,
            });
          } else if (climb > 0 && climb >= recordClimb - 2) {
            insights.push({
              id: `${result.id}:climb-threat`,
              kind: "threat",
              title: `${name} is threatening the biggest-climb record`,
              summary: `A ${climb}-place climb, compared with the record of ${recordClimb}.`,
              route,
              importance: 72 + climb,
            });
          }
        }
      }
    }
  }

  return insights
    .sort((a, b) => b.importance - a.importance || a.title.localeCompare(b.title))
    .filter((insight, index, list) => list.findIndex((other) => other.id === insight.id) === index)
    .slice(0, 8);
}
