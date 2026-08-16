import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Flag } from "lucide-react";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export const Route = createFileRoute("/confirmations/admin/countries")({
  head: () => ({ meta: [{ title: "Confirmation Countries — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: CountriesPage,
});

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  review_status: string | null;
  removed?: boolean | null;
};

type ResponseRow = {
  id: string;
  country: string;
  instagram_username: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  submitted_at: string;
  internal_entries: Entry | null;
  national_finals: {
    id: string;
    nf_name: string | null;
    winning_entry_id: string | null;
    national_final_entries: Entry[];
  } | null;
  submission_rounds: { id: string; name: string; edition_id: string } | null;
  editions: { id: string; name: string; edition_number: number } | null;
};

function countryStatus(submission: ResponseRow) {
  if (!submission.participating) return "Not participating";

  if (submission.selection_method === "internal") {
    const entry = submission.internal_entries;
    if (!entry || submission.entry_unknown || !entry.song_title) return "Internal entry not submitted";
    if (entry.review_status === "declined") return "Internal entry declined";
    if (entry.review_status === "accepted") return "Internal entry accepted";
    return "Internal entry submitted";
  }

  if (submission.selection_method === "national_final") {
    const nf = submission.national_finals;
    const active = (nf?.national_final_entries ?? []).filter((entry) => !entry.removed && entry.review_status !== "removed");
    if (!active.length) return "NF entries not submitted";
    const declined = active.filter((entry) => entry.review_status === "declined").length;
    if (declined === 1) return "NF entry declined";
    if (declined > 1) return `${declined} NF entries declined`;
    if (active.some((entry) => !entry.review_status || entry.review_status === "pending")) return "NF entries pending review";
    if (active.every((entry) => entry.review_status === "accepted")) {
      const winnerActive = Boolean(nf?.winning_entry_id) && active.some((entry) => entry.id === nf?.winning_entry_id);
      return winnerActive ? "NF complete" : "NF incomplete";
    }
    return "NF incomplete";
  }

  return "Entry not submitted";
}

function responseLabel(submission: ResponseRow) {
  if (!submission.participating) return "Not participating";
  if (submission.selection_method === "internal") {
    return submission.internal_entries?.song_title ? "Song submitted" : "Awaiting song";
  }
  if (submission.selection_method === "national_final") {
    const active = (submission.national_finals?.national_final_entries ?? []).filter((entry) => !entry.removed);
    return active.length ? `${active.length} NF ${active.length === 1 ? "entry" : "entries"}` : "Awaiting NF entries";
  }
  return "Awaiting selection method";
}

function CountriesPage() {
  const navigate = useNavigate();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [copied, setCopied] = useState<"countries" | "status" | null>(null);
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
        const selected = editionRows.find((item) => item.status === "active")?.id ?? editionRows[0]?.id ?? "";
        const { data, error: loadError } = await confirmationsSupabase.rpc("admin_confirmation_responses");
        if (loadError) throw loadError;
        if (!alive) return;
        setEditions(editionRows);
        setEditionId(selected);
        setRows(Array.isArray(data) ? (data as unknown as ResponseRow[]) : []);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load countries.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const scopedRows = useMemo(
    () => rows.filter((row) => !editionId || row.editions?.id === editionId),
    [rows, editionId],
  );

  const countries = useMemo(() => {
    const map = new Map<string, ResponseRow[]>();
    for (const row of scopedRows) {
      const list = map.get(row.country) ?? [];
      list.push(row);
      map.set(row.country, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedRows]);

  const participatingStatuses = useMemo(() => {
    return countries
      .map(([country, list]) => {
        const latest = list.find((row) => row.participating);
        return latest ? { country, submission: latest, status: countryStatus(latest) } : null;
      })
      .filter(Boolean) as Array<{ country: string; submission: ResponseRow; status: string }>;
  }, [countries]);

  async function copy(text: string, type: "countries" | "status") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied((current) => (current === type ? null : current)), 1600);
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/countries" />

        <header className="mb-7">
          <div className="flex items-center gap-2 text-sky-100/70"><Flag className="size-4" /><p className="text-[10px] uppercase tracking-[0.22em]">Delegation overview</p></div>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Countries</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/55">Each delegation and everything it submitted in the selected edition, grouped by country.</p>
        </header>

        <div className="confirmations-surface mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Label>Edition</Label>
            <select value={editionId} onChange={(event) => setEditionId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none">
              {editions.map((edition) => <option key={edition.id} value={edition.id}>{`SSC ${edition.edition_number} — ${edition.name}`}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!participatingStatuses.length} onClick={() => void copy(participatingStatuses.map((item) => item.country).join(", "), "countries")}>{copied === "countries" ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === "countries" ? "Copied" : "Copy countries"}</Button>
            <Button variant="outline" size="sm" disabled={!participatingStatuses.length} onClick={() => void copy(participatingStatuses.map((item) => `${item.country} (${item.status})`).join("\n"), "status")}>{copied === "status" ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === "status" ? "Copied" : "Copy status list"}</Button>
          </div>
        </div>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading countries…</div> : error ? <div className="confirmations-surface border-red-300/20 p-6 text-sm text-red-100">{error}</div> : (
          <div className="space-y-3">
            <div className="text-sm text-white/42"><span className="font-medium text-white">{participatingStatuses.length}</span> participating</div>
            {countries.map(([country, list]) => {
              const latest = list[0]!;
              const participating = list.some((row) => row.participating);
              const latestParticipating = list.find((row) => row.participating) ?? latest;
              return (
                <section key={country} className="confirmations-surface overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-medium text-white">{country}</h2>{!participating ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/35">Not participating</span> : null}</div><p className="mt-1 text-xs text-white/38">@{latest.instagram_username.replace(/^@/, "")}</p></div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] text-white/50">{countryStatus(latestParticipating)}</span>
                  </div>
                  <div className="divide-y divide-white/8 border-t border-white/8">
                    {list.map((submission) => (
                      <Link key={submission.id} to="/confirmations/admin/responses/$id" params={{ id: submission.id }} className="flex flex-col gap-1 px-5 py-3 transition hover:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-white/38">{submission.submission_rounds?.name ?? "Round"}</span>
                        <span className="text-sm text-white/65">{responseLabel(submission)}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
            {!countries.length ? <div className="confirmations-surface p-8 text-center text-sm text-white/50">No responses in this edition yet.</div> : null}
          </div>
        )}
      </main>
    </div>
  );
}
