import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Label } from "@/components/ui/label";
import {
  loadConfirmationCalendar,
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationCalendarRow,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";

export const Route = createFileRoute("/confirmations/admin/calendar")({
  head: () => ({ meta: [{ title: "Confirmation Calendar — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
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
      items.push({
        id: `${row.id}-reveal`,
        country: row.country,
        label: row.selection_method === "national_final" ? "Entries reveal" : "Song reveal / release",
        date: row.reveal_date_type === "exact" ? row.reveal_exact_date : null,
        approx:
          row.reveal_date_type === "immediately"
            ? "Immediately"
            : row.reveal_date_type === "approximate"
              ? row.reveal_approximate_text
              : row.reveal_date_type === "unknown"
                ? "Not known yet"
                : null,
        kind: "reveal",
      });
    }

    if (row.nf_date_type) {
      items.push({
        id: `${row.id}-nf`,
        country: row.country,
        label: `National Final${row.nf_name ? ` — ${row.nf_name}` : ""}`,
        date: row.nf_date_type === "exact" ? row.nf_exact_date : null,
        approx: row.nf_date_type === "approximate" ? row.nf_approximate_text : "Not known yet",
        kind: "nf",
      });
    }

    if (row.nf_result_date_type) {
      items.push({
        id: `${row.id}-nfr`,
        country: row.country,
        label: "National Final result",
        date: row.nf_result_date_type === "exact" ? row.nf_result_exact_date : null,
        approx: row.nf_result_date_type === "approximate" ? row.nf_result_approximate_text : "Not known yet",
        kind: "nf_result",
      });
    }
  }

  return items;
}

function CalendarPage() {
  const navigate = useNavigate();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [roundId, setRoundId] = useState("");
  const [rows, setRows] = useState<ConfirmationCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/confirmations/admin/sign-in" });
          return;
        }
        const editionRows = await loadConfirmationEditions();
        if (!alive) return;
        const selected = editionRows.find((item) => item.status === "active")?.id ?? editionRows[0]?.id ?? "";
        setEditions(editionRows);
        setEditionId(selected);
        setRows(await loadConfirmationCalendar(selected || undefined));
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load release calendar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const selectedEdition = editions.find((edition) => edition.id === editionId) ?? null;

  async function changeScope(nextEditionId: string, nextRoundId: string) {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadConfirmationCalendar(nextEditionId || undefined, nextRoundId || undefined));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load calendar data.");
    } finally {
      setLoading(false);
    }
  }

  const { dated, undated } = useMemo(() => {
    const items = buildItems(rows);
    return {
      dated: items.filter((item) => item.date).sort((a, b) => a.date!.localeCompare(b.date!)),
      undated: items.filter((item) => !item.date),
    };
  }, [rows]);

  const groups = useMemo(() => {
    return dated.reduce<Record<string, CalendarItem[]>>((acc, item) => {
      const key = new Date(`${item.date!}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      (acc[key] ??= []).push(item);
      return acc;
    }, {});
  }, [dated]);

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/calendar" />

        <header className="mb-7">
          <div className="flex items-center gap-2 text-sky-100/70"><CalendarDays className="size-4" /><p className="text-[10px] uppercase tracking-[0.22em]">Organiser workspace</p></div>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Release calendar</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/55">Reveal dates, National Finals and result dates pulled directly from submitted confirmations.</p>
        </header>

        <section className="confirmations-surface mb-5 grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <Label>Edition</Label>
            <select value={editionId} onChange={(event) => {
              const next = event.target.value;
              setEditionId(next);
              setRoundId("");
              void changeScope(next, "");
            }} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none">
              {editions.map((edition) => <option key={edition.id} value={edition.id}>{`SSC ${edition.edition_number} — ${edition.name}`}</option>)}
            </select>
          </div>
          <div>
            <Label>Round</Label>
            <select value={roundId} onChange={(event) => {
              const next = event.target.value;
              setRoundId(next);
              void changeScope(editionId, next);
            }} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none">
              <option value="">All rounds</option>
              {(selectedEdition?.rounds ?? []).map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
            </select>
          </div>
        </section>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading calendar…</div> : error ? <div className="confirmations-surface border-red-300/20 p-6 text-sm text-red-100">{error}</div> : (
          <div className="space-y-5">
            {Object.entries(groups).map(([month, items]) => (
              <section key={month} className="confirmations-surface p-5">
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-white/38">{month}</h2>
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="grid gap-2 rounded-xl border border-white/8 bg-black/10 px-4 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                      <span className="font-medium text-white">{item.country}</span>
                      <span className="text-sm text-white/52">{item.label}</span>
                      <span className="text-xs text-sky-100/75">{new Date(`${item.date!}T12:00:00`).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {!dated.length ? <div className="confirmations-surface p-6 text-sm text-white/45">No exact dates submitted in this scope.</div> : null}

            {undated.length ? (
              <section className="confirmations-surface p-5">
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-white/38">Approximate & unknown</h2>
                <div className="mt-3 space-y-2">
                  {undated.map((item) => (
                    <div key={item.id} className="grid gap-2 rounded-xl border border-white/8 bg-black/10 px-4 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                      <span className="font-medium text-white">{item.country}</span>
                      <span className="text-sm text-white/52">{item.label}</span>
                      <span className="text-xs text-white/38">{item.approx ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
