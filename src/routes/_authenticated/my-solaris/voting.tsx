import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  UsersRound,
  Vote,
} from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { televotingSupabase } from "@/integrations/televoting/client";
import { loadStudio2HodWorkspace } from "@/lib/studio2-hod-workspace";

export const Route = createFileRoute("/_authenticated/my-solaris/voting")({
  head: () => ({
    meta: [
      { title: "MySolaris voting — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MySolarisVotingPage,
});

type OpenTelevote = {
  id: string;
  name: string;
  editionName: string | null;
};

async function loadOpenTelevote(): Promise<OpenTelevote | null> {
  const { data, error } = await televotingSupabase
    .from("rounds")
    .select("id,name,editions(name)")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    name: string;
    editions: { name: string } | null;
  };
  return {
    id: row.id,
    name: row.name,
    editionName: row.editions?.name ?? null,
  };
}

function MySolarisVotingPage() {
  return (
    <AppShell>
      <MySolarisVotingContent />
    </AppShell>
  );
}

function MySolarisVotingContent() {
  const workspace = useMySolaris();
  const country = workspace.countryAccount?.country;
  const edition = workspace.currentEdition;

  const delegationQuery = useQuery({
    queryKey: [
      "mysolaris-voting-status",
      edition?.id ?? "none",
      country?.id ?? "none",
    ],
    enabled: Boolean(
      workspace.capabilities.hod_workspace_v2 && edition?.id && country?.id,
    ),
    queryFn: () => loadStudio2HodWorkspace(edition!.id, country!.id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const televoteQuery = useQuery({
    queryKey: ["mysolaris-open-televote"],
    queryFn: loadOpenTelevote,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const context = delegationQuery.data?.context;
  const hod = context?.juryMembers[0] ?? null;
  const juryDeadline = context?.deadlines.find((deadline) =>
    `${deadline.kind} ${deadline.label}`.toLowerCase().includes("jury"),
  );
  const juryReady = Boolean(context && hod);
  const ballotSubmitted = Boolean(context?.juryBallotSubmitted);
  const openTelevote = televoteQuery.data ?? null;

  return (
    <>
      <PageHeader
        eyebrow="MySolaris · Voting"
        title="Voting"
        description="Your delegation ballot and the public televote share one status-led workspace."
      />

      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <VotingMetric
            label="Delegation"
            value={country?.name ?? "Not connected"}
          />
          <VotingMetric
            label="Assigned HOD"
            value={
              hod?.displayName ?? (juryReady ? "Assigned" : "Not assigned")
            }
          />
          <VotingMetric
            label="Jury ballot"
            value={ballotSubmitted ? "Submitted" : "Not submitted"}
          />
          <VotingMetric
            label="Televote"
            value={openTelevote ? "Open" : "Closed"}
          />
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Jury"
            description="The official HOD ballot for the current edition"
            actions={
              <StatusPill
                value={
                  ballotSubmitted
                    ? "submitted"
                    : juryReady
                      ? "ready"
                      : "not ready"
                }
              />
            }
          >
            {delegationQuery.isLoading || workspace.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading delegation voting status…
              </p>
            ) : delegationQuery.error ? (
              <p className="text-sm text-destructive">
                The delegation voting status could not be loaded.
              </p>
            ) : !country || !edition ? (
              <p className="text-sm text-muted-foreground">
                Connect a country and current edition before jury voting.
              </p>
            ) : !workspace.capabilities.hod_workspace_v2 ? (
              <p className="text-sm text-muted-foreground">
                Delegation voting status is not enabled for this account.
              </p>
            ) : (
              <div className="space-y-3">
                <StatusRow
                  icon={UsersRound}
                  label="Assigned HOD"
                  value={hod?.displayName ?? "No HOD assigned"}
                  complete={Boolean(hod)}
                />
                <StatusRow
                  icon={CheckCircle2}
                  label="Ballot status"
                  value={
                    ballotSubmitted
                      ? "Submitted"
                      : juryReady
                        ? "Ready to submit"
                        : "Waiting for HOD assignment"
                  }
                  complete={ballotSubmitted}
                />
                <StatusRow
                  icon={CalendarClock}
                  label="Deadline"
                  value={
                    juryDeadline
                      ? formatDateTime(juryDeadline.dueAt)
                      : "No jury deadline published"
                  }
                  complete={Boolean(juryDeadline?.completedAt)}
                />
              </div>
            )}
            <Link
              to="/jury-voting"
              className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/55 px-4 text-sm font-semibold transition-colors hover:border-primary/25 hover:bg-surface-strong"
            >
              <span>
                {ballotSubmitted ? "Review jury vote" : "Open jury vote"}
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </Panel>

          <Panel
            title="Public televote"
            description="Live audience-voting status and relevant actions"
            actions={<StatusPill value={openTelevote ? "open" : "closed"} />}
          >
            {televoteQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Checking the public televote…
              </p>
            ) : televoteQuery.error ? (
              <p className="text-sm text-destructive">
                The live televote status could not be loaded.
              </p>
            ) : openTelevote ? (
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
                  Open now
                </p>
                <p className="mt-2 text-base font-semibold">
                  {openTelevote.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {openTelevote.editionName ?? "Solaris Song Contest"}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <Clock3
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold">
                  Voting is currently closed
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The public voting service has not published a future opening
                  time. This status refreshes automatically.
                </p>
              </div>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                to="/televoting"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
              >
                <Vote className="size-4" aria-hidden="true" /> Open televoting
              </Link>
              <Link
                to="/televoting/how-to-vote"
                className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
              >
                How voting works
              </Link>
              <Link
                to="/televoting/results"
                className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold sm:col-span-2"
              >
                Published televote results
              </Link>
            </div>
          </Panel>
        </div>

        <Panel
          title="What belongs here"
          description="Participant-facing status only"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            MySolaris shows the assigned HOD, ballot state, deadline and public
            voting availability. Internal voter identities, integrity signals
            and organizer controls remain in protected Organizer tools.
          </p>
        </Panel>
      </div>
    </>
  );
}

function VotingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  complete,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${complete ? "bg-emerald-300/10 text-emerald-200" : "bg-surface text-muted-foreground"}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">
          {value}
        </span>
      </span>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {value}
    </span>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
