import "@/confirmations.css";

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  PencilLine,
  UserRoundCheck,
} from "lucide-react";

import { ConfirmationForm } from "@/components/ConfirmationForm";
import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import {
  createCountryAccountConfirmationEditToken,
  getCountryConfirmationAccess,
  type CountryConfirmationResponse,
} from "@/lib/confirmation-country-account";
import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import { availabilityBadge, computeAvailability, type AvailabilityReason } from "@/lib/ssc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/")({
  head: () => ({
    meta: [
      { title: "Participation Confirmations — Solaris Studio" },
      {
        name: "description",
        content: "Confirm your participation and entry details for Solaris Song Contest.",
      },
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
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function StatePill({ round }: { round: PublicRound }) {
  const reason = roundReason(round);
  const state = availabilityBadge(reason);
  const copy =
    state === "open"
      ? "Open"
      : state === "full"
        ? "Full"
        : state === "scheduled"
          ? "Upcoming"
          : "Closed";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        state === "open" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
        state === "full" && "border-amber-200/25 bg-amber-200/10 text-amber-100",
        state === "scheduled" && "border-sky-200/25 bg-sky-200/10 text-sky-100",
        state === "closed" && "border-border bg-surface text-muted-foreground",
      )}
    >
      {state === "open" ? (
        <CheckCircle2 className="size-3" />
      ) : state === "scheduled" ? (
        <Clock3 className="size-3" />
      ) : (
        <LockKeyhole className="size-3" />
      )}
      {copy}
    </span>
  );
}

function ConfirmationsPage() {
  const rounds = Route.useLoaderData();
  const initiallyOpen = useMemo(
    () => (rounds.length === 1 && roundReason(rounds[0]!) === "OPEN" ? rounds[0]!.id : null),
    [rounds],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initiallyOpen);
  const [openingRoundId, setOpeningRoundId] = useState<string | null>(null);
  const [accountEditError, setAccountEditError] = useState<string | null>(null);
  const selected = rounds.find((round) => round.id === selectedId) ?? null;

  const accountAccessQuery = useQuery({
    queryKey: ["country-confirmation-access"],
    queryFn: getCountryConfirmationAccess,
    enabled: typeof window !== "undefined",
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const accountAccess = accountAccessQuery.data;
  const accountResponses = accountAccess?.responses ?? [];
  const editableAccountResponses = accountResponses.filter((response) => response.can_edit);
  const preferredAccountResponse = editableAccountResponses[0] ?? accountResponses[0] ?? null;
  const selectedAccountResponse = selected
    ? accountResponses.find((response) => response.round_id === selected.id) ?? null
    : null;

  async function editCountryAccountResponse(response: CountryConfirmationResponse) {
    setAccountEditError(null);
    setOpeningRoundId(response.round_id);

    try {
      const result = await createCountryAccountConfirmationEditToken(response.round_id);
      if (!result.ok || !result.token) {
        const message =
          result.reason === "editing_closed"
            ? "Editing is closed for this response."
            : result.reason === "locked"
              ? "This response is locked."
              : result.reason === "not_authenticated"
                ? "Sign in to the country account again, then retry."
                : "This confirmation could not be opened for editing.";
        setAccountEditError(message);
        await accountAccessQuery.refetch();
        return;
      }

      window.location.assign(`/confirmations/edit/${encodeURIComponent(result.token)}`);
    } catch (error) {
      setAccountEditError(
        error instanceof Error ? error.message : "This confirmation could not be opened for editing.",
      );
    } finally {
      setOpeningRoundId(null);
    }
  }

  return (
    <ParticipationRouteChrome>
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
          {accountAccess?.authenticated && accountAccess.country && preferredAccountResponse ? (
            <section className="data-panel mb-5 border-primary/20 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-primary">
                    <UserRoundCheck className="size-4" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                      Country account connected
                    </p>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold">
                    Signed in as {accountAccess.country.name}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Solaris Studio found your existing confirmation automatically. You do not need the recovery
                    code while you are signed in to this country account.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    SSC {preferredAccountResponse.edition_number} · {preferredAccountResponse.round_name}
                  </p>
                </div>

                <Button
                  type="button"
                  disabled={!preferredAccountResponse.can_edit || openingRoundId !== null}
                  onClick={() => void editCountryAccountResponse(preferredAccountResponse)}
                  className="shrink-0"
                >
                  {preferredAccountResponse.can_edit ? (
                    <>
                      <PencilLine className="size-4" />
                      {openingRoundId === preferredAccountResponse.round_id
                        ? "Opening…"
                        : "Edit your response"}
                    </>
                  ) : (
                    <>
                      <LockKeyhole className="size-4" /> Editing closed
                    </>
                  )}
                </Button>
              </div>

              {accountEditError ? (
                <div className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">
                  {accountEditError}
                </div>
              ) : null}
            </section>
          ) : null}

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
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    {selected.edition_name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedAccountResponse
                      ? "You already have a response for this round. Open that response instead of submitting a second one."
                      : "Complete the six-step confirmation form below."}
                  </p>
                </div>
                <StatePill round={selected} />
              </div>

              {selectedAccountResponse ? (
                <div className="data-panel p-5 text-center sm:p-6">
                  <PencilLine className="mx-auto size-6 text-primary" />
                  <h2 className="mt-3 font-display text-xl font-bold">Your response already exists</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {selectedAccountResponse.can_edit
                      ? "Editing is open. Because you are signed in to this country account, Solaris Studio can open the saved response directly."
                      : "Your response is saved, but editing is currently closed."}
                  </p>
                  <Button
                    type="button"
                    disabled={!selectedAccountResponse.can_edit || openingRoundId !== null}
                    onClick={() => void editCountryAccountResponse(selectedAccountResponse)}
                    className="mt-5"
                  >
                    {selectedAccountResponse.can_edit ? (
                      <>
                        <PencilLine className="size-4" />
                        {openingRoundId === selectedAccountResponse.round_id
                          ? "Opening…"
                          : "Edit your response"}
                      </>
                    ) : (
                      <>
                        <LockKeyhole className="size-4" /> Editing closed
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <ConfirmationForm round={selected} availability={roundReason(selected)} />
              )}
            </section>
          ) : rounds.length ? (
            <section className="space-y-3">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                    Available rounds
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold">Choose a confirmation round</h2>
                </div>
                <span className="numeric text-xs text-muted-foreground">{rounds.length}</span>
              </div>

              {rounds.map((round) => {
                const reason = roundReason(round);
                const canOpen = reason === "OPEN";
                const opens = formatDate(round.opens_at);
                const closes = formatDate(round.closes_at);
                const remaining =
                  round.response_limit === null
                    ? null
                    : Math.max(round.response_limit - round.response_count, 0);
                const ownResponse = accountResponses.find((response) => response.round_id === round.id) ?? null;

                return (
                  <article key={round.id} className="data-panel p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            SSC {round.edition_number}
                          </p>
                          <StatePill round={round} />
                          {ownResponse ? (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                              Your response
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">{round.name}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {ownResponse
                            ? ownResponse.can_edit
                              ? "Your response is saved and editing is open."
                              : "Your response is saved. Editing is currently closed."
                            : canOpen
                              ? remaining === null
                                ? "Responses are being accepted."
                                : `${remaining} ${remaining === 1 ? "place" : "places"} remaining.`
                              : reason === "NOT_OPEN_YET" && opens
                                ? `Opens ${opens}.`
                                : reason === "DEADLINE_PASSED" && closes
                                  ? `Closed ${closes}.`
                                  : reason === "RESPONSE_LIMIT_REACHED"
                                    ? "This round has reached its response limit."
                                    : "This round is currently closed."}
                        </p>
                      </div>

                      {ownResponse ? (
                        <Button
                          type="button"
                          disabled={!ownResponse.can_edit || openingRoundId !== null}
                          onClick={() => void editCountryAccountResponse(ownResponse)}
                          className="shrink-0"
                        >
                          {ownResponse.can_edit ? (
                            <>
                              <PencilLine className="size-4" />
                              {openingRoundId === ownResponse.round_id ? "Opening…" : "Edit your response"}
                            </>
                          ) : (
                            <>
                              <LockKeyhole className="size-4" /> Editing closed
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => setSelectedId(round.id)}
                          className="shrink-0"
                        >
                          Open confirmation <ArrowRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="data-panel p-8 text-center sm:p-10">
              <LockKeyhole className="mx-auto size-7 text-muted-foreground" />
              <h2 className="mt-4 font-display text-xl font-bold sm:text-2xl">
                No confirmation rounds are available
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                When a confirmation round is published, it will appear here automatically.
              </p>
            </section>
          )}
        </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
