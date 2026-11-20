import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ShieldX, TriangleAlert, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminConfirmSheet, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import {
  editionLabel,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
} from "@/lib/data";
import { DEFAULT_ACCENT, entityDisplayMap } from "@/lib/entities";
import {
  participationStatus,
  participationStatusLabel,
  type ParticipationAwareParticipant,
  type ParticipationStatus,
} from "@/lib/participation-status";
import { validateEditionCommandScope } from "@/lib/solaris-v6-edition-context";
import { normalizeSystemReceipt } from "@/lib/system-receipt";

export const Route = createFileRoute("/_authenticated/admin/participant-status/$slug")({
  head: () => ({ meta: [{ title: "Participation status — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: ParticipantStatusWorkspace,
});

type StatusGroup = {
  key: string;
  rows: ParticipationAwareParticipant[];
  status: ParticipationStatus;
  countryId: string | null;
  contestEntityId: string | null;
};

type ParticipationStatusPreview = {
  riskClass: "R2";
  editionId: string;
  countryId: string | null;
  contestEntityId: string | null;
  subjectKey: string;
  requestedStatus: ParticipationStatus;
  currentStatus: ParticipationStatus;
  expectedVersion: number;
  participantRows: number;
  entryRows: number;
  resultRows: number;
  publishedResultRows: number;
  shows: Array<{ showId: string; showName: string; published: boolean }>;
  alreadyApplied: boolean;
};

type PendingStatusChange = {
  group: StatusGroup;
  displayName: string;
  preview: ParticipationStatusPreview;
  operationId: string;
  idempotencyKey: string;
};

type ParticipationStatusExecution = {
  ok: true;
  riskClass: "R2";
  editionId: string;
  countryId: string | null;
  contestEntityId: string | null;
  status: ParticipationStatus;
  updatedRows: number;
  operationId: string;
  previousVersion: number;
  version: number;
};

function validateParticipationStatusExecution(
  value: unknown,
  pending: PendingStatusChange,
  editionId: string,
): ParticipationStatusExecution {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Participation status returned an invalid operation result.");
  }
  const row = value as Record<string, unknown>;
  const expectedStatus = pending.preview.requestedStatus;
  if (
    row.ok !== true ||
    row.riskClass !== "R2" ||
    row.editionId !== editionId ||
    row.countryId !== pending.group.countryId ||
    row.contestEntityId !== pending.group.contestEntityId ||
    row.status !== expectedStatus ||
    row.operationId !== pending.operationId ||
    typeof row.updatedRows !== "number" ||
    typeof row.previousVersion !== "number" ||
    typeof row.version !== "number"
  ) {
    throw new Error("Participation status operation result does not match the reviewed command.");
  }
  return row as ParticipationStatusExecution;
}

function ParticipantStatusWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: edition, isLoading } = useEdition(slug);
  const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined;
  const { data: participants = [] } = useParticipants(scopedEditionId);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(scopedEditionId);
  const { data: shows = [] } = useShows(scopedEditionId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingStatusChange | null>(null);

  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const countryIds = useMemo(() => new Set(countries.map((country) => country.id)), [countries]);
  const showNames = useMemo(() => new Map(shows.map((show) => [show.id, show.name])), [shows]);

  useEffect(() => {
    setPendingChange(null);
  }, [organizerEditionId, edition?.id]);

  const groups = useMemo<StatusGroup[]>(() => {
    const byIdentity = new Map<string, ParticipationAwareParticipant[]>();
    for (const row of participants as ParticipationAwareParticipant[]) {
      const key = row.country_id;
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), row]);
    }

    return [...byIdentity.entries()]
      .map(([key, rows]) => {
        const status: ParticipationStatus = rows.some((row) => participationStatus(row) === "disqualified")
          ? "disqualified"
          : rows.some((row) => participationStatus(row) === "withdrawn")
            ? "withdrawn"
            : "confirmed";
        const sample = rows[0];
        const global = countryIds.has(sample.country_id);
        return {
          key,
          rows,
          status,
          countryId: global ? sample.country_id : null,
          contestEntityId: global ? sample.contest_entity_id : (sample.contest_entity_id ?? sample.country_id),
        };
      })
      .sort((a, b) => {
        const aName = displays.get(a.key)?.name ?? a.key;
        const bName = displays.get(b.key)?.name ?? b.key;
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
      });
  }, [participants, countryIds, displays]);

  function assertParticipationEditionScope(entityEditionId?: string) {
    if (!edition || !organizerEditionId) {
      throw Object.assign(
        new Error("Participation status requires an exact Organizer edition context."),
        { status: 409 },
      );
    }

    const scope = validateEditionCommandScope({
      routeEditionId: edition.id,
      commandEditionId: organizerEditionId,
      entityEditionId: entityEditionId ?? edition.id,
      capabilityEditionId: organizerEditionId,
    });
    if (!scope.ok) {
      throw Object.assign(
        new Error(
          `Edition context changed before the participation-status command (${scope.mismatches.join(", ")}). Refresh canonical state before retrying.`,
        ),
        { status: 409 },
      );
    }
    return edition.id;
  }

  async function refreshParticipationState() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["public-participants"] }),
      qc.invalidateQueries({ queryKey: ["results"] }),
      qc.invalidateQueries({ queryKey: ["organizer-tasks-v5"] }),
    ]);
  }

  async function reconcileParticipationStatusOperation(pending: PendingStatusChange) {
    const { data, error } = await (supabase as any).rpc(
      "studio2_reconcile_operation",
      { p_operation_id: pending.operationId },
    );
    if (error) return false;

    const receipt = normalizeSystemReceipt(data);
    if (
      !receipt ||
      receipt.operationId !== pending.operationId ||
      receipt.command !== `participation.status.${pending.preview.requestedStatus}` ||
      receipt.status !== "succeeded"
    ) {
      return false;
    }

    validateParticipationStatusExecution(receipt.result, pending, pending.preview.editionId);
    return true;
  }

  async function requestStatusChange(group: StatusGroup, status: ParticipationStatus) {
    if (!edition || group.status === status) return;
    setBusyKey(group.key);
    try {
      const commandEditionId = assertParticipationEditionScope();
      const { data, error } = await (supabase as any).rpc(
        "studio2_participation_status_change_preview",
        {
          p_edition_id: commandEditionId,
          p_country_id: group.countryId,
          p_contest_entity_id: group.contestEntityId,
          p_status: status,
        },
      );
      if (error) throw error;

      const preview = data as ParticipationStatusPreview;
      if (preview.editionId !== commandEditionId) {
        throw Object.assign(
          new Error("Participation preview returned a different edition than the reviewed Organizer context."),
          { status: 409 },
        );
      }

      const displayName = displays.get(group.key)?.name ?? "Country";
      if (preview.alreadyApplied) {
        toast.message(`${displayName} is already marked ${participationStatusLabel(status).toLowerCase()}.`);
        return;
      }

      setPendingChange({
        group,
        displayName,
        preview,
        operationId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Participation impact could not be loaded");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmStatusChange() {
    if (!edition || !pendingChange) return;
    const pending = pendingChange;
    setBusyKey(pending.group.key);
    try {
      const commandEditionId = assertParticipationEditionScope(pending.preview.editionId);
      const { data, error } = await (supabase as any).rpc(
        "studio2_apply_participation_status",
        {
          p_edition_id: commandEditionId,
          p_country_id: pending.group.countryId,
          p_contest_entity_id: pending.group.contestEntityId,
          p_status: pending.preview.requestedStatus,
          p_operation_id: pending.operationId,
          p_idempotency_key: pending.idempotencyKey,
          p_expected_version: pending.preview.expectedVersion,
        },
      );
      if (error) throw error;
      validateParticipationStatusExecution(data, pending, commandEditionId);

      await refreshParticipationState();
      toast.success(
        `${pending.displayName} marked ${participationStatusLabel(pending.preview.requestedStatus).toLowerCase()}`,
      );
      setPendingChange(null);
    } catch (caught) {
      const reconciled = await reconcileParticipationStatusOperation(pending).catch(() => false);
      if (reconciled) {
        await refreshParticipationState();
        toast.success(
          `${pending.displayName} marked ${participationStatusLabel(pending.preview.requestedStatus).toLowerCase()} · confirmed after reconnect`,
        );
        setPendingChange(null);
        return;
      }
      toast.error(caught instanceof Error ? caught.message : "Participation status could not be changed");
    } finally {
      setBusyKey(null);
    }
  }

  if (isLoading) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading participation statuses…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Ban} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!organizerEditionId) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={Ban}
            title="Choose an edition"
            description="Participation status is edition-scoped contest authority. Select the exact edition in the Organizer toolbar before loading or changing participation state."
            action={<Link to="/admin" className="admin-action-secondary">Back to Organizer</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (organizerEditionId !== edition.id) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={TriangleAlert}
            title="Edition context mismatch"
            description="This Participation Status URL belongs to a different edition than the one selected in Solaris Organizer. Edition-scoped reads and actions stay blocked until the contexts match."
            action={<Link to="/admin" className="admin-action-secondary">Back to Organizer</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Participation status"
        description="Mark a country active, withdrawn or disqualified. Withdrawn and disqualified countries stay in the published participant list but are excluded from public scoreboards and result statistics."
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Active" value={groups.filter((group) => group.status === "confirmed").length} />
        <Metric label="Withdrawn" value={groups.filter((group) => group.status === "withdrawn").length} />
        <Metric label="Disqualified" value={groups.filter((group) => group.status === "disqualified").length} />
      </div>

      {!groups.length ? (
        <AdminCard><AdminEmptyState icon={Ban} title="No participants yet" description="Build a show line-up first. Countries will appear here automatically." action={<Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-primary">Open entries</Link>} /></AdminCard>
      ) : (
        <AdminCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-white/[0.07]">
            {groups.map((group) => {
              const display = displays.get(group.key);
              const showList = [...new Set(group.rows.map((row) => row.show_id ? showNames.get(row.show_id) : null).filter(Boolean))];
              const busy = busyKey === group.key;
              return (
                <div key={group.key} className="p-3 sm:p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <FlagChip code={display?.short_code ?? "?"} color={display?.accent_color ?? DEFAULT_ACCENT} image={display?.flag_image ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{display?.name ?? "Unknown country"}</p>
                        <AdminStatus tone={group.status === "confirmed" ? "ready" : "attention"}>
                          {participationStatusLabel(group.status)}
                        </AdminStatus>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{showList.length ? showList.join(" · ") : `${group.rows.length} edition record${group.rows.length === 1 ? "" : "s"}`}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" disabled={busy || group.status === "confirmed"} onClick={() => void requestStatusChange(group, "confirmed")} className="admin-action-secondary !min-h-10 !px-2"><UserCheck className="size-3.5" /> Active</button>
                    <button type="button" disabled={busy || group.status === "withdrawn"} onClick={() => void requestStatusChange(group, "withdrawn")} className="admin-action-secondary !min-h-10 !px-2"><Ban className="size-3.5" /> Withdrawn</button>
                    <button type="button" disabled={busy || group.status === "disqualified"} onClick={() => void requestStatusChange(group, "disqualified")} className="admin-action-secondary !min-h-10 !px-2"><ShieldX className="size-3.5" /> Disqualified</button>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      )}

      <AdminConfirmSheet
        open={Boolean(pendingChange)}
        onClose={() => {
          if (!busyKey) setPendingChange(null);
        }}
        onConfirm={confirmStatusChange}
        title={
          pendingChange
            ? `Mark ${pendingChange.displayName} ${participationStatusLabel(pendingChange.preview.requestedStatus).toLowerCase()}?`
            : "Change participation status?"
        }
        description={
          pendingChange ? (
            <ParticipationStatusImpactPreview pending={pendingChange} />
          ) : (
            "Review the participation impact before continuing."
          )
        }
        confirmLabel={
          pendingChange
            ? `Mark ${participationStatusLabel(pendingChange.preview.requestedStatus).toLowerCase()}`
            : "Apply status"
        }
        confirmationText={
          pendingChange && pendingChange.preview.requestedStatus !== "confirmed"
            ? pendingChange.displayName
            : undefined
        }
        confirmationHint={
          pendingChange && pendingChange.preview.requestedStatus !== "confirmed"
            ? `Type ${pendingChange.displayName} to confirm this R2 participation change`
            : undefined
        }
        busy={Boolean(busyKey)}
        danger={pendingChange?.preview.requestedStatus !== "confirmed"}
      />
    </AdminPage>
  );
}

function ParticipationStatusImpactPreview({ pending }: { pending: PendingStatusChange }) {
  const preview = pending.preview;
  const publishedShows = preview.shows.filter((show) => show.published);

  return (
    <div className="space-y-3">
      <p>
        This is a <strong className="text-foreground">Risk R2</strong> participation change for{" "}
        <strong className="text-foreground">{pending.displayName}</strong>.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ImpactMetric label="Current → requested" value={`${participationStatusLabel(preview.currentStatus)} → ${participationStatusLabel(preview.requestedStatus)}`} />
        <ImpactMetric label="Show rows affected" value={preview.participantRows} />
        <ImpactMetric label="Result rows present" value={preview.resultRows} />
        <ImpactMetric label="Published result rows" value={preview.publishedResultRows} />
      </div>

      {preview.publishedResultRows > 0 ? (
        <p className="rounded-lg border border-rose-200/15 bg-rose-200/[0.05] px-3 py-2 text-xs leading-5 text-rose-50">
          Published result visibility/statistics are affected immediately by this status. Existing score rows are not deleted.
        </p>
      ) : null}

      {publishedShows.length ? (
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Published shows in scope
          </span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {publishedShows.map((show) => show.showName).join(" · ")}
          </p>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Solaris will reject this command if participant or entry truth changes after preview version v{preview.expectedVersion}.
        Retrying this same confirmation replays its operation receipt instead of applying the status twice.
      </p>
    </div>
  );
}

function ImpactMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/10 p-2.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-xs text-foreground">{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}