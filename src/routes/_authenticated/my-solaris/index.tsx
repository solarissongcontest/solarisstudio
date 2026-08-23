import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  ClipboardCheck,
  Eye,
  Flag,
  History,
  Home,
  LayoutDashboard,
  ListChecks,
  Newspaper,
  Palette,
  PencilLine,
  Send,
  Sparkles,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { ConfirmationReviewStatus } from "@/components/ConfirmationReviewStatus";
import { CountryHodHistoryPanel } from "@/components/CountryHodHistoryPanel";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { MySolarisAccountPanel } from "@/components/MySolarisAccountPanel";
import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel";
import { getCountryConfirmationAccess } from "@/lib/confirmation-country-account";
import { getPublicRounds } from "@/lib/confirmation-rounds.functions";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  editionLabel,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useEditions,
} from "@/lib/data";
import { buildEditionProgressionPlacements } from "@/lib/edition-progression";
import {
  useOwnedEntryPublication,
  useSetOwnedEntryPublication,
} from "@/lib/entry-publication";
import { listenLinksFrom } from "@/lib/entry-utils";
import { useContentEvents } from "@/lib/engagement-data";
import { useCountryHistoricalNationalFinals } from "@/lib/historical-national-finals";
import {
  confirmationDateToUtc,
  formatCompactCountdown,
  millisecondsUntil,
  resolveScheduleState,
} from "@/lib/solaris-schedule";

type MySolarisTab = "home" | "entry" | "country" | "history" | "activity" | "account";

type MySolarisSearch = {
  tab?: MySolarisTab;
};

const TAB_IDS: MySolarisTab[] = ["home", "entry", "country", "history", "activity", "account"];

const TABS: Array<{ id: MySolarisTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "entry", label: "Entry", icon: Sparkles },
  { id: "country", label: "Country", icon: Flag },
  { id: "history", label: "History", icon: History },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "account", label: "Account", icon: CircleUserRound },
];

export const Route = createFileRoute("/_authenticated/my-solaris/")({
  head: () => ({ meta: [{ title: "MySolaris — Solaris Studio" }] }),
  validateSearch: (search: Record<string, unknown>): MySolarisSearch => ({
    tab: TAB_IDS.includes(search.tab as MySolarisTab) ? (search.tab as MySolarisTab) : undefined,
  }),
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
  const { tab: requestedTab } = Route.useSearch();
  const tab = requestedTab ?? "home";
  const navigate = Route.useNavigate();
  const { data: accountData, isLoading } = useMyCountryAccount();
  const country = accountData?.country;
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();
  const { data: eventsData } = useContentEvents(100);
  const nationalFinals = useCountryHistoricalNationalFinals(country?.id);

  const roundsQuery = useQuery({
    queryKey: ["mysolaris-confirmation-rounds"],
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
  const currentEdition = useMemo(
    () =>
      [...(editions ?? [])].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      )[0] ?? null,
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
  const currentEntry = currentEdition
    ? countryEntries.find((entry) => entry.edition_id === currentEdition.id) ?? null
    : countryEntries[0] ?? null;
  const previousEntries = currentEdition
    ? countryEntries.filter((entry) => entry.edition_id !== currentEdition.id)
    : countryEntries;

  const placementMap = useMemo(
    () => buildEditionProgressionPlacements(results ?? [], shows ?? []),
    [results, shows],
  );
  const currentPlacement = currentEdition && country
    ? placementMap.get(currentEdition.id)?.get(country.id) ?? null
    : null;

  const publicationQuery = useOwnedEntryPublication(currentEdition?.id);
  const setPublication = useSetOwnedEntryPublication(currentEdition?.id);
  const publication = publicationQuery.data;
  const entryIsPublic = publication?.publication_status === "published";

  const confirmationResponses = confirmationQuery.data?.responses ?? [];
  const currentConfirmation = currentEdition
    ? confirmationResponses.find((response) => response.edition_id === currentEdition.id) ?? null
    : confirmationResponses[0] ?? null;

  const currentNationalFinal = currentEdition
    ? (nationalFinals.data ?? []).find((nf) => nf.edition_id === currentEdition.id) ?? null
    : null;

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
        .slice(0, 20),
    [eventsData?.events, country],
  );

  const [scheduleValue, setScheduleValue] = useState("");
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening MySolaris…</p>
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris"
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
  const listeningLinks = listenLinksFrom(currentEntry);
  const listeningLinkCount = Object.values(listeningLinks).filter(Boolean).length;

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
            : "Reveal schedule cancelled.",
      );
    } catch (error) {
      setPublicationMessage(
        error instanceof Error ? error.message : "The publication setting could not be saved.",
      );
    }
  };

  const setTab = (next: MySolarisTab) => {
    void navigate({ search: { tab: next }, replace: true });
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris"
        title={`Welcome back, ${country.name}`}
        description="Your HOD home base for the current edition, entries, country history, updates and account."
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

      <MySolarisTabs active={tab} onChange={setTab} />

      <div className="mt-5 space-y-5">
        {tab === "home" && (
          <HomeTab
            country={country}
            currentEdition={currentEdition}
            currentEntry={currentEntry}
            currentConfirmation={currentConfirmation}
            currentPlacement={currentPlacement}
            currentNationalFinal={currentNationalFinal}
            nextRound={nextRound}
            nextRoundState={nextRoundState}
            untilRound={untilRound}
            publication={publication}
            countryEvents={countryEvents.slice(0, 5)}
            listeningLinkCount={listeningLinkCount}
            onTabChange={setTab}
          />
        )}

        {tab === "entry" && (
          <>
            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <CurrentEntryPanel
                currentEdition={currentEdition}
                currentEntry={currentEntry}
                publication={publication}
                entryIsPublic={entryIsPublic}
                scheduleValue={scheduleValue}
                setScheduleValue={setScheduleValue}
                currentConfirmation={currentConfirmation}
                confirmationReveal={confirmationReveal}
                canUseConfirmationReveal={canUseConfirmationReveal}
                publicationMessage={publicationMessage}
                setPublication={setPublication}
                runPublication={runPublication}
              />
              <ConfirmationPanel
                countryName={country.name}
                currentConfirmation={currentConfirmation}
              />
            </section>

            <Panel
              title="National final"
              description="Current selection plus the place to manage older national finals"
              actions={
                <Link to="/country-hub" className="text-xs font-semibold text-primary">
                  Manage national finals →
                </Link>
              }
            >
              {currentNationalFinal ? (
                <div className="rounded-2xl border border-border/70 bg-surface/55 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                    {currentEdition ? editionLabel(currentEdition) : "Current edition"}
                  </p>
                  <p className="mt-2 text-base font-semibold">{currentNationalFinal.name || "National final"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {currentNationalFinal.entries.length} entr{currentNationalFinal.entries.length === 1 ? "y" : "ies"}
                    {currentNationalFinal.lineup_published ? " · line-up public" : " · line-up private"}
                    {currentNationalFinal.results_published ? " · results public" : " · results private"}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-surface p-4">
                  <p className="text-sm font-semibold">No current national final stored</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    If this entry was internally selected, nothing is missing. Older national finals can still be added from the country workspace.
                  </p>
                </div>
              )}
            </Panel>

            <EntryHistoryPanel
              countryId={country.id}
              entries={previousEntries}
              editionMap={editionMap}
              placementMap={placementMap}
              title="Previous entries"
              emptyText="No previous SSC entries are stored for this country yet."
            />
          </>
        )}

        {tab === "country" && (
          <CountryTab
            country={country}
            currentEntry={currentEntry}
            listeningLinkCount={listeningLinkCount}
          />
        )}

        {tab === "history" && (
          <>
            <CountryHodHistoryPanel inline />

            <Panel
              title="National final history"
              description="Confirmation-created and manually added national finals for your country"
              actions={
                <Link to="/country-hub" className="text-xs font-semibold text-primary">
                  Add or edit older NFs →
                </Link>
              }
            >
              {(nationalFinals.data ?? []).length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(nationalFinals.data ?? []).map((nf) => {
                    const edition = nf.edition_id ? editionMap.get(nf.edition_id) : null;
                    return (
                      <div key={nf.id} className="rounded-xl border border-border/70 bg-surface/45 p-3">
                        <p className="text-[9px] font-black uppercase tracking-[0.13em] text-primary">
                          {edition ? editionLabel(edition) : nf.edition_number ? `SSC ${nf.edition_number}` : "Edition unknown"}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold">{nf.name || "National final"}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {nf.entries.length} entr{nf.entries.length === 1 ? "y" : "ies"} · {nf.source === "manual" ? "added in Solaris" : "from Confirmations"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No national finals are stored yet.</p>
              )}
            </Panel>

            <EntryHistoryPanel
              countryId={country.id}
              entries={countryEntries}
              editionMap={editionMap}
              placementMap={placementMap}
              title="Participation history"
              emptyText="No SSC participation history is stored yet."
            />
          </>
        )}

        {tab === "activity" && (
          <ActivityTab
            countryName={country.name}
            events={countryEvents}
            entryCount={countryEntries.length}
            nfCount={(nationalFinals.data ?? []).length}
          />
        )}

        {tab === "account" && (
          <div className="space-y-5">
            <MySolarisAccountPanel />
            <MySolarisPasswordPanel />
            <Panel title="Country account" description="The country attached to this MySolaris account">
              <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface/55 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {country.flag_image ? (
                    <img src={country.flag_image} alt="" className="h-10 w-14 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-10 w-14 place-items-center rounded-lg border border-border bg-background text-xs font-bold">
                      {country.short_code}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-semibold">{country.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {accountData?.access.countryStatus === "suspended" ? "Suspended" : "Active country account"}
                    </p>
                  </div>
                </div>
                <Link to="/country-hub" className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold">
                  Open country workspace
                </Link>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MySolarisTabs({
  active,
  onChange,
}: {
  active: MySolarisTab;
  onChange: (tab: MySolarisTab) => void;
}) {
  return (
    <nav
      className="scroll-slim flex gap-1.5 overflow-x-auto rounded-2xl border border-border/70 bg-surface/55 p-1.5"
      aria-label="MySolaris sections"
    >
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
          className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${
            active === id
              ? "bg-primary/12 text-primary ring-1 ring-primary/20"
              : "text-muted-foreground hover:bg-surface-strong hover:text-foreground"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </nav>
  );
}

function HomeTab({
  country,
  currentEdition,
  currentEntry,
  currentConfirmation,
  currentPlacement,
  currentNationalFinal,
  nextRound,
  nextRoundState,
  untilRound,
  publication,
  countryEvents,
  listeningLinkCount,
  onTabChange,
}: {
  country: NonNullable<ReturnType<typeof useMyCountryAccount>["data"]>["country"] extends infer T ? NonNullable<T> : never;
  currentEdition: ReturnType<typeof useEditions>["data"] extends Array<infer T> | undefined ? T | null : never;
  currentEntry: ReturnType<typeof useAllParticipants>["data"] extends Array<infer T> | undefined ? T | null : never;
  currentConfirmation: Awaited<ReturnType<typeof getCountryConfirmationAccess>>["responses"][number] | null;
  currentPlacement: ReturnType<typeof buildEditionProgressionPlacements> extends Map<string, Map<string, infer T>> ? T | null : never;
  currentNationalFinal: NonNullable<ReturnType<typeof useCountryHistoricalNationalFinals>["data"]>[number] | null;
  nextRound: Awaited<ReturnType<typeof getPublicRounds>>[number] | undefined;
  nextRoundState: ReturnType<typeof resolveScheduleState> | null;
  untilRound: number | null;
  publication: ReturnType<typeof useOwnedEntryPublication>["data"];
  countryEvents: NonNullable<ReturnType<typeof useContentEvents>["data"]>["events"];
  listeningLinkCount: number;
  onTabChange: (tab: MySolarisTab) => void;
}) {
  const hasCurrentEntry = Boolean(currentEntry);
  const confirmationDone = Boolean(currentConfirmation);
  const revealReady = publication?.publication_status === "published" || publication?.publication_status === "scheduled";

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Panel title="Next action" description="What deserves your attention first">
          {nextRound && !confirmationDone ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <CalendarClock className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-primary">
                    {nextRoundState === "open" || nextRoundState === "closing-soon" ? "Open now" : "Coming up"}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold">{nextRound.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {nextRoundState === "open" || nextRoundState === "closing-soon"
                      ? "Your country can submit its confirmation now."
                      : untilRound !== null
                        ? `Opens in ${formatCompactCountdown(untilRound)}.`
                        : "Opening time will appear here when it is set."}
                  </p>
                  <Link to="/confirmations" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-aurora px-4 text-xs font-semibold text-primary-foreground">
                    <ClipboardCheck className="size-3.5" /> Open confirmations
                  </Link>
                </div>
              </div>
            </div>
          ) : hasCurrentEntry && !revealReady ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Entry needs attention</p>
              <p className="mt-2 text-base font-semibold">Set the reveal for {currentEntry?.song || "your current entry"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The entry exists, but it is still a draft and has no scheduled public reveal.
              </p>
              <button type="button" onClick={() => onTabChange("entry")} className="mt-3 min-h-10 rounded-xl bg-aurora px-4 text-xs font-semibold text-primary-foreground">
                Open entry controls
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-surface p-4">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Nothing urgent right now</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                MySolaris will put confirmation rounds, reveal tasks and other current-edition actions here when they need you.
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Quick actions" description="Useful shortcuts, without the scavenger hunt">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <QuickAction to="/confirmations" icon={ClipboardCheck} label="Confirmations" />
            <QuickAction to="/televoting" icon={Vote} label="Televoting" />
            <button type="button" onClick={() => onTabChange("entry")} className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-left text-sm font-semibold transition hover:border-primary/25 hover:bg-surface-strong">
              <Sparkles className="size-4 text-primary" /> Entry
            </button>
            <button type="button" onClick={() => onTabChange("country")} className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-left text-sm font-semibold transition hover:border-primary/25 hover:bg-surface-strong">
              <PencilLine className="size-4 text-primary" /> Country tools
            </button>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Panel
          title="Current edition"
          description={currentEdition ? editionLabel(currentEdition) : "No edition is loaded"}
          actions={currentEdition ? <Link to="/editions/$slug" params={{ slug: currentEdition.slug }} className="text-xs font-semibold text-primary">View edition →</Link> : undefined}
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-surface/55 p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">{country.name}</p>
              <p className="mt-2 font-display text-xl font-semibold">
                {currentEntry ? [currentEntry.artist, currentEntry.song].filter(Boolean).join(" — ") || "Entry details incomplete" : "No entry stored yet"}
              </p>
              {currentEntry ? <EntryListenLinks entry={currentEntry} compact className="mt-3" /> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-muted-foreground">
                <span className="rounded-full border border-border px-2.5 py-1">
                  {publication?.publication_status === "published" ? "Public" : publication?.publication_status === "scheduled" ? "Scheduled" : currentEntry ? "Draft" : "No entry"}
                </span>
                {currentPlacement ? <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">Overall #{currentPlacement.rank}</span> : null}
                {currentNationalFinal ? <span className="rounded-full border border-border px-2.5 py-1">NF: {currentNationalFinal.name || "National final"}</span> : null}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Country status" description="A quick current-edition checklist">
          <div className="space-y-2">
            <StatusRow ok label="Country account" detail="Connected" />
            <StatusRow ok={confirmationDone} label="Confirmation" detail={confirmationDone ? "Submitted" : "Not submitted for current edition"} />
            <StatusRow ok={hasCurrentEntry} label="Entry" detail={hasCurrentEntry ? "Stored" : "No current entry"} />
            <StatusRow ok={revealReady} label="Reveal" detail={publication?.publication_status === "published" ? "Public" : publication?.publication_status === "scheduled" ? "Scheduled" : "Not set"} />
            <StatusRow ok={listeningLinkCount > 0} label="Listening link" detail={listeningLinkCount > 0 ? `${listeningLinkCount} service${listeningLinkCount === 1 ? "" : "s"}` : "None added"} optional />
          </div>
        </Panel>
      </section>

      <PulsePanel countryName={country.name} events={countryEvents} compact />
    </>
  );
}

function CurrentEntryPanel({
  currentEdition,
  currentEntry,
  publication,
  entryIsPublic,
  scheduleValue,
  setScheduleValue,
  currentConfirmation,
  confirmationReveal,
  canUseConfirmationReveal,
  publicationMessage,
  setPublication,
  runPublication,
}: {
  currentEdition: ReturnType<typeof useEditions>["data"] extends Array<infer T> | undefined ? T | null : never;
  currentEntry: ReturnType<typeof useAllParticipants>["data"] extends Array<infer T> | undefined ? T | null : never;
  publication: ReturnType<typeof useOwnedEntryPublication>["data"];
  entryIsPublic: boolean;
  scheduleValue: string;
  setScheduleValue: (value: string) => void;
  currentConfirmation: Awaited<ReturnType<typeof getCountryConfirmationAccess>>["responses"][number] | null;
  confirmationReveal: string | null;
  canUseConfirmationReveal: boolean;
  publicationMessage: string | null;
  setPublication: ReturnType<typeof useSetOwnedEntryPublication>;
  runPublication: (mode: "publish" | "schedule" | "draft", scheduledAt?: string | null, source?: "manual" | "confirmation") => Promise<void>;
}) {
  return (
    <Panel title="Current entry" description={currentEdition ? editionLabel(currentEdition) : "Current SSC edition"}>
      {currentEntry && currentEdition ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-surface/65 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">{editionLabel(currentEdition)}</p>
            <p className="mt-2 font-display text-xl font-semibold">
              {[currentEntry.artist, currentEntry.song].filter(Boolean).join(" — ") || "Entry details incomplete"}
            </p>
            <EntryListenLinks entry={currentEntry} compact className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
              <span className="rounded-full border border-border bg-background/50 px-2.5 py-1">
                {publication?.publication_status === "scheduled" ? "Scheduled" : publication?.publication_status === "draft" ? "Draft" : "Public"}
              </span>
              {publication?.scheduled_publish_at ? (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
                  Reveals {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(publication.scheduled_publish_at))}
                </span>
              ) : null}
            </div>
          </div>

          {entryIsPublic ? (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-sm text-emerald-100">
              This entry is public. MySolaris will not silently hide it again.
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
                <button type="button" disabled={setPublication.isPending} onClick={() => void runPublication("publish")} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-aurora px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                  <Send className="size-3.5" /> Publish now
                </button>
                {publication?.publication_status === "scheduled" ? (
                  <button type="button" disabled={setPublication.isPending} onClick={() => void runPublication("draft")} className="min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold disabled:opacity-60">
                    Cancel schedule
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input type="datetime-local" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
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
                    <p className="mt-1 text-[11px] text-muted-foreground">{currentConfirmation.reveal_exact_date} · date-only reveals use 00:00 UTC.</p>
                  </div>
                  <button type="button" disabled={!canUseConfirmationReveal || setPublication.isPending} onClick={() => confirmationReveal && void runPublication("schedule", confirmationReveal, "confirmation")} className="min-h-10 shrink-0 rounded-xl border border-border bg-background px-3 text-xs font-semibold disabled:opacity-50">
                    Use confirmation date
                  </button>
                </div>
              ) : currentConfirmation?.reveal_approximate_text ? (
                <p className="rounded-xl bg-surface p-3 text-xs text-muted-foreground">
                  Your confirmation says “{currentConfirmation.reveal_approximate_text}”. Choose an exact time above before Solaris can publish automatically.
                </p>
              ) : null}

              {publicationMessage ? <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">{publicationMessage}</p> : null}
            </div>
          )}

          <Link to="/country-hub" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold">
            <PencilLine className="size-3.5" /> Edit entry details
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-sm font-semibold">No current entry stored yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add the entry in your country workspace, then reveal controls will appear here.</p>
          <Link to="/country-hub" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold">
            <PencilLine className="size-3.5" /> Manage entries
          </Link>
        </div>
      )}
    </Panel>
  );
}

function ConfirmationPanel({
  countryName,
  currentConfirmation,
}: {
  countryName: string;
  currentConfirmation: Awaited<ReturnType<typeof getCountryConfirmationAccess>>["responses"][number] | null;
}) {
  return (
    <Panel title="Participation" description="Your current confirmation state">
      {currentConfirmation ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-surface/65 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">SSC {currentConfirmation.edition_number}</p>
            <p className="mt-2 text-sm font-semibold">Confirmation submitted</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {currentConfirmation.can_edit ? "Your response is saved and editing is open." : currentConfirmation.reason === "locked" ? "Your response is saved and locked." : "Your response is saved. Editing is currently closed."}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(currentConfirmation.updated_at))}
            </p>
          </div>
          <ConfirmationReviewStatus selectionMethod={currentConfirmation.selection_method} internalEntry={currentConfirmation.internal_entry} nationalFinal={currentConfirmation.national_final} compact />
          <Link to="/confirmations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold">
            <ClipboardCheck className="size-3.5" /> {currentConfirmation.can_edit ? "View or edit confirmation" : "View confirmation"}
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-sm font-semibold">No current confirmation found</p>
          <p className="mt-1 text-xs text-muted-foreground">Open Confirmations to see available rounds for {countryName}.</p>
          <Link to="/confirmations" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold">
            <ClipboardCheck className="size-3.5" /> Open confirmations
          </Link>
        </div>
      )}
    </Panel>
  );
}

function CountryTab({
  country,
  currentEntry,
  listeningLinkCount,
}: {
  country: NonNullable<ReturnType<typeof useMyCountryAccount>["data"]>["country"] extends infer T ? NonNullable<T> : never;
  currentEntry: ReturnType<typeof useAllParticipants>["data"] extends Array<infer T> | undefined ? T | null : never;
  listeningLinkCount: number;
}) {
  const health = [
    { label: "Flag", ok: Boolean(country.flag_image), detail: country.flag_image ? "Added" : "Missing" },
    { label: "Country description", ok: Boolean(country.description?.trim()), detail: country.description?.trim() ? "Added" : "Missing" },
    { label: "Current entry", ok: Boolean(currentEntry?.artist?.trim() && currentEntry?.song?.trim()), detail: currentEntry ? "Stored" : "No current entry" },
    { label: "Listening links", ok: listeningLinkCount > 0, detail: listeningLinkCount ? `${listeningLinkCount} added` : "None added", optional: true },
  ];

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <Panel title="Public preview" description="Check what people actually see">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Link to="/countries/$code" params={{ code: country.short_code }} className="rounded-2xl border border-border/70 bg-surface/55 p-4 transition hover:border-primary/25">
              <Eye className="size-4 text-primary" />
              <p className="mt-3 text-sm font-semibold">Country page</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Open public page →</p>
            </Link>
            <Link to="/wiki/$code" params={{ code: country.short_code }} className="rounded-2xl border border-border/70 bg-surface/55 p-4 transition hover:border-primary/25">
              <Newspaper className="size-4 text-primary" />
              <p className="mt-3 text-sm font-semibold">Wiki</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Open public Wiki →</p>
            </Link>
          </div>
        </Panel>

        <Panel title="Public page health" description="Missing items are suggestions, not arbitrary punishment by checklist">
          <div className="space-y-2">
            {health.map((item) => <StatusRow key={item.label} {...item} />)}
          </div>
        </Panel>
      </section>

      <Panel title="Country tools" description="Everything that changes the public country experience">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <WorkspaceLink to="/country-hub" icon={PencilLine} title="Country & entries" />
          <WorkspaceLink to="/country-hub/page-builder" icon={Newspaper} title="Page & media" />
          <WorkspaceLink to="/country-hub/theme" icon={Palette} title="Appearance" />
          <WorkspaceLink to="/guide" icon={LayoutDashboard} title="How to use Solaris" />
        </div>
      </Panel>
    </>
  );
}

function ActivityTab({
  countryName,
  events,
  entryCount,
  nfCount,
}: {
  countryName: string;
  events: NonNullable<ReturnType<typeof useContentEvents>["data"]>["events"];
  entryCount: number;
  nfCount: number;
}) {
  return (
    <>
      <Panel title="Your Solaris activity" description="A compact view of what exists around your delegation">
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Entries" value={entryCount} />
          <MiniStat label="National finals" value={nfCount} />
          <MiniStat label="Recent updates" value={events.length} />
        </div>
      </Panel>
      <PulsePanel countryName={countryName} events={events} />
    </>
  );
}

function PulsePanel({
  countryName,
  events,
  compact = false,
}: {
  countryName: string;
  events: NonNullable<ReturnType<typeof useContentEvents>["data"]>["events"];
  compact?: boolean;
}) {
  const shown = compact ? events.slice(0, 5) : events;
  return (
    <Panel
      title="My Pulse"
      description={`Updates involving ${countryName}, separate from the Solaris-wide feed`}
      actions={<Link to="/pulse" className="text-xs font-semibold text-primary">What’s happening across Solaris? →</Link>}
    >
      {shown.length ? (
        <div className="divide-y divide-border/60">
          {shown.map((event) => (
            <Link key={event.id} to={event.route as any} className="block py-3 first:pt-0 last:pb-0">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">{event.event_type.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm font-semibold">{event.title}</p>
              {event.summary ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.summary}</p> : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-4">
          <Sparkles className="size-5 text-primary" />
          <p className="mt-2 text-sm font-semibold">Nothing new for {countryName} yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Entry reveals, results, records and other country-specific updates will collect here.</p>
        </div>
      )}
    </Panel>
  );
}

function EntryHistoryPanel({
  countryId,
  entries,
  editionMap,
  placementMap,
  title,
  emptyText,
}: {
  countryId: string;
  entries: NonNullable<ReturnType<typeof useAllParticipants>["data"]>;
  editionMap: Map<string, NonNullable<ReturnType<typeof useEditions>["data"]>[number]>;
  placementMap: ReturnType<typeof buildEditionProgressionPlacements>;
  title: string;
  emptyText: string;
}) {
  return (
    <Panel title={title} description="One entry per SSC edition, even when the same song appeared in several shows">
      {entries.length ? (
        <div className="divide-y divide-border/60">
          {entries.map((entry) => {
            const edition = editionMap.get(entry.edition_id);
            const placement = placementMap.get(entry.edition_id)?.get(countryId);
            return (
              <div key={entry.edition_id} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{edition ? editionLabel(edition) : "Edition"}</p>
                    {placement ? <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">#{placement.rank} overall</span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[entry.artist, entry.song].filter(Boolean).join(" — ") || "Entry details not stored"}
                  </p>
                  <EntryListenLinks entry={entry} compact className="mt-2" />
                </div>
                {edition ? (
                  <Link to="/editions/$slug" params={{ slug: edition.slug }} className="text-xs font-semibold text-primary">View edition →</Link>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </Panel>
  );
}

function StatusRow({
  ok,
  label,
  detail,
  optional = false,
}: {
  ok: boolean;
  label: string;
  detail: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/45 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {ok ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <ListChecks className="size-4 shrink-0 text-muted-foreground" />}
        <p className="truncate text-xs font-semibold">{label}{optional ? <span className="ml-1 text-[9px] font-normal text-muted-foreground">optional</span> : null}</p>
      </div>
      <p className="shrink-0 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/55 p-4 text-center">
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link to={to as any} className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-sm font-semibold transition hover:border-primary/25 hover:bg-surface-strong">
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
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link to={to as any} className="group rounded-2xl border border-border/70 bg-surface/60 p-4 transition hover:border-primary/25 hover:bg-surface-strong">
      <Icon className="size-4 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[10px] text-muted-foreground group-hover:text-foreground">Open →</p>
    </Link>
  );
}
