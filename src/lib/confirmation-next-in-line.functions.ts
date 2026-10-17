import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";
import {
  parseV3NextInLineProjection,
  parseV3NextInLineReceipt,
  type V3NextInLineProjection,
  type V3NextInLineReceipt,
} from "@/lib/v3-next-in-line";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = createConfirmationPublicRuntimeClient();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function authenticatedRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error("AUTHENTICATION");

  const { data, error } = await (client as any).rpc(name, args);
  if (error) {
    const detail = [error.code, error.message, error.hint]
      .filter((value): value is string => typeof value === "string" && Boolean(value))
      .join(" | ");
    throw new Error(detail || "RPC_FAILED");
  }
  return data as T;
}

export interface NextInLineCountry {
  country: string;
}

export interface NextInLineEdition {
  id: string;
  name: string;
  edition_number: number;
}

export interface NextInLineNfEntry {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  position: number;
}

export type NextInLineSubmissionFailure = {
  ok: false;
  error:
    | "not_authenticated"
    | "not_authorized"
    | "state_changed"
    | "invalid_nf_entry"
    | "duplicate_song"
    | "duplicate_artist"
    | "preview_required"
    | "validation"
    | "reconciliation_pending"
    | "server";
};

export type NextInLineSubmissionReceipt =
  | V3NextInLineReceipt
  | NextInLineSubmissionFailure;

export const getNextInLineCountries = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await rpc<{
      ok: boolean;
      error?: string;
      edition?: NextInLineEdition;
      countries: NextInLineCountry[];
    }>("public_next_in_line_countries", {});
  } catch (error) {
    console.error("Could not load Next in Line countries:", error);
    return { ok: false as const, error: "server", countries: [] as NextInLineCountry[] };
  }
});

// Retained for legacy/non-V3 callers. The V3 participant surface derives its
// authorized countries/candidates from v3_my_next_in_line instead.
export const getNextInLineCountry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        edition_id: z.string().uuid(),
        country: z.string().trim().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      return await rpc<{
        ok: boolean;
        error?: string;
        submission_id?: string;
        country?: string;
        selection_method?: "internal" | "national_final" | "unknown";
        entries?: NextInLineNfEntry[];
      }>("public_next_in_line_country", {
        _edition_id: data.edition_id,
        _country: data.country,
      });
    } catch (error) {
      console.error("Could not load Next in Line country:", error);
      return { ok: false as const, error: "server", entries: [] as NextInLineNfEntry[] };
    }
  });

export const getMyNextInLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ edition_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<V3NextInLineProjection> => {
    const result = await authenticatedRpc<unknown>("v3_my_next_in_line", {
      p_edition_id: data.edition_id,
    });
    return parseV3NextInLineProjection(result, data.edition_id);
  });

const submitSchema = z.object({
  edition_id: z.string().uuid(),
  source_submission_id: z.string().uuid(),
  country: z.string().trim().min(1).max(80),
  participating: z.literal(true),
  entry_unknown: z.literal(false),
  selection_type: z.enum(["internal", "national_final"]),
  national_final_entry_id: z.string().uuid().nullable().optional(),
  artist: z.string().trim().max(160),
  song_title: z.string().trim().max(160),
  song_url: z.string().trim().max(500),
  preview_start: z.string().trim().max(10),
  preview_end: z.string().trim().max(10),
  operation_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(8).max(200),
});

function commandFailure(value: unknown): NextInLineSubmissionFailure | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== false) return null;
  const status = typeof row.status === "string" ? row.status.toLowerCase() : "";
  if (status === "pending" || status === "running") {
    return { ok: false, error: "reconciliation_pending" };
  }
  return { ok: false, error: "server" };
}

function mapCommandError(error: unknown): NextInLineSubmissionFailure {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("authentication")) return { ok: false, error: "not_authenticated" };
  if (message.includes("authorization") || message.includes("42501")) return { ok: false, error: "not_authorized" };
  if (message.includes("state_changed") || message.includes("next in line is closed")) return { ok: false, error: "state_changed" };
  if (message.includes("invalid_nf_entry")) return { ok: false, error: "invalid_nf_entry" };
  if (message.includes("duplicate_song")) return { ok: false, error: "duplicate_song" };
  if (message.includes("duplicate_artist")) return { ok: false, error: "duplicate_artist" };
  if (message.includes("preview_required")) return { ok: false, error: "preview_required" };
  if (message.includes("validation") || message.includes("22023")) return { ok: false, error: "validation" };
  return { ok: false, error: "server" };
}

export const submitNextInLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }): Promise<NextInLineSubmissionReceipt> => {
    const {
      operation_id,
      idempotency_key,
      ...payload
    } = data;

    try {
      const result = await authenticatedRpc<unknown>("v3_submit_next_in_line", {
        payload,
        p_operation_id: operation_id,
        p_idempotency_key: idempotency_key,
      });
      const failure = commandFailure(result);
      if (failure) return failure;
      return parseV3NextInLineReceipt(result);
    } catch (error) {
      const mapped = mapCommandError(error);
      if (mapped.error === "server") {
        console.error("Next in Line submission failed:", error);
      }
      return mapped;
    }
  });
