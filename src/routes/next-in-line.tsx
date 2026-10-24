import { createFileRoute, Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";

import { NextInLineCompetition } from "@/components/NextInLineCompetition";
import { Panel } from "@/components/AppShell";
import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { useFanSession } from "@/lib/prediction-data";

export const Route = createFileRoute("/next-in-line")({
  head: () => ({
    meta: [
      { title: "Next in Line — Solaris Studio" },
      {
        name: "description",
        content: "The separate Solaris competition for songs that did not win a National Final or were not selected internally by countries already competing in SSC.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NextInLinePage,
});

function NextInLinePage() {
  const session = useFanSession();

  if (session.isLoading) {
    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service="next-in-line"
          title="Next in Line"
          description="A second competition for songs left behind by countries already competing in the current SSC edition."
          maxWidth="max-w-4xl"
        >
          <Panel>
            <p className="py-6 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              Checking your Solaris session…
            </p>
          </Panel>
        </ParticipationServiceShell>
      </ParticipationRouteChrome>
    );
  }

  if (!session.data) {
    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service="next-in-line"
          title="Next in Line"
          description="A second competition for songs left behind by countries already competing in the current SSC edition."
          maxWidth="max-w-4xl"
        >
          <Panel title="Sign in to enter Next in Line">
            <p className="text-sm leading-6 text-muted-foreground">
              Solaris derives the eligible delegation and source entry from your authenticated account. A country cannot be selected as authority while signed out.
            </p>
            <Link
              to="/auth"
              search={{ redirect: "/next-in-line" }}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Sign in
            </Link>
          </Panel>
        </ParticipationServiceShell>
      </ParticipationRouteChrome>
    );
  }

  return <NextInLineCompetition key={session.data.id} />;
}
