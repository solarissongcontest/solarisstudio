import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  AvailabilityReason,
  RoundAvailability,
} from "@/lib/ssc";

const CONFIRMATIONS_LEGACY_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dm5ycHVxZWhxY2F0b3d4ZnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDcwOTQsImV4cCI6MjEwMTg4MzA5NH0.TsV-Osg8YAqR6jqVLGkDTya97THNAkDtD0S3Ddd6Eu0";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function getConfirmationsSupabase() {
  const url =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL ||
    process.env["CONFIRMATIONS_SUPABASE_URL"];

  const configuredKey =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY ||
    process.env["CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY"];

  const key =
    !configuredKey || configuredKey.startsWith("sb_publishable_")
      ? CONFIRMATIONS_LEGACY_ANON_KEY
      : configuredKey;

  if (!url) {
    throw new Error("Missing Confirmations Supabase configuration.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const db = getConfirmationsSupabase();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const payloadSchema = z.object({
  round_id: z.string().uuid(),
  instagram_username: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
  has_country_account: z.boolean(),
  country_account: z.string().trim().max(80),
  participating: z.boolean(),
  selection_method: z.enum(["internal", "national_final", "unknown", ""]),
  entry_unknown: z.boolean(),
  nf_entries_unknown: z.boolean(),
  artist: z.string().trim().max(160),
  song_title: z.string().trim().max(160),
  song_url: z.string().trim().max(500),
  preview_start: z.string().trim().max(10),
  preview_end: z.string().trim().max(10),
  final_clip_start: z.string().trim().max(10),
  final_clip_end: z.string().trim().max(10),
  replacement_video_required: z.boolean(),
  replacement_video_url: z.string().trim().max(500),
  nf_name: z.string().trim().max(160),
  expected_entry_count: z.string().trim().max(4),
  nf_entries: z.array(z.object({
    artist: z.string().trim().max(160),
    song_title: z.string().trim().max(160),
    song_url: z.string().trim().max(500),
  })).max(60),
  nf_date_type: z.string().max(20),
  nf_exact_date: z.string().max(20),
  nf_approximate_text: z.string().trim().max(200),
  nf_result_date_type: z.string().max(20),
  nf_result_exact_date: z.string().max(20),
  nf_result_approximate_text: z.string().trim().max(200),
  reveal_date_type: z.string().max(20),
  reveal_exact_date: z.string().max(20),
  reveal_approximate_text: z.string().trim().max(200),
  browser_session_id: z.string().trim().max(80).optional(),
  edit_token: z.string().trim().max(120).optional(),
});

export interface PublicRound {
  id: string;
  name: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  response_count: number;
  edition_id: string;
  edition_name: string;
  edition_number: number;
}

export const getPublicRounds = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicRound[]> => {
    const data = await rpc<PublicRound[]>("public_confirmation_rounds", {});
    return Array.isArray(data) ? data : [];
  },
);

export const getRoundAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: { round_id: string }) =>
    z.object({ round_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<RoundAvailability> =>
    rpc<RoundAvailability>("round_availability", { _round_id: data.round_id }),
  );

const duplicateCheckSchema = z.object({
  edition_id: z.string().uuid(),
  submission_id: z.string().uuid().nullable().optional(),
  artist: z.string().trim().max(160),
  song_title: z.string().trim().max(160),
  song_url: z.string().trim().max(500),
});

export const checkEntryDuplicate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => duplicateCheckSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const result = await rpc<{
        duplicate: boolean;
        type: "song" | "artist" | null;
      }>("public_check_entry_duplicate", {
        _edition_id: data.edition_id,
        _submission_id: data.submission_id ?? null,
        _artist: data.artist,
        _song_title: data.song_title,
        _song_url: data.song_url,
      });
      return { ok: true as const, duplicate: result.duplicate, type: result.type };
    } catch (error) {
      console.error("Instant duplicate check failed:", error);
      return { ok: false as const, duplicate: false, type: null };
    }
  });

export const submitConfirmation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }) => {
    const { getClientIp, sha256Hex } = await import("@/lib/request.server");
    const { edit_token, ...rest } = data;
    const payload: Record<string, unknown> = {
      ...rest,
      client_ip: getClientIp(),
      ...(edit_token ? { edit_token_hash: await sha256Hex(edit_token) } : {}),
    };

    try {
      return await rpc<{
        ok: boolean;
        error?: string;
        reason?: AvailabilityReason;
        submission_id?: string;
      }>("submit_confirmation", { payload });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes("duplicate_song")) return { ok: false as const, error: "duplicate_song" };
      if (message.includes("duplicate_artist")) return { ok: false as const, error: "duplicate_artist" };
      return { ok: false as const, error: "server" };
    }
  });

export const lookupSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: { round_id: string; country: string }) =>
    z.object({
      round_id: z.string().uuid(),
      country: z.string().trim().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const result = await rpc<{
      exists: boolean;
      can_edit?: boolean;
      submission?: JsonValue;
    }>("public_lookup_submission", {
      _round_id: data.round_id,
      _country: data.country,
    });

    if (!result.exists) return { exists: false as const, canEdit: false as const, submission: null };
    if (!result.can_edit) return { exists: true as const, canEdit: false as const, submission: null };
    return { exists: true as const, canEdit: true as const, submission: result.submission ?? null };
  });

const draftSchema = z.object({
  round_id: z.string().uuid(),
  browser_session_id: z.string().trim().min(1).max(80),
  payload_json: z.string().max(200_000),
});

export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data }) => {
    const { getClientIp } = await import("@/lib/request.server");
    let parsed: { payload?: Record<string, unknown>; step?: number };
    try {
      parsed = JSON.parse(data.payload_json) as typeof parsed;
    } catch {
      return { ok: false as const, saved_at: "" };
    }
    const form = parsed.payload ?? {};
    return rpc<{ ok: boolean; saved_at: string }>("public_save_draft", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
      _payload: parsed,
      _instagram_username: typeof form["instagram_username"] === "string" ? form["instagram_username"] : "",
      _country: typeof form["country"] === "string" ? form["country"] : "",
      _ip: getClientIp(),
    });
  });

export const loadDraft = createServerFn({ method: "POST" })
  .inputValidator((data: { round_id: string; browser_session_id: string }) =>
    z.object({
      round_id: z.string().uuid(),
      browser_session_id: z.string().trim().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const result = await rpc<{
      found: boolean;
      payload?: unknown;
      updated_at?: string;
    }>("public_load_draft", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
    });

    if (!result.found) return { found: false as const, payload_json: "", updated_at: "" };
    return {
      found: true as const,
      payload_json: JSON.stringify(result.payload),
      updated_at: result.updated_at ?? "",
    };
  });

export const findMySubmission = createServerFn({ method: "POST" })
  .inputValidator((data: { round_id: string; browser_session_id: string }) =>
    z.object({
      round_id: z.string().uuid(),
      browser_session_id: z.string().trim().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const result = await rpc<{
      found: boolean;
      can_edit?: boolean;
      submission?: {
        id: string;
        country: string;
        instagram_username: string;
        submitted_at: string;
        editing_allowed: boolean;
        locked: boolean;
        [key: string]: JsonValue;
      };
    }>("public_find_my_submission", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
    });

    if (!result.found || !result.submission) {
      return { found: false as const, can_edit: false, submission: null };
    }
    return {
      found: true as const,
      can_edit: result.can_edit === true,
      submission: result.submission,
    };
  });

export const createBrowserEditToken = createServerFn({ method: "POST" })
  .inputValidator((data: { round_id: string; browser_session_id: string }) =>
    z.object({
      round_id: z.string().uuid(),
      browser_session_id: z.string().trim().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const result = await rpc<{
      ok: boolean;
      reason?: string;
      submission_id?: string;
      token?: string;
    }>("public_create_browser_edit_token", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
    });

    if (!result.ok || !result.token) {
      return { ok: false as const, reason: result.reason ?? "unknown", token: null };
    }
    return { ok: true as const, reason: "ok", token: result.token };
  });
