import "@/confirmations.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";

import { ConfirmationForm } from "@/components/ConfirmationForm";
import { Button } from "@/components/ui/button";
import { getPublicRounds, type PublicRound } from "@/lib/public.functions";
import { availabilityBadge, computeAvailability, type AvailabilityReason } from "@/lib/ssc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/")({
  head: () => ({
    meta: [
      { title: "Participation Confirmations — Solaris Song Contest" },
      { name: "description", content: "Confirm your participation and entry details for Solaris Song Contest." },
    ],
  }),
  loader: () => getPublicRounds(),
  component: ConfirmationsPage,
});

function roundReason(round: PublicRound): AvailabilityReason {
  return computeAvailability({
    status: round.status,
    count: round.response_count,
    limit: round.response_limit,
    opens_at: round.opens_at,
    closes_at: round.closes_at,
  });
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StatePill({ round }: { round: PublicRound }) {
  const reason = roundReason(round);
  const state = availabilityBadge(reason);
  const copy = state === "open" ? "OPEN" : state === "full" ? "FULL" : state === "scheduled" ? "UPCOMING" : "CLOSED";

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-medium tracking-[0.18em]",
      state === "open" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
      state === "full" && "border-amber-200/25 bg-amber-200/10 text-amber-100",
      state === "scheduled" && "border-sky-200/25 bg-sky-200/10 text-sky-100",
      state === "closed" && "border-white/10 bg-white/[0.04] text-white/55",
    )}>
      {state === "open" ? <CheckCircle2 className="size-3" /> : state === "scheduled" ? <Clock3 className="size-3" /> : <LockKeyhole className="size-3" />}
      {copy}
    </span>
  );
}

function ConfirmationsPage() {
  const rounds = Route.useLoaderData();
  const initiallyOpen = useMemo(
    () => rounds.length === 1 && roundReason(rounds[0]!) === "OPEN" ? rounds[0]!.id : null,
    [rounds],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initiallyOpen);
  const selected = rounds.find((round) => round.id === selectedId) ?? null;

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs text-white/70 backdrop-blur-xl transition hover:border-white/20 hover:text-white">
            <ArrowLeft className="size-3.5" /> Solaris Studio
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">Participation Portal</span>
        </div>

        <header className="mb-10 text-center sm:mb-12">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-sky-200/70">Solaris Song Contest</p>
          <h1 className="confirmations-display text-5xl font-normal uppercase leading-[0.88] sm:text-7xl">Confirmations</h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-white/58 sm:text-base">
            Confirm your participation, selection method and entry details. Your progress is saved while you work.
          </p>
        </header>

        {selected ? (
          <section>
            <button type="button" onClick={() => setSelectedId(null)} className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-white/55 transition hover:text-white">
              <ArrowLeft className="size-3.5" /> Choose another round
            </button>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{selected.edition_name}</p>
                <h2 className="mt-1 text-xl font-medium text-white">{selected.name}</h2>
              </div>
              <StatePill round={selected} />
            </div>
            <ConfirmationForm round={selected} availability={roundReason(selected)} />
          </section>
        ) : rounds.length ? (
          <section className="space-y-3">
            <div className="mb-5 px-1"><p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Available rounds</p></div>
            {rounds.map((round) => {
              const reason = roundReason(round);
              const canOpen = reason === "OPEN";
              const opens = formatDate(round.opens_at);
              const closes = formatDate(round.closes_at);
              const remaining = round.response_limit === null ? null : Math.max(round.response_limit - round.response_count, 0);

              return (
                <article key={round.id} className="confirmations-surface group p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="text-[10px] uppercase tracking-[0.19em] text-white/42">SSC {round.edition_number}</p>
                        <StatePill round={round} />
                      </div>
                      <h2 className="mt-3 text-2xl font-medium text-white">{round.name}</h2>
                      <p className="mt-2 text-sm text-white/52">
                        {canOpen
                          ? remaining === null ? "Responses are being accepted." : `${remaining} ${remaining === 1 ? "place" : "places"} remaining.`
                          : reason === "NOT_OPEN_YET" && opens ? `Opens ${opens}.`
                            : reason === "DEADLINE_PASSED" && closes ? `Closed ${closes}.`
                              : reason === "RESPONSE_LIMIT_REACHED" ? "This round has reached its response limit."
                                : "This round is currently closed."}
                      </p>
                    </div>
                    <Button type="button" disabled={!canOpen} onClick={() => setSelectedId(round.id)} className="shrink-0">
                      Open confirmation <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="confirmations-surface p-8 text-center sm:p-10">
            <LockKeyhole className="mx-auto size-7 text-white/45" />
            <h2 className="mt-4 text-2xl font-medium text-white">No confirmation rounds are available</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/52">When a confirmation round is published, it will appear here automatically.</p>
          </section>
        )}
      </main>
    </div>
  );
}
