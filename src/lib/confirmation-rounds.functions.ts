import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

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

export const getPublicRounds = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicRound[]> => {
    const db = getConfirmationsSupabase();
    const { data, error } = await db.rpc("public_confirmation_rounds");

    if (error) {
      console.error("Could not load public confirmation rounds:", error);
      throw new Error("Confirmation rounds could not be loaded.");
    }

    return Array.isArray(data) ? (data as PublicRound[]) : [];
  },
);
