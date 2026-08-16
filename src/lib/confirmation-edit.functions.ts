import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { PublicRound } from "@/lib/public.functions";

function getConfirmationsSupabase() {
  const url =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL ||
    process.env["CONFIRMATIONS_SUPABASE_URL"];
  const key =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY ||
    process.env["CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
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

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = getConfirmationsSupabase();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const resolveEditToken = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().trim().min(10).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { sha256Hex } = await import("@/lib/request.server");
    const tokenHash = await sha256Hex(data.token);

    const result = await rpc<{
      valid: boolean;
      reason: string;
      submission?: Record<string, unknown>;
      round?: {
        id: string;
        name: string;
        status: string;
        opens_at: string | null;
        closes_at: string | null;
        response_limit: number | null;
        edition_id: string;
        edition_name: string;
        edition_number: number;
      };
    }>("public_resolve_edit_token", {
      _token_hash: tokenHash,
    });

    if (!result.valid || !result.submission || !result.round) {
      return {
        valid: false as const,
        reason: result.reason ?? "invalid",
        submission: null,
        round: null,
      };
    }

    const round: PublicRound = {
      ...result.round,
      response_count: 0,
    };

    return {
      valid: true as const,
      reason: "ok",
      submission: result.submission,
      round,
    };
  });
