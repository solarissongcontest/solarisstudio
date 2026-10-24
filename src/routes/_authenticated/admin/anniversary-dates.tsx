import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, CircleAlert, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminConfirmSheet, AdminPageHeader } from "@/components/admin/AdminUI";
import { editionLabel, useEditions, type Edition } from "@/lib/data";
import { reportSupabaseError } from "@/lib/errors";
import {
  applyAnniversaryDateChange,
  createAnniversaryDateOperation,
  loadAnniversaryDateSnapshot,
  sameAnniversaryDateSnapshot,
  type AnniversaryDateOperation,
  type AnniversaryDateSnapshot,
} from "@/lib/v3-organizer-anniversary-date";
import { resolveSolarisV6OperationRecovery } from "@/lib/solaris-v6-operation-recovery";

export const Route = createFileRoute("/_authenticated/admin/anniversary-dates")({
  validateSearch: (search: Record<string, unknown>): { edition?: string } => ({
    edition:
      typeof search.edition === "string" && search.edition.trim() ? search.edition : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Anniversary Dates — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnniversaryDatesPage,
});

type DatedEdition = Edition & { event_date?: string | null };

type PendingDateReview = {
  snapshot: AnniversaryDateSnapshot;
  editionLabel: string;
  nextDate: string | null;
  nextYear: number | null;
  operation: AnniversaryDateOperation;
  reason: string;
  attempted: boolean;
};

function dateFor(edition: Edition) {
  return (edition as DatedEdition).event_date ?? "";
}

function yearFromDate(value: string) {
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function AnniversaryDatesPage() {
  const search = Route.useSearch();
  const { data: editions = [], isLoading } = useEditions();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyEditionId, setBusyEditionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingDateReview | null>(null);

  const sorted = useMemo(
    () => [...editions].sort((a, b) => (a.edition_number ?? 9999) - (b.edition_number ?? 9999)),
    [editions],
  );
  const datedCount = sorted.filter((edition) => dateFor(edition)).length;

  useEffect(() => {
    if (isLoading || !search.edition) return;

    const row = document.getElementById(`edition-date-${search.edition}`);
    if (!row) return;

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = row.querySelector<HTMLInputElement>('input[type="date"]');
    const timer = window.setTimeout(() => input?.focus(), 250);
    return () => window.clearTimeout(timer);
  }, [isLoading, search.edition, sorted.length]);

  async function prepareDateReview(edition: Edition) {
    const nextDate = (drafts[edition.id] ?? dateFor(edition)) || null;
    setBusyEditionId(edition.id);
    setMessage(null);
    setError(null);

    try {
      const snapshot = await loadAnniversaryDateSnapshot(edition.id);
      if (snapshot.eventDate === nextDate) {
        setDrafts((current) => {
          const next = { ...current };
          delete next[edition.id];
          return next;
        });
        await qc.invalidateQueries({ queryKey: ["editions"] });
        setMessage(`${editionLabel(edition)} already has that authoritative date.`);
        return;
      }

      const operation = createAnniversaryDateOperation(snapshot, nextDate);
      setPendingReview({
        snapshot,
        editionLabel: editionLabel(edition),
        nextDate,
        nextYear: nextDate ? yearFromDate(nextDate) : snapshot.year,
        operation,
        reason: "",
        attempted: false,
      });
    } catch (caught) {
      setError(
        reportSupabaseError(
          caught,
          `Could not load the authoritative ${editionLabel(edition)} date state. Nothing was changed.`,
        ),
      );
    } finally {
      setBusyEditionId(null);
    }
  }

  async function applyReviewedDate() {
    if (!pendingReview) return;
    if (pendingReview.reason.trim().length < 5) {
      setError("Add a short reason of at least 5 characters before applying this historical change.");
      return;
    }

    let review = pendingReview;
    setBusyEditionId(review.snapshot.editionId);
    setMessage(null);
    setError(null);

    try {
      if (!review.attempted) {
        const fresh = await loadAnniversaryDateSnapshot(review.snapshot.editionId);
        if (!sameAnniversaryDateSnapshot(fresh, review.snapshot)) {
          setPendingReview(null);
          setError(
            `${review.editionLabel} changed while this review was open. Nothing was changed. Refresh the edition state and review the date again.`,
          );
          await qc.invalidateQueries({ queryKey: ["editions"] });
          return;
        }

        review = { ...review, reason: review.reason.trim(), attempted: true };
        setPendingReview(review);
      }

      const result = await applyAnniversaryDateChange({
        snapshot: review.snapshot,
        eventDate: review.nextDate,
        reason: review.reason,
        operation: review.operation,
      });

      setDrafts((current) => {
        const next = { ...current };
        delete next[review.snapshot.editionId];
        return next;
      });
      setPendingReview(null);
      await qc.invalidateQueries({ queryKey: ["editions"] });
      setMessage(
        `${review.editionLabel} date saved${result.after.eventDate ? ` as ${result.after.eventDate}` : " as unknown"}. Operation ${result.operationId}${result.replayed ? " was recovered from its durable receipt" : " completed"}.`,
      );
    } catch (caught) {
      const recovery = resolveSolarisV6OperationRecovery(caught, {
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        stableOperationIdentity: Boolean(review.operation.operationId),
      });

      if (recovery.keepOperationOpen) {
        setPendingReview(review);
        setError(
          `${recovery.title}. ${recovery.description} Operation ${review.operation.operationId} remains the only operation for this reviewed change.`,
        );
        return;
      }

      setPendingReview(null);
      if (recovery.shouldRefreshCanonical) {
        await qc.invalidateQueries({ queryKey: ["editions"] });
      }
      setError(`${recovery.title}. ${recovery.description}`);
    } finally {
      setBusyEditionId(null);
    }
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Historical archive"
          title="Edition dates"
          description="Enter the Grand Final or main event date for every SSC edition. Anniversary-year statistics use these exact dates to determine whether an edition happened before or after 17 September."
          actions={
            <Link to="/admin/anniversary" className="admin-action-secondary">
              Anniversary preview
            </Link>
          }
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100" role="alert">
            {error}
          </div>
        ) : null}
        {!error && message ? (
          <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100" role="status">
            {message}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <AdminCard className="!p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Exact dates
            </p>
            <p className="mt-1 text-2xl font-black">{datedCount}</p>
          </AdminCard>
          <AdminCard className="!p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Still missing
            </p>
            <p className="mt-1 text-2xl font-black">{Math.max(0, sorted.length - datedCount)}</p>
          </AdminCard>
        </div>

        <AdminCard>
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-sm leading-relaxed text-amber-50/85">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Use the actual Grand Final date. If an edition had no Grand Final, use its main event
              date. Do not estimate from the year or edition number.
            </p>
          </div>

          {isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading editions…</p>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {sorted.map((edition) => {
                const current = dateFor(edition);
                const value = drafts[edition.id] ?? current;
                const changed = value !== current;
                const busy = busyEditionId === edition.id;
                const focused = search.edition === edition.id;

                return (
                  <div
                    id={`edition-date-${edition.id}`}
                    key={edition.id}
                    className={`grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center ${
                      focused ? "-mx-2 rounded-xl bg-primary/[0.05] px-2 ring-1 ring-primary/20" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {current ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
                        ) : (
                          <CalendarDays className="size-4 shrink-0 text-amber-300" />
                        )}
                        <p className="font-semibold">{editionLabel(edition)}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {edition.name}
                        {edition.year ? ` · ${edition.year}` : " · year unknown"}
                      </p>
                    </div>

                    <input
                      type="date"
                      value={value}
                      onChange={(event) =>
                        setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [edition.id]: event.target.value,
                        }))
                      }
                      className="min-h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-primary/50"
                      aria-label={`${editionLabel(edition)} event date`}
                    />

                    <button
                      type="button"
                      onClick={() => void prepareDateReview(edition)}
                      disabled={!changed || busy}
                      className="admin-action-primary min-w-24 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="size-4" /> {busy ? "Checking…" : "Review"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        <AdminConfirmSheet
          open={Boolean(pendingReview)}
          onClose={() => {
            if (!busyEditionId) setPendingReview(null);
          }}
          onConfirm={applyReviewedDate}
          title={pendingReview?.attempted ? "Retry the same Anniversary operation?" : "Apply historical edition date?"}
          description={
            pendingReview ? (
              <div className="space-y-3 text-sm leading-6">
                <p>
                  Review the exact authoritative archive change for <strong>{pendingReview.editionLabel}</strong>.
                  Anniversary statistics and historical date-based views consume this value.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Before · server snapshot
                    </span>
                    <strong className="mt-1 block text-foreground">
                      {pendingReview.snapshot.eventDate ?? "Unknown date"}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Stored year: {pendingReview.snapshot.year ?? "unknown"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      After
                    </span>
                    <strong className="mt-1 block text-foreground">
                      {pendingReview.nextDate ?? "Unknown date"}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Stored year: {pendingReview.nextYear ?? "unknown"}
                    </span>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-foreground">Reason</span>
                  <textarea
                    value={pendingReview.reason}
                    onChange={(event) =>
                      setPendingReview((current) =>
                        current && !current.attempted ? { ...current, reason: event.target.value } : current,
                      )
                    }
                    disabled={pendingReview.attempted}
                    rows={3}
                    minLength={5}
                    placeholder="Why is this historical date being changed?"
                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-65"
                  />
                </label>
                <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">R2 · exact edition</span>
                  <br />Operation {pendingReview.operation.operationId}
                  <br />Solaris rechecks this exact server snapshot before the first commit. The System command then locks the edition, enforces the reviewed date/year with CAS, records a durable operation receipt and reconciles a lost response using this same operation identity.
                </div>
              </div>
            ) : (
              "Review the exact edition date change before applying it."
            )
          }
          confirmLabel={pendingReview?.attempted ? "Retry same operation" : "Apply reviewed date"}
          confirmationText={pendingReview?.editionLabel}
          confirmationHint={
            pendingReview ? `Type ${pendingReview.editionLabel} to confirm this historical date change` : undefined
          }
          busy={Boolean(busyEditionId)}
          danger
        />
      </div>
    </AdminPage>
  );
}
