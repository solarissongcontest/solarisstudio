import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition } from "@/lib/data";
import type { V3EntryEditorSection } from "@/lib/v3-entry";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";

type RpcResult = { data: unknown; error: unknown };
type AnyClient = {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  from(table: string): any;
};

type AccessResponse = {
  edition_id?: unknown;
  round_id?: unknown;
  can_edit?: unknown;
  reason?: unknown;
};

type EditTokenPayload = {
  ok?: unknown;
  reason?: unknown;
  token?: unknown;
  expires_at?: unknown;
};

export type V3EntryEditLinkResult =
  | {
      ok: true;
      href: string;
      expiresAt: string | null;
    }
  | {
      ok: false;
      reason:
        | "no_current_edition"
        | "no_delegation"
        | "no_submission"
        | "editing_closed"
        | "locked"
        | "unavailable";
    };

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function normalizeEditFailure(value: unknown): V3EntryEditLinkResult {
  const reason = stringOrNull(value);
  if (reason === "locked") return { ok: false, reason: "locked" };
  if (reason === "editing_closed") return { ok: false, reason: "editing_closed" };
  return { ok: false, reason: "unavailable" };
}

/**
 * Opens the canonical Confirmation editor for the signed-in delegation's
 * current-edition response. No browser-provided user, country, edition, round or
 * submission selector is accepted. The optional focus is presentation-only;
 * the existing Confirmation edit-token RPC remains the sole authorization
 * boundary for editing the canonical submission.
 */
export async function createCurrentV3EntryEditLink(
  focus?: V3EntryEditorSection,
): Promise<V3EntryEditLinkResult> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer() as unknown as AnyClient;
  const publicClient = createConfirmationPublicRuntimeClient() as unknown as AnyClient;
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) {
    throw new Error("Solaris session is not authenticated.");
  }

  const editionResult = await publicClient
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(editionResult.error, "Could not resolve the current Solaris edition");
  const edition = resolveCurrentPublicEdition((editionResult.data ?? []) as Edition[]);
  if (!edition) return { ok: false, reason: "no_current_edition" };

  const accessResult = await client.rpc("public_country_account_confirmation_access");
  throwIfError(accessResult.error, "Could not resolve your Entry editing access");
  const access = objectOrNull(accessResult.data);
  if (access?.authenticated !== true || !objectOrNull(access.country)) {
    return { ok: false, reason: "no_delegation" };
  }

  const responses = Array.isArray(access.responses) ? access.responses : [];
  const response = responses
    .map((value) => objectOrNull(value) as AccessResponse | null)
    .find((value) => value && stringOrNull(value.edition_id) === edition.id) ?? null;
  if (!response) return { ok: false, reason: "no_submission" };
  if (response.can_edit !== true) return normalizeEditFailure(response.reason);

  const roundId = stringOrNull(response.round_id);
  if (!roundId) return { ok: false, reason: "unavailable" };

  const editResult = await client.rpc("public_create_country_account_edit_token", {
    _round_id: roundId,
  });
  throwIfError(editResult.error, "Could not open your canonical Entry submission");
  const payload = objectOrNull(editResult.data) as EditTokenPayload | null;
  const editToken = stringOrNull(payload?.token);
  if (payload?.ok !== true || !editToken) return normalizeEditFailure(payload?.reason);

  const focusSearch = focus ? `?focus=${encodeURIComponent(focus)}` : "";
  return {
    ok: true,
    href: `/confirmations/edit/${encodeURIComponent(editToken)}${focusSearch}`,
    expiresAt: stringOrNull(payload.expires_at),
  };
}
