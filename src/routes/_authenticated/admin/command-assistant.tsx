import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { useEditions } from "@/lib/data";
import {
  matchSolarisAssistantCommands,
  partitionSolarisAssistantCommandsByContext,
} from "@/lib/solaris-command-assistant";
import { buildCommandAssistantInsight } from "@/lib/solaris-command-assistant-insights";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { useV3OrganizerProjection } from "@/lib/v3-organizer-projection.query";

export const Route = createFileRoute("/_authenticated/admin/command-assistant")({
  head: () => ({
    meta: [
      { title: "Command Assistant — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandAssistantPage,
});

function CommandAssistantPage() {
  const { editionId, setEditionId } = useAdminContext();
  const editionsQuery = useEditions();
  const [prompt, setPrompt] = useState("");
  const feature = useQuery({
    queryKey: ["studio2-feature", "solaris_command_assistant"],
    queryFn: () => isStudio2FeatureEnabled("solaris_command_assistant"),
    staleTime: 30_000,
  });

  const selectedEdition = editionsQuery.data?.find((edition) => edition.id === editionId) ?? null;
  const resolvedEditionId = selectedEdition?.id ?? "";
  const projectionQuery = useV3OrganizerProjection(resolvedEditionId || null);

  const matches = useMemo(() => matchSolarisAssistantCommands(prompt), [prompt]);
  const commandContext = useMemo(
    () => partitionSolarisAssistantCommandsByContext(matches, Boolean(selectedEdition)),
    [matches, selectedEdition],
  );
  const insight = useMemo(
    () => prompt.trim() && projectionQuery.data
      ? buildCommandAssistantInsight(prompt, projectionQuery.data)
      : null,
    [projectionQuery.data, prompt],
  );

  if (feature.isLoading) {
    return <AdminPage><p className="text-sm text-muted-foreground">Loading Command Assistant…</p></AdminPage>;
  }
  if (feature.data !== true) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={Sparkles}
          title="Command Assistant is disabled"
          description="The read-only command registry is installed, but its rollout flag remains off until verification is complete."
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-4">
        <AdminPageHeader
          eyebrow="Organizer command layer"
          title="Solaris Command Assistant"
          description="Read-only first: natural wording is matched to a fixed command registry and the canonical Organizer projection. It can explain blockers and point to the next safe workspace, but it cannot generate arbitrary SQL, bypass permissions or silently execute a write."
        />

        <AdminCard strong>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Ask Solaris</span>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Why can't I publish results?"
                className="min-h-12 w-full rounded-xl border border-white/[0.09] bg-black/15 pl-10 pr-3 text-sm outline-none focus:border-sky-300/30"
              />
            </div>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Requests are interpreted against registered read-only operations and the selected edition projection. Unknown wording is never converted into an invented database command.
          </p>
        </AdminCard>

        {editionId && editionsQuery.isLoading ? (
          <AdminCard>
            <AdminStatus tone="neutral">Confirming edition context…</AdminStatus>
          </AdminCard>
        ) : editionId && editionsQuery.error ? (
          <AdminCard>
            <AdminCardHeader
              eyebrow="Edition context"
              title="Could not verify the selected edition"
              description="Command Assistant will not treat an edition lookup failure as missing context or silently substitute another edition."
            />
            <div className="flex flex-wrap items-center gap-3">
              <AdminStatus tone="blocked">
                {editionsQuery.error instanceof Error ? editionsQuery.error.message : "Edition lookup failed"}
              </AdminStatus>
              <button
                type="button"
                onClick={() => void editionsQuery.refetch()}
                disabled={editionsQuery.isFetching}
                className="admin-action-secondary"
              >
                Retry edition lookup
              </button>
            </div>
          </AdminCard>
        ) : editionId && !selectedEdition ? (
          <AdminCard>
            <AdminEmptyState
              icon={Sparkles}
              title="Selected edition is unavailable"
              description="The stored Organizer context no longer resolves to an edition you can verify. Edition-scoped commands remain blocked until you choose a valid context."
              action={
                <button
                  type="button"
                  className="admin-action-secondary"
                  onClick={() => setEditionId("")}
                >
                  Clear unavailable context
                </button>
              }
            />
          </AdminCard>
        ) : selectedEdition ? (
          <AdminCard>
            <AdminCardHeader eyebrow="Current edition" title="Canonical operational summary" description="One projection shared with Control and readiness surfaces, rather than a second set of browser database queries." />
            {projectionQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Reading canonical Organizer projection…</p>
            ) : projectionQuery.error ? (
              <AdminStatus tone="blocked">{projectionQuery.error instanceof Error ? projectionQuery.error.message : "Could not load edition state"}</AdminStatus>
            ) : projectionQuery.data ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Readiness" value={projectionQuery.data.readiness.overall} suffix="%" />
                <Metric label="Critical tasks" value={projectionQuery.data.tasks.critical} tone={projectionQuery.data.tasks.critical ? "attention" : "ready"} />
                <Metric label="Attention items" value={projectionQuery.data.attention.length} tone={projectionQuery.data.attention.length ? "attention" : "ready"} />
                <Metric label="System issues" value={projectionQuery.data.systemHealth.issueCount} tone={projectionQuery.data.systemHealth.issueCount ? "attention" : "ready"} />
              </div>
            ) : null}
          </AdminCard>
        ) : (
          <AdminCard>
            <AdminEmptyState
              icon={Sparkles}
              title="Choose an edition"
              description="Select an exact Organizer edition before loading operational context. Command Assistant will not turn a missing or stale edition into an all-editions query or a misleading zero-state summary."
            />
          </AdminCard>
        )}

        {selectedEdition && prompt.trim() ? (
          <AdminCard strong>
            <AdminCardHeader
              eyebrow="Canonical explanation"
              title={insight?.title ?? "Checking blockers…"}
              description="Derived from the same Organizer projection used by Control and readiness surfaces."
            />
            {projectionQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Reading current blockers and recommended action…</p>
            ) : projectionQuery.error ? (
              <AdminStatus tone="blocked">{projectionQuery.error instanceof Error ? projectionQuery.error.message : "Organizer projection is unavailable"}</AdminStatus>
            ) : insight ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AdminStatus tone={insight.blockerCount ? "blocked" : "ready"}>
                    {insight.blockerCount ? `${insight.blockerCount} critical blocker${insight.blockerCount === 1 ? "" : "s"}` : "No critical blocker in this domain"}
                  </AdminStatus>
                  <AdminStatus tone="neutral">Read-only explanation</AdminStatus>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{insight.summary}</p>
                {insight.nextAction ? (
                  <Link to={insight.nextAction.route as any} className="admin-action-primary w-full sm:w-auto">
                    {insight.nextAction.label}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">No action is currently projected for this scope.</p>
                )}
              </div>
            ) : null}
          </AdminCard>
        ) : null}

        <AdminCard>
          <AdminCardHeader eyebrow="Registered commands" title={prompt ? "Best matches" : "Available read-only workflows"} />
          <div className="space-y-2">
            {commandContext.available.length ? commandContext.available.map((command) => (
              <Link
                key={command.id}
                to={command.route as any}
                className="block rounded-xl border border-white/[0.08] bg-black/10 p-4 transition hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{command.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{command.description}</p>
                  </div>
                  <AdminStatus tone="info">
                    {command.scope === "global" ? "Global read-only navigation" : "Edition read-only navigation"}
                  </AdminStatus>
                </div>
                {command.capability ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Capability context: {command.capability}</p> : null}
              </Link>
            )) : commandContext.blockedByEdition.length ? (
              <AdminEmptyState
                icon={Search}
                title="Choose an edition for this command"
                description="The matching workflows are edition-scoped. Solaris will not navigate to them until the Organizer context resolves to an exact edition."
              />
            ) : (
              <AdminEmptyState icon={Search} title="No registered command matched" description="Try a status, results, voting, confirmation, Inbox or Integrity request. Unknown wording is not converted into an invented database operation." />
            )}
          </div>
        </AdminCard>

        {!selectedEdition && commandContext.blockedByEdition.length ? (
          <AdminCard>
            <AdminCardHeader
              eyebrow="Context required"
              title={`${commandContext.blockedByEdition.length} matching workflow${commandContext.blockedByEdition.length === 1 ? "" : "s"} need an edition`}
              description="These suggestions remain visible as explanations, but they are deliberately not links until the edition context is verified."
            />
            <div className="mt-3 space-y-2">
              {commandContext.blockedByEdition.map((command) => (
                <div key={command.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{command.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{command.description}</p>
                    </div>
                    <AdminStatus tone="blocked">Edition required</AdminStatus>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        ) : null}
      </div>
    </AdminPage>
  );
}

function Metric({ label, value, tone = "neutral", suffix = "" }: { label: string; value: number; tone?: "neutral" | "ready" | "attention"; suffix?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}{suffix}</span>
        {tone !== "neutral" ? <AdminStatus tone={tone}>{tone === "ready" ? "Clear" : "Review"}</AdminStatus> : null}
      </div>
    </div>
  );
}
