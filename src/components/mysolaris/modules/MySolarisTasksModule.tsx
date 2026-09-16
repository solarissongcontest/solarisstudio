import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useCountries } from "@/lib/data";
import { useMyCountryAccount } from "@/lib/country-account";
import { listStudio2EligibilityOverrides } from "@/lib/studio2-eligibility";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { NAV_TARGETS, countrySearch as buildCountrySearch } from "@/lib/navigation-targets";
import {
  acknowledgeStudio2Notice,
  listStudio2HodEditions,
  loadStudio2HodWorkspace,
} from "@/lib/studio2-hod-workspace";

export function MySolarisTasksModule() {
  const search = useRouterState({ select: (state) => state.location.search });
  const targetCountryId =
    search &&
    typeof search === "object" &&
    "country" in search &&
    typeof search.country === "string"
      ? search.country
      : undefined;
  const queryClient = useQueryClient();
  const account = useMyCountryAccount();
  const countries = useCountries();
  const access = account.data?.access;
  const ownCountry = account.data?.country;
  const organizerInspection = Boolean(access?.isOrganizer && targetCountryId);
  const organizerCountry = organizerInspection
    ? (countries.data ?? []).find((candidate) => candidate.id === targetCountryId)
    : undefined;
  const country = organizerCountry ?? ownCountry;
  const countrySearch = buildCountrySearch(targetCountryId);
  const [editionId, setEditionId] = useState("");

  const featureQuery = useQuery({
    queryKey: ["studio2-feature", "hod_workspace_v2"],
    queryFn: () => isStudio2FeatureEnabled("hod_workspace_v2"),
    staleTime: 30_000,
  });

  const editionsQuery = useQuery({
    queryKey: ["studio2-hod-editions", country?.id ?? "none"],
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
    queryKey: ["studio2-hod-workspace", country?.id ?? "none", editionId || "none"],
    enabled: featureQuery.data === true && Boolean(country?.id && editionId),
    queryFn: () => loadStudio2HodWorkspace(editionId, country!.id),
  });

  const eligibilityOverridesQuery = useQuery({
    queryKey: [
      "studio2-eligibility-overrides",
      editionId || "none",
      country?.id ?? "none",
      "active",
    ],
    enabled: featureQuery.data === true && Boolean(country?.id && editionId),
    queryFn: () => listStudio2EligibilityOverrides(editionId, { countryId: country!.id }),
    staleTime: 15_000,
  });

  const refreshWorkspace = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["studio2-hod-workspace", country?.id ?? "none", editionId],
    });
  };

  const acknowledgeNotice = useMutation({
    mutationFn: (noticeId: string) => acknowledgeStudio2Notice(noticeId),
    onSuccess: refreshWorkspace,
  });

  if (
    featureQuery.isLoading ||
    account.isLoading ||
    (targetCountryId && access?.isOrganizer && countries.isLoading)
  ) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading MySolaris tasks…</p>
      </AppShell>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Tasks"
          title="Tasks aren’t available yet"
          description="This section isn’t available for your delegation yet."
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
          eyebrow="MySolaris · Tasks"
          title="Country account suspended"
          description="Tasks are unavailable while this country account is suspended."
        />
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Tasks"
          title="No country selected"
          description="Choose a country in MySolaris before opening edition tasks."
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
  const mutationError = acknowledgeNotice.error;

  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris · Tasks"
        title={`${country.name} edition tasks`}
        description="Keep track of confirmations, entry checks, deadlines, jury work and official notices."
        actions={
          organizerInspection ? (
            <Link
              to="/admin"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Back to Organizer
            </Link>
          ) : (
            <Link
              to={NAV_TARGETS.mySolaris}
              search={countrySearch}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Back to MySolaris
            </Link>
          )
        }
      />

      <div className="space-y-5">
        {organizerInspection ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3">
            <p className="text-sm font-semibold">Viewing as organizer</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This view is read-only. Acknowledgements can only be made by the delegation.
            </p>
          </div>
        ) : null}

        <Panel
          title="Edition"
          description="Choose the edition you want to view."
        >
          {editionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading editions…</p>
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

        {!organizerInspection && mutationError ? <ErrorText error={mutationError} /> : null}

        {editionId && workspaceQuery.isLoading ? (
          <Panel title="Delegation status">
            <p className="text-sm text-muted-foreground">Checking delegation status…</p>
          </Panel>
        ) : workspaceQuery.error ? (
          <Panel title="Delegation status">
            <ErrorText error={workspaceQuery.error} />
          </Panel>
        ) : snapshot ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Readiness"
                value={`${snapshot.model.readiness}% · ${readinessLabel(snapshot.model.readinessState)}`}
              />
              <MetricCard
                label="Confirmation"
                value={snapshot.context.confirmationComplete ? "Complete" : "Required"}
              />
              <MetricCard
                label="Entry"
                value={
                  snapshot.eligibility.status === "ready" ? "Ready" : snapshot.eligibility.status
                }
              />
              <MetricCard
                label="Jury"
                value={
                  snapshot.context.juryBallotSubmitted
                    ? "Ballot submitted"
                    : snapshot.model.jury.complete
                      ? "HOD assigned"
                      : "HOD missing"
                }
              />
            </section>

            <Panel
              title="Readiness"
              description="See what’s ready and what still needs attention."
            >
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {snapshot.operationalReadiness.signals.map((signal) => (
                  <div
                    key={signal.id}
                    className="rounded-xl border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{signal.label}</p>
                      <StatusPill value={signal.state} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{signal.message}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Organizer decisions"
              description="Any organizer decision affecting entry eligibility appears here."
            >
              {eligibilityOverridesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading organizer decisions…
                </p>
              ) : eligibilityOverridesQuery.error ? (
                <ErrorText error={eligibilityOverridesQuery.error} />
              ) : (eligibilityOverridesQuery.data ?? []).length ? (
                <div className="space-y-2">
                  {(eligibilityOverridesQuery.data ?? []).map((override) => (
                    <div
                      key={override.id}
                      className="rounded-xl border border-sky-300/20 bg-sky-300/[0.06] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">Eligibility decision</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Rule: {override.affectedRule}
                          </p>
                        </div>
                        <StatusPill value="overridden" />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {override.reason}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Recorded {formatDateTime(override.createdAt)}
                      </p>
                      {override.expiresAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Expires {formatDateTime(override.expiresAt)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No organizer exceptions are active for this delegation.
                </p>
              )}
            </Panel>

            <Panel
              title="Priority actions"
              description={
                snapshot.model.actions.length
                  ? organizerInspection
                    ? "These are the delegation’s current actions. Changes are disabled here."
                    : "Start with the urgent items."
                  : "No outstanding actions for this edition."
              }
            >
              {snapshot.model.actions.length ? (
                <div className="space-y-2">
                  {snapshot.model.actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold">{action.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {action.description}
                        </p>
                      </div>
                      <StatusPill value={action.priority} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
              )}
            </Panel>

            <Panel
              title="Deadlines & alerts"
              description={`${snapshot.operationalReadiness.overdueDeadlines.length} overdue · ${snapshot.operationalReadiness.upcomingDeadlines.length} upcoming · ${snapshot.context.unresolvedOrganizerIssues} issue${snapshot.context.unresolvedOrganizerIssues === 1 ? "" : "s"} being reviewed`}
            >
              {snapshot.context.deadlines.length ? (
                <div className="space-y-2">
                  {snapshot.context.deadlines.map((deadline) => {
                    const overdue = snapshot.operationalReadiness.overdueDeadlines.some(
                      (item) => item.id === deadline.id,
                    );
                    const completed = Boolean(deadline.completedAt);
                    return (
                      <div
                        key={deadline.id}
                        className="rounded-xl border border-border bg-background/40 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{deadline.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Due {formatDateTime(deadline.dueAt)} ·{" "}
                              {deadline.kind.replace(/_/g, " ")}
                            </p>
                          </div>
                          <StatusPill
                            value={completed ? "completed" : overdue ? "overdue" : "upcoming"}
                          />
                        </div>
                        {deadline.notes ? (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {deadline.notes}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No deadlines have been published for this edition yet.
                </p>
              )}
              {snapshot.context.unresolvedOrganizerIssues ? (
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Organizers are reviewing {snapshot.context.unresolvedOrganizerIssues} issue
                  {snapshot.context.unresolvedOrganizerIssues === 1 ? "" : "s"}. You only need to act if TSBC contacts you.
                </p>
              ) : null}
            </Panel>

            <Panel
              title="Entry progress"
              description={`${snapshot.workflow.progress}% complete · ${snapshot.workflow.blockedCount} blocked`}
            >
              <div className="grid gap-2 md:grid-cols-2">
                {snapshot.workflow.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{task.label}</p>
                      <StatusPill value={task.effectiveStatus} />
                    </div>
                    {task.blockers.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Waiting for {task.blockers.length} prerequisite
                        {task.blockers.length === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Submission review history"
              description="Review decisions for this country and edition."
            >
              {snapshot.context.reviewHistory.length ? (
                <div className="space-y-2">
                  {snapshot.context.reviewHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {[item.artist, item.songTitle].filter(Boolean).join(" · ") ||
                              "Submission review"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(item.createdAt)} · {item.targetType.replace(/_/g, " ")}
                          </p>
                        </div>
                        <StatusPill value={item.action} />
                      </div>
                      {item.reason ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {item.reason}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No review decisions have been recorded for this country in the selected edition.
                </p>
              )}
            </Panel>

            <Panel
              title="Country jury"
              description={
                snapshot.context.juryBallotSubmitted
                  ? "The HOD has submitted the country jury ballot."
                  : snapshot.model.jury.complete
                    ? organizerInspection
                      ? "The Head of Delegation is the country’s sole jury. This view is read-only."
                      : "The Head of Delegation is the country’s sole jury for this edition."
                    : "Assign a Head of Delegation before jury voting."
              }
            >
              {snapshot.context.juryMembers.length ? (
                <div className="space-y-2">
                  {snapshot.context.juryMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-1 rounded-xl border border-border bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium">{member.displayName}</span>
                      <StatusPill value="Head of Delegation · sole jury" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3">
                  <p className="text-sm font-semibold">HOD assignment missing</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Add the correct Head of Delegation for this country and edition before jury voting.
                  </p>
                  {organizerInspection ? (
                    <Link
                      to="/admin/hod-history"
                      className="mt-3 inline-flex rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                    >
                      Open HOD history
                    </Link>
                  ) : null}
                </div>
              )}
            </Panel>

            <Panel
              title="Official notices"
              description={`${snapshot.model.outstandingAcknowledgements} acknowledgement${snapshot.model.outstandingAcknowledgements === 1 ? "" : "s"} outstanding.`}
            >
              {snapshot.context.notices.length ? (
                <div className="space-y-2">
                  {snapshot.context.notices.map((notice) => (
                    <div
                      key={notice.id}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{notice.title}</p>
                          <StatusPill value={notice.severity} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {notice.acknowledgementRequired
                            ? notice.acknowledged
                              ? "Acknowledged"
                              : "Acknowledgement required"
                            : "Information only"}
                        </p>
                      </div>
                      {!organizerInspection &&
                      notice.acknowledgementRequired &&
                      !notice.acknowledged ? (
                        <button
                          type="button"
                          disabled={acknowledgeNotice.isPending}
                          onClick={() => acknowledgeNotice.mutate(notice.id)}
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No official notices for this edition.
                </p>
              )}
              {!organizerInspection ? (
                <Link
                  to={NAV_TARGETS.mySolarisNotices}
                  className="mt-3 inline-flex rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  Open notice inbox
                </Link>
              ) : null}
            </Panel>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold">{value}</p>
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

function readinessLabel(value: string) {
  if (value === "ready") return "Ready";
  if (value === "blocked") return "Blocked";
  return "Attention required";
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

function ErrorText({ error }: { error: unknown }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof Error ? error.message : "We couldn’t complete that request."}
    </p>
  );
}
