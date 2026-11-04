import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { isCurrentConfirmationRequirementAction } from "@/lib/confirmation-requirement-action-scope";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import { toSystemError } from "@/lib/system-error";

type RequirementFilter = "all" | "required" | "satisfied" | "waived";
type PendingAction =
  | { kind: "reconfirm"; requirement: ConfirmationRequirement }
  | { kind: "waive"; requirement: ConfirmationRequirement }
  | null;

const RISK = "R2" as const;
const STALE_CONTEXT_ERROR =
  "Organizer edition context changed before this confirmation requirement command. Review the requirement again in the selected edition.";

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
  const reconcileRequirementOperation = useServerFn(reconcileSystemOperation);
  const { editionId } = useAdminContext();
  const [filter, setFilter] = useState<RequirementFilter>("all");
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const activeEditionRef = useRef(editionId);
  const editionReviewEpochRef = useRef(0);
  const ensureInFlightRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const unresolvedRequirementRef = useRef<{ operationId: string; fingerprint: string } | null>(null);

  const requirementsQuery = useQuery({
    queryKey: ["confirmation-requirements", editionId || "none"],
    enabled: Boolean(editionId),
    queryFn: () => loadConfirmationRequirements(editionId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const ensure = useMutation({
    mutationFn: async (input: { editionId: string; reviewEpoch: number }) => {
      const result = await ensureConfirmationRequirements(input.editionId);
      if (!result || result.ok !== true || result.editionId !== input.editionId ||
          !Number.isSafeInteger(result.created) || result.created < 0) {
        throw new Error("The current edition's requirement initialization could not be verified.");
      }
      return result;
    },
    onSuccess: async (result, input) => {
      if (isCurrentConfirmationRequirementAction(
        input.editionId, activeEditionRef.current,
        input.reviewEpoch, editionReviewEpochRef.current,
      )) {
        toast.success(
          result.created
            ? String(result.created) + " confirmation requirement" + (result.created === 1 ? "" : "s") + " created"
            : "Every active delegation already has a current requirement",
        );
      } else {
        toast.info("A prior Organizer selection's confirmation requirements were updated. Review that edition to see the result.");
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["confirmation-requirements", input.editionId],
        }),
        queryClient.invalidateQueries({ queryKey: ["organizer-tasks-v5", input.editionId] }),
        queryClient.invalidateQueries({ queryKey: ["organizer-task-count-v5", input.editionId] }),
      ]);
    },
    onError: (error, input) => {
      if (isCurrentConfirmationRequirementAction(
        input.editionId, activeEditionRef.current,
        input.reviewEpoch, editionReviewEpochRef.current,
      )) {
        toast.error(error instanceof Error ? error.message : "Requirements could not be initialized");
      } else {
        toast.warning("Requirements for a prior Organizer edition selection could not be verified. Inspect that edition before retrying.");
      }
    },
    onSettled: () => {
      ensureInFlightRef.current = false;
    },
  });

  const action = useMutation({
    mutationFn: async (input: {
      kind: "reconfirm" | "waive";
      requirement: ConfirmationRequirement;
      organizerEditionId: string;
      reviewEpoch: number;
      actionReason: string;
    }) => {
      if (input.requirement.editionId !== input.organizerEditionId) {
        throw new Error(STALE_CONTEXT_ERROR);
      }

      const fingerprint = JSON.stringify([
        input.organizerEditionId,
        input.requirement.id,
        input.requirement.generation,
        input.kind,
        input.actionReason,
      ]);
      // The first server call can commit even when its HTTP reply is lost.
      // Reconcile that same operation before authorizing any new R2 intent.
      const unresolved = unresolvedRequirementRef.current;
      if (unresolved) {
        if (unresolved.fingerprint !== fingerprint) {
          throw new Error(
            "An earlier requirement command has an unresolved outcome (" +
            unresolved.operationId + "). Reconcile it before changing the reviewed decision.",
          );
        }
        const recovery = await reconcileRequirementOperation({
          data: { operationId: unresolved.operationId },
        });
        if (recovery.ok && recovery.receipt.operationId === unresolved.operationId &&
            recovery.receipt.status === "succeeded") {
          unresolvedRequirementRef.current = null;
          return recovery.receipt;
        }
        if (recovery.ok && recovery.receipt.operationId === unresolved.operationId &&
            recovery.receipt.status === "failed") {
          unresolvedRequirementRef.current = null;
          throw new Error("The earlier requirement operation failed authoritatively. Reload this requirement before retrying.");
        }
        throw new Error(
          "The earlier requirement operation is not yet confirmed. Reconcile operation " +
          unresolved.operationId + " before attempting another change.",
        );
      }

      const command = createOrganisationCommand({
        command:
          input.kind === "reconfirm"
            ? "confirmation.requirement.reconfirm"
            : "confirmation.requirement.waive",
        riskClass: RISK,
        scope: {
          editionId: input.organizerEditionId,
          countryId: input.requirement.countryId,
          entityId: input.requirement.id,
        },
        payload: {
          requirementId: input.requirement.id,
          generation: input.requirement.generation,
        },
      });
      if (!isCurrentConfirmationRequirementAction(
        input.organizerEditionId, activeEditionRef.current,
        input.reviewEpoch, editionReviewEpochRef.current,
      )) {
        throw new Error(STALE_CONTEXT_ERROR);
      }
      unresolvedRequirementRef.current = { operationId: command.operationId, fingerprint };
      let returned: unknown = null;
      let failureMessage = "The requirement command returned no verified receipt.";
      try {
        returned = input.kind === "reconfirm"
          ? await reconfirmConfirmationRequirement({
              requirementId: input.requirement.id,
              reason: input.actionReason,
              operationId: command.operationId,
              idempotencyKey: command.idempotencyKey,
            })
          : await waiveConfirmationRequirement({
              requirementId: input.requirement.id,
              reason: input.actionReason,
              operationId: command.operationId,
              idempotencyKey: command.idempotencyKey,
            });
      } catch (caught) {
        failureMessage = toSystemError(caught).message;
      }
      const receipt = normalizeSystemReceipt(returned);
      if (receipt && receipt.operationId === command.operationId &&
          receipt.status === "succeeded") {
        unresolvedRequirementRef.current = null;
        return receipt;
      }
      if (receipt && receipt.operationId === command.operationId && receipt.status === "failed") {
        unresolvedRequirementRef.current = null;
        throw new Error(receipt.error?.message ?? "The requirement command failed authoritatively.");
      }
      // A transport error, invalid payload or incomplete operation is not a
      // failed canonical mutation. Verify the durable receipt before UI success.
      const recovery = await reconcileRequirementOperation({
        data: { operationId: command.operationId },
      });
      if (recovery.ok && recovery.receipt.operationId === command.operationId &&
          recovery.receipt.status === "succeeded") {
        unresolvedRequirementRef.current = null;
        return recovery.receipt;
      }
      if (recovery.ok && recovery.receipt.operationId === command.operationId &&
          recovery.receipt.status === "failed") {
        unresolvedRequirementRef.current = null;
        throw new Error("The requirement operation failed. " + failureMessage);
      }
      throw new Error(
        failureMessage + " Outcome uncertain. Reconcile operation " +
        command.operationId + " before retrying this requirement.",
      );
    },
    onSuccess: async (_, variables) => {
      if (isCurrentConfirmationRequirementAction(
        variables.organizerEditionId, activeEditionRef.current,
        variables.reviewEpoch, editionReviewEpochRef.current,
      )) {
        toast.success(
          variables.kind === "reconfirm"
            ? variables.requirement.countryName + " now requires confirmation again"
            : variables.requirement.countryName + " confirmation requirement waived",
        );
        setPending(null);
        setReason("");
      } else {
        toast.info("The previous edition's requirement operation completed. Review that edition before taking another action.");
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["confirmation-requirements", variables.organizerEditionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["organizer-tasks-v5", variables.organizerEditionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["organizer-task-count-v5", variables.organizerEditionId],
        }),
      ]);
    },
    onError: (error, variables) => {
      if (isCurrentConfirmationRequirementAction(
        variables.organizerEditionId, activeEditionRef.current,
        variables.reviewEpoch, editionReviewEpochRef.current,
      )) {
        toast.error(error instanceof Error ? error.message : "The requirement operation failed.");
      } else {
        toast.warning("A previous edition's requirement operation could not be confirmed. Inspect that edition before retrying.");
      }
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  useLayoutEffect(() => {
    // Update the imperative context before a settled mutation can touch the
    // next edition's pending decision during the post-commit paint window.
    activeEditionRef.current = editionId;
    editionReviewEpochRef.current += 1;
    // A pending R2 decision belongs to the edition in which it was opened.
    // Never let an old sheet survive a global Organizer context switch.
    setPending(null);
    setReason("");
  }, [editionId]);

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
    if (unresolvedRequirementRef.current) {
      toast.error("A requirement operation is unresolved. Reconcile the open review before starting another.");
      return;
    }
    if (actionInFlightRef.current) {
      toast.error("Finish the current requirement operation before reviewing another.");
      return;
    }
    if (!editionId || next.requirement.editionId !== editionId) {
      toast.error(STALE_CONTEXT_ERROR);
      return;
    }
    action.reset();
    setReason("");
    setPending(next);
  }

  function submitAction() {
    // React state alone cannot prevent two clicks in the same render tick from
    // creating different operation identities for one consequential decision.
    if (actionInFlightRef.current || action.isPending || !pending || reason.trim().length < 5) return;
    if (!editionId || pending.requirement.editionId !== editionId ||
        !isCurrentConfirmationRequirementAction(
          editionId, activeEditionRef.current,
          editionReviewEpochRef.current, editionReviewEpochRef.current,
        )) {
      setPending(null);
      setReason("");
      toast.error(STALE_CONTEXT_ERROR);
      return;
    }
    actionInFlightRef.current = true;
    action.mutate({
      kind: pending.kind,
      requirement: pending.requirement,
      organizerEditionId: editionId,
      reviewEpoch: editionReviewEpochRef.current,
      actionReason: reason.trim(),
    });
  }

  return (
    <div className="admin-page pb-5" data-v3-organizer-confirmation-requirements="">
      <AdminPageHeader
        eyebrow="Delegations · Confirmations"
        title="Confirmation requirements"
        description="One current requirement per edition and delegation. Submission rounds only provide windows to satisfy these requirements; opening another round never creates another obligation."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-action-secondary"
              disabled={!editionId || ensure.isPending || ensureInFlightRef.current}
              onClick={() => {
                if (!editionId || ensureInFlightRef.current || ensure.isPending ||
                    editionId !== activeEditionRef.current) return;
                ensureInFlightRef.current = true;
                ensure.mutate({ editionId, reviewEpoch: editionReviewEpochRef.current });
              }}
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
            description="Select an Organizer edition before managing its confirmation requirements. Solaris will not retain a pending requirement decision from another edition."
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
          if (action.isPending || actionInFlightRef.current || unresolvedRequirementRef.current) return;
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

            {action.error && action.variables?.organizerEditionId === editionId &&
              action.variables?.reviewEpoch === editionReviewEpochRef.current ? (
              <p className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
                {action.error instanceof Error ? action.error.message : "The requirement command failed."}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="admin-action-secondary w-full"
                disabled={action.isPending || Boolean(unresolvedRequirementRef.current)}
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
                disabled={action.isPending || actionInFlightRef.current || reason.trim().length < 5}
                onClick={submitAction}
              >
                {action.isPending
                  ? "Applying…"
                  : unresolvedRequirementRef.current
                    ? "Reconcile prior operation"
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
