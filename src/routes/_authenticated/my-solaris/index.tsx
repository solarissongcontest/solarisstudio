import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  LayoutDashboard,
  Newspaper,
  Palette,
  PencilLine,
  Radio,
  Send,
  Sparkles,
  Vote,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { ConfirmationReviewStatus } from "@/components/ConfirmationReviewStatus";
import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel";
import { getCountryConfirmationAccess } from "@/lib/confirmation-country-account";
import { getPublicRounds } from "@/lib/confirmation-rounds.functions";
import { useMyCountryAccount } from "@/lib/country-account";
import { editionLabel, useAllParticipants, useEditions } from "@/lib/data";
import {
  useOwnedEntryPublication,
  useSetOwnedEntryPublication,
} from "@/lib/entry-publication";
import { useContentEvents } from "@/lib/engagement-data";
import {
  confirmationDateToUtc,
  formatCompactCountdown,
  millisecondsUntil,
  resolveScheduleState,
} from "@/lib/solaris-schedule";

export const Route = createFileRoute("/_authenticated/my-solaris/")({
  head: () => ({ meta: [{ title: "My Solaris — Solaris Studio" }] }),
  component: MySolarisPage,
});

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function payloadCountryId(payload: unknown) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const value = record.countryId ?? record.country_id;
  return typeof value === "string" ? value : null;
}

function MySolarisPage() {
  const now = useNow();
  const { data: accountData, isLoading } = useMyCountryAccount();
  const country = accountData?.country;
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();
  const { data: eventsData } = useContentEvents(50);

  const roundsQuery = useQuery({
    queryKey: ["my-solaris-confirmation-rounds"],
    queryFn: () => getPublicRounds(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const confirmationQuery = useQuery({
    queryKey: ["country-confirmation-access"],
    queryFn: getCountryConfirmationAccess,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );

  const countryEntries = useMemo(
    () =>
      (participants ?? [])
        .filter((entry) => entry.country_id === country?.id && entry.show_id == null)
        .sort(
          (a, b) =>
            (editionMap.get(b.edition_id)?.edition_number ?? -1) -
            (editionMap.get(a.edition_id)?.edition_number ?? -1),
        ),
    [participants, country?.id, editionMap],
  );

  const currentEntry = countryEntries[0] ?? null;
  const currentEdition = currentEntry ? editionMap.get(currentEntry.edition_id) ?? null : null;
  const publicationQuery = useOwnedEntryPublication(currentEntry?.edition_id);
  const setPublication = useSetOwnedEntryPublication(currentEntry?.edition_id);
  const publication = publicationQuery.data;

  const confirmationResponses = confirmationQuery.data?.responses ?? [];
  const currentConfirmation = currentEdition
    ? confirmationResponses.find((response) => response.edition_id === currentEdition.id) ??
      confirmationResponses[0] ??
      null
    : confirmationResponses[0] ?? null;

  const nextRound = useMemo(() => {
    const rounds = roundsQuery.data ?? [];
    return [...rounds]
      .filter((round) => {
        const state = resolveScheduleState(
          { status: round.status, opensAt: round.opens_at, closesAt: round.closes_at },
          now,
        );
        return state !== "closed";
      })
      .sort((a, b) => {
        const aTime = a.opens_at ? new Date(a.opens_at).getTime() : 0;
        const bTime = b.opens_at ? new Date(b.opens_at).getTime() : 0;
        return aTime - bTime;
      })[0];
  }, [roundsQuery.data, now]);

  const countryEvents = useMemo(
    () =>
      (eventsData?.events ?? [])
        .filter(
          (event) =>
            Boolean(country) &&
            ((event.entity_type === "country" && event.entity_id === country!.id) ||
              payloadCountryId(event.payload) === country!.id),
        )
        .slice(0, 5),
    [eventsData?.events, country],
  );

  const [scheduleValue, setScheduleValue] = useState("");
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening My Solaris…</p>
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="My Solaris"
          title="Finish your country setup"
          description="Choose your country first. Your dashboard, entries and participation tools will appear here automatically."
        />
        <Panel title="Country account">
          <Link
            to="/country-hub"
            className="inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
          >
            Choose your country
          </Link>
        </Panel>
      </AppShell>
    );
  }

  const nextRoundState = nextRound
    ? resolveScheduleState(
        { status: nextRound.status, opensAt: nextRound.opens_at, closesAt: nextRound.closes_at },
        now,
      )
    : null;
  const untilRound = nextRound?.opens_at ? millisecondsUntil(nextRound.opens_at, now) : null;
  const confirmationReveal = confirmationDateToUtc(currentConfirmation?.reveal_exact_date);
  const canUseConfirmationReveal = Boolean(
    confirmationReveal && new Date(confirmationReveal).getTime() > now,
  );

  const runPublication = async (
    mode: "publish" | "schedule" | "draft",
    scheduledAt?: string | null,
    source: "manual" | "confirmation" = "manual",
  ) => {
    setPublicationMessage(null);
    try {
      await setPublication.mutateAsync({ mode, scheduledAt, source });
      setPublicationMessage(
        mode === "publish"
          ? "Your entry is public."
          : mode === "schedule"
            ? "Reveal schedule saved."
            : "Entry returned to draft.",
      );
    } catch (error) {
      setPublicationMessage(
        error instanceof Error ? error.message : "The publication setting could not be saved.",
      );
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris"
        title={`Welcome back, ${country.name}`}
        description="Your country, entry, upcoming actions and personal Solaris updates in one place."
        actions={
          <Link
            to="/countries/$code"
            params={{ code: country.short_code }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
          >
            <Eye className="size-3.5" /> View public page
          </Link>
        }
      />

      <div className="space-y-5">
        <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <Panel
            title="Next up"
            description="The most relevant participation deadline for your country"
          >
            {nextRound ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <CalendarClock className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.17em] text-primary">
                      {nextRoundState === "open" || nextRoundState === "closing-soon"
                        ? "Open now"
                        : "Coming up"}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold">{nextRound.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {nextRoundState === "open" || nextRoundState === "closing-soon"
                        ? "This confirmation round is accepting responses now."
                        : untilRound !== null
                          ? `Opens in ${formatCompactCountdown(untilRound)}.`
                          : "Opening time will appear here when it is set."}
                    </p>
                    <Link
                      to="/confirmations"
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-aurora px-4 text-xs font-semibold text-primary-foreground"
                    >
                      <ClipboardCheck className="size-3.5" /> Open confirmations
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <CheckCircle2 className="size-5 text-primary" />
                <p className="mt-2 text-sm font-semibold">Nothing urgent right now</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  New confirmation and participation deadlines will appear here automatically.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Quick actions" description="The shortcuts people should not have to hunt for">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <QuickAction to="/confirmations" icon={ClipboardCheck} label="Confirmations" />
              <QuickAction to="/televoting" icon={Vote} label="Televoting" />
              <QuickAction to="/country-hub" icon={PencilLine} label="Edit country" />
              <QuickAction to="/country-hub/theme" icon={Palette} label="Page design" />
              <QuickAction to="/pulse" icon={Radio} label="Public Pulse" />
              <QuickAction to="/guide" icon={LayoutDashboard} label="Guide" />
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Panel
            title="Current entry"
            description={currentEdition ? editionLabel(currentEdition) : "Your newest stored SSC entry"}
          >
            {currentEntry && currentEdition ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-surface/65 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                    {editionLabel(currentEdition)}
                  </p>
                  <p className="mt-2 font-display text-xl font-semibold">
                    {[currentEntry.artist, currentEntry.song].filter(Boolean).join(" — ") ||
                      "Entry details incomplete"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full border border-border bg-background/50 px-2.5 py-1">
                      {publication?.publication_status === "scheduled"
                        ? "Scheduled"
                        : publication?.publication_status === "draft"
                          ? "Draft"
                          : "Public"}
                    </span>
                    {publication?.scheduled_publish_at && (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
                        Reveals {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(publication.scheduled_publish_at))}
                      </span>
                    )}
                  </div>
                </div>

                {publication?.published_at ? (
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-sm text-emerald-100">
                    This managed entry is already public. Solaris will not silently hide it again.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                    <div>
                      <p className="text-sm font-semibold">Entry reveal</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Publish now, choose an exact reveal time, or use the exact date from your confirmation.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={setPublication.isPending}
                        onClick={() => void runPublication("publish")}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-aurora px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        <Send className="size-3.5" /> Publish now
                      </button>
                      {publication?.publication_status === "scheduled" && (
                        <button
                          type="button"
                          disabled={setPublication.isPending}
                          onClick={() => void runPublication("draft")}
                          className="min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold disabled:opacity-60"
                        >
                          Cancel schedule
                        </button>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        type="datetime-local"
                        value={scheduleValue}
                        onChange={(event) => setScheduleValue(event.target.value)}
                        className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
                      />
                      <button
                        type="button"
                        disabled={!scheduleValue || setPublication.isPending}
                        onClick={() => {
                          const date = new Date(scheduleValue);
                          if (!Number.isNaN(date.getTime())) void runPublication("schedule", date.toISOString());
                        }}
                        className="min-h-11 rounded-xl border border-primary/25 bg-primary/10 px-4 text-xs font-semibold text-primary disabled:opacity-50"
                      >
                        Schedule reveal
                      </button>
                    </div>

                    {currentConfirmation?.reveal_exact_date ? (
                      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold">From your confirmation</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {currentConfirmation.reveal_exact_date} · date-only reveals use 00:00 UTC.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!canUseConfirmationReveal || setPublication.isPending}
                          onClick={() =>
                            confirmationReveal &&
                            void runPublication("schedule", confirmationReveal, "confirmation")
                          }
                          className="min-h-10 shrink-0 rounded-xl border border-border bg-background px-3 text-xs font-semibold disabled:opacity-50"
                        >
                          Use confirmation date
                        </button>
                      </div>
                    ) : currentConfirmation?.reveal_approximate_text ? (
                      <p className="rounded-xl bg-surface p-3 text-xs text-muted-foreground">
                        Your confirmation says “{currentConfirmation.reveal_approximate_text}”. Choose an exact time above before Solaris can publish automatically.
                      </p>
                    ) : null}

                    {publicationMessage && (
                      <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">
                        {publicationMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <p className="text-sm font-semibold">No entry stored yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the current SSC entry in your country workspace, then its reveal controls will appear here.
                </p>
                <Link
                  to="/country-hub"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                >
                  <PencilLine className="size-3.5" /> Manage entries
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Participation" description="Your current confirmation state">
            {currentConfirmation ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-surface/65 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                    SSC {currentConfirmation.edition_number}
                  </p>
                  <p className="mt-2 text-sm font-semibold">Confirmation submitted</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {currentConfirmation.can_edit
                      ? "Your response is saved and editing is open."
                      : currentConfirmation.reason === "locked"
                        ? "Your response is saved and locked."
                        : "Your response is saved. Editing is currently closed."}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Updated {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(currentConfirmation.updated_at))}
                  </p>
                </div>
                <ConfirmationReviewStatus
                  selectionMethod={currentConfirmation.selection_method}
                  internalEntry={currentConfirmation.internal_entry}
                  nationalFinal={currentConfirmation.national_final}
                  compact
                />
                <Link
                  to="/confirmations"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
                >
                  <ClipboardCheck className="size-3.5" />
                  {currentConfirmation.can_edit ? "View or edit confirmation" : "View confirmations"}
                </Link>
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <p className="text-sm font-semibold">No saved confirmation found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open Confirmations to see available rounds for {country.name}.
                </p>
                <Link
                  to="/confirmations"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                >
                  <ClipboardCheck className="size-3.5" /> Open confirmations
                </Link>
              </div>
            )}
          </Panel>
        </section>

        <Panel
          title="My Pulse"
          description={`Updates involving ${country.name}, separated from the full Solaris-wide feed`}
          actions={
            <Link to="/pulse" className="text-xs font-semibold text-primary">
              What’s happening across Solaris? →
            </Link>
          }
        >
          {countryEvents.length ? (
            <div className="divide-y divide-border/60">
              {countryEvents.map((event) => (
                <Link key={event.id} to={event.route as any} className="block py-3 first:pt-0 last:pb-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">
                    {event.event_type.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{event.title}</p>
                  {event.summary && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.summary}</p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-surface p-4">
              <Sparkles className="size-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Nothing new for {country.name} yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Entry reveals, results, records and other country-specific updates will collect here.
              </p>
            </div>
          )}
        </Panel>

        <MySolarisPasswordPanel />

        <Panel title="Your workspace" description="Deeper editing stays organised away from the dashboard">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <WorkspaceLink to="/country-hub" icon={PencilLine} title="Country & entries" />
            <WorkspaceLink to="/country-hub/page-builder" icon={Newspaper} title="Page & media" />
            <WorkspaceLink to="/country-hub/theme" icon={Palette} title="Appearance" />
            <WorkspaceLink
              to={`/countries/${country.short_code}`}
              icon={ExternalLink}
              title="Public page"
            />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Vote;
  label: string;
}) {
  return (
    <Link
      to={to as any}
      className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-sm font-semibold transition hover:border-primary/25 hover:bg-surface-strong"
    >
      <Icon className="size-4 text-primary" />
      {label}
    </Link>
  );
}

function WorkspaceLink({
  to,
  icon: Icon,
  title,
}: {
  to: string;
  icon: typeof PencilLine;
  title: string;
}) {
  return (
    <Link
      to={to as any}
      className="group rounded-2xl border border-border/70 bg-surface/60 p-4 transition hover:border-primary/25 hover:bg-surface-strong"
    >
      <Icon className="size-4 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[10px] text-muted-foreground group-hover:text-foreground">Open →</p>
    </Link>
  );
}
