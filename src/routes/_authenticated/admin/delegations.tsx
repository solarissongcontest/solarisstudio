import { useQuery } from "@tanstack/react-query";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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


import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { loadConfirmationRequirements } from "@/integrations/confirmations/admin";
import { useAdminContext } from "@/components/admin/AdminContext";
import { selectOrganizerEdition } from "@/lib/admin-edition-selection";
import { verifyOrganizerConfirmationRead } from "@/integrations/confirmations/organizer-confirmation-read-authorization";
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
  const { editionId, setEditionContext } = useAdminContext();
  const { id: actorId } = useAuthenticatedUser();
  const editionsQuery = useEditions();
  // The shared selector currently synthesizes a newest-edition fallback.
  // Delegations must instead require an affirmative in-page choice; bind the
  // choice to the signed-in actor to avoid cross-account scope carryover.
  const [explicitChoice, setExplicitChoice] = useState<{ actorId: string; editionId: string } | null>(null);
  const explicitEditionId = explicitChoice?.actorId === actorId ? explicitChoice.editionId : "";
  // Never hand off an edition-specific Confirmation link if NAV scope moved
  // since the deliberate selection. A mismatch must be resolved explicitly.
  const verifiedChoiceId = explicitEditionId && editionId === explicitEditionId ? explicitEditionId : "";
  // A failed refresh may retain cached edition rows. Those rows must not
  // authorize another private Confirmation request after verification fails.
  const selectedEdition =
    editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching
      ? selectOrganizerEdition(editionsQuery.data ?? [], verifiedChoiceId)
      : null;
  const resolvedEditionId = selectedEdition?.id ?? "";
  const selectedEditionLabel = selectedEdition ? editionLabel(selectedEdition) : null;

  // A published edition is visible in the public catalogue even when this
  // actor has lost its edition-scoped Confirmation permission. Probe canonical
  // server authorization before accessing private requirement data.
  const capabilityQuery = useQuery({
    queryKey: ["v3-organizer", "delegations", "confirmation-read", actorId, resolvedEditionId || "none"],
    queryFn: () => verifyOrganizerConfirmationRead(resolvedEditionId),
    enabled: editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching && Boolean(resolvedEditionId),
    // Do not reuse a previously-authorized actor/edition scope on a later visit.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const hasConfirmationRead =
    capabilityQuery.isSuccess &&
    !capabilityQuery.isFetching &&
    !capabilityQuery.error &&
    capabilityQuery.data === true;

  const requirementsQuery = useQuery({
    queryKey: [
      "v3-organizer",
      "delegations",
      "confirmation-requirements",
      actorId,
      resolvedEditionId || "none",
    ],
    queryFn: () => loadConfirmationRequirements(resolvedEditionId),
    enabled: hasConfirmationRead,
    staleTime: 20_000,
  });

  const summary = summarizeConfirmationRequirementAttention(requirementsQuery.data ?? []);
  const [attentionSearch, setAttentionSearch] = useState("");
  const attentionNeedle = attentionSearch.trim().toLocaleLowerCase();
  const visibleAttention = attentionNeedle
    ? summary.needsAttention.filter((requirement) =>
        `${requirement.countryName} ${requirement.reason ?? ""}`
          .toLocaleLowerCase()
          .includes(attentionNeedle),
      )
    : summary.needsAttention;

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        eyebrow={selectedEditionLabel ?? "Current edition"}
        title="Delegations"
        description="Exception-first delegation operations. Confirmation attention is derived from the canonical requirement projection for the exact Organizer edition, never from entry-review status."
        actions={selectedEdition ? (
          <Link to="/admin/countries" className="admin-action-secondary">
            <Flag className="size-4" />
            Browse delegation roster
            <ArrowRight className="size-4" />
          </Link>
        ) : undefined}
      />

      <AdminCard className="mb-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Choose an edition for this Delegations review
          </span>
          <select
            className="admin-input"
            value={verifiedChoiceId}
            disabled={!editionsQuery.isSuccess || Boolean(editionsQuery.error) || editionsQuery.isFetching}
            onChange={(event) => {
              const choice = (editionsQuery.data ?? []).find((edition) => edition.id === event.target.value);
              setExplicitChoice(choice ? { actorId, editionId: choice.id } : null);
              if (choice) {
                setEditionContext({ id: choice.id, slug: choice.slug, label: editionLabel(choice) });
              }
              setAttentionSearch("");
            }}
          >
            <option value="">Select an exact edition…</option>
            {(editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching
              ? editionsQuery.data ?? []
              : []
            ).map((edition) => (
              <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            No edition is inferred from the Organizer shell. The selected edition also scopes the linked Confirmation workspaces. Private obligations load only after your selection and its capability are verified.
          </span>
        </label>
      </AdminCard>

      {editionsQuery.isLoading || editionsQuery.isFetching ? (
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
            description="Explicitly select an exact edition above before opening Delegations. Solaris will not substitute another edition or a globally active Confirmation edition for missing, stale or revoked context."
          />
        </AdminCard>
      ) : capabilityQuery.isPending || capabilityQuery.isFetching ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Verifying edition-scoped Confirmation access…
          </p>
        </AdminCard>
      ) : capabilityQuery.isError ? (
        <AdminCard>
          <AdminEmptyState
            icon={CircleAlert}
            title="Confirmation access could not be verified"
            description="Private Confirmation obligations remain unavailable until Solaris can verify this edition-scoped capability."
          />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void capabilityQuery.refetch()}
              disabled={capabilityQuery.isFetching}
              className="admin-action-secondary"
            >
              Retry access verification
            </button>
          </div>
        </AdminCard>
      ) : !hasConfirmationRead ? (
        <AdminCard>
          <AdminEmptyState
            icon={CircleAlert}
            title="Confirmation access required"
            description="This Organizer account does not currently have confirmation.read for the selected edition. Public edition visibility does not grant access to private obligations."
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
              <div className="mt-3 border-t border-white/[0.07]">
                <div className="flex flex-wrap items-end justify-between gap-3 py-3">
                  <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Find a delegation obligation</span>
                    <input
                      type="search"
                      value={attentionSearch}
                      onChange={(event) => setAttentionSearch(event.target.value)}
                      placeholder="Country or requirement reason"
                      className="admin-input"
                    />
                  </label>
                  <span className="pb-2 text-xs text-muted-foreground" role="status">
                    {visibleAttention.length} of {summary.needsAttention.length} unresolved obligations
                  </span>
                </div>
                <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
                  {visibleAttention.slice(0, 12).map((requirement) => (
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
                  {visibleAttention.length === 0 ? (
                    <p className="py-4 text-xs text-muted-foreground">
                      No unresolved obligations match this search. The edition-wide attention total remains unchanged.
                    </p>
                  ) : null}
                  {visibleAttention.length > 12 ? (
                    <p className="py-3 text-xs text-muted-foreground">
                      +{visibleAttention.length - 12} more matching obligations. Open Requirements for the complete authoritative list.
                    </p>
                  ) : null}
                </div>
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
