import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Music2,
  Scale,
  Vote,
} from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { AppTaskCenter } from "@/components/app/AppTaskCenter";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicCurrentStatus } from "@/components/public/PublicCurrentStatus";
import { PublicDestinationGrid } from "@/components/public/PublicDestinationGrid";
import { PublicHubHero } from "@/components/public/PublicHubHero";
import { PublicPrimaryAction } from "@/components/public/PublicPrimaryAction";
import { PublicSecondaryLinks } from "@/components/public/PublicSecondaryLinks";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { televotingSupabase } from "@/integrations/televoting/client";
import { getCountryConfirmationAccess } from "@/lib/confirmation-country-account";
import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import { formatEventDateTime } from "@/lib/public-time";
import {
  primaryParticipationAction,
  sortParticipationActions,
  upcomingParticipationActions,
  type ParticipationAction,
} from "@/lib/participation-state";
import { buildParticipationTasks, type VotingTaskInput } from "@/lib/participation-os";
import { computeAvailability } from "@/lib/ssc";

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

type VotingRoundSummary = {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
};

type JurySummary = {
  signedIn: boolean;
  openRound: VotingRoundSummary | null;
  completedOpenRound: VotingRoundSummary | null;
};

type TelevoteSummary = {
  openRound: {
    id: string;
    name: string;
    editionName: string | null;
    closesAt: string | null;
  } | null;
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

  const summarize = (round: any): VotingRoundSummary => ({
    id: String(round.show_id ?? round.id ?? round.show_name ?? "jury"),
    name: String(round.show_name ?? "Jury voting"),
    opensAt: round.opens_at ? String(round.opens_at) : null,
    closesAt: round.closes_at ? String(round.closes_at) : null,
  });

  return {
    signedIn: true,
    openRound: openRound ? summarize(openRound) : null,
    completedOpenRound: completedOpenRound ? summarize(completedOpenRound) : null,
  };
}

async function loadTelevoteSummary(): Promise<TelevoteSummary> {
  const { data, error } = await televotingSupabase
    .from("rounds")
    .select("id,name,closes_at,editions(name)")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (error || !data) return { openRound: null };
  const edition = Array.isArray((data as any).editions)
    ? (data as any).editions[0]
    : (data as any).editions;

  return {
    openRound: {
      id: String((data as any).id),
      name: String((data as any).name ?? "Televoting"),
      editionName: edition?.name ? String(edition.name) : null,
      closesAt: (data as any).closes_at ? String((data as any).closes_at) : null,
    },
  };
}

function ParticipatePage() {
  const { isAppMode } = useSolarisApp();
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
  const confirmationAccessQuery = useQuery({
    enabled: isAppMode && juryQuery.data?.signedIn === true,
    queryKey: ["participate-confirmation-access", "app"],
    queryFn: getCountryConfirmationAccess,
    staleTime: 10_000,
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
            ? `Confirmations are open now · closes ${formatEventDateTime(openConfirmation.closes_at)}.`
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
              ? `Confirmations open ${formatEventDateTime(upcomingConfirmation.opens_at)}.`
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
          description: `Submit your official ballot for ${jury.openRound.name}. Friend-voting integrity checks apply before submission.`,
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
              ? "No jury ballot currently needs your delegation. Friend-voting integrity checks apply when voting opens."
              : "Country account required. Sign in to check official jury voting; friend-voting integrity checks apply before submission.",
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

  const appTasks = useMemo(() => {
    const rounds = confirmationsQuery.data ?? [];
    const access = confirmationAccessQuery.data;
    const participantRounds =
      access?.authenticated && access.country ? rounds : [];
    const currentRound =
      [...participantRounds].sort(
        (a, b) =>
          b.edition_number - a.edition_number ||
          new Date(b.opens_at ?? 0).getTime() - new Date(a.opens_at ?? 0).getTime(),
      )[0] ?? null;

    const jury = juryQuery.data;
    const juryTask: VotingTaskInput | null = jury?.openRound
      ? {
          id: jury.openRound.id,
          title: `${jury.openRound.name} jury ballot`,
          route: "/jury-voting",
          eligible: true,
          submitted: false,
          status: "open",
          opensAt: jury.openRound.opensAt,
          closesAt: jury.openRound.closesAt,
        }
      : jury?.completedOpenRound
        ? {
            id: jury.completedOpenRound.id,
            title: `${jury.completedOpenRound.name} jury ballot`,
            route: "/jury-voting",
            eligible: true,
            submitted: true,
            status: "open",
            opensAt: jury.completedOpenRound.opensAt,
            closesAt: jury.completedOpenRound.closesAt,
          }
        : null;

    const televote = televoteQuery.data?.openRound;
    const televoteTask: VotingTaskInput | null = televote
      ? {
          id: televote.id,
          title: televote.editionName
            ? `${televote.editionName} public voting`
            : televote.name,
          route: "/televoting",
          eligible: true,
          submitted: false,
          status: "open",
          closesAt: televote.closesAt,
          required: false,
        }
      : null;

    return {
      editionLabel: currentRound
        ? `SSC ${currentRound.edition_number} · ${currentRound.edition_name}`
        : null,
      tasks: buildParticipationTasks({
        editionId: currentRound?.edition_id ?? null,
        responses: access?.responses ?? [],
        requirements: access?.requirements ?? [],
        rounds: participantRounds,
        jury: juryTask,
        televote: televoteTask,
      }),
    };
  }, [
    confirmationAccessQuery.data,
    confirmationsQuery.data,
    juryQuery.data,
    televoteQuery.data,
  ]);

  const primary = primaryParticipationAction(actions);
  const otherAvailable = actions.filter(
    (action) => action.status === "available" && action.id !== primary?.id,
  );
  const upcoming = upcomingParticipationActions(actions);
  const inactive = actions.filter(
    (action) => action.status === "complete" || action.status === "unavailable",
  );
  const appAuthKnown = !juryQuery.isLoading;
  const appSignedIn = juryQuery.data?.signedIn === true;
  const loading =
    confirmationsQuery.isLoading ||
    juryQuery.isLoading ||
    televoteQuery.isLoading ||
    (isAppMode && appSignedIn && confirmationAccessQuery.isLoading);

  return (
    <AppShell>
      {!isAppMode ? (
        <PublicHubHero
          eyebrow="Participate"
          title="Take part in Solaris"
          description="Current actions come first. Upcoming and inactive services stay available without competing with work that actually needs you now."
        />
      ) : null}

      {isAppMode ? (
        !appAuthKnown ? (
          <div className="solaris-app-task-loading" role="status" aria-live="polite">
            <Clock3 className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Checking participation</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Loading the current Solaris participation state.
              </p>
            </div>
          </div>
        ) : !appSignedIn ? (
          <section className="solaris-app-task-summary" aria-labelledby="app-participate-sign-in">
            <div className="min-w-0">
              <p className="solaris-app-task-kicker">Your SSC tasks</p>
              <h2 id="app-participate-sign-in" className="mt-1 text-xl font-black tracking-[-.025em]">
                Sign in to see what needs you
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Your delegation deadlines, confirmations and jury tasks appear here after sign-in. Public voting and other services remain available below.
              </p>
              <Link
                to="/auth"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Sign in to Solaris
              </Link>
            </div>
          </section>
        ) : loading ? (
          <div className="solaris-app-task-loading" role="status" aria-live="polite">
            <Clock3 className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Checking your edition</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Matching confirmations and voting to your delegation.
              </p>
            </div>
          </div>
        ) : (
          <AppTaskCenter tasks={appTasks.tasks} editionLabel={appTasks.editionLabel} />
        )
      ) : (
      <section aria-labelledby="participate-attention-title">
        <div className="public-hub-section-heading">
          <p className="public-hub-eyebrow">Now</p>
          <h2 id="participate-attention-title">Needs your attention</h2>
        </div>

        {loading ? (
          <PublicCurrentStatus
            icon={Clock3}
            eyebrow="Checking status"
            title="Loading participation windows"
            description="Solaris is checking confirmations, jury voting and public voting."
          />
        ) : primary ? (
          <div className="space-y-3">
            <PublicPrimaryAction
              to={primary.to}
              icon={iconForAction(primary)}
              status="Open now"
              title={primary.title}
              description={primary.description}
              dominant
            />
            {otherAvailable.length ? (
              <PublicDestinationGrid columns={2}>
                {otherAvailable.map((action) => (
                  <PublicPrimaryAction
                    key={action.id}
                    to={action.to}
                    icon={iconForAction(action)}
                    status="Open now"
                    title={action.title}
                    description={action.description}
                  />
                ))}
              </PublicDestinationGrid>
            ) : null}
          </div>
        ) : (
          <PublicCurrentStatus
            icon={CheckCircle2}
            eyebrow="Up to date"
            title="Nothing needs your attention right now"
            description="Solaris will surface confirmations and voting here when they become actionable."
            tone="complete"
          />
        )}
      </section>
      )}

      {!isAppMode && upcoming.length ? (
        <section className="public-hub-section" aria-labelledby="participate-upcoming-title">
          <div className="public-hub-section-heading">
            <p className="public-hub-eyebrow is-muted">Next</p>
            <h2 id="participate-upcoming-title">Upcoming</h2>
          </div>
          <PublicDestinationGrid columns={2}>
            {upcoming.map((action) => (
              <PublicPrimaryAction
                key={action.id}
                to={action.to}
                icon={iconForAction(action)}
                status="Upcoming"
                title={action.title}
                description={action.description}
              />
            ))}
          </PublicDestinationGrid>
        </section>
      ) : null}

      <PublicSecondaryLinks
        eyebrow="Other participation"
        title="Services and instructions"
        items={[
          ...inactive.map((action) => ({
            to: action.to,
            icon: iconForAction(action),
            title: action.title,
            description: action.description,
          })),
          {
            to: "/next-in-line",
            icon: Music2,
            title: "Next in Line",
            description: "Open the separate side competition for eligible unused songs.",
          },
          {
            to: "/televoting/how-to-vote",
            icon: Vote,
            title: "How to vote",
            description: "Read the public voting instructions before a televote opens.",
          },
        ]}
      />
    </AppShell>
  );
}

function iconForAction(action: ParticipationAction) {
  if (action.id === "confirmations") return ClipboardCheck;
  if (action.id === "jury") return Scale;
  return Vote;
}

