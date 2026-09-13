import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, UsersRound, Vote } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/my-solaris/voting")({
  head: () => ({
    meta: [{ title: "MySolaris voting — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: MySolarisVotingPage,
});

function MySolarisVotingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris · Voting"
        title="Voting"
        description="Your delegation voting and the public televote are reachable from one MySolaris section instead of being scattered across unrelated menus."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Jury voting"
          description="Submit the official HOD jury ballot when the organizer opens the jury window."
        >
          <Link
            to="/jury-voting"
            className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/55 px-4 transition-colors hover:border-primary/25 hover:bg-surface-strong"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Open jury voting</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Official delegation ballot
                </span>
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Panel>

        <Panel
          title="Public televoting"
          description="Open the audience vote or read the current voting instructions."
        >
          <div className="space-y-2">
            <Link
              to="/televoting"
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/55 px-4 transition-colors hover:border-primary/25 hover:bg-surface-strong"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Vote className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Open televoting</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Audience voting surface
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link
              to="/televoting/how-to-vote"
              className="inline-flex min-h-10 items-center text-xs font-semibold text-primary"
            >
              Read how voting works →
            </Link>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
