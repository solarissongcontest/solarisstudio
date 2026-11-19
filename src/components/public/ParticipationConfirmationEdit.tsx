import { useState } from "react";
import { ArrowRight, ClipboardCheck, RefreshCcw } from "lucide-react";

import { createCountryAccountConfirmationEditToken } from "@/lib/confirmation-country-account";
import { useParticipationConfirmationEdit } from "@/lib/participation-confirmation-edit";

/**
 * Editing an already submitted Confirmation is not a new Confirmation round.
 * The exact same authorized dashboard and edit-token RPC as the maintenance
 * HOD flow govern this action. Never navigate to the maintenance-blocked
 * /confirmations overview as a substitute for an edit token.
 */
export function ParticipationConfirmationEdit() {
  const { actor, query } = useParticipationConfirmationEdit();
  if (!actor) return null;
  // A new country account gets a fresh mutation/error state, not the previous
  // delegation's message. The private query is independently actor-keyed.
  return <ParticipationConfirmationEditInner key={actor} query={query} />;
}

function ParticipationConfirmationEditInner({
  query,
}: {
  query: ReturnType<typeof useParticipationConfirmationEdit>["query"];
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) return null;

  if (query.isError) {
    return (
      <section className="mt-4 rounded-xl border border-border/70 p-4" data-participate-confirmation-edit="unknown">
        <p className="text-sm font-semibold">Confirmation editing status couldn't be checked</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Your saved response has not been changed. We cannot determine whether editing is open.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"
        >
          <RefreshCcw className="size-4" aria-hidden="true" /> Retry
        </button>
      </section>
    );
  }

  const edit = query.data;
  if (!edit || edit.status !== "open") {
    // If token issuance revoked an edit between rendering and click, retain
    // the reason even after the fresh dashboard no longer shows an open editor.
    return error ? (
      <section className="mt-4 rounded-xl border border-border/70 p-4" role="alert" data-participate-confirmation-edit="closed">
        <p className="text-sm font-semibold">Confirmation editing is no longer available</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </section>
    ) : null;
  }

  async function openEditor() {
    if (!edit || edit.status !== "open" || opening) return;
    setError(null);
    setOpening(true);
    try {
      // The RPC rechecks account ownership, lock and editing status at click
      // time. The short-lived token is never included in query cache or SSR.
      const result = await createCountryAccountConfirmationEditToken(edit.roundId);
      if (!result.ok || !result.token) {
        await query.refetch();
        setError(result.reason === "editing_closed"
          ? "Editing is no longer open for this response."
          : result.reason === "locked"
            ? "This response is locked."
            : result.reason === "not_authenticated"
              ? "Your session expired. Sign in again to edit."
              : "The Confirmation editor could not be opened. Check your access and retry.");
        return;
      }
      window.location.assign(`/confirmations/edit/${encodeURIComponent(result.token)}`);
    } catch {
      await query.refetch().catch(() => undefined);
      setError("The Confirmation editor could not be opened. Check your connection and retry.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
      aria-labelledby="participate-edit-confirmation-title"
      data-participate-confirmation-edit="open"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ClipboardCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {edit.changesRequested ? "Changes requested" : "Existing Confirmation · Editing open"}
            </p>
            <h2 id="participate-edit-confirmation-title" className="mt-1 text-base font-semibold">
              {edit.changesRequested ? "Update your submission" : "Continue editing your confirmation"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {edit.countryName ?? "Your delegation"}
              {edit.editionName ? ` · ${edit.editionName}` : ""}.
              {" "}You can update the saved response even when new Confirmations are closed.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={opening}
          onClick={() => void openEditor()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {opening ? "Opening…" : edit.changesRequested ? "Update submission" : "Edit confirmation"}
          {!opening ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
      </div>
      {error ? <p className="mt-3 text-xs text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
