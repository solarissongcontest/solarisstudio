import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CircleOff,
  RefreshCw,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { editionLabel, useEditions } from "@/lib/data";
import {
  buildV3OrganizerControlGroups,
  type V3OrganizerControlDomainKey,
} from "@/lib/v3-organizer";
import { useV3OrganizerProjection } from "@/lib/v3-organizer-projection.query";
import type {
  V3OrganizerDomainState,
  V3OrganizerDomainSummary,
} from "@/lib/v3-organizer-projection";

export const Route = createFileRoute("/_authenticated/admin/control")({
  head: () => ({
    meta: [
      { title: "Control — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Operate the canonical Solaris contest systems from one explicit, edition-scoped Organizer workspace.",
      },
    ],
  }),
  component: OrganizerControl,
});

function OrganizerControl() {
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const activeEdition = useMemo(
    () => (editionId ? editions.find((edition) => edition.id === editionId) ?? null : null),
    [editionId, editions],
  );
  const projectionQuery = useV3OrganizerProjection(activeEdition?.id);
  const projection = projectionQuery.data;
  const groups = buildV3OrganizerControlGroups(activeEdition?.slug);
  const contextLoading = Boolean(editionId) && editionsQuery.isLoading;
  const contextInvalid = Boolean(editionId) && !contextLoading && !activeEdition;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl" data-v3-organizer-control="">
        <AdminPageHeader
          eyebrow="Control"
          title="Contest systems"
          description="Exception-first operational domains backed by the existing Solaris authorities. Control shows what needs attention and sends you to the workspace that actually owns the operation."
        />

        <AdminCard strong>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="admin-section-label">Current edition</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-.03em] text-foreground">
                {contextLoading
                  ? "Loading edition context…"
                  : activeEdition
                    ? projection?.context.editionLabel ?? editionLabel(activeEdition)
                    : contextInvalid
                      ? "Selected edition unavailable"
                      : "No edition selected"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {activeEdition
                  ? `${activeEdition.name}. Every operational summary and edition-scoped destination below is bound to this exact context.`
                  : contextInvalid
                    ? "The previously selected edition is no longer available to this Organizer context. Select an edition before operating contest systems."
                    : "Select an edition before entering an operational workspace. Solaris will not guess a different edition for you."}
              </p>
              {projection ? (
                <p className="mt-2 text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                  Canonical state {projection.stateVersion} · server {formatServerTime(projection.serverTime)}
                </p>
              ) : null}
            </div>
            <AdminStatus
              tone={
                activeEdition
                  ? projectionQuery.error
                    ? "attention"
                    : "ready"
                  : contextInvalid
                    ? "blocked"
                    : "attention"
              }
            >
              {contextLoading
                ? "Checking context"
                : activeEdition
                  ? projectionQuery.error
                    ? "State unavailable"
                    : "Edition locked"
                  : contextInvalid
                    ? "Context invalid"
                    : "Select edition"}
            </AdminStatus>
          </div>
        </AdminCard>

        {activeEdition && projectionQuery.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200/20 bg-amber-200/[0.05] p-4 text-amber-50">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Operational summary could not be reconciled</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                Solaris is not inferring healthy states from missing projection data. The authoritative specialist workspaces remain available below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void projectionQuery.refetch()}
              disabled={projectionQuery.isFetching}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/[0.06] px-3 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const summary = projection?.domains[group.key];
            return (
              <AdminCard key={group.key}>
                <AdminCardHeader
                  eyebrow="Operational domain"
                  title={group.label}
                  description={group.description}
                  action={
                    <DomainStatus
                      activeEdition={Boolean(activeEdition)}
                      loading={projectionQuery.isLoading || projectionQuery.isFetching}
                      failed={Boolean(projectionQuery.error)}
                      summary={summary}
                    />
                  }
                />

                <DomainContext
                  domain={group.key}
                  activeEdition={Boolean(activeEdition)}
                  loading={projectionQuery.isLoading}
                  failed={Boolean(projectionQuery.error)}
                  summary={summary}
                />

                <div className="mt-3 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                  {group.items.map((item) => {
                    const href = activeEdition ? item.href : null;
                    return href ? (
                      <Link key={item.key} to={href as any} className="admin-list-row group">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
                          <SlidersHorizontal className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{item.label}</span>
                            <AdminStatus tone="neutral">
                              {item.editionScoped ? "Edition scoped" : "Workspace"}
                            </AdminStatus>
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                      </Link>
                    ) : (
                      <div key={item.key} className="admin-list-row opacity-65" aria-disabled="true">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-muted-foreground">
                          <CircleOff className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{item.label}</span>
                            <AdminStatus tone="attention">
                              {activeEdition ? "Unavailable" : "Select edition"}
                            </AdminStatus>
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </AdminCard>
            );
          })}
        </div>

        {!activeEdition && !contextLoading ? (
          <AdminCard className="mt-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-200/[0.05] text-amber-100">
                <Trophy className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Edition-scoped operations are protected</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Choose an edition from the Organizer context switcher. Control intentionally refuses to substitute the newest edition when context is missing or stale.
                </p>
              </div>
            </div>
          </AdminCard>
        ) : null}
      </div>
    </AdminPage>
  );
}

function DomainStatus({
  activeEdition,
  loading,
  failed,
  summary,
}: {
  activeEdition: boolean;
  loading: boolean;
  failed: boolean;
  summary?: V3OrganizerDomainSummary;
}) {
  if (!activeEdition) return <AdminStatus tone="neutral">Context required</AdminStatus>;
  if (loading && !summary) return <AdminStatus tone="neutral">Checking</AdminStatus>;
  if (failed && !summary) return <AdminStatus tone="attention">Unavailable</AdminStatus>;
  if (!summary) return <AdminStatus tone="neutral">No summary</AdminStatus>;
  return <AdminStatus tone={domainTone(summary.state)}>{domainLabel(summary.state)}</AdminStatus>;
}

function DomainContext({
  domain,
  activeEdition,
  loading,
  failed,
  summary,
}: {
  domain: V3OrganizerControlDomainKey;
  activeEdition: boolean;
  loading: boolean;
  failed: boolean;
  summary?: V3OrganizerDomainSummary;
}) {
  if (!activeEdition) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Select an edition to resolve current operational state for {domain}.
      </p>
    );
  }
  if (loading && !summary) {
    return <p className="mt-3 text-xs text-muted-foreground">Checking canonical operational state…</p>;
  }
  if (failed && !summary) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Summary unavailable. No healthy state is inferred; open the authoritative workspace to inspect current state.
      </p>
    );
  }
  if (!summary) return null;

  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{summary.detail}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {summary.blockingIssueCount
              ? `${summary.blockingIssueCount} blocking · ${summary.issueCount} total open`
              : summary.issueCount
                ? `${summary.issueCount} open operational ${summary.issueCount === 1 ? "item" : "items"}`
                : "No canonical task currently requires intervention in this domain."}
          </p>
        </div>
        {summary.recommendedAction ? (
          <Link
            to={summary.recommendedAction.route as any}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] font-semibold text-foreground transition hover:bg-white/[0.07]"
          >
            {summary.recommendedAction.label}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function domainTone(state: V3OrganizerDomainState) {
  if (state === "blocked") return "blocked" as const;
  if (state === "attention") return "attention" as const;
  if (state === "active") return "info" as const;
  if (state === "ready" || state === "complete") return "ready" as const;
  return "neutral" as const;
}

function domainLabel(state: V3OrganizerDomainState) {
  if (state === "attention") return "Needs attention";
  if (state === "not_configured") return "Not configured";
  return state.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatServerTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
