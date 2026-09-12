import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AnonymousCaseSnapshot, IntegrityCategory } from "@/lib/integrity";

function createAnonymousIntegrityClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration for the Integrity Centre.");
  }

  // Deliberately create a sessionless client for fully anonymous reports.
  // A signed-in Solaris browser session is never forwarded by these functions.
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

export const createAnonymousIntegrityCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
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
      ok: boolean;
      case_code: string;
      recovery_key: string;
      status: string;
      priority: string;
      created_at: string;
    }>("public_create_anonymous_integrity_case", {
      _category: data.category satisfies IntegrityCategory,
      _summary: data.summary,
      _details: data.details,
      _observed_facts: data.observedFacts || null,
      _uncertainties: data.uncertainties || null,
      _related_countries: data.relatedCountries,
      _edition_reference: data.editionReference || null,
    }),
  );

export const getAnonymousIntegrityCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        caseCode: z.string().trim().min(5).max(32),
        recoveryKey: z.string().trim().min(12).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data }) =>
    anonymousRpc<{
      ok: boolean;
      error?: string;
      snapshot?: AnonymousCaseSnapshot;
    }>("public_get_anonymous_integrity_case", {
      _case_code: data.caseCode,
      _recovery_key: data.recoveryKey,
    }),
  );

export const replyToAnonymousIntegrityCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        caseCode: z.string().trim().min(5).max(32),
        recoveryKey: z.string().trim().min(12).max(80),
        body: z.string().trim().min(2).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data }) =>
    anonymousRpc<{
      ok: boolean;
      error?: string;
      snapshot?: AnonymousCaseSnapshot;
    }>("public_reply_anonymous_integrity_case", {
      _case_code: data.caseCode,
      _recovery_key: data.recoveryKey,
      _body: data.body,
    }),
  );
