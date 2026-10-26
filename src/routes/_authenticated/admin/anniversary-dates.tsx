import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, CircleAlert, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminConfirmSheet, AdminPageHeader } from "@/components/admin/AdminUI";
import { editionLabel, useEditions, type Edition } from "@/lib/data";
import {
  applyAnniversaryDate,
  previewAnniversaryDate,
  type AnniversaryDatePreview,
} from "@/lib/v3-anniversary-dates";

export const Route = createFileRoute("/_authenticated/admin/anniversary-dates")({
  validateSearch: (search: Record<string, unknown>): { edition?: string } => ({
    edition:
      typeof search.edition === "string" && search.edition.trim() ? search.edition : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Anniversary Dates — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnniversaryDatesPage,
});

type DatedEdition = Edition & { event_date?: string | null };

type PendingDateReview = {
  editionLabel: string;
  preview: AnniversaryDatePreview;
  operationId: string;
  idempotencyKey: string;
  reason: string;
};

function dateFor(edition: Edition) {
  return (edition as DatedEdition).event_date ?? "";
}

function errorText(error: unknown) {
  if (error && typeof error === "object") {
    const row = error as { code?: unknown; message?: unknown };
    if (row.code === "40001" || row.message === "VERSION_CONFLICT") {
      return "This edition changed after the review was prepared. Nothing was overwritten. Refresh the canonical state and review the date again.";
    }
    if (row.message === "AUTHORIZATION") {
      return "Your current Organizer access does not allow Storytelling or edition management for this edition.";
    }
    if (typeof row.message === "string" && row.message.trim()) return row.message;
  }
  return "Solaris could not apply the historical edition date change.";
}

function AnniversaryDatesPage() {
  const search = Route.useSearch();
  const { data: editions = [], isLoading } = useEditions();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [auditReason, setAuditReason] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const prepareDateReview = async (edition: Edition) => {
    const reason = auditReason.trim();
    if (reason.length < 5) {
      setMessage(null);
      setError("Add an audit reason of at least 5 characters before reviewing a historical date change.");
      return;
    }

    const nextDate = drafts[edition.id] ?? dateFor(edition);
    setSavingId(edition.id);
    setMessage(null);
    setError(null);

    try {
      const preview = await previewAnniversaryDate(edition.id, nextDate || null);
      if (preview.editionId !== edition.id) {
        throw new Error("Solaris returned a different edition than the one being reviewed.");
      }

      const operationId = crypto.randomUUID();
      setPendingReview({
        editionLabel: editionLabel(edition),
        preview,
        operationId,
        idempotencyKey: `anniversary-date:${edition.id}:${operationId}`,
        reason,
      });
    } catch (previewError) {
      setError(errorText(previewError));
    } finally {
      setSavingId(null);
    }
  };

  const applyReviewedDate = async () => {
    if (!pendingReview) return;

    setSavingId(pendingReview.preview.editionId);
    setMessage(null);
    setError(null);

    try {
      const receipt = await applyAnniversaryDate({
        preview: pendingReview.preview,
        reason: pendingReview.reason,
        operationId: pendingReview.operationId,
        idempotencyKey: pendingReview.idempotencyKey,
      });

      setDrafts((current) => {
        const next = { ...current };
        delete next[pendingReview.preview.editionId];
        return next;
      });
      setPendingReview(null);
      await qc.invalidateQueries({ queryKey: ["editions"] });
      setMessage(
        `${pendingReview.editionLabel} date saved${receipt.eventDate ? ` as ${receipt.eventDate}` : " as unknown"}. Operation ${receipt.operationId.slice(0, 8)}… is available for reconciliation.`,
      );
    } catch (applyError) {
      setError(errorText(applyError));
      await qc.invalidateQueries({ queryKey: ["editions"] });
    } finally {
      setSavingId(null);
    }
  };

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
          <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {!error && message ? (
          <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">
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

        <AdminCard className="mb-4">
          <AdminCardHeader
            eyebrow="Audit trail"
            title="Reason for historical changes"
            description="The governed System command records this reason with the exact before/after date, actor, version and durable operation receipt."
          />
          <input
            aria-label="Reason for historical date changes"
            value={auditReason}
            onChange={(event) => setAuditReason(event.target.value)}
            placeholder="e.g. Correct SSC 12 Grand Final date from the official archive"
            className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </AdminCard>

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
                const saving = savingId === edition.id;
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
                      disabled={!changed || saving}
                      className="admin-action-primary min-w-24 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="size-4" /> {saving ? "Checking…" : "Review"}
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
            if (!savingId) setPendingReview(null);
          }}
          onConfirm={applyReviewedDate}
          title="Apply historical edition date?"
          description={
            pendingReview ? (
              <div className="space-y-3 text-sm leading-6">
                <p>
                  Review the canonical archive change for <strong>{pendingReview.editionLabel}</strong>.
                  The server bound this review to edition revision {pendingReview.preview.expectedVersion}.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Before
                    </span>
                    <strong className="mt-1 block text-foreground">
                      {pendingReview.preview.previousEventDate ?? "Unknown date"}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Stored year: {pendingReview.preview.previousYear ?? "unknown"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      After
                    </span>
                    <strong className="mt-1 block text-foreground">
                      {pendingReview.preview.eventDate ?? "Unknown date"}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Stored year: {pendingReview.preview.year ?? "unknown"}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Audit reason
                  </span>
                  <span className="mt-1 block text-foreground">{pendingReview.reason}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Apply revalidates authorization and the exact edition version inside the database
                  transaction. A stale review is rejected, retries reuse one operation identity, and
                  a lost response is reconciled from the durable receipt instead of repeating the write.
                </p>
              </div>
            ) : (
              "Review the exact edition date change before applying it."
            )
          }
          confirmLabel="Apply reviewed date"
          confirmationText={pendingReview?.editionLabel}
          confirmationHint={
            pendingReview ? `Type ${pendingReview.editionLabel} to confirm this historical date change` : undefined
          }
          busy={Boolean(savingId)}
          danger
        />
      </div>
    </AdminPage>
  );
}
