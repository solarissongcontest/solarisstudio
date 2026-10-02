import { createServerFn } from "@tanstack/react-start";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";

const CONFIRMATIONS_LEGACY_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dm5ycHVxZWhxY2F0b3d4ZnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDcwOTQsImV4cCI6MjEwMTg4MzA5NH0.TsV-Osg8YAqR6jqVLGkDTya97THNAkDtD0S3Ddd6Eu0";

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
