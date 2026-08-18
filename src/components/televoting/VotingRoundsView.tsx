import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Layers3, Lock, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  createMergedTelevotingRound,
  deleteMergedTelevotingRound,
  getMergedTelevotingRounds,
  renameMergedTelevotingRound,
  setMergedTelevotingRoundStatus,
  type MergedAdminRound,
} from "@/integrations/televoting/rounds.functions";

export function VotingRoundsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getRounds = useServerFn(getMergedTelevotingRounds);
  const createRound = useServerFn(createMergedTelevotingRound);
  const renameRound = useServerFn(renameMergedTelevotingRound);
  const setStatus = useServerFn(setMergedTelevotingRoundStatus);
  const deleteRound = useServerFn(deleteMergedTelevotingRound);

  const [editionId, setEditionId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MergedAdminRound | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MergedAdminRound | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: editions = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-rounds"],
    queryFn: () => getRounds(),
    enabled: Boolean(admin),
  });

  const effectiveEditionId =
    editionId || editions.find((edition) => edition.is_active && !edition.is_archived)?.id || editions[0]?.id || "";

  const edition = useMemo(
    () => editions.find((item) => item.id === effectiveEditionId) ?? null,
    [editions, effectiveEditionId],
  );

  const rounds = edition?.rounds ?? [];
  const openRound = rounds.find((round) => round.status === "open") ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] });

  const createMutation = useMutation({
    mutationFn: () => createRound({ data: { editionId: effectiveEditionId, name: newName.trim() } }),
    onSuccess: async () => {
      setNewName("");
      setCreateOpen(false);
      toast.success("Voting round created as draft");
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

  async function changeStatus(round: MergedAdminRound, status: "draft" | "open" | "closed") {
    setStatusBusy(round.id);
    try {
      await setStatus({ data: { id: round.id, status } });
      toast.success(status === "open" ? `${round.name} is accepting votes` : status === "closed" ? `${round.name} is closed` : `${round.name} moved to draft`);
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
          <button type="button" onClick={() => setCreateOpen(true)} className="admin-action-primary">
            <Plus className="size-4" /> New round
          </button>
        }
      />

      <AdminCard className="mb-4 !p-3">
        <label className="block">
          <span className="admin-section-label">Edition</span>
          <select
            value={effectiveEditionId}
            onChange={(event) => setEditionId(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold text-foreground outline-none focus:border-sky-200/30"
          >
            {editions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.is_active ? " · Active" : ""}{item.is_archived ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading voting rounds…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
          {error instanceof Error ? error.message : "Voting rounds could not be loaded."}
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
                      <button type="button" disabled={busy} onClick={() => void changeStatus(round, "closed")} className="admin-action-primary w-full">
                        <Lock className="size-4" /> {busy ? "Working…" : "Close voting"}
                      </button>
                    ) : canOpen ? (
                      <button type="button" disabled={busy} onClick={() => void changeStatus(round, "open")} className="admin-action-primary w-full">
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
                        {round.status === "closed" ? <AdminActionItem icon={Radio} title="Reopen voting" description="Accept ballots again. Existing ballots stay stored." disabled={!canOpen || busy} onClick={() => void changeStatus(round, "open")} /> : null}
                        {round.status !== "draft" ? <AdminActionItem icon={Layers3} title="Move to draft" description="Take the round out of active/closed workflow state." disabled={busy} onClick={() => void changeStatus(round, "draft")} /> : null}
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
            description="Create a draft round, add its entries, then open voting when the line-up is ready."
            action={<button type="button" onClick={() => setCreateOpen(true)} className="admin-action-primary"><Plus className="size-4" /> Create round</button>}
          />
        </AdminCard>
      )}

      <AdminSheet open={createOpen} onClose={() => !createMutation.isPending && setCreateOpen(false)} title="Create voting round" description="The round starts as a draft. Configure its entries before opening voting.">
        <div className="space-y-4">
          <label className="block"><span className="text-xs font-semibold">Round name</span><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Grand Final" className="mt-2 min-h-11" /></label>
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={createMutation.isPending} onClick={() => setCreateOpen(false)} className="admin-action-secondary">Cancel</button>
            <button type="button" disabled={!effectiveEditionId || !newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} className="admin-action-primary w-full">{createMutation.isPending ? "Creating…" : "Create draft round"}</button>
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
