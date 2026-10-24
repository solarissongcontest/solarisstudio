import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, CircleAlert, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminConfirmSheet, AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions, type Edition } from "@/lib/data";
import { reportSupabaseError } from "@/lib/errors";

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
  editionId: string;
  editionLabel: string;
  editionName: string;
  editionNumber: number | null;
  baselineDate: string | null;
  baselineYear: number | null;
  nextDate: string | null;
  nextYear: number | null;
  reason: string;
  operationId: string;
  idempotencyKey: string;
  operationStarted: boolean;
};

type AnniversaryDateSnapshot = {
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  eventDate: string | null;
  year: number | null;
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

  const prepareDateReview = (edition: Edition) => {
    const currentDate = dateFor(edition) || null;
    const nextDate = drafts[edition.id] ?? dateFor(edition);
    const nextYear = nextDate ? yearFromDate(nextDate) : edition.year ?? null;
    const operationId = crypto.randomUUID();

    setMessage(null);
    setError(null);
    setPendingReview({
      editionId: edition.id,
      editionLabel: editionLabel(edition),
      editionName: edition.name,
      editionNumber: edition.edition_number ?? null,
      baselineDate: currentDate,
      baselineYear: edition.year ?? null,
      nextDate: nextDate || null,
      nextYear,
      reason: "",
      operationId,
      idempotencyKey: `anniversary-date:${operationId}`,
      operationStarted: false,
    });
  };

  const applyReviewedDate = async () => {
    if (!pendingReview) return;

    const reason = pendingReview.reason.trim();
    if (reason.length < 5) {
      setError("Add a short reason for this historical date change before applying it.");
      return;
    }

    setSavingId(pendingReview.editionId);
    setMessage(null);
    setError(null);

    try {
      const { data: liveData, error: readError } = await (supabase as any).rpc(
        "studio2_anniversary_date_snapshot",
        { p_edition_id: pendingReview.editionId },
      );

      if (readError) {
        setError(
          reportSupabaseError(
            readError,
            `Could not re-check ${pendingReview.editionLabel} before applying the date change. Nothing was changed.`,
          ),
        );
        return;
      }

      const live = (liveData ?? null) as AnniversaryDateSnapshot | null;
      if (
        !live ||
        live.editionId !== pendingReview.editionId ||
        (live.editionNumber ?? null) !== pendingReview.editionNumber ||
        live.editionName !== pendingReview.editionName ||
        (live.eventDate ?? null) !== pendingReview.baselineDate ||
        (live.year ?? null) !== pendingReview.baselineYear
      ) {
        setPendingReview(null);
        setError(
          `${pendingReview.editionLabel} changed while this review was open. Nothing was changed. Refresh the edition state and review the date again.`,
        );
        await qc.invalidateQueries({ queryKey: ["editions"] });
        return;
      }

      setPendingReview((current) =>
        current && current.operationId === pendingReview.operationId
          ? { ...current, operationStarted: true, reason }
          : current,
      );

      const { error: operationError } = await (supabase as any).rpc(
        "studio2_set_anniversary_date",
        {
          p_edition_id: pendingReview.editionId,
          p_event_date: pendingReview.nextDate,
          p_expected_event_date: pendingReview.baselineDate,
          p_expected_year: pendingReview.baselineYear,
          p_reason: reason,
          p_operation_id: pendingReview.operationId,
          p_idempotency_key: pendingReview.idempotencyKey,
          p_correlation_id: pendingReview.operationId,
        },
      );

      if (operationError) {
        if (operationError.code === "40001" || operationError.message?.includes("VERSION_CONFLICT")) {
          setPendingReview(null);
          setError(
            `${pendingReview.editionLabel} changed immediately before apply, so the reviewed date was not written. Refresh and review it again.`,
          );
          await qc.invalidateQueries({ queryKey: ["editions"] });
          return;
        }

        setError(
          reportSupabaseError(
            operationError,
            `Could not save the date for ${pendingReview.editionLabel}. You can retry this same reviewed operation safely.`,
          ),
        );
        return;
      }

      setDrafts((current) => {
        const next = { ...current };
        delete next[pendingReview.editionId];
        return next;
      });
      setPendingReview(null);
      await qc.invalidateQueries({ queryKey: ["editions"] });
      setMessage(
        `${pendingReview.editionLabel} date saved${pendingReview.nextDate ? ` as ${pendingReview.nextDate}` : " as unknown"}.`,
      );
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
                      onClick={() => prepareDateReview(edition)}
                      disabled={!changed || saving}
                      className="admin-action-primary min-w-24 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="size-4" /> {saving ? "Saving…" : "Review"}
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
                  Review the exact archive change for <strong>{pendingReview.editionLabel}</strong>.
                  Anniversary statistics and historical date-based views consume this value.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Before
                    </span>
                    <strong className="mt-1 block text-foreground">
                      {pendingReview.baselineDate ?? "Unknown date"}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Stored year: {pendingReview.baselineYear ?? "unknown"}
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
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Reason for historical change
                  </span>
                  <textarea
                    value={pendingReview.reason}
                    onChange={(event) =>
                      setPendingReview((current) =>
                        current && !current.operationStarted
                          ? { ...current, reason: event.target.value }
                          : current,
                      )
                    }
                    disabled={pendingReview.operationStarted || Boolean(savingId)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-60"
                    placeholder="Why is this archive date being changed?"
                    aria-label="Reason for historical edition date change"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Solaris re-reads this exact edition from the governed server snapshot immediately
                  before apply. The command then locks the edition and rejects the change if the
                  reviewed date or year moved. If the network drops after commit, retrying this same
                  review reuses its operation identity and reconciles the existing receipt instead of
                  applying the date twice.
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
