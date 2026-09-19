import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import {
  buildEntryReadinessModel,
  type EntryReadinessStatus,
} from "@/lib/entry-readiness-model";
import {
  NAV_TARGETS,
  countrySearch as buildCountrySearch,
} from "@/lib/navigation-targets";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import {
  listStudio2HodEditions,
  loadStudio2HodWorkspace,
} from "@/lib/studio2-hod-workspace";

type EntrySection =
  | "overview"
  | "details"
  | "media"
  | "eligibility"
  | "readiness"
  | "history";

const ENTRY_SECTIONS: Array<{
  id: EntrySection;
  label: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    description: "Current entry at a glance",
  },
  { id: "details", label: "Details", description: "Artist, song and approval" },
  { id: "media", label: "Media", description: "Performance and public media" },
  {
    id: "eligibility",
    label: "Eligibility",
    description: "Rule and submission checks",
  },
  { id: "readiness", label: "Readiness", description: "What still needs attention" },
  { id: "history", label: "History", description: "Reviews and past entries" },
];

export function MySolarisEntryModule() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });
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
      ? (countries.data ?? []).find(
          (candidate) => candidate.id === targetCountryId,
        )
      : undefined;
  const country = organizerCountry ?? ownCountry;
  const countrySearch = buildCountrySearch(targetCountryId);
  const [editionId, setEditionId] = useState("");
  const [activeSection, setActiveSection] = useState<EntrySection>("overview");

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
    queryKey: [
      "studio2-entry-readiness",
      country?.id ?? "none",
      editionId || "none",
    ],
    enabled: featureQuery.data === true && Boolean(country?.id && editionId),
    queryFn: () => loadStudio2HodWorkspace(editionId, country!.id),
  });

  const readiness = useMemo(() => {
    if (!workspaceQuery.data) return null;
    return buildEntryReadinessModel(
      workspaceQuery.data.eligibility,
      workspaceQuery.data.workflow,
    );
  }, [workspaceQuery.data]);

  if (
    featureQuery.isLoading ||
    account.isLoading ||
    (targetCountryId && access?.isOrganizer && countries.isLoading)
  ) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Loading entry…
        </p>
      </AppShell>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris · Entry"
          title="Entry tools aren’t available yet"
          description="This section isn’t available for your delegation yet."
          actions={<BackToMySolaris search={countrySearch} />}
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
          description="Entry tools are unavailable while this country account is suspended."
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
          description="Choose a country in MySolaris before opening the entry page."
          actions={
            <Link
              to={NAV_TARGETS.mySolarisCountry}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Choose country
            </Link>
          }
        />
      </AppShell>
    );
  }

  const snapshot = workspaceQuery.data;
  const entry = snapshot?.context.entry ?? null;
  const waitingForOrganizerReview =
    entry?.source === "confirmations" && entry.status === "pending";

  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris · Entry"
        title={`${country.name} entry`}
        description="Manage the selected edition’s song, media, eligibility and review history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={NAV_TARGETS.mySolarisTasks}
              search={countrySearch}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Open tasks
            </Link>
            <BackToMySolaris search={countrySearch} />
          </div>
        }
      />

      <div className="space-y-5">
        <Panel
          title="Edition"
          description="Choose the edition you want to view."
        >
          {editionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading editions…
            </p>
          ) : editionsQuery.error ? (
            <ErrorText error={editionsQuery.error} />
          ) : (editionsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Solaris edition is linked to this delegation yet.
            </p>
          ) : (
            <select
              value={editionId}
              onChange={(event) => {
                setEditionId(event.target.value);
                setActiveSection("overview");
              }}
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
          <Panel title="Loading entry">
            <p className="text-sm text-muted-foreground">
              Checking entry details and eligibility…
            </p>
          </Panel>
        ) : workspaceQuery.error ? (
          <Panel title="Entry">
            <ErrorText error={workspaceQuery.error} />
          </Panel>
        ) : snapshot && readiness ? (
          <>
            <EntrySectionNav
              active={activeSection}
              onChange={setActiveSection}
            />

            {activeSection === "overview" ? (
              <div className="space-y-4">
                <section
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    readiness.blockerCount
                      ? "border-destructive/25 bg-destructive/[0.06]"
                      : waitingForOrganizerReview
                        ? "border-sky-300/20 bg-sky-300/[0.055]"
                        : readiness.actions.length
                          ? "border-amber-300/20 bg-amber-300/[0.055]"
                          : "border-emerald-300/20 bg-emerald-300/[0.055]"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Entry status
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    {readiness.blockerCount
                      ? "Changes required"
                      : waitingForOrganizerReview
                        ? "Under review"
                        : readiness.actions.length
                          ? "Needs attention"
                          : "Ready"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {readiness.blockerCount
                      ? `${readiness.blockerCount} verified requirement${readiness.blockerCount === 1 ? "" : "s"} currently block this entry.`
                      : waitingForOrganizerReview
                        ? "TSBC is reviewing the submitted entry. No participant action is required unless organizers request changes."
                        : readiness.actions.length
                          ? `${readiness.actions.length} item${readiness.actions.length === 1 ? "" : "s"} can be completed now.`
                          : "No participant action is required for this entry right now."}
                  </p>
                  {readiness.actions.length ? (
                    <button
                      type="button"
                      onClick={() => setActiveSection("readiness")}
                      className="mt-3 min-h-10 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      Review actions
                    </button>
                  ) : null}
                </section>

                <Panel
                  title="Current entry"
                  description={snapshot.context.editionName}
                >
                  {waitingForOrganizerReview && !entry?.artist && !entry?.songTitle ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Your submitted entry details remain in Confirmations while TSBC reviews the submission.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <EntryField label="Artist" value={entry?.artist} />
                      <EntryField label="Song" value={entry?.songTitle} />
                      <EntryField label="Approval" value={entry?.status} />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to="/confirmations"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
                    >
                      {waitingForOrganizerReview ? "View submission" : "Edit submission"}{" "}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </Panel>
              </div>
            ) : null}

            {activeSection === "details" ? (
              <Panel
                title="Entry details"
                description="Artist and song details come from the accepted confirmation."
                actions={
                  <Link
                    to="/confirmations"
                    className="text-xs font-semibold text-primary"
                  >
                    Edit in Confirmations →
                  </Link>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <EntryField label="Artist" value={entry?.artist} />
                  <EntryField label="Song title" value={entry?.songTitle} />
                  <EntryField label="Entry status" value={entry?.status} />
                  <EntryField label="Source" value={entry?.source} />
                  <EntryField
                    label="Confirmation"
                    value={
                      snapshot.context.confirmationComplete
                        ? "Complete"
                        : "Incomplete"
                    }
                  />
                  <EntryField
                    label="Publication"
                    value={snapshot.context.publicationStatus}
                  />
                </div>
              </Panel>
            ) : null}

            {activeSection === "media" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel
                  title="Performance media"
                  description="The performance link attached to this edition entry"
                >
                  {entry?.songUrl ? (
                    <a
                      href={entry.songUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                    >
                      Open performance link{" "}
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No performance link has been submitted.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Artist, song and performance media are edited through the
                    edition confirmation.
                  </p>
                  <Link
                    to="/confirmations"
                    className="mt-3 inline-flex text-xs font-semibold text-primary"
                  >
                    Edit performance media →
                  </Link>
                </Panel>
                <Panel
                  title="Country page media"
                  description="Flags, images, captions and public-page sections"
                >
                  <p className="text-sm leading-6 text-muted-foreground">
                    Edit country-wide presentation in Page & media. Entry media
                    for this edition stays here.
                  </p>
                  <Link
                    to={NAV_TARGETS.mySolarisPageBuilder}
                    search={countrySearch}
                    className="mt-3 inline-flex text-xs font-semibold text-primary"
                  >
                    Open Page & media →
                  </Link>
                </Panel>
              </div>
            ) : null}

            {activeSection === "eligibility" ? (
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
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {check.message}
                      </p>
                      {check.level !== "pass" ? (
                        <EntryActionLink
                          id={`eligibility:${check.id}`}
                          search={countrySearch}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {activeSection === "readiness" ? (
              <div className="space-y-4">
                <Panel
                  title="Readiness summary"
                  description={readinessSummary(
                    readiness.status,
                    readiness.blockerCount,
                    readiness.warningCount,
                  )}
                >
                  <div className="space-y-4">
                    <ProgressLine
                      label="Eligibility checks"
                      value={readiness.eligibilityScore}
                    />
                    <ProgressLine
                      label="Submission progress"
                      value={readiness.workflowProgress}
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <SmallStat
                        label="Checks passed"
                        value={`${readiness.passedChecks}/${readiness.totalChecks}`}
                      />
                      <SmallStat
                        label="Steps complete"
                        value={`${readiness.completedWorkflowTasks}/${readiness.totalWorkflowTasks}`}
                      />
                      <SmallStat
                        label="Warnings"
                        value={`${readiness.warningCount}`}
                      />
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="What needs attention"
                  description={
                    readiness.actions.length
                      ? "Complete these items before the entry is ready."
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
                                <ShieldAlert
                                  className="size-4 text-destructive"
                                  aria-hidden="true"
                                />
                              ) : action.priority === "high" ? (
                                <AlertTriangle
                                  className="size-4 text-amber-400"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CircleDot
                                  className="size-4 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              )}
                              <p className="text-sm font-semibold">
                                {action.label}
                              </p>
                            </div>
                            <StatusPill
                              value={`${action.source} · ${action.priority}`}
                            />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {action.description}
                          </p>
                          <EntryActionLink
                            id={action.id}
                            search={countrySearch}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      This entry is ready.
                    </div>
                  )}
                </Panel>
                <Panel
                  title="Submission progress"
                  description={`${snapshot.workflow.progress}% complete · ${snapshot.workflow.blockedCount} blocked · ${snapshot.workflow.nextTaskIds.length} ready now`}
                >
                  <div className="space-y-2">
                    {snapshot.workflow.tasks.map((task, index) => {
                      const blockerLabels = task.blockers.map(
                        (blockerId) =>
                          snapshot.workflow.tasks.find(
                            (candidate) => candidate.id === blockerId,
                          )?.label ?? blockerId,
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
                            <p className="text-sm font-semibold">
                              {task.label}
                            </p>
                            {blockerLabels.length ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Waiting for: {blockerLabels.join(", ")}
                              </p>
                            ) : task.ready ? (
                              <p className="mt-1 text-xs text-emerald-300">
                                Ready now.
                              </p>
                            ) : task.effectiveStatus === "completed" ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Completed.
                              </p>
                            ) : null}
                          </div>
                          <StatusPill value={task.effectiveStatus} />
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>
            ) : null}

            {activeSection === "history" ? (
              <div className="space-y-4">
                <Panel
                  title="Review history"
                  description="Organizer review actions for this edition entry"
                >
                  {snapshot.context.reviewHistory.length ? (
                    <div className="space-y-2">
                      {snapshot.context.reviewHistory.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border bg-background/40 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {item.action.replace(/_/g, " ")}
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDateTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[item.artist, item.songTitle]
                              .filter(Boolean)
                              .join(" — ") || item.targetType}
                          </p>
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
                      No review actions have been recorded for this entry.
                    </p>
                  )}
                </Panel>
                <Panel
                  title="Participation history"
                  description="Past entries, listening links, HOD history and national finals"
                >
                  <Link
                    to={NAV_TARGETS.mySolarisHistory}
                    search={countrySearch}
                    className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                  >
                    Open country history →
                  </Link>
                </Panel>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function EntrySectionNav({
  active,
  onChange,
}: {
  active: EntrySection;
  onChange: (section: EntrySection) => void;
}) {
  return (
    <>
      <label className="block sm:hidden">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Entry section
        </span>
        <select
          value={active}
          onChange={(event) => onChange(event.target.value as EntrySection)}
          className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
        >
          {ENTRY_SECTIONS.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>

      <nav
        aria-label="Entry sections"
        className="hidden gap-2 rounded-2xl border border-border/70 bg-surface/55 p-2 sm:grid sm:grid-cols-2 xl:grid-cols-3"
      >
        {ENTRY_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            aria-current={active === section.id ? "page" : undefined}
            className={`rounded-xl px-3 py-2.5 text-left transition-colors ${active === section.id ? "bg-primary/10 text-primary" : "hover:bg-surface-strong"}`}
          >
            <span className="block text-xs font-semibold">{section.label}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {section.description}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}

function BackToMySolaris({ search }: { search: { country?: string } }) {
  return (
    <Link
      to={NAV_TARGETS.mySolaris}
      search={search}
      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
    >
      Back to MySolaris
    </Link>
  );
}

function EntryActionLink({
  id,
  search,
}: {
  id: string;
  search: { country?: string };
}) {
  const confirmationOwned =
    /(country-confirmed|artist|song|video|broadcaster-approval|entry\.(song-info|artist-info|media|eligibility|broadcaster-approval|tsbc-review|lock))/.test(
      id,
    );
  return confirmationOwned ? (
    <Link
      to="/confirmations"
      className="mt-3 inline-flex text-xs font-semibold text-primary"
    >
      Open submission →
    </Link>
  ) : (
    <Link
      to={NAV_TARGETS.mySolarisTasks}
      search={search}
      className="mt-3 inline-flex text-xs font-semibold text-primary"
    >
      Open task →
    </Link>
  );
}

function EntryField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold capitalize">
        {value?.trim() || "Not available"}
      </p>
    </div>
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

function eligibilityStatus(
  status: "ready" | "warning" | "blocked",
): EntryReadinessStatus {
  if (status === "blocked") return "blocked";
  if (status === "warning") return "attention";
  return "ready";
}

function readinessSummary(
  status: EntryReadinessStatus,
  blockers: number,
  warnings: number,
) {
  if (status === "ready")
    return "All current eligibility checks and required steps are complete.";
  if (status === "blocked") {
    return `${blockers} blocker${blockers === 1 ? "" : "s"} must be resolved before this entry is ready.${warnings ? ` ${warnings} warning${warnings === 1 ? "" : "s"} also need attention.` : ""}`;
  }
  return `Nothing is blocking progress, but some steps are still unfinished${warnings ? ` and ${warnings} warning${warnings === 1 ? "" : "s"} remain` : ""}.`;
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
      {error instanceof Error
        ? error.message
        : "We couldn’t complete that request."}
    </p>
  );
}
