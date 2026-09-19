import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Music2,
  Scale,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { televotingSupabase } from "@/integrations/televoting/client";
import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import {
  primaryParticipationAction,
  sortParticipationActions,
  upcomingParticipationActions,
  type ParticipationAction,
} from "@/lib/participation-state";
import { computeAvailability } from "@/lib/ssc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/participate/")({
  head: () => ({
    meta: [
      { title: "Participate — Solaris Studio" },
      {
        name: "description",
        content:
          "See what needs your attention now, what opens next, and every Solaris participation service.",
      },
    ],
  }),
  component: ParticipatePage,
});

type JurySummary = {
  signedIn: boolean;
  openRound: { name: string } | null;
  completedOpenRound: { name: string } | null;
};

type TelevoteSummary = {
  openRound: { name: string; editionName: string | null } | null;
};

function confirmationReason(round: PublicRound) {
  return computeAvailability({
    status: round.status,
    count: round.response_count,
    limit: round.response_limit,
    opens_at: round.opens_at,
    closes_at: round.closes_at,
  });
}

async function loadJurySummary(): Promise<JurySummary> {
  const { data: sessionData } = await typedSupabase.auth.getSession();
  if (!sessionData.session) {
    return { signedIn: false, openRound: null, completedOpenRound: null };
  }

  const { data, error } = await (typedSupabase as any).rpc("country_jury_voting_context");
  if (error || !data?.ok) {
    return { signedIn: true, openRound: null, completedOpenRound: null };
  }

  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const openRound = rounds.find(
    (round: any) => round.status === "open" && round.eligible && !round.already_submitted,
  );
  const completedOpenRound = rounds.find(
    (round: any) => round.status === "open" && round.eligible && round.already_submitted,
  );

  return {
    signedIn: true,
    openRound: openRound ? { name: String(openRound.show_name ?? "Jury voting") } : null,
    completedOpenRound: completedOpenRound
      ? { name: String(completedOpenRound.show_name ?? "Jury voting") }
      : null,
  };
}

async function loadTelevoteSummary(): Promise<TelevoteSummary> {
  const { data, error } = await televotingSupabase
    .from("rounds")
    .select("id,name,editions(name)")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (error || !data) return { openRound: null };
  const edition = Array.isArray((data as any).editions)
    ? (data as any).editions[0]
    : (data as any).editions;

  return {
    openRound: {
      name: String((data as any).name ?? "Televoting"),
      editionName: edition?.name ? String(edition.name) : null,
    },
  };
}

function ParticipatePage() {
  const confirmationsQuery = useQuery({
    queryKey: ["participate-confirmation-rounds"],
    queryFn: () => getPublicRounds(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const juryQuery = useQuery({
    queryKey: ["participate-jury-summary"],
    queryFn: loadJurySummary,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const televoteQuery = useQuery({
    queryKey: ["participate-televote-summary"],
    queryFn: loadTelevoteSummary,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const actions = useMemo(() => {
    const rounds = confirmationsQuery.data ?? [];
    const openConfirmation = rounds.find((round) => confirmationReason(round) === "OPEN") ?? null;
    const upcomingConfirmation = [...rounds]
      .filter((round) => confirmationReason(round) === "NOT_OPEN_YET")
      .sort(
        (a, b) =>
          new Date(a.opens_at ?? 0).getTime() - new Date(b.opens_at ?? 0).getTime(),
      )[0] ?? null;

    const confirmationAction: ParticipationAction = openConfirmation
      ? {
          id: "confirmations",
          status: "available",
          title: openConfirmation.name,
          description: openConfirmation.closes_at
            ? `Confirmations are open now · closes ${formatDate(openConfirmation.closes_at)}.`
            : "Confirmations are open now.",
          to: "/confirmations",
          priority: 10,
          closesAt: openConfirmation.closes_at,
        }
      : upcomingConfirmation
        ? {
            id: "confirmations",
            status: "upcoming",
            title: upcomingConfirmation.name,
            description: upcomingConfirmation.opens_at
              ? `Confirmations open ${formatDate(upcomingConfirmation.opens_at)}.`
              : "A confirmation round is scheduled.",
            to: "/confirmations",
            priority: 10,
            opensAt: upcomingConfirmation.opens_at,
          }
        : {
            id: "confirmations",
            status: "unavailable",
            title: "Confirmations",
            description: "No confirmation round is open right now.",
            to: "/confirmations",
            priority: 10,
          };

    const jury = juryQuery.data;
    const juryAction: ParticipationAction = jury?.openRound
      ? {
          id: "jury",
          status: "available",
          title: "Jury voting is open",
          description: `Submit your official ballot for ${jury.openRound.name}.`,
          to: "/jury-voting",
          priority: 20,
        }
      : jury?.completedOpenRound
        ? {
            id: "jury",
            status: "complete",
            title: "Jury ballot submitted",
            description: `Your ballot for ${jury.completedOpenRound.name} is already submitted.`,
            to: "/jury-voting",
            priority: 20,
          }
        : {
            id: "jury",
            status: "unavailable",
            title: "Jury voting",
            description: jury?.signedIn
              ? "No jury ballot currently needs your delegation."
              : "Sign in with a country account to check official jury voting.",
            to: "/jury-voting",
            priority: 20,
          };

    const televote = televoteQuery.data?.openRound;
    const televoteAction: ParticipationAction = televote
      ? {
          id: "televoting",
          status: "available",
          title: "Public voting is open",
          description: televote.editionName
            ? `${televote.editionName} · ${televote.name}`
            : televote.name,
          to: "/televoting",
          priority: 15,
        }
      : {
          id: "televoting",
          status: "unavailable",
          title: "Televoting",
          description: "There is no open public voting round right now.",
          to: "/televoting",
          priority: 30,
        };

    return sortParticipationActions([confirmationAction, televoteAction, juryAction]);
  }, [confirmationsQuery.data, juryQuery.data, televoteQuery.data]);

  const primary = primaryParticipationAction(actions);
  const otherAvailable = actions.filter(
    (action) => action.status === "available" && action.id !== primary?.id,
  );
  const upcoming = upcomingParticipationActions(actions);
  const inactive = actions.filter(
    (action) => action.status === "complete" || action.status === "unavailable",
  );
  const loading =
    confirmationsQuery.isLoading || juryQuery.isLoading || televoteQuery.isLoading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Participate"
        title="Take part in Solaris"
        description="Current actions come first. Upcoming and inactive services stay available without pretending they are equally urgent."
      />

      <section className="mb-7" aria-labelledby="participate-attention-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Now
          </p>
          <h2 id="participate-attention-title" className="mt-1 font-display text-2xl font-bold">
            Needs your attention
          </h2>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border/70 bg-surface/45 p-5 text-sm text-muted-foreground">
            Checking the current participation windows…
          </div>
        ) : primary ? (
          <div className="space-y-3">
            <ParticipationActionCard action={primary} dominant />
            {otherAvailable.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {otherAvailable.map((action) => (
                  <ParticipationActionCard key={action.id} action={action} />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-surface/45 p-5 sm:p-6">
            <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
            <h3 className="mt-3 font-display text-xl font-bold">
              Nothing needs your attention right now
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Solaris will surface confirmations and voting here when they become actionable.
            </p>
          </div>
        )}
      </section>

      {upcoming.length ? (
        <section className="mb-7" aria-labelledby="participate-upcoming-title">
          <div className="mb-3 border-b border-border/60 pb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Next
            </p>
            <h2 id="participate-upcoming-title" className="mt-1 font-display text-xl font-bold">
              Upcoming
            </h2>
          </div>
          <div className="space-y-2">
            {upcoming.map((action) => (
              <ParticipationActionCard key={action.id} action={action} compact />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="participate-other-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Other participation
          </p>
          <h2 id="participate-other-title" className="mt-1 font-display text-xl font-bold">
            Services and instructions
          </h2>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {inactive.map((action) => (
            <ParticipationActionCard key={action.id} action={action} compact />
          ))}
          <StaticParticipationLink
            to="/next-in-line"
            icon={Music2}
            title="Next in Line"
            description="Open the separate side competition for eligible unused songs."
          />
          <StaticParticipationLink
            to="/televoting/how-to-vote"
            icon={Vote}
            title="How to vote"
            description="Read the public voting instructions before a televote opens."
          />
        </div>
      </section>
    </AppShell>
  );
}

function ParticipationActionCard({
  action,
  dominant = false,
  compact = false,
}: {
  action: ParticipationAction;
  dominant?: boolean;
  compact?: boolean;
}) {
  const icon = action.id === "confirmations" ? ClipboardCheck : action.id === "jury" ? Scale : Vote;
  const Icon = icon;
  const stateLabel =
    action.status === "available"
      ? "Open now"
      : action.status === "upcoming"
        ? "Upcoming"
        : action.status === "complete"
          ? "Complete"
          : "Not open";

  return (
    <Link
      to={action.to as any}
      className={cn(
        "group block min-w-0 rounded-2xl border transition-colors",
        dominant
          ? "border-primary/25 bg-primary/[0.07] p-5 sm:p-7"
          : "border-border/70 bg-surface/45 p-4 hover:border-primary/30 hover:bg-surface/75",
        compact && "sm:flex sm:items-center sm:gap-4",
      )}
    >
      <div className={cn("flex items-start gap-3", compact && "sm:flex-1")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
              {stateLabel}
            </span>
          </div>
          <h3 className={cn("mt-1 font-display font-bold", dominant ? "text-2xl sm:text-3xl" : "text-lg")}>
            {action.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        </div>
      </div>
      <span className={cn("mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary", compact && "sm:mt-0")}>
        {action.status === "available" ? "Continue" : "Open"} <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}

function StaticParticipationLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="group flex min-h-28 items-start gap-3 rounded-2xl border border-border/70 bg-surface/45 p-4 transition-colors hover:border-primary/30 hover:bg-surface/75"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
