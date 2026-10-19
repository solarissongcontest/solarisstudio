import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminSheet, AdminStatus } from "@/components/admin/AdminUI";
import {
  applyConfirmationRequirementMaterialization,
  previewConfirmationRequirementMaterialization,
  type ConfirmationRequirementMaterializationPreview,
} from "@/integrations/confirmations/requirement-materialization";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

type PendingMaterialization = {
  editionId: string;
  preview: ConfirmationRequirementMaterializationPreview;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

const RISK = "R2" as const;

export function ConfirmationRequirementMaterializationControl(props: {
  editionId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingMaterialization | null>(null);

  const preview = useMutation({
    mutationFn: async (editionId: string) => {
      const impact = await previewConfirmationRequirementMaterialization({ editionId });
      const command = createOrganisationCommand({
        command: "confirmation.requirement.materialize",
        riskClass: RISK,
        scope: { editionId },
        expectedVersion: impact.impactFingerprint,
        payload: {
          countryIds: null,
          expectedFingerprint: impact.impactFingerprint,
        },
      });

      return {
        editionId,
        preview: impact,
        operationId: command.operationId,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      } satisfies PendingMaterialization;
    },
    onSuccess: (next) => {
      if (props.editionId !== next.editionId) {
        toast.error(
          "Organizer edition context changed while the impact was loading. Review the selected edition again.",
        );
        return;
      }
      setPending(next);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Confirmation requirement impact could not be loaded.",
      );
    },
  });

  const apply = useMutation({
    mutationFn: async (reviewed: PendingMaterialization) => {
      if (!props.editionId || props.editionId !== reviewed.editionId) {
        throw new Error(
          "Organizer edition context changed before apply. Review the impact again in the selected edition.",
        );
      }

      return applyConfirmationRequirementMaterialization({
        editionId: reviewed.editionId,
        countryIds: null,
        expectedFingerprint: reviewed.preview.impactFingerprint,
        operationId: reviewed.operationId,
        idempotencyKey: reviewed.idempotencyKey,
        correlationId: reviewed.correlationId,
      });
    },
    onSuccess: async (result, reviewed) => {
      if (!result.ok) {
        if (result.error?.code === "VERSION_CONFLICT") {
          toast.error("Delegation requirement state changed. Review the fresh impact before applying.");
          setPending(null);
        } else if (result.reconciliationRequired) {
          toast.error(
            "The operation outcome is still uncertain. Solaris kept the same operation identity; reconcile before starting a new apply.",
          );
        } else {
          toast.error(
            result.error?.code
              ? `Requirement materialization failed: ${result.error.code}`
              : "Requirement materialization failed.",
          );
        }
        await invalidateRequirementState(queryClient, reviewed.editionId);
        return;
      }

      const created = result.created ?? 0;
      toast.success(
        created > 0
          ? `${created} confirmation requirement${created === 1 ? "" : "s"} created with receipt ${shortId(result.receiptId ?? result.operationId)}.`
          : "Every reviewed delegation already has a current confirmation requirement.",
      );
      setPending(null);
      await invalidateRequirementState(queryClient, reviewed.editionId);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "The governed requirement operation could not be completed.",
      );
    },
  });

  useEffect(() => {
    // A reviewed R2 impact belongs to exactly one Organizer edition.
    setPending(null);
  }, [props.editionId]);

  const busy = preview.isPending || apply.isPending;

  return (
    <>
      <button
        type="button"
        className="admin-action-secondary"
        disabled={!props.editionId || busy}
        onClick={() => {
          if (props.editionId) preview.mutate(props.editionId);
        }}
      >
        <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
        {preview.isPending ? "Reviewing…" : apply.isPending ? "Applying…" : "Ensure active delegations"}
      </button>

      <AdminSheet
        open={Boolean(pending)}
        onClose={() => {
          if (apply.isPending) return;
          setPending(null);
          apply.reset();
        }}
        title="Ensure active delegation requirements"
        description="This is an R2 bulk operation. Solaris freezes the exact delegation impact before creating any current-generation requirement."
      >
        {pending ? (
          <div className="space-y-4" data-confirmation-materialization-review="">
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatus tone="attention">{RISK}</AdminStatus>
              <span className="text-xs font-semibold text-muted-foreground">
                Exact impact review required
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ImpactMetric label="Delegations reviewed" value={pending.preview.targetCount} />
              <ImpactMetric label="Requirements to create" value={pending.preview.createCount} />
            </div>

            <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3">
              <p className="text-sm font-semibold">
                {pending.preview.createCount
                  ? `${pending.preview.createCount} delegation${pending.preview.createCount === 1 ? "" : "s"} will receive a requirement.`
                  : "No new requirement will be created."}
              </p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                <li>Existing current requirements are left unchanged and are never duplicated.</li>
                <li>Submission rounds remain only windows in which a requirement can be satisfied.</li>
                <li>The server rechecks this exact impact fingerprint under the edition lock before apply.</li>
                <li>The operation is idempotent and returns a durable receipt for reconciliation.</li>
              </ul>
            </div>

            {pending.preview.createTargets.length ? (
              <div>
                <p className="admin-section-label">Will receive a current requirement</p>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {pending.preview.createTargets.map((target) => (
                    <div
                      key={target.countryId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{target.countryName}</p>
                        <p className="text-[11px] text-muted-foreground">{target.countryCode}</p>
                      </div>
                      <AdminStatus tone="attention">Create</AdminStatus>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-[11px] text-muted-foreground">
              Reviewed state <span className="font-mono text-foreground/80">{shortId(pending.preview.impactFingerprint)}</span>
              <span aria-hidden="true"> · </span>
              operation <span className="font-mono text-foreground/80">{shortId(pending.operationId)}</span>
            </div>

            {apply.error ? (
              <p className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
                {apply.error instanceof Error
                  ? apply.error.message
                  : "The requirement operation failed."}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="admin-action-secondary w-full"
                disabled={apply.isPending}
                onClick={() => {
                  setPending(null);
                  apply.reset();
                }}
              >
                {pending.preview.createCount ? "Cancel" : "Close"}
              </button>
              <button
                type="button"
                className="admin-action-primary w-full"
                disabled={apply.isPending || pending.preview.createCount === 0}
                onClick={() => apply.mutate(pending)}
              >
                {apply.isPending
                  ? "Applying…"
                  : pending.preview.createCount
                    ? `Create ${pending.preview.createCount}`
                    : "Nothing to create"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminSheet>
    </>
  );
}

function ImpactMetric(props: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{props.value}</p>
    </div>
  );
}

async function invalidateRequirementState(queryClient: QueryClient, editionId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["confirmation-requirements", editionId] }),
    queryClient.invalidateQueries({ queryKey: ["organizer-tasks-v5", editionId] }),
    queryClient.invalidateQueries({ queryKey: ["organizer-task-count-v5", editionId] }),
  ]);
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
