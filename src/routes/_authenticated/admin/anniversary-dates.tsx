import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, CircleAlert, Save } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions, type Edition } from "@/lib/data";
import { reportSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/anniversary-dates")({
  head: () => ({
    meta: [
      { title: "Anniversary Dates — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnniversaryDatesPage,
});

type DatedEdition = Edition & { event_date?: string | null };

function dateFor(edition: Edition) {
  return (edition as DatedEdition).event_date ?? "";
}

function yearFromDate(value: string) {
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function AnniversaryDatesPage() {
  const { data: editions = [], isLoading } = useEditions();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...editions].sort((a, b) => (a.edition_number ?? 9999) - (b.edition_number ?? 9999)),
    [editions],
  );
  const datedCount = sorted.filter((edition) => dateFor(edition)).length;

  const saveDate = async (edition: Edition) => {
    const value = drafts[edition.id] ?? dateFor(edition);
    setSavingId(edition.id);
    setMessage(null);
    setError(null);

    try {
      const year = value ? yearFromDate(value) : edition.year;
      const { error: updateError } = await (supabase as any)
        .from("editions")
        .update({ event_date: value || null, year })
        .eq("id", edition.id);

      if (updateError) {
        setError(reportSupabaseError(updateError, `Could not save the date for ${editionLabel(edition)}.`));
        return;
      }

      setDrafts((current) => {
        const next = { ...current };
        delete next[edition.id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["editions"] });
      setMessage(`${editionLabel(edition)} date saved${value ? ` as ${value}` : " as unknown"}.`);
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

        {error ? <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">{error}</div> : null}
        {!error && message ? <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">{message}</div> : null}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <AdminCard className="!p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Exact dates</p>
            <p className="mt-1 text-2xl font-black">{datedCount}</p>
          </AdminCard>
          <AdminCard className="!p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Still missing</p>
            <p className="mt-1 text-2xl font-black">{Math.max(0, sorted.length - datedCount)}</p>
          </AdminCard>
        </div>

        <AdminCard>
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-sm leading-relaxed text-amber-50/85">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>Use the actual Grand Final date. If an edition had no Grand Final, use its main event date. Do not estimate from the year or edition number.</p>
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

                return (
                  <div key={edition.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {current ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : <CalendarDays className="size-4 shrink-0 text-amber-300" />}
                        <p className="font-semibold">{editionLabel(edition)}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{edition.name}{edition.year ? ` · ${edition.year}` : " · year unknown"}</p>
                    </div>

                    <input
                      type="date"
                      value={value}
                      onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [edition.id]: event.target.value }))}
                      className="min-h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-primary/50"
                      aria-label={`${editionLabel(edition)} event date`}
                    />

                    <button
                      type="button"
                      onClick={() => saveDate(edition)}
                      disabled={!changed || saving}
                      className="admin-action-primary min-w-24 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="size-4" /> {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}
