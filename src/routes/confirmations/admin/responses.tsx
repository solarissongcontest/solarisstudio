import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, LogOut, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/responses")({
  head: () => ({
    meta: [
      { title: "Confirmation Responses — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationResponsesPage,
});

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  review_status: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
  removed?: boolean | null;
  position?: number;
};

type ResponseRow = {
  id: string;
  country: string;
  instagram_username: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reviewed: boolean;
  locked: boolean;
  editing_allowed: boolean;
  submitted_at: string;
  updated_at: string;
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

function overallState(row: ResponseRow) {
  if (!row.participating) return "not-participating";

  if (row.selection_method === "internal") {
    return row.internal_entries?.review_status ?? (row.entry_unknown ? "missing" : "pending");
  }

  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (!active.length) return row.nf_entries_unknown ? "missing" : "pending";
    if (active.some((entry) => entry.review_status === "declined")) return "declined";
    if (active.every((entry) => entry.review_status === "accepted")) return "accepted";
    return "pending";
  }

  return "pending";
}

function StateBadge({ state }: { state: string }) {
  const accepted = state === "accepted";
  const declined = state === "declined";
  const missing = state === "missing";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em]",
        accepted && "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        declined && "border-red-300/30 bg-red-300/10 text-red-100",
        missing && "border-amber-200/25 bg-amber-200/10 text-amber-100",
        !accepted && !declined && !missing && "border-white/10 bg-white/[0.04] text-white/55",
      )}
    >
      {state.replaceAll("-", " ")}
    </span>
  );
}

function ConfirmationResponsesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;

    void (async () => {
      const { data: sessionData } = await confirmationsSupabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        await navigate({ to: "/confirmations/admin/sign-in" });
        return;
      }

      const { data: isAdmin, error: roleError } = await confirmationsSupabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (roleError || isAdmin !== true) {
        if (alive) {
          setError("This account does not have Confirmations admin access.");
          setLoading(false);
        }
        return;
      }

      const { data, error: loadError } = await confirmationsSupabase.rpc("admin_confirmation_responses");

      if (!alive) return;

      if (loadError) {
        setError(loadError.message);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? (data as unknown as ResponseRow[]) : []);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [navigate]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((row) => {
      const internal = row.internal_entries;
      const nfEntries = row.national_finals?.national_final_entries ?? [];
      const text = [
        row.country,
        row.instagram_username,
        row.selection_method ?? "",
        row.submission_rounds?.name ?? "",
        row.editions?.name ?? "",
        internal?.artist ?? "",
        internal?.song_title ?? "",
        ...nfEntries.flatMap((entry) => [entry.artist ?? "", entry.song_title ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
  }, [query, rows]);

  async function signOut() {
    await confirmationsSupabase.auth.signOut();
    await navigate({ to: "/confirmations/admin/sign-in" });
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/confirmations"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs text-white/65 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Confirmations
          </Link>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>

        <header className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">Organiser workspace</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="confirmations-display text-5xl font-normal uppercase leading-none sm:text-6xl">Responses</h1>
              <p className="mt-3 text-sm text-white/55">
                The same live submissions used by the original Confirmations site, including existing internal and National Final entry details.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/65">
              {rows.length} total responses
            </div>
          </div>
        </header>

        <div className="confirmations-surface mb-5 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country, username, artist or song…"
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading responses…</div>
        ) : error ? (
          <div className="confirmations-surface border-red-300/20 p-6">
            <div className="flex items-start gap-3 text-red-100">
              <ShieldAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Responses could not be loaded</p>
                <p className="mt-1 text-sm text-red-100/70">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <section className="grid gap-3 md:grid-cols-2">
            {filtered.map((row) => {
              const state = overallState(row);
              const internal = row.internal_entries;
              const nf = row.national_finals;
              const activeNfEntries = (nf?.national_final_entries ?? []).filter((entry) => !entry.removed);

              return (
                <article key={row.id} className="confirmations-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">
                        {row.editions ? `SSC ${row.editions.edition_number}` : "SSC"} · {row.submission_rounds?.name ?? "Confirmation"}
                      </p>
                      <h2 className="mt-2 truncate text-xl font-medium text-white">{row.country}</h2>
                      <p className="mt-1 truncate text-xs text-white/45">@{row.instagram_username.replace(/^@/, "")}</p>
                    </div>
                    <StateBadge state={state} />
                  </div>

                  <div className="mt-4 rounded-xl border border-white/8 bg-black/10 p-3">
                    {!row.participating ? (
                      <p className="text-sm text-white/55">Not participating</p>
                    ) : row.selection_method === "internal" ? (
                      <>
                        <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Internal selection</p>
                        <p className="mt-1 text-sm font-medium text-white">
                          {internal?.artist || "Unknown artist"} {internal?.song_title ? `— ${internal.song_title}` : ""}
                        </p>
                      </>
                    ) : row.selection_method === "national_final" ? (
                      <>
                        <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">National Final</p>
                        <p className="mt-1 text-sm font-medium text-white">{nf?.nf_name || "National Final"}</p>
                        <p className="mt-1 text-xs text-white/45">{activeNfEntries.length} submitted {activeNfEntries.length === 1 ? "entry" : "entries"}</p>
                      </>
                    ) : (
                      <p className="text-sm text-white/55">Selection method unknown</p>
                    )}
                  </div>

                  {row.selection_method === "national_final" && activeNfEntries.length ? (
                    <div className="mt-3 space-y-1.5">
                      {activeNfEntries.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-white/55">
                            {entry.artist ?? "Unknown artist"} — {entry.song_title ?? "Unknown song"}
                          </span>
                          <StateBadge state={entry.review_status ?? "pending"} />
                        </div>
                      ))}
                      {activeNfEntries.length > 3 ? (
                        <p className="text-[10px] text-white/30">+{activeNfEntries.length - 3} more entries</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-white/35">
                    <span>{new Date(row.submitted_at).toLocaleString()}</span>
                    {row.reviewed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-100/70">
                        <CheckCircle2 className="size-3" /> Reviewed
                      </span>
                    ) : (
                      <span>Needs review</span>
                    )}
                  </div>

                  <Link
                    to="/confirmations/admin/responses/$id"
                    params={{ id: row.id }}
                    className="mt-4 flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                  >
                    Open response →
                  </Link>
                </article>
              );
            })}

            {!filtered.length ? (
              <div className="confirmations-surface p-8 text-center text-sm text-white/55 md:col-span-2">
                No responses match this search.
              </div>
            ) : null}
          </section>
        )}

        <p className="mt-6 text-center text-[10px] text-white/30">
          This view reads the same live response records as the original Confirmations admin.
        </p>
      </main>
    </div>
  );
}
