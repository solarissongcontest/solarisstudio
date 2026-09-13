import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, ShieldAlert } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import { buildEntryReadinessModel, type EntryReadinessStatus } from "@/lib/entry-readiness-model";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { NAV_TARGETS, countrySearch as buildCountrySearch } from "@/lib/navigation-targets";
import { listStudio2HodEditions, loadStudio2HodWorkspace } from "@/lib/studio2-hod-workspace";

export function MySolarisEntryPage() {
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  const targetCountryId =
    locationSearch &&
    typeof locationSearch === "object" &&
    "country" in locationSearch &&
    typeof locationSearch.country === "string"
      ? locationSearch.country
      : undefined;
  const account = useMyCountryAccount();
  const countries = useCountries();
  const access = account.data?.access;
  const ownCountry = account.data?.country;
  const organizerCountry =
    access?.isOrganizer && targetCountryId
      ? (countries.data ?? []).find((candidate) => candidate.id === targetCountryId)
      : undefined;
  const country = organizerCountry ?? ownCountry;
  const countrySearch = buildCountrySearch(targetCountryId);
  const [editionId, setEditionId] = useState("");

  const featureQuery = useQuery({
    queryKey: ["studio2-entry-readiness-flags"],
    queryFn: async () => {
      const [hodEnabled, workflowEnabled] = await Promise.all([
        isStudio2FeatureEnabled("hod_workspace_v2"),
        isStudio2FeatureEnabled("workflow_engine"),
      ]);
      return hodEnabled && workflowEnabled;
    },
    staleTime: 30_000,
  });

  const editionsQuery = useQuery({
    queryKey: ["studio2-readiness-editions", country?.id ?? "none"],
    enabled: featureQuery.data === true && Boolean(country?.id),
    queryFn: () => listStudio2HodEditions(country!.id),
  });

  useEffect(() => {
    const editions = editionsQuery.data ?? [];
    if (!editions.length) {
      if (editionId) setEditionId("");
      return;
    }
    if (!editionId || !editions.some((edition) => edition.id === editionId)) {
      setEditionId(editions[0]!.id);
    }
  }, [editionId, editionsQuery.data]);

  const workspaceQuery = useQuery({
    queryKey: ["studio2-entry-readiness", country?.id ?? "none", editionId || "none"],
    enabled: featureQuery.data === true && Boolean(country?.id && editionId),
    queryFn: () => loadStudio2HodWorkspace(editionId, country!.id),
  });

  const readiness = useMemo(() => {
    if (!workspaceQuery.data) return null;
    return buildEntryReadinessModel(workspaceQuery.data.eligibility, workspaceQuery.data.workflow);
  }, [workspaceQuery.data]);

  if (
    featureQuery.isLoading ||
    account.isLoading ||
    (targetCountryId && access?.isOrganizer && countries.isLoading)
  ) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading entry readiness…</p>
      </AppShell>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Entry"
          title="Entry readiness is not enabled"
          description="Entry readiness is unavailable until the required delegation and workflow capabilities are enabled."
          actions={
            <Link
              to={NAV_TARGETS.mySolaris}
              search={countrySearch}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Back to MySolaris
            </Link>
          }
        />
      </AppShell>
    );
  }

  if (!access?.isOrganizer && access?.countryStatus === "suspended") {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Entry"
          title="Country account suspended"
          description="Entry operations are unavailable while this country account is suspended."
        />
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Entry"
          title="No country selected"
          description="Claim a country in MySolaris before opening your entry."
          actions={
            <Link
              to={NAV_TARGETS.mySolarisCountry}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Back to MySolaris
            </Link>
          }
        />
      </AppShell>
    );
  }

  const snapshot = workspaceQuery.data;

  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris · Entry"
        title={`${country.name} entry readiness`}
        description="See exactly what is complete, what needs attention and what is preventing the current entry from being ready."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={NAV_TARGETS.mySolarisTasks}
              search={countrySearch}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Open tasks
            </Link>
            <Link
              to={NAV_TARGETS.mySolaris}
              search={countrySearch}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Back to MySolaris
            </Link>
          </div>
        }
      />

      <div className="space-y-5">
        <Panel
          title="Edition"
          description="Readiness is calculated against the selected edition and its current delegation data."
        >
          {editionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading delegation editions…</p>
          ) : editionsQuery.error ? (
            <ErrorText error={editionsQuery.error} />
          ) : (editionsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Solaris edition is linked to this delegation yet.
            </p>
          ) : (
            <select
              value={editionId}
              onChange={(event) => setEditionId(event.target.value)}
              className="min-h-11 w-full max-w-xl rounded-xl border border-border bg-background px-3 text-sm"
            >
              {(editionsQuery.data ?? []).map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.editionNumber == null
                    ? edition.name
                    : `SSC ${edition.editionNumber} · ${edition.name}`}
                </option>
              ))}
            </select>
          )}
        </Panel>

        {editionId && workspaceQuery.isLoading ? (
          <Panel title="Calculating readiness">
            <p className="text-sm text-muted-foreground">
              Checking eligibility and workflow dependencies…
            </p>
          </Panel>
        ) : workspaceQuery.error ? (
          <Panel title="Entry readiness">
            <ErrorText error={workspaceQuery.error} />
          </Panel>
        ) : snapshot && readiness ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ReadinessMetric
                label="Overall"
                value={`${readiness.score}%`}
                status={readiness.status}
              />
              <ReadinessMetric
                label="Eligibility"
                value={`${readiness.eligibilityScore}%`}
                status={eligibilityStatus(snapshot.eligibility.status)}
              />
              <ReadinessMetric
                label="Workflow"
                value={`${readiness.workflowProgress}%`}
                status={snapshot.workflow.complete ? "ready" : "attention"}
              />
              <ReadinessMetric
                label="Blockers"
                value={`${readiness.blockerCount}`}
                status={readiness.blockerCount ? "blocked" : "ready"}
              />
            </section>

            <Panel
              title="Readiness summary"
              description={readinessSummary(
                readiness.status,
                readiness.blockerCount,
                readiness.warningCount,
              )}
            >
              <div className="space-y-4">
                <ProgressLine label="Eligibility checks" value={readiness.eligibilityScore} />
                <ProgressLine label="Submission workflow" value={readiness.workflowProgress} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <SmallStat
                    label="Checks passed"
                    value={`${readiness.passedChecks}/${readiness.totalChecks}`}
                  />
                  <SmallStat
                    label="Workflow complete"
                    value={`${readiness.completedWorkflowTasks}/${readiness.totalWorkflowTasks}`}
                  />
                  <SmallStat label="Warnings" value={`${readiness.warningCount}`} />
                </div>
              </div>
            </Panel>

            <Panel
              title="What needs attention"
              description={
                readiness.actions.length
                  ? "Eligibility blockers come first, followed by workflow steps that can be completed now."
                  : "Nothing is waiting. This entry is ready."
              }
            >
              {readiness.actions.length ? (
                <div className="space-y-2">
                  {readiness.actions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-xl border border-border bg-background/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {action.priority === "critical" ? (
                            <ShieldAlert className="size-4 text-destructive" />
                          ) : action.priority === "high" ? (
                            <AlertTriangle className="size-4 text-amber-400" />
                          ) : (
                            <CircleDot className="size-4 text-muted-foreground" />
                          )}
                          <p className="text-sm font-semibold">{action.label}</p>
                        </div>
                        <StatusPill value={`${action.source} · ${action.priority}`} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  Entry eligibility and workflow are complete.
                </div>
              )}
            </Panel>

            <Panel
              title="Eligibility checks"
              description={`${readiness.passedChecks}/${readiness.totalChecks} checks currently pass.`}
            >
              <div className="grid gap-2 lg:grid-cols-2">
                {snapshot.eligibility.checks.map((check) => (
                  <div
                    key={check.id}
                    className="rounded-xl border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{check.label}</p>
                      <StatusPill value={check.level} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.message}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Submission workflow"
              description={`${snapshot.workflow.progress}% complete · ${snapshot.workflow.blockedCount} dependency-blocked · ${snapshot.workflow.nextTaskIds.length} ready now`}
            >
              <div className="space-y-2">
                {snapshot.workflow.tasks.map((task, index) => {
                  const blockerLabels = task.blockers.map(
                    (blockerId) =>
                      snapshot.workflow.tasks.find((candidate) => candidate.id === blockerId)
                        ?.label ?? blockerId,
                  );
                  return (
                    <div
                      key={task.id}
                      className="grid gap-3 rounded-xl border border-border bg-background/40 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-start"
                    >
                      <div className="grid size-8 place-items-center rounded-full border border-border bg-surface text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{task.label}</p>
                        {blockerLabels.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Waiting for: {blockerLabels.join(", ")}
                          </p>
                        ) : task.ready ? (
                          <p className="mt-1 text-xs text-emerald-300">Ready to work now.</p>
                        ) : task.effectiveStatus === "completed" ? (
                          <p className="mt-1 text-xs text-muted-foreground">Completed.</p>
                        ) : null}
                      </div>
                      <StatusPill value={task.effectiveStatus} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReadinessMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: EntryReadinessStatus;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <StatusPill value={status} />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {value.replace(/_/g, " ")}
    </span>
  );
}

function eligibilityStatus(status: "ready" | "warning" | "blocked"): EntryReadinessStatus {
  if (status === "blocked") return "blocked";
  if (status === "warning") return "attention";
  return "ready";
}

function readinessSummary(status: EntryReadinessStatus, blockers: number, warnings: number) {
  if (status === "ready")
    return "All current eligibility checks and required workflow steps are complete.";
  if (status === "blocked")
    return `${blockers} blocker${blockers === 1 ? "" : "s"} must be resolved before this entry is ready.${warnings ? ` ${warnings} warning${warnings === 1 ? "" : "s"} also need attention.` : ""}`;
  return `No hard blocker is preventing progress, but the workflow is not finished${warnings ? ` and ${warnings} warning${warnings === 1 ? "" : "s"} remain` : ""}.`;
}

function ErrorText({ error }: { error: unknown }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof Error ? error.message : "Entry readiness could not complete that request."}
    </p>
  );
}
