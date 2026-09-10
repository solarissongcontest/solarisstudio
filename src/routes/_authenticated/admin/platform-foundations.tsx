import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Database, Flag, History, Workflow } from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { AdminPage } from "@/components/admin/AdminShell";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useEditions } from "@/lib/data";
import {
  EDITION_PHASE_LABELS,
  describeEditionTransition,
  getAvailableEditionPhaseTransitions,
  type EditionPhase,
} from "@/lib/platform/edition-state";
import {
  getEditionRuntimeState,
  initializeEditionRuntimeState,
  listEditionPlatformEvents,
  listPlatformFeatureFlags,
  transitionEditionRuntimeState,
} from "@/lib/platform/runtime-state";

export const Route = createFileRoute("/_authenticated/admin/platform-foundations")({
  head: () => ({
    meta: [
      { title: "Platform foundations — Solaris Organizer" },
      {
        name: "description",
        content: "Inspect and operate the Solaris edition state engine and shared platform foundations.",
      },
    ],
  }),
  component: PlatformFoundationsPage,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function PlatformFoundationsPage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const queryClient = useQueryClient();

  const edition =
    editions.find((item) => item.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const runtimeQuery = useQuery({
    queryKey: ["platform-runtime-state", edition?.id],
    queryFn: () => getEditionRuntimeState(edition!.id),
    enabled: Boolean(edition?.id),
  });

  const eventsQuery = useQuery({
    queryKey: ["platform-events", edition?.id],
    queryFn: () => listEditionPlatformEvents(edition!.id, 30),
    enabled: Boolean(edition?.id && runtimeQuery.data),
  });

  const flagsQuery = useQuery({
    queryKey: ["platform-feature-flags"],
    queryFn: listPlatformFeatureFlags,
  });

  const refreshRuntime = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["platform-runtime-state", edition?.id] }),
      queryClient.invalidateQueries({ queryKey: ["platform-events", edition?.id] }),
    ]);
  };

  const initializeMutation = useMutation({
    mutationFn: () => initializeEditionRuntimeState(edition!.id, "planning", "Initialized from Organizer"),
    onSuccess: refreshRuntime,
  });

  const transitionMutation = useMutation({
    mutationFn: (target: EditionPhase) =>
      transitionEditionRuntimeState(
        edition!.id,
        target,
        `Organizer transition to ${EDITION_PHASE_LABELS[target]}`,
      ),
    onSuccess: refreshRuntime,
  });

  const mutationError = initializeMutation.error ?? transitionMutation.error;
  const runtime = runtimeQuery.data;
  const transitions = runtime ? getAvailableEditionPhaseTransitions(runtime.phase) : [];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Solaris Studio 2.0"
        title="Platform foundations"
        description="The shared runtime layer behind the future Control Room, workflows, simulations, replay, governance and contextual Organizer experience."
      />

      {!edition ? (
        <AdminEmptyState
          icon={Database}
          title="No edition selected"
          description="Create or select an edition before initializing its runtime state."
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <AdminCard strong>
              <AdminCardHeader
                eyebrow={editionLabel(edition)}
                title="Edition State Engine"
                description="Runtime state is intentionally separate from the legacy edition publication status while Solaris migrates feature-by-feature."
                action={
                  runtime ? (
                    <AdminStatus tone={runtime.phase === "archived" ? "neutral" : "ready"}>
                      {EDITION_PHASE_LABELS[runtime.phase]}
                    </AdminStatus>
                  ) : undefined
                }
              />

              {runtimeQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading runtime state…</p>
              ) : runtimeQuery.error ? (
                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
                  <p className="text-sm font-semibold text-amber-100">Runtime schema is not available yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {errorMessage(runtimeQuery.error)}
                  </p>
                </div>
              ) : !runtime ? (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This edition has no runtime state yet. Initialization is explicit so existing editions are never assigned a contest phase by guesswork.
                  </p>
                  <button
                    type="button"
                    onClick={() => initializeMutation.mutate()}
                    disabled={initializeMutation.isPending}
                    className="min-h-11 rounded-xl bg-sky-200 px-4 text-sm font-bold text-slate-950 disabled:opacity-50"
                  >
                    {initializeMutation.isPending ? "Initializing…" : "Initialize in Planning"}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <RuntimeCell label="Confirmations" value={runtime.confirmations_state} />
                    <RuntimeCell label="Submissions" value={runtime.submissions_state} />
                    <RuntimeCell label="Jury voting" value={runtime.jury_voting_state} />
                    <RuntimeCell label="Televoting" value={runtime.televoting_state} />
                    <RuntimeCell label="Results" value={runtime.results_state} />
                    <RuntimeCell label="State version" value={`v${runtime.version}`} />
                  </div>

                  <div>
                    <p className="admin-section-label mb-2">Allowed next phases</p>
                    {transitions.length ? (
                      <div className="flex flex-wrap gap-2">
                        {transitions.map((target) => (
                          <button
                            key={target}
                            type="button"
                            onClick={() => transitionMutation.mutate(target)}
                            disabled={transitionMutation.isPending}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.07] disabled:opacity-50"
                          >
                            {EDITION_PHASE_LABELS[target]}
                            <ArrowRight className="size-4" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {runtime.phase === "archived"
                          ? "Archived is terminal. Historical corrections should be appended instead of rewriting the lifecycle."
                          : "No forward transition is configured from this phase."}
                      </p>
                    )}
                  </div>

                  {runtime.last_transition_at ? (
                    <p className="text-xs text-muted-foreground">
                      Last transition {new Date(runtime.last_transition_at).toLocaleString()}
                      {runtime.last_transition_reason ? ` · ${runtime.last_transition_reason}` : ""}
                    </p>
                  ) : null}
                </div>
              )}

              {mutationError ? (
                <p className="mt-4 rounded-xl border border-red-300/15 bg-red-300/[0.05] p-3 text-xs text-red-100">
                  {errorMessage(mutationError)}
                </p>
              ) : null}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Rollout safety"
                title="Feature flags"
                description="Major systems stay dark until their edition is ready for them."
                action={<Flag className="size-4 text-muted-foreground" />}
              />

              {flagsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading flags…</p>
              ) : flagsQuery.error ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {errorMessage(flagsQuery.error)}
                </p>
              ) : (
                <div className="space-y-2">
                  {(flagsQuery.data ?? []).map((flag) => (
                    <div
                      key={flag.key}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{flag.key}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{flag.description}</p>
                      </div>
                      <AdminStatus tone={flag.enabled_by_default ? "ready" : "neutral"}>
                        {flag.enabled_by_default ? "Default on" : "Default off"}
                      </AdminStatus>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AdminCard>
              <AdminCardHeader
                eyebrow="Event engine"
                title="Recent runtime events"
                description="This append-only stream will later power replay, incident reconstruction, Time Machine and edition storylines."
                action={<History className="size-4 text-muted-foreground" />}
              />

              {!runtime ? (
                <p className="text-sm text-muted-foreground">Initialize runtime state to begin the event stream.</p>
              ) : eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading events…</p>
              ) : eventsQuery.error ? (
                <p className="text-xs text-muted-foreground">{errorMessage(eventsQuery.error)}</p>
              ) : eventsQuery.data?.length ? (
                <div className="space-y-2">
                  {eventsQuery.data.map((event) => (
                    <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{event.event_type}</p>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(event.occurred_at).toLocaleString()}
                        </time>
                      </div>
                      {event.event_type === "EDITION_PHASE_CHANGED" &&
                      typeof event.payload.from === "string" &&
                      typeof event.payload.to === "string" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {describeEditionTransition(
                            event.payload.from as EditionPhase,
                            event.payload.to as EditionPhase,
                          )}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No runtime events recorded yet.</p>
              )}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Workflow engine"
                title="Shared operational model"
                description="The schema is ready for confirmation, submission, host-transfer, incident and production workflows without each feature inventing its own task system."
                action={<Workflow className="size-4 text-muted-foreground" />}
              />
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Workflows contain ordered stages, tasks, assignees, due dates, priority, structured context and explicit task dependencies.
                </p>
                <p>
                  The next slice will add dependency evaluation so a late entry can automatically mark graphics, recap and broadcast-package tasks as at risk.
                </p>
              </div>
            </AdminCard>
          </div>
        </>
      )}
    </AdminPage>
  );
}

function RuntimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold capitalize text-foreground">{value.replaceAll("_", " ")}</p>
    </div>
  );
}
