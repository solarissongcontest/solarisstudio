import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Layers3, Lock, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import {
  createMergedTelevotingRound,
  deleteMergedTelevotingRound,
  getMergedTelevotingRoundsPage,
  previewMergedTelevotingRoundStatus,
  renameMergedTelevotingRound,
  setMergedTelevotingRoundStatus,
  type MergedAdminRound,
  type MergedRoundStatusPreview,
} from "@/integrations/televoting/rounds.functions";

type PendingRoundStatusChange = {
  round: MergedAdminRound;
  status: "draft" | "open" | "closed";
  preview: MergedRoundStatusPreview;
  operationId: string;
  idempotencyKey: string;
};

export function VotingRoundsView() {
  const queryClient = useQueryClient();
  const { editionId } = useAdminContext();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const createRound = useServerFn(createMergedTelevotingRound);
  const renameRound = useServerFn(renameMergedTelevotingRound);
  const previewStatus = useServerFn(previewMergedTelevotingRoundStatus);
  const setStatus = useServerFn(setMergedTelevotingRoundStatus);
  const deleteRound = useServerFn(deleteMergedTelevotingRound);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MergedAdminRound | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MergedAdminRound | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PendingRoundStatusChange | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-rounds-page", editionId],
    queryFn: () => getRoundsPage({ data: { editionId } }),
    enabled: Boolean(editionId),
    staleTime: 10_000,
  });

  const edition = pageData?.edition ?? null;
  const rounds = edition?.rounds ?? [];
  const openRound = rounds.find((round) => round.status === "open") ?? null;
  const remoteEditionId = edition?.id ?? "";
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds-page", editionId] });

  const createMutation = useMutation({
    mutationFn: () => createRound({ data: { editionId: remoteEditionId, name: newName.trim() } }),
    onSuccess: async (result) => {
      setNewName("");
      setCreateOpen(false);
      if (result.sync_warning) toast.warning(`Round created. ${result.sync_warning}`);
      else toast.success("Voting round created as draft");
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Round could not be created"),
  });

  const renameMutation = useMutation({
    mutationFn: () => renameRound({ data: { id: editing!.id, name: editingName.trim() } }),
    onSuccess: async () => {
      setEditing(null);
      setEditingName("");
      toast.success("Round renamed");
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Round could not be renamed"),
  });

  async function requestStatusChange(
    round: MergedAdminRound,
    status: "draft" | "open" | "closed",
  ) {
    setStatusBusy(round.id);
    try {
      const preview = await previewStatus({ data: { id: round.id, status } });
      if (preview.alreadyApplied) {
        toast.message(`${round.name} is already ${status}.`);
        return;
      }
      if (preview.blockers.length) {
        throw new Error(preview.blockers.join(" "));
      }
      setPendingStatus({
        round,
        status,
        preview,
        operationId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round status impact could not be loaded");
    } finally {
      setStatusBusy(null);
    }
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    const pending = pendingStatus;
    setStatusBusy(pending.round.id);
    try {
      await setStatus({
        data: {
          id: pending.round.id,
          status: pending.status,
          operationId: pending.operationId,
          idempotencyKey: pending.idempotencyKey,
          expectedGlobalVersion: pending.preview.expectedGlobalVersion,
          expectedRoundVersion: pending.preview.expectedRoundVersion,
        },
      });
      toast.success(
        pending.status === "open"
          ? `${pending.round.name} is accepting votes`
          : pending.status === "closed"
            ? `${pending.round.name} is closed`
            : `${pending.round.name} moved to draft`,
      );
      setPendingStatus(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round status could not be changed");
    } finally {
      setStatusBusy(null);
    }
  }

  async function removeRound() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteRound({ data: { id: target.id } });
      toast.success("Round deleted");
      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round could not be deleted");
    }
  }

  return (
    <div className="admin-page mx-auto max-w-5xl pb-5">
      <AdminPageHeader
        eyebrow="Voting"
        title="Rounds & entries"
        description="Prepare a voting round, check its line-up, then deliberately open or close voting. Technical state stays out of the way until you need it."
        actions={
          <button
            type="button"
            disabled={!remoteEditionId}
            onClick={() => setCreateOpen(true)}
            className="admin-action-primary"
          >
            <Plus className="size-4" /> New round
          </button>
        }
      />

      {!editionId || isLoading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">
          {!editionId ? "Selecting the current Organizer edition…" : "Loading voting rounds…"}
        </AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
          <p className="font-semibold">Voting rounds could not be loaded.</p>
          <p className="mt-1 text-rose-100/70">
            The rest of Solaris Organizer remains available. Retry this section after the voting connection recovers.
          </p>
          <details className="mt-3 rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs text-rose-100/65">
            <summary className="cursor-pointer font-semibold">Technical details</summary>
            <p className="mt-2 break-words">{error instanceof Error ? error.message : "Unknown voting-round error"}</p>
          </details>
        </AdminCard>
      ) : pageData && !pageData.linked ? (
        <AdminCard>
          <AdminEmptyState
            icon={Radio}
            title="Public voting is not linked to this edition yet"
            description="Create or repair the Televoting edition projection before adding voting rounds."
            action={
              <Link to="/televoting/admin/editions" className="admin-action-primary">
                Link voting edition
              </Link>
            }
          />
        </AdminCard>
      ) : rounds.length ? (
        <section className="space-y-3">
          {rounds.map((round) => {
            const anotherRoundOpen = Boolean(openRound && openRound.id !== round.id);
            const validEntryCount = round.entry_count >= 2 && round.entry_count <= 50;
            const canOpen = validEntryCount && !anotherRoundOpen;
            const busy = statusBusy === round.id;

            return (
              <AdminCard key={round.id} className="!p-0 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold tracking-[-.02em] sm:text-lg">{round.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {round.entry_count} entries · {humanMode(round.participant_mode)}
                      </p>
                    </div>
                    <AdminStatus tone={round.status === "open" ? "ready" : round.status === "draft" ? "attention" : "neutral"}>
                      {round.status === "open" ? "Voting open" : round.status === "closed" ? "Closed" : "Draft"}
                    </AdminStatus>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Info label="Self voting" value={round.self_voting_mode.replaceAll("_", " ")} />
                    <Info
                      label="Line-up"
                      value={validEntryCount ? `${round.entry_count} ready` : `${round.entry_count} · needs 2–50`}
                      tone={validEntryCount ? "normal" : "attention"}
                    />
                  </div>

                  {round.status !== "open" && !canOpen ? (
                    <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs leading-relaxed text-amber-100/85">
                      {!validEntryCount
                        ? "Voting cannot open until this round has between 2 and 50 entries."
                        : `${openRound?.name ?? "Another round"} is already open in this edition.`}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    {round.status === "open" ? (
                      <button type="button" disabled={busy} onClick={() => void requestStatusChange(round, "closed")} className="admin-action-primary w-full">
                        <Lock className="size-4" /> {busy ? "Working…" : "Close voting"}
                      </button>
                    ) : canOpen ? (
                      <button type="button" disabled={busy} onClick={() => void requestStatusChange(round, "open")} className="admin-action-primary w-full">
                        <Radio className="size-4" /> {busy ? "Working…" : "Open voting"}
                      </button>
                    ) : (
                      <Link to="/televoting/admin/rounds/$id/entries" params={{ id: round.id }} className="admin-action-primary w-full">
                        <Layers3 className="size-4" /> Fix line-up
                      </Link>
                    )}

                    <AdminMoreMenu label={`${round.name} actions`} title={round.name} description="Round setup and lower-frequency controls.">
                      <div className="divide-y divide-white/[0.07]">
                        <Link to="/televoting/admin/rounds/$id/entries" params={{ id: round.id }} className="admin-action-row">
                          <span className="admin-action-row-icon"><Layers3 className="size-4" /></span>
                          <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">Manage entries</span><span className="mt-1 block text-xs text-muted-foreground">Countries, custom entries, order and self-voting rules.</span></span>
                        </Link>
                        <AdminActionItem icon={Edit3} title="Rename round" description="Change the organizer-facing round name." onClick={() => { setEditing(round); setEditingName(round.name); }} />
                        {round.status === "closed" ? <AdminActionItem icon={Radio} title="Reopen voting" description="Accept ballots again. Existing ballots stay stored." disabled={!canOpen || busy} onClick={() => void requestStatusChange(round, "open")} /> : null}
                        {round.status !== "draft" ? <AdminActionItem icon={Layers3} title="Move to draft" description="Take the round out of active/closed workflow state." disabled={busy} onClick={() => void requestStatusChange(round, "draft")} /> : null}
                        <AdminActionItem icon={Trash2} title="Delete round" description={round.status === "draft" ? "Permanently remove this unused draft round." : "Only draft rounds can be deleted."} tone="danger" disabled={round.status !== "draft"} onClick={() => setDeleteTarget(round)} />
                      </div>
                    </AdminMoreMenu>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </section>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={Radio}
            title="No voting rounds yet"
            description={edition ? `Create a draft round for ${edition.name}, configure its entries, then open voting when the line-up is ready.` : "Create a draft round, configure its entries, then open voting when the line-up is ready."}
            action={<button type="button" disabled={!remoteEditionId} onClick={() => setCreateOpen(true)} className="admin-action-primary"><Plus className="size-4" /> Create round</button>}
          />
        </AdminCard>
      )}

      <AdminSheet open={createOpen} onClose={() => !createMutation.isPending && setCreateOpen(false)} title="Create voting round" description="The round starts as a draft. Configure its entries before opening voting.">
        <div className="space-y-4">
          <label className="block"><span className="text-xs font-semibold">Round name</span><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Grand Final" className="mt-2 min-h-11" /></label>
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={createMutation.isPending} onClick={() => setCreateOpen(false)} className="admin-action-secondary">Cancel</button>
            <button type="button" disabled={!remoteEditionId || !newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} className="admin-action-primary w-full">{createMutation.isPending ? "Creating…" : "Create draft round"}</button>
          </div>
        </div>
      </AdminSheet>

      <AdminSheet open={Boolean(editing)} onClose={() => !renameMutation.isPending && setEditing(null)} title="Rename voting round" description="This changes the round name without touching entries, ballots or results.">
        <div className="space-y-4">
          <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="min-h-11" />
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={renameMutation.isPending} onClick={() => setEditing(null)} className="admin-action-secondary">Cancel</button>
            <button type="button" disabled={!editingName.trim() || renameMutation.isPending} onClick={() => renameMutation.mutate()} className="admin-action-primary w-full">{renameMutation.isPending ? "Saving…" : "Save name"}</button>
          </div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingStatus)}
        onClose={() => {
          if (!statusBusy) setPendingStatus(null);
        }}
        onConfirm={confirmStatusChange}
        title={
          pendingStatus?.status === "open"
            ? "Open televoting?"
            : pendingStatus?.status === "closed"
              ? "Close televoting?"
              : "Move round to draft?"
        }
        description={
          pendingStatus ? (
            <TelevoteRoundImpactPreview pending={pendingStatus} />
          ) : (
            "Review the live voting impact before continuing."
          )
        }
        confirmLabel={
          pendingStatus?.status === "open"
            ? "Open voting"
            : pendingStatus?.status === "closed"
              ? "Close voting"
              : "Move to draft"
        }
        confirmationText={pendingStatus?.round.name}
        confirmationHint={
          pendingStatus
            ? `Type ${pendingStatus.round.name} to confirm this R2 voting-state change`
            : undefined
        }
        busy={Boolean(statusBusy)}
        danger={pendingStatus?.status !== "open"}
      />

      <AdminConfirmSheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeRound}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete round?"}
        description="This permanently removes the draft voting round. Only draft rounds can be deleted; backend protections remain in force."
        confirmLabel="Delete round"
        confirmationText={deleteTarget?.name}
        confirmationHint={deleteTarget ? `Type ${deleteTarget.name} to confirm` : undefined}
        danger
      />
    </div>
  );
}

function TelevoteRoundImpactPreview({ pending }: { pending: PendingRoundStatusChange }) {
  const preview = pending.preview;
  return (
    <div className="space-y-3">
      <p>
        This is a <strong className="text-foreground">Risk R2</strong> live-voting change for{" "}
        <strong className="text-foreground">{pending.round.name}</strong>.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <RoundImpactMetric label="Current → requested" value={`${preview.currentStatus} → ${preview.requestedStatus}`} />
        <RoundImpactMetric label="Entries" value={preview.entryCount} />
        <RoundImpactMetric label="Stored ballots" value={preview.ballotCount} />
        <RoundImpactMetric label="Suspicious ballots" value={preview.suspiciousBallotCount} />
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
        <strong className="text-foreground">Result state:</strong>{" "}
        {preview.resultsStatus} · calculation v{preview.calculationVersion}
        {preview.resultsOutdated ? " · already outdated" : ""}
      </div>

      {pending.status === "open" && preview.calculationVersion > 0 ? (
        <p className="rounded-lg border border-amber-200/15 bg-amber-200/[0.05] px-3 py-2 text-xs leading-5 text-amber-50">
          Reopening this round marks the existing calculated result outdated immediately. Locked or published results must be unlocked first.
        </p>
      ) : null}

      {preview.otherOpenRound ? (
        <p className="rounded-lg border border-rose-200/15 bg-rose-200/[0.05] px-3 py-2 text-xs leading-5 text-rose-50">
          Another round is open: {preview.otherOpenRound.roundName}. Solaris will not open two rounds at once.
        </p>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Expected system version v{preview.expectedGlobalVersion} and round version v{preview.expectedRoundVersion}.
        Any concurrent round-state or line-up change makes this preview stale. Retrying this confirmation replays the same operation receipt.
      </p>
    </div>
  );
}

function RoundImpactMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/10 p-2.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-xs text-foreground">{value}</strong>
    </div>
  );
}

function Info({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "attention" }) {
  return (
    <div className={tone === "attention" ? "rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-2.5" : "rounded-xl border border-white/[0.06] bg-white/[0.018] p-2.5"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={tone === "attention" ? "mt-1 truncate text-xs font-semibold text-amber-100" : "mt-1 truncate text-xs font-semibold"}>{value}</p>
    </div>
  );
}

function humanMode(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
