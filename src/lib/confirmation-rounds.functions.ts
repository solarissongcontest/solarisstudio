import { createServerFn } from "@tanstack/react-start";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";


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
    const db = createConfirmationPublicRuntimeClient();
    const { data, error } = await db.rpc("public_confirmation_rounds");

    if (error) {
      console.error("Could not load public confirmation rounds:", error);
      throw new Error("Confirmation rounds could not be loaded.");
    }

    return Array.isArray(data) ? (data as PublicRound[]) : [];
  },
);
