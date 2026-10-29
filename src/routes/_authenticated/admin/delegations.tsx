import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileClock,
  FileText,
  Flag,
  KeyRound,
  Layers3,
  ShieldCheck,
} from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { loadConfirmationRequirements } from "@/integrations/confirmations/admin";
import { selectOrganizerEdition } from "@/lib/admin-edition-selection";
import { editionLabel, useEditions } from "@/lib/data";
import { summarizeConfirmationRequirementAttention } from "@/lib/v3-organizer-confirmation-requirement-attention";

export const Route = createFileRoute("/_authenticated/admin/delegations")({
  head: () => ({
    meta: [
      { title: "Delegations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrganizerDelegationsPage,
});

function OrganizerDelegationsPage() {
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const selectedEdition = selectOrganizerEdition(editionsQuery.data ?? [], editionId);
  const resolvedEditionId = selectedEdition?.id ?? "";
  const selectedEditionLabel = selectedEdition ? editionLabel(selectedEdition) : null;

  const requirementsQuery = useQuery({
    queryKey: [
      "v3-organizer",
      "delegations",
      "confirmation-requirements",
      resolvedEditionId || "none",
    ],
    queryFn: () => loadConfirmationRequirements(resolvedEditionId),
    enabled: Boolean(resolvedEditionId),
    staleTime: 20_000,
  });

  const summary = summarizeConfirmationRequirementAttention(requirementsQuery.data ?? []);

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        eyebrow={selectedEditionLabel ?? "Current edition"}
        title="Delegations"
        description="Exception-first delegation operations. Confirmation attention is derived from the canonical requirement projection for the exact Organizer edition, never from entry-review status."
      />

      {editionsQuery.isLoading ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Verifying Organizer edition context…
          </p>
        </AdminCard>
      ) : editionsQuery.isError ? (
        <AdminCard>
          <AdminEmptyState
            icon={CircleAlert}
            title="Edition context could not be verified"
            description="Delegation operations stay unavailable until Solaris can verify that the selected Organizer edition is still accessible."
          />
          <div className="mt-3 flex justify-center">
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
      ) : !selectedEdition ? (
        <AdminCard>
          <AdminEmptyState
            icon={Flag}
            title="Edition context required"
            description="Select an exact accessible Organizer edition before opening Delegations. Solaris will not substitute another edition or a globally active Confirmation edition for missing, stale or revoked context."
          />
        </AdminCard>
      ) : requirementsQuery.isLoading ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading confirmation obligations…
          </p>
        </AdminCard>
      ) : requirementsQuery.isError ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm leading-relaxed text-rose-100">
            Confirmation requirement truth could not be loaded. The workspace will not infer an all-clear from missing data.
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void requirementsQuery.refetch()}
              disabled={requirementsQuery.isFetching}
              className="admin-action-secondary"
            >
              Retry requirements
            </button>
          </div>
        </AdminCard>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 py-2">
            <AdminStatus tone="neutral">Edition context</AdminStatus>
            <span className="text-sm font-semibold text-foreground">{selectedEditionLabel}</span>
            <span className="text-xs text-muted-foreground">
              All delegation attention and workspace links below are scoped to this Organizer edition.
            </span>
          </div>

          <section className="grid gap-2 sm:grid-cols-3">
            <MetricCard
              icon={CircleAlert}
              label="Needs attention"
              value={summary.needsAttention.length}
              detail="Unresolved required obligations"
              tone={summary.needsAttention.length > 0 ? "attention" : "ready"}
            />
            <MetricCard
              icon={CheckCircle2}
              label="Resolved"
              value={summary.resolvedEffective}
              detail={`${summary.totalEffective} effective obligations`}
              tone="ready"
            />
            <MetricCard
              icon={FileClock}
              label="Superseded"
              value={summary.invalidated.length}
              detail="Visible for invariant diagnostics"
              tone="neutral"
            />
          </section>

          <AdminCard strong>
            <AdminCardHeader
              eyebrow="Attention"
              title={
                summary.needsAttention.length > 0
                  ? `${summary.needsAttention.length} confirmation ${summary.needsAttention.length === 1 ? "obligation needs" : "obligations need"} action`
                  : "No unresolved confirmation requirements"
              }
              description={
                summary.needsAttention.length > 0
                  ? "These are canonical required obligations. Review the requirement or the delegation response in the owning Confirmation workspace."
                  : "The requirement projection has no effective required obligations for this edition. This does not manufacture Entry, Media or Voting readiness."
              }
              action={
                <Link to="/confirmations/admin/requirements" className="admin-action-secondary">
                  Open requirements <ArrowRight className="size-4" />
                </Link>
              }
            />

            {summary.needsAttention.length > 0 ? (
              <div className="mt-3 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                {summary.needsAttention.slice(0, 12).map((requirement) => (
                  <div
                    key={requirement.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{requirement.countryName}</p>
                        <AdminStatus tone="attention">Required</AdminStatus>
                        {requirement.generation > 1 ? (
                          <AdminStatus tone="neutral">Revision {requirement.generation}</AdminStatus>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {requirement.reason}
                      </p>
                    </div>
                    <Link
                      to="/confirmations/admin/requirements"
                      className="admin-action-secondary shrink-0"
                    >
                      Review <ArrowRight className="size-4" />
                    </Link>
                  </div>
                ))}
                {summary.needsAttention.length > 12 ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    +{summary.needsAttention.length - 12} more unresolved obligations. Open Requirements for the complete authoritative list.
                  </p>
                ) : null}
              </div>
            ) : null}
          </AdminCard>

          {summary.invalidated.length > 0 ? (
            <AdminCard>
              <AdminCardHeader
                eyebrow="Invariant diagnostics"
                title="Superseded requirements remain observable"
                description={`${summary.invalidated.length} invalidated requirement${summary.invalidated.length === 1 ? " is" : "s are"} excluded from actionable counts, but Solaris keeps them visible so duplicate/supersession defects cannot be hidden by presentation logic.`}
              />
            </AdminCard>
          ) : null}

          <AdminCard>
            <AdminCardHeader
              eyebrow="Confirmation"
              title="Authoritative workspaces"
              description="The overview stays read-only. Decisions and lifecycle mutations remain in the existing capability-protected Confirmation workspaces."
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <WorkspaceLink
                to="/confirmations/admin"
                icon={ShieldCheck}
                title="Confirmation overview"
                description="Current submission posture and delegation triage."
              />
              <WorkspaceLink
                to="/confirmations/admin/requirements"
                icon={CircleAlert}
                title="Requirements"
                description="Inspect, waive or reconfirm canonical obligations."
              />
              <WorkspaceLink
                to="/confirmations/admin/responses"
                icon={FileText}
                title="Responses"
                description="Review saved delegation responses and revisions."
              />
              <WorkspaceLink
                to="/confirmations/admin/countries"
                icon={Flag}
                title="Countries"
                description="Country-scoped submission and contest context."
              />
              <WorkspaceLink
                to="/confirmations/admin/rounds"
                icon={Layers3}
                title="Rounds"
                description="Governed submission-round lifecycle controls."
              />
              <WorkspaceLink
                to="/confirmations/admin/calendar"
                icon={CalendarDays}
                title="Calendar"
                description="Projection of canonical round and deadline dates."
              />
              <WorkspaceLink
                to="/confirmations/admin/recovery-codes"
                icon={KeyRound}
                title="Access"
                description="Delegation access and recovery tooling."
              />
              <WorkspaceLink
                to="/admin/submission-versions"
                icon={FileClock}
                title="Submission history"
                description="Inspect canonical saved response versions."
              />
            </div>
          </AdminCard>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Sync and low-level Confirmation settings intentionally remain on legacy/advanced routes until the System section owns those diagnostics, per Organizer V3 O4.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof CircleAlert;
  label: string;
  value: number;
  detail: string;
  tone: "attention" | "ready" | "neutral";
}) {
  const classes =
    tone === "attention"
      ? "border-amber-300/25 bg-amber-300/[0.035]"
      : tone === "ready"
        ? "border-emerald-300/20 bg-emerald-300/[0.025]"
        : "border-white/[0.08] bg-white/[0.018]";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="numeric text-2xl font-black">{value}</span>
      </div>
      <p className="mt-2 text-xs font-bold text-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function WorkspaceLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Flag;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="group rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 transition hover:bg-white/[0.045]"
    >
      <div className="flex items-start gap-3">
        <span className="admin-action-row-icon">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
