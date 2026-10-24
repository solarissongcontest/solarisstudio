import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string; details?: string; hint?: string; code?: string } | null;
  }>;
};

type AuthenticatedRpcClient = RpcClient & {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

type NextInLineRuntimeError = "authentication" | "forbidden" | "server";

async function rpc<T>(client: RpcClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const message = [error.message, error.details, error.hint, error.code]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
    throw new Error(message || `Solaris operation ${name} failed.`);
  }
  return data as T;
}

async function authenticatedClient(): Promise<AuthenticatedRpcClient> {
  const token = getSolarisAccessTokenServer();
  if (!token) throw new Error("AUTHENTICATION");

  const client = createSolarisAuthenticatedClientServer() as unknown as AuthenticatedRpcClient;
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) throw new Error("AUTHENTICATION");
  return client;
}

function classifyRuntimeError(error: unknown): NextInLineRuntimeError {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("authentication") || message.includes("not authenticated")) {
    return "authentication";
  }
  if (message.includes("authorization") || message.includes("forbidden")) {
    return "forbidden";
  }
  return "server";
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

type V3NextInLineCandidate = {
  id: string;
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  position: number;
};

export type NextInLineOperationEvidence = {
  operationId: string;
  correlationId: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type NextInLineSubmissionRevision = {
  revision: number;
  operationId: string | null;
  createdAt: string | null;
};

export type NextInLineExistingSubmission = {
  id: string;
  revision: number;
  selectionType: "internal" | "national_final";
  nationalFinalEntryId: string | null;
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  previewStart: string | null;
  previewEnd: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  lastOperationId: string | null;
  history?: NextInLineSubmissionRevision[];
  lastOperation?: NextInLineOperationEvidence | null;
};

type V3NextInLineContext = {
  country: { id: string; name: string; shortCode: string };
  sourceSubmissionId: string;
  selectionMethod: "internal" | "national_final" | "unknown" | null;
  eligible: boolean;
  candidates: V3NextInLineCandidate[];
  submission: NextInLineExistingSubmission | null;
};

export type V3NextInLineProjection = {
  editionId: string;
  state: "unavailable" | "draft" | "upcoming" | "open" | "submitted" | "closed" | "cancelled";
  window: {
    status: string;
    enabled: boolean;
    opensAt: string | null;
    closesAt: string | null;
    version: number;
    effectiveOpen: boolean;
  } | null;
  contexts: V3NextInLineContext[];
  serverTime: string;
};

async function loadMyProjection(client: RpcClient, editionId: string) {
  return rpc<V3NextInLineProjection>(client, "v3_my_next_in_line", {
    p_edition_id: editionId,
  });
}

function legacyEntry(candidate: V3NextInLineCandidate): NextInLineNfEntry {
  return {
    id: candidate.id,
    artist: candidate.artist,
    song_title: candidate.songTitle,
    song_url: candidate.songUrl,
    position: candidate.position,
  };
}

export const getNextInLineCountries = createServerFn({ method: "GET" }).handler(async () => {
  try {
    // The public RPC remains discovery-only: it resolves the currently active
    // Next in Line edition. Participant eligibility/country scope comes from the
    // authenticated V3 projection below, never from the browser country picker.
    const publicClient = createConfirmationPublicRuntimeClient() as unknown as RpcClient;
    const active = await rpc<{
      ok: boolean;
      error?: string;
      edition?: NextInLineEdition;
      countries: NextInLineCountry[];
    }>(publicClient, "public_next_in_line_countries", {});

    if (!active.ok || !active.edition) {
      return { ...active, countries: [] as NextInLineCountry[] };
    }

    const client = await authenticatedClient();
    const projection = await loadMyProjection(client, active.edition.id);
    const countries = projection.contexts
      .filter((context) => context.eligible)
      .map((context) => ({ country: context.country.name }));

    if (!countries.length) {
      return {
        ok: false as const,
        error: "ineligible" as const,
        edition: active.edition,
        countries,
        state: projection.state,
        editing_open: false,
        server_time: projection.serverTime,
      };
    }

    return {
      ok: true as const,
      edition: active.edition,
      countries,
      state: projection.state,
      editing_open: projection.window?.effectiveOpen === true,
      server_time: projection.serverTime,
    };
  } catch (error) {
    console.error("Could not load authenticated Next in Line context:", error);
    return {
      ok: false as const,
      error: classifyRuntimeError(error),
      countries: [] as NextInLineCountry[],
    };
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
      const client = await authenticatedClient();
      const projection = await loadMyProjection(client, data.edition_id);
      const requested = data.country.trim().toLocaleLowerCase();
      const context = projection.contexts.find(
        (candidate) => candidate.country.name.trim().toLocaleLowerCase() === requested,
      );

      if (!context?.eligible) {
        return { ok: false as const, error: "forbidden", entries: [] as NextInLineNfEntry[] };
      }

      return {
        ok: true as const,
        submission_id: context.sourceSubmissionId,
        country: context.country.name,
        selection_method: context.selectionMethod ?? "unknown",
        entries: context.candidates.map(legacyEntry),
        existing_submission: context.submission,
        state: projection.state,
        editing_open: projection.window?.effectiveOpen === true,
        server_time: projection.serverTime,
      };
    } catch (error) {
      console.error("Could not load authenticated Next in Line country:", error);
      return {
        ok: false as const,
        error: classifyRuntimeError(error),
        entries: [] as NextInLineNfEntry[],
      };
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

type SubmitInput = z.infer<typeof submitSchema>;

type V3NextInLineSubmitResult = {
  ok: boolean;
  submission_id?: string;
  revision?: number;
  operationId?: string;
  receiptId?: string;
  replayed?: boolean;
  unchanged?: boolean;
  error?: string;
};

async function nextInLineIdempotencyKey(data: SubmitInput) {
  // Receipt keys identify the semantic request without persisting artist/song/URL
  // text in plain form. The same semantic submission still hashes to the same
  // actor-scoped key, so a lost response can retry safely.
  const semanticRequest = JSON.stringify({
    editionId: data.edition_id,
    sourceSubmissionId: data.source_submission_id,
    selectionType: data.selection_type,
    nationalFinalEntryId: data.national_final_entry_id ?? null,
    artist: data.artist.trim(),
    songTitle: data.song_title.trim(),
    songUrl: data.song_url.trim(),
    previewStart: data.preview_start.trim(),
    previewEnd: data.preview_end.trim(),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(semanticRequest),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `participant-next-in-line-v3:${fingerprint}`;
}

function submissionMatchesIntent(submission: NextInLineExistingSubmission | null, data: SubmitInput) {
  if (!submission) return false;
  return (
    submission.selectionType === data.selection_type &&
    (submission.nationalFinalEntryId ?? null) === (data.national_final_entry_id ?? null) &&
    (submission.artist ?? "") === data.artist.trim() &&
    (submission.songTitle ?? "") === data.song_title.trim() &&
    (submission.songUrl ?? "") === data.song_url.trim() &&
    (submission.previewStart ?? "") === data.preview_start.trim() &&
    (submission.previewEnd ?? "") === data.preview_end.trim()
  );
}

async function reconcileSubmittedIntent(client: RpcClient, data: SubmitInput) {
  const projection = await loadMyProjection(client, data.edition_id);
  const context = projection.contexts.find(
    (candidate) => candidate.sourceSubmissionId === data.source_submission_id,
  );
  if (!context || !submissionMatchesIntent(context.submission, data)) return null;
  return context.submission;
}

export const submitNextInLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    let client: RpcClient | null = null;
    try {
      client = await authenticatedClient();

      // Resolve the caller-scoped projection before the mutation. This rejects
      // a forged edition/source/country tuple before it reaches the command,
      // while the database remains the final authorization authority.
      const projection = await loadMyProjection(client, data.edition_id);
      const context = projection.contexts.find(
        (candidate) => candidate.sourceSubmissionId === data.source_submission_id,
      );
      if (
        !context?.eligible ||
        context.country.name.trim().toLocaleLowerCase() !== data.country.trim().toLocaleLowerCase()
      ) {
        return { ok: false as const, error: "forbidden" };
      }

      const result = await rpc<V3NextInLineSubmitResult>(client, "v3_submit_next_in_line", {
        payload: data,
        p_operation_id: crypto.randomUUID(),
        p_idempotency_key: await nextInLineIdempotencyKey(data),
      });

      if (result.ok) return result;

      const reconciled = await reconcileSubmittedIntent(client, data);
      if (reconciled) {
        return {
          ok: true as const,
          submission_id: reconciled.id,
          revision: reconciled.revision,
          operationId: reconciled.lastOperationId ?? undefined,
          reconciled: true as const,
        };
      }
      return { ok: false as const, error: "state_changed" };
    } catch (error) {
      // A transport failure may happen after the database committed. Reload the
      // authenticated projection before reporting failure so a lost response
      // cannot make the participant resubmit a completed command blindly.
      if (client) {
        try {
          const reconciled = await reconcileSubmittedIntent(client, data);
          if (reconciled) {
            return {
              ok: true as const,
              submission_id: reconciled.id,
              revision: reconciled.revision,
              operationId: reconciled.lastOperationId ?? undefined,
              reconciled: true as const,
            };
          }
        } catch (reconcileError) {
          console.error("Next in Line reconciliation failed:", reconcileError);
        }
      }

      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes("duplicate_song")) return { ok: false as const, error: "duplicate_song" };
      if (message.includes("duplicate_artist")) return { ok: false as const, error: "duplicate_artist" };
      if (message.includes("invalid_nf_entry")) return { ok: false as const, error: "invalid_nf_entry" };
      if (message.includes("preview_required")) return { ok: false as const, error: "preview_required" };
      if (message.includes("authentication")) return { ok: false as const, error: "authentication" };
      if (message.includes("authorization")) return { ok: false as const, error: "forbidden" };
      if (message.includes("state_changed")) return { ok: false as const, error: "state_changed" };
      console.error("Next in Line submission failed:", error);
      return { ok: false as const, error: "server" };
    }
  });
