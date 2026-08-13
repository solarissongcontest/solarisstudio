import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  Bell,
  CheckCircle2,
  CircleAlert,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import {
  useMemo,
} from "react";

import {
  AppShell,
  PageHeader,
  Panel,
} from "@/components/AppShell";

import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useAllVoters,
  useEditions,
} from "@/lib/data";

import {
  buildEditionReadiness,
} from "@/lib/admin-readiness";

import {
  useAdminNotifications,
  useMarkNotificationRead,
} from "@/lib/admin-ops";

import {
  cn,
} from "@/lib/utils";

export const Route =
  createFileRoute(
    "/_authenticated/admin/action-centre",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Action Centre — Solaris Studio",
        },
      ],
    }),

    component:
      ActionCentrePage,
  });

function ActionCentrePage() {
  const {
    data: editions,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const {
    data:
      participants,
  } =
    useAllParticipants();

  const {
    data: voters,
  } =
    useAllVoters();

  const {
    data:
      juryVotes,
  } =
    useAllJuryVotes();

  const {
    data:
      televotes,
  } =
    useAllTelevotes();

  const {
    data: results,
  } =
    useAllResults();

  const {
    data:
      notifications,
  } =
    useAdminNotifications();

  const markRead =
    useMarkNotificationRead();

  const rows =
    useMemo(
      () =>
        [
          ...(editions ??
            []),
        ]
          .sort(
            (a, b) =>
              (b.edition_number ??
                -1) -
              (a.edition_number ??
                -1),
          )
          .map(
            (
              edition,
            ) => ({
              edition,

              readiness:
                buildEditionReadiness({
                  edition,

                  shows:
                    shows ??
                    [],

                  participants:
                    participants ??
                    [],

                  voters:
                    voters ??
                    [],

                  juryVotes:
                    juryVotes ??
                    [],

                  televotes:
                    televotes ??
                    [],

                  results:
                    results ??
                    [],
                }),
            }),
          ),
      [
        editions,
        shows,
        participants,
        voters,
        juryVotes,
        televotes,
        results,
      ],
    );

  const issues =
    rows.flatMap(
      ({
        edition,
        readiness,
      }) =>
        readiness.issues.map(
          (issue) => ({
            edition,
            issue,
          }),
        ),
    );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Operations"
        title="Action Centre"
        description="One queue for blockers, incomplete contest work and persistent organizer notifications."
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <Panel
          title={`${issues.length} live issues`}
          description="These are recalculated from the contest data whenever the page loads."
        >
          <div className="space-y-2">
            {issues.map(
              ({
                edition,
                issue,
              }) => {
                const Icon =
                  issue.severity ===
                  "critical"
                    ? ShieldAlert
                    : issue.severity ===
                        "action"
                      ? TriangleAlert
                      : CircleAlert;

                return (
                  <div
                    key={`${edition.id}-${issue.id}`}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3.5",

                      issue.severity ===
                        "critical"
                        ? "border-red-500/25 bg-red-500/[0.055]"
                        : issue.severity ===
                            "action"
                          ? "border-amber-400/20 bg-amber-400/[0.045]"
                          : "border-sky-400/20 bg-sky-400/[0.045]",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />

                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {editionLabel(
                          edition,
                        )}{" "}
                        ·{" "}
                        {
                          issue.area
                        }
                      </p>

                      <p className="mt-1 text-sm font-bold">
                        {
                          issue.title
                        }
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {
                          issue.detail
                        }
                      </p>

                      <Link
                        to="/admin/$slug"
                        params={{
                          slug:
                            edition.slug,
                        }}
                        className="mt-2 inline-flex text-xs font-bold text-primary"
                      >
                        Open
                        edition →
                      </Link>
                    </div>
                  </div>
                );
              },
            )}

            {!issues.length && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />

                <p className="text-sm font-semibold">
                  No live
                  readiness
                  issues.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Notifications"
          description="Persistent organizer notifications."
        >
          <div className="space-y-2">
            {(
              notifications ??
              []
            ).map(
              (item) => (
                <button
                  key={
                    item.id
                  }
                  type="button"
                  onClick={() => {
                    if (
                      !item.read_at
                    ) {
                      markRead.mutate(
                        item.id,
                      );
                    }

                    if (
                      item.href
                    ) {
                      window.location.href =
                        item.href;
                    }
                  }}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left",

                    item.read_at
                      ? "border-border/60 bg-surface/50 opacity-65"
                      : "border-primary/25 bg-primary/[0.055]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

                    <div className="min-w-0">
                      <p className="text-xs font-bold">
                        {
                          item.title
                        }
                      </p>

                      {item.body && (
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {
                            item.body
                          }
                        </p>
                      )}

                      <p className="mt-2 text-[9px] text-muted-foreground">
                        {new Date(
                          item.created_at,
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ),
            )}

            {!(
              notifications ??
              []
            ).length && (
              <p className="text-sm text-muted-foreground">
                No persistent
                notifications
                yet.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
