import { z } from "zod";

export type V3PersonalHistoryRole = "hod" | "juror" | "other";
export type V3PersonalHistoryState = "current" | "historical" | "superseded";
export type V3PersonalHistorySource = "hod_claim" | "hod_assignment" | "jury_membership" | "other";

export type V3PersonalHistoryItem = {
  id: string;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  role: V3PersonalHistoryRole;
  startedAt: string | null;
  endedAt: string | null;
  source: V3PersonalHistorySource;
  state: V3PersonalHistoryState;
};

export type V3PersonalHistoryBundle = {
  schemaReady: boolean;
  viewerId: string | null;
  items: V3PersonalHistoryItem[];
  generatedAt: string | null;
};

const rawItemSchema = z.object({
  id: z.string().min(1).max(320),
  edition_id: z.string().uuid(),
  edition_number: z.number().int().nullable(),
  edition_name: z.string().min(1).max(240),
  country_id: z.string().uuid(),
  country_code: z.string().min(1).max(64),
  country_name: z.string().min(1).max(240),
  role: z.string().min(1).max(80),
  started_at: z.string().min(1).max(128).nullable(),
  ended_at: z.string().min(1).max(128).nullable(),
  source: z.string().min(1).max(80),
  state: z.enum(["current", "historical", "superseded"]),
});

const projectionSchema = z.object({
  viewer_id: z.string().uuid(),
  items: z.array(rawItemSchema).max(500),
  generated_at: z.string().min(1).max(128),
});

export function unavailableV3PersonalHistory(): V3PersonalHistoryBundle {
  return {
    schemaReady: false,
    viewerId: null,
    items: [],
    generatedAt: null,
  };
}

function normalizeRole(role: string): V3PersonalHistoryRole {
  if (role === "hod") return "hod";
  if (role === "juror") return "juror";
  return "other";
}

function normalizeSource(source: string): V3PersonalHistorySource {
  if (source === "hod_claim") return "hod_claim";
  if (source === "hod_assignment") return "hod_assignment";
  if (source === "jury_membership") return "jury_membership";
  return "other";
}

export function parseV3PersonalHistory(value: unknown): V3PersonalHistoryBundle {
  const parsed = projectionSchema.safeParse(value);
  if (!parsed.success) return unavailableV3PersonalHistory();

  return {
    schemaReady: true,
    viewerId: parsed.data.viewer_id,
    generatedAt: parsed.data.generated_at,
    items: parsed.data.items.map((item) => ({
      id: item.id,
      editionId: item.edition_id,
      editionNumber: item.edition_number,
      editionName: item.edition_name,
      countryId: item.country_id,
      countryCode: item.country_code,
      countryName: item.country_name,
      role: normalizeRole(item.role),
      startedAt: item.started_at,
      endedAt: item.ended_at,
      source: normalizeSource(item.source),
      state: item.state,
    })),
  };
}
