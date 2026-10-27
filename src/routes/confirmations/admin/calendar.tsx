import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";

import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { confirmationCalendarEditionsQuery, confirmationCalendarQuery } from "@/lib/v3-organizer-confirmation-calendar";
import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  loadConfirmationCalendar,
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationCalendarRow,
} from "@/integrations/confirmations/admin";

export const Route = createFileRoute("/confirmations/admin/calendar")({
  head: () => ({ meta: [{ title: "Delegation Calendar — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: CalendarPage,
});

type CalendarItem = {
  id: string;
  country: string;
  label: string;
  date: string | null;
  approx: string | null;
  kind: "reveal" | "nf" | "nf_result";
};

function buildItems(rows: ConfirmationCalendarRow[]) {
  const items: CalendarItem[] = [];
  for (const row of rows) {
    if (!row.participating) continue;
    if (row.reveal_date_type) {
      items.push({ id: `${row.id}-reveal`, country: row.country, label: row.selection_method === "national_final" ? "Entries reveal" : "Song reveal / release", date: row.reveal_date_type === "exact" ? row.reveal_exact_date : null, approx: row.reveal_date_type === "immediately" ? "Immediately" : row.reveal_date_type === "approximate" ? row.reveal_approximate_text : row.reveal_date_type === "unknown" ? "Not known yet" : null, kind: "reveal" });
    }
    if (row.nf_date_type) {
      items.push({ id: `${row.id}-nf`, country: row.country, label: `National Final${row.nf_name ? ` · ${row.nf_name}` : ""}`, date: row.nf_date_type === "exact" ? row.nf_exact_date : null, approx: row.nf_date_type === "approximate" ? row.nf_approximate_text : "Not known yet", kind: "nf" });
    }
    if (row.nf_result_date_type) {
      items.push({ id: `${row.id}-nfr`, country: row.country, label: "National Final result", date: row.nf_result_date_type === "exact" ? row.nf_result_exact_date : null, approx: row.nf_result_date_type === "approximate" ? row.nf_result_approximate_text : "Not known yet", kind: "nf_result" });
    }
  }
  return items;
}

function kindLabel(kind: CalendarItem["kind"]) {
  if (kind === "nf") return "National final";
  if (kind === "nf_result") return "Result";
  return "Reveal";
}

function CalendarPage() {
  const actor = useAuthenticatedUser();
  const { editionId: organizerEditionId, setEditionId: setOrganizerEditionId } = useAdminContext();
  const [roundSelection, setRoundSelection] = useState({ editionId: "", roundId: "" });
  const authority = {
    requireAdmin: requireConfirmationsAdmin,
    editions: loadConfirmationEditions,
    calendar: loadConfirmationCalendar,
  };
  const editionsQuery = useQuery(confirmationCalendarEditionsQuery(actor.id, authority));
  const editionRows = editionsQuery.data ?? [];
  const editionId = editionRows.find((item) => item.id === organizerEditionId)?.id ?? "";
  const selectedEdition = editionRows.find((edition) => edition.id === editionId) ?? null;
  // A round selected in another edition never survives the context transition.
  const roundId = roundSelection.editionId === editionId && selectedEdition?.rounds.some(
    (round) => round.id === roundSelection.roundId && round.edition_id === editionId,
  ) ? roundSelection.roundId : "";
  const calendarQuery = useQuery(confirmationCalendarQuery(actor.id, editionId, roundId, authority));
  const rows = calendarQuery.data ?? [];
  const loading = editionsQuery.isPending || (Boolean(editionId) && calendarQuery.isPending);
  const caught = editionsQuery.error ?? calendarQuery.error;
  const error = caught ? (caught instanceof Error ? caught.message : "Could not load delegation calendar.") : null;

  const { dated, undated } = useMemo(() => {
    const items = buildItems(rows);
    return { dated: items.filter((item) => item.date).sort((a, b) => a.date!.localeCompare(b.date!)), undated: items.filter((item) => !item.date) };
  }, [rows]);

  const groups = useMemo(() => dated.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    const key = new Date(`${item.date!}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    (acc[key] ??= []).push(item);
    return acc;
  }, {}), [dated]);

  const upcoming = dated.filter((item) => new Date(`${item.date!}T23:59:59`).getTime() >= Date.now()).length;

  return (
    <AdminPage>
      <div data-v3-organizer-confirmation-calendar="">
        <AdminPageHeader eyebrow="Delegations" title="Calendar" description="Reveal dates, National Finals and result dates collected from delegation submissions for the exact edition selected in Solaris Organizer." />

        <AdminCard className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="admin-section-label">Edition</span>
              <select value={editionId} onChange={(event) => { setOrganizerEditionId(event.target.value); setRoundSelection({ editionId: "", roundId: "" }); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
                <option value="">Select edition…</option>
                {editionRows.map((edition) => <option key={edition.id} value={edition.id}>{`SSC ${edition.edition_number} · ${edition.name}`}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="admin-section-label">Submission round</span>
              <select disabled={!editionId} value={roundId} onChange={(event) => { setRoundSelection({ editionId, roundId: event.target.value }); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30 disabled:opacity-45">
                <option value="">All rounds</option>
                {(selectedEdition?.rounds ?? []).map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
              </select>
            </label>
          </div>
        </AdminCard>

        {!editionId && error ? <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}

        {!editionId && !loading && !error ? (
          <AdminCard>
            <AdminEmptyState
              icon={CalendarDays}
              title="Select an edition"
              description="Delegation Calendar is edition-scoped operational state. Solaris will not load a globally active or first edition when Organizer context is missing or stale."
            />
          </AdminCard>
        ) : !loading && !error ? (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <AdminCard className="!p-3"><p className="admin-section-label">Exact dates</p><p className="mt-2 text-2xl font-bold tracking-tight">{dated.length}</p></AdminCard>
            <AdminCard className="!p-3"><p className="admin-section-label">Upcoming</p><p className="mt-2 text-2xl font-bold tracking-tight">{upcoming}</p></AdminCard>
            <AdminCard className="!p-3"><p className="admin-section-label">Unscheduled</p><p className="mt-2 text-2xl font-bold tracking-tight">{undated.length}</p></AdminCard>
          </div>
        ) : null}

        {editionId ? (
          loading ? (
            <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading calendar…</p></AdminCard>
          ) : error ? (
            <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard>
          ) : (
            <div className="space-y-4">
              {Object.entries(groups).map(([month, items]) => (
                <AdminCard key={month}>
                  <AdminCardHeader eyebrow="Scheduled" title={month} description={`${items.length} delegation event${items.length === 1 ? "" : "s"}`} />
                  <div className="divide-y divide-white/[0.07]">
                    {items.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-muted-foreground"><CalendarDays className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{item.country}</p><AdminStatus tone="info">{kindLabel(item.kind)}</AdminStatus></div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{item.label}</p>
                        </div>
                        <div className="shrink-0 text-right"><p className="text-sm font-semibold text-foreground">{new Date(`${item.date!}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(`${item.date!}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</p></div>
                      </div>
                    ))}
                  </div>
                </AdminCard>
              ))}

              {!dated.length ? <AdminEmptyState icon={CalendarDays} title="No exact dates yet" description="Exact reveal and National Final dates will appear here as delegations submit them." /> : null}

              {undated.length ? (
                <AdminCard>
                  <AdminCardHeader eyebrow="Needs scheduling" title="Approximate & unknown" description="Dates that still need to become concrete before show planning." />
                  <div className="divide-y divide-white/[0.07]">
                    {undated.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-muted-foreground"><Clock3 className="size-4" /></div>
                        <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{item.country}</p><AdminStatus tone="attention">{kindLabel(item.kind)}</AdminStatus></div><p className="mt-1 truncate text-xs text-muted-foreground">{item.label}</p></div>
                        <p className="max-w-[8.5rem] shrink-0 text-right text-xs text-muted-foreground">{item.approx ?? "Not known yet"}</p>
                      </div>
                    ))}
                  </div>
                </AdminCard>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </AdminPage>
  );
}
