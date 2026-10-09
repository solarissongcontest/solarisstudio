import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  ensureConfirmationRequirements,
  loadConfirmationRequirements,
  reconfirmConfirmationRequirement,
  waiveConfirmationRequirement,
  type ConfirmationRequirement,
} from "@/integrations/confirmations/admin";
import {
  createOrganisationCommand,
  requiresImpactPreview,
} from "@/lib/organisation-operation-contract";

type RequirementFilter = "all" | "required" | "satisfied" | "waived";
type PendingAction =
  | { kind: "reconfirm"; requirement: ConfirmationRequirement }
  | { kind: "waive"; requirement: ConfirmationRequirement }
  | null;

const RISK = "R2" as const;

export const Route = createFileRoute("/confirmations/admin/requirements")({
  head: () => ({
    meta: [
      { title: "Confirmation requirements — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationRequirementsPage,
});

function ConfirmationRequirementsPage() {
  const queryClient = useQueryClient();
  const { editionId } = useAdminContext();
  const [filter, setFilter] = useState<RequirementFilter>("all");
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");

  const requirementsQuery = useQuery({
    queryKey: ["confirmation-requirements", editionId || "none"],
    enabled: Boolean(editionId),
    queryFn: () => loadConfirmationRequirements(editionId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const ensure = useMutation({
    mutationFn: () => ensureConfirmationRequirements(editionId),
    onSuccess: async (result) => {
      toast.success(
        result.created
          ? String(result.created) + " confirmation requirement" + (result.created === 1 ? "" : "s") + " created"
          : "Every active delegation already has a current requirement",
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["confirmation-requirements", editionId || "none"],
        }),
        queryClient.invalidateQueries({ queryKey: ["organizer-tasks-v5"] }),
        queryClient.invalidateQueries({ queryKey: ["organizer-task-count-v5"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Requirements could not be initialized"),
  });

  const action = useMutation({
    mutationFn: async (input: {
      kind: "reconfirm" | "waive";
      requirement: ConfirmationRequirement;
      actionReason: string;
    }) => {
      const command = createOrganisationCommand({
        command:
          input.kind === "reconfirm"
            ? "confirmation.requirement.reconfirm"
            : "confirmation.requirement.waive",
        riskClass: RISK,
        scope: {
          editionId: input.requirement.editionId,
          countryId: input.requirement.countryId,
          entityId: input.requirement.id,
        },
        payload: {
          requirementId: input.requirement.id,
          generation: input.requirement.generation,
        },
      });

      return input.kind === "reconfirm"
        ? reconfirmConfirmationRequirement({
            requirementId: input.requirement.id,
            reason: input.actionReason,
            operationId: command.operationId,
            idempotencyKey: command.idempotencyKey,
          })
        : waiveConfirmationRequirement({
            requirementId: input.requirement.id,
            reason: input.actionReason,
            operationId: command.operationId,
            idempotencyKey: command.idempotencyKey,
          });
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.kind === "reconfirm"
          ? variables.requirement.countryName + " now requires confirmation again"
          : variables.requirement.countryName + " confirmation requirement waived",
      );
      setPending(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["confirmation-requirements", editionId || "none"],
        }),
        queryClient.invalidateQueries({ queryKey: ["organizer-tasks-v5"] }),
        queryClient.invalidateQueries({ queryKey: ["organizer-task-count-v5"] }),
      ]);
    },
  });

  const requirements = requirementsQuery.data ?? [];
  const counts = useMemo(
    () => ({
      required: requirements.filter((item) => item.status === "required").length,
      satisfied: requirements.filter((item) => item.status === "satisfied").length,
      waived: requirements.filter((item) => item.status === "waived").length,
    }),
    [requirements],
  );
  const visible = useMemo(
    () =>
      filter === "all"
        ? requirements
        : requirements.filter((item) => item.status === filter),
    [filter, requirements],
  );

  function start(next: Exclude<PendingAction, null>) {
    action.reset();
    setReason("");
    setPending(next);
  }

  function submitAction() {
    if (!pending || reason.trim().length < 5) return;
    action.mutate({
      kind: pending.kind,
      requirement: pending.requirement,
      actionReason: reason.trim(),
    });
  }

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Delegations · Confirmations"
        title="Confirmation requirements"
        description="One current requirement per edition and delegation. Submission rounds only provide windows to satisfy these requirements; opening another round never creates another obligation."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-action-secondary"
              disabled={!editionId || ensure.isPending}
              onClick={() => ensure.mutate()}
            >
              <RefreshCw className={ensure.isPending ? "size-4 animate-spin" : "size-4"} />
              {ensure.isPending ? "Checking…" : "Ensure active delegations"}
            </button>
            <Link to="/confirmations/admin/rounds" className="admin-action-secondary">
              Submission rounds
            </Link>
          </div>
        }
      />

      {!editionId ? (
        <AdminCard>
          <AdminEmptyState
            icon={CircleAlert}
            title="Choose an edition"
            description="Select an Organizer edition before managing its confirmation requirements."
          />
        </AdminCard>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="Required" value={counts.required} tone={counts.required ? "attention" : "ready"} />
            <Metric label="Satisfied" value={counts.satisfied} tone="ready" />
            <Metric label="Waived" value={counts.waived} tone="neutral" />
          </section>

          <AdminCard className="mt-4 !p-2">
            <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Requirement filters">
              {(["all", "required", "satisfied", "waived"] as RequirementFilter[]).map((item) => {
                const count = item === "all" ? requirements.length : counts[item];
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={filter === item}
                    className={
                      filter === item
                        ? "min-h-10 rounded-xl border border-sky-200/15 bg-sky-200/[0.09] px-2 text-xs font-semibold text-sky-50"
                        : "min-h-10 rounded-xl border border-transparent px-2 text-xs font-semibold capitalize text-muted-foreground hover:bg-white/[0.035]"
                    }
                    onClick={() => setFilter(item)}
                  >
                    {item === "all" ? "All " + count : capitalize(item) + " " + count}
                  </button>
                );
              })}
            </div>
          </AdminCard>

          {requirementsQuery.isLoading ? (
            <AdminCard className="mt-4">
              <p className="py-12 text-center text-sm text-muted-foreground">
                Loading confirmation requirements…
              </p>
            </AdminCard>
          ) : requirementsQuery.error ? (
            <AdminCard className="mt-4">
              <AdminEmptyState
                icon={CircleAlert}
                title="Requirements could not be loaded"
                description={
                  requirementsQuery.error instanceof Error
                    ? requirementsQuery.error.message
                    : "The canonical requirement projection is unavailable."
                }
              />
            </AdminCard>
          ) : visible.length ? (
            <section className="mt-4 space-y-3">
              {visible.map((requirement) => (
                <AdminCard key={requirement.id} className="!p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold">{requirement.countryName}</h2>
                        <AdminStatus tone={statusTone(requirement.status)}>
                          {requirement.status}
                        </AdminStatus>
                        <AdminStatus tone="neutral">
                          Generation {requirement.generation}
                        </AdminStatus>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {requirement.reason}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Valid from {formatDate(requirement.validFrom)}
                        {requirement.resolvedAt
                          ? " · resolved " + formatDate(requirement.resolvedAt)
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {requirement.status === "required" ? (
                        <button
                          type="button"
                          className="admin-action-secondary"
                          onClick={() => start({ kind: "waive", requirement })}
                        >
                          <ShieldCheck className="size-4" />
                          Waive
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-action-secondary"
                          onClick={() => start({ kind: "reconfirm", requirement })}
                        >
                          <RotateCcw className="size-4" />
                          Require again
                        </button>
                      )}
                    </div>
                  </div>
                </AdminCard>
              ))}
            </section>
          ) : (
            <AdminCard className="mt-4">
              <AdminEmptyState
                icon={CheckCircle2}
                title={filter === "all" ? "No confirmation requirements yet" : "No " + filter + " requirements"}
                description={
                  filter === "all"
                    ? "Use Ensure active delegations to create the first current-generation requirements. Existing satisfied requirements are never duplicated."
                    : "Nothing in this edition matches the selected requirement state."
                }
              />
            </AdminCard>
          )}
        </>
      )}

      <AdminSheet
        open={Boolean(pending)}
        onClose={() => {
          if (action.isPending) return;
          setPending(null);
          setReason("");
          action.reset();
        }}
        title={pending?.kind === "reconfirm" ? "Require confirmation again" : "Waive confirmation requirement"}
        description="This is an R2 operational decision. Review the affected delegation state before applying it."
      >
        {pending ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AdminStatus tone="attention">{RISK}</AdminStatus>
              <span className="text-xs font-semibold text-muted-foreground">
                {requiresImpactPreview(RISK) ? "Impact review required" : "Review"}
              </span>
            </div>

            <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3">
              <p className="font-semibold">{pending.requirement.countryName}</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                {pending.kind === "reconfirm" ? (
                  <>
                    <li>Generation {pending.requirement.generation} remains in history and is invalidated.</li>
                    <li>Generation {pending.requirement.generation + 1} becomes required immediately.</li>
                    <li>An older response does not satisfy the new generation until the delegation submits or updates after its new valid-from time.</li>
                    <li>Opening or closing a round remains separate from this decision.</li>
                  </>
                ) : (
                  <>
                    <li>The current requirement becomes waived and stops creating participant or Organizer action.</li>
                    <li>No confirmation submission, entry, score or participation history is deleted.</li>
                    <li>The reason and operation are recorded in the audit log.</li>
                  </>
                )}
              </ul>
            </div>

            <label className="block">
              <span className="text-xs font-semibold">
                {pending.kind === "reconfirm"
                  ? "Why is reconfirmation required?"
                  : "Why is this requirement waived?"}
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-2 min-h-28 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm outline-none focus:border-sky-200/30"
                placeholder="Record the concrete operational reason…"
              />
            </label>

            {action.error ? (
              <p className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
                {action.error instanceof Error ? action.error.message : "The requirement command failed."}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="admin-action-secondary w-full"
                disabled={action.isPending}
                onClick={() => {
                  setPending(null);
                  setReason("");
                  action.reset();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={pending.kind === "reconfirm" ? "admin-action-danger w-full" : "admin-action-primary w-full"}
                disabled={action.isPending || reason.trim().length < 5}
                onClick={submitAction}
              >
                {action.isPending
                  ? "Applying…"
                  : pending.kind === "reconfirm"
                    ? "Require again"
                    : "Waive requirement"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminSheet>
    </div>
  );
}

function Metric(props: {
  label: string;
  value: number;
  tone: "ready" | "attention" | "neutral";
}) {
  return (
    <AdminCard>
      <p className="admin-section-label">{props.label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums">{props.value}</p>
        <AdminStatus tone={props.tone}>{props.tone}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function statusTone(status: ConfirmationRequirement["status"]) {
  if (status === "required") return "attention" as const;
  if (status === "satisfied") return "ready" as const;
  return "neutral" as const;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
