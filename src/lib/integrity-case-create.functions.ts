import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { IntegrityCategory } from "@/lib/integrity";

function createAnonymousIntegrityClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration for the Integrity Centre.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: undefined,
    },
  });
}

async function anonymousRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = createAnonymousIntegrityClient();
  const { data, error } = await (client as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const categorySchema = z.enum([
  "voting_integrity",
  "vote_coordination",
  "entry_eligibility",
  "account_abuse",
  "conduct",
  "safety",
  "privacy",
  "technical_exploit",
  "tsbc_conduct",
  "other",
]);

const operationIdentitySchema = z.object({
  operationId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[0-9a-f]{64}$/),
});

export const createIdempotentAnonymousIntegrityCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    operationIdentitySchema
      .extend({
        category: categorySchema,
        summary: z.string().trim().min(5).max(180),
        details: z.string().trim().min(20).max(12000),
        observedFacts: z.string().trim().max(8000).optional().default(""),
        uncertainties: z.string().trim().max(6000).optional().default(""),
        relatedCountries: z
          .array(z.string().trim().min(1).max(80))
          .max(12)
          .optional()
          .default([]),
        editionReference: z.string().trim().max(80).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) =>
    anonymousRpc<{
      ok: true;
      operation_id: string;
      case_id: string;
      case_code: string;
      recovery_key: string;
      status: string;
      priority: string;
      created_at: string;
      replayed: boolean;
    }>("v3_public_create_anonymous_integrity_case", {
      p_operation_id: data.operationId,
      p_idempotency_key: data.idempotencyKey,
      p_category: data.category satisfies IntegrityCategory,
      p_summary: data.summary,
      p_details: data.details,
      p_observed_facts: data.observedFacts || null,
      p_uncertainties: data.uncertainties || null,
      p_related_countries: data.relatedCountries,
      p_edition_reference: data.editionReference || null,
      p_case_kind: "report",
    }),
  );
