import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { PublicCurrentStatus } from "@/components/public/PublicCurrentStatus";
import { PublicDestinationGrid } from "@/components/public/PublicDestinationGrid";
import { PublicHubHero } from "@/components/public/PublicHubHero";
import { PublicPrimaryAction } from "@/components/public/PublicPrimaryAction";
import { PublicSecondaryLinks } from "@/components/public/PublicSecondaryLinks";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { televotingSupabase } from "@/integrations/televoting/client";
import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import { formatEventDateTime } from "@/lib/public-time";
import {
  primaryParticipationAction,
  sortParticipationActions,
  upcomingParticipationActions,
  type ParticipationAction,
} from "@/lib/participation-state";
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
      <PublicHubHero
        eyebrow="Participate"
        title="Take part in Solaris"
        description="Current actions come first. Upcoming and inactive services stay available without competing with work that actually needs you now."
      />

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

      {upcoming.length ? (
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

