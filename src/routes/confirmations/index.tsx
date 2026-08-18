import "@/confirmations.css";

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
} from "lucide-react";

import { ConfirmationForm } from "@/components/ConfirmationForm";
import { ParticipationServiceShell } from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import { availabilityBadge, computeAvailability, type AvailabilityReason } from "@/lib/ssc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/")({
  head: () => ({
    meta: [
      { title: "Participation Confirmations — Solaris Studio" },
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
  const copy = state === "open" ? "Open" : state === "full" ? "Full" : state === "scheduled" ? "Upcoming" : "Closed";

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
      state === "open" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
      state === "full" && "border-amber-200/25 bg-amber-200/10 text-amber-100",
      state === "scheduled" && "border-sky-200/25 bg-sky-200/10 text-sky-100",
      state === "closed" && "border-border bg-surface text-muted-foreground",
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
    <ParticipationServiceShell
      service="confirmations"
      title={selected ? selected.name : "Confirmations"}
      description={
        selected
          ? `Submit participation and entry details for ${selected.edition_name}. Your progress saves while you work.`
          : "Confirm participation, selection method and entry details for the current Solaris Song Contest edition."
      }
      actions={[
        { to: "/confirmations/recover", label: "Recover response" },
        { to: "/confirmations/next-in-line", label: "Next in Line" },
      ]}
      maxWidth="max-w-4xl"
    >
      <div className="confirmations-theme">
        {selected ? (
          <section>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground transition hover:bg-surface-strong hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Choose another round
            </button>

            <div className="data-panel mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{selected.edition_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">Complete the six-step confirmation form below.</p>
              </div>
              <StatePill round={selected} />
            </div>

            <ConfirmationForm round={selected} availability={roundReason(selected)} />
          </section>
        ) : rounds.length ? (
          <section className="space-y-3">
            <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Available rounds</p>
                <h2 className="mt-1 font-display text-xl font-bold">Choose a confirmation round</h2>
              </div>
              <span className="numeric text-xs text-muted-foreground">{rounds.length}</span>
            </div>

            {rounds.map((round) => {
              const reason = roundReason(round);
              const canOpen = reason === "OPEN";
              const opens = formatDate(round.opens_at);
              const closes = formatDate(round.closes_at);
              const remaining = round.response_limit === null ? null : Math.max(round.response_limit - round.response_count, 0);

              return (
                <article key={round.id} className="data-panel p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">SSC {round.edition_number}</p>
                        <StatePill round={round} />
                      </div>
                      <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">{round.name}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
          <section className="data-panel p-8 text-center sm:p-10">
            <LockKeyhole className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-4 font-display text-xl font-bold sm:text-2xl">No confirmation rounds are available</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              When a confirmation round is published, it will appear here automatically.
            </p>
          </section>
        )}
      </div>
    </ParticipationServiceShell>
  );
}
