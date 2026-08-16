import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function getConfirmationsSupabase() {
  const url =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL ||
    process.env["CONFIRMATIONS_SUPABASE_URL"];
  const key =
    import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY ||
    process.env["CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) throw new Error("Missing Confirmations Supabase configuration.");

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

const submitSchema = z.object({
  edition_id: z.string().uuid(),
  source_submission_id: z.string().uuid(),
  country: z.string().trim().min(1).max(80),
  participating: z.boolean(),
  entry_unknown: z.boolean(),
  selection_type: z.enum(["none", "unknown", "internal", "national_final"]),
  national_final_entry_id: z.string().uuid().nullable().optional(),
  artist: z.string().trim().max(160),
  song_title: z.string().trim().max(160),
  song_url: z.string().trim().max(500),
  preview_start: z.string().trim().max(10),
  preview_end: z.string().trim().max(10),
});

export const submitNextInLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return await rpc<{ ok: boolean; error?: string }>("submit_next_in_line", { payload: data });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes("duplicate_song")) return { ok: false as const, error: "duplicate_song" };
      if (message.includes("duplicate_artist")) return { ok: false as const, error: "duplicate_artist" };
      console.error("Next in Line submission failed:", error);
      return { ok: false as const, error: "server" };
    }
  });
