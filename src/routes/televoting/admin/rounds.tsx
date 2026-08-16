import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleDot, Layers3, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/rounds")({
  head: () => ({ meta: [{ title: "Televoting Rounds — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingRoundsPage,
});

function TelevotingRoundsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getRounds = useServerFn(getMergedTelevotingRounds);
  const createRound = useServerFn(createMergedTelevotingRound);
  const renameRound = useServerFn(renameMergedTelevotingRound);
  const setStatus = useServerFn(setMergedTelevotingRoundStatus);
  const deleteRound = useServerFn(deleteMergedTelevotingRound);

  const [editionId, setEditionId] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MergedAdminRound | null>(null);
  const [editingName, setEditingName] = useState("");

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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] });

  const createMutation = useMutation({
    mutationFn: () => createRound({ data: { editionId: effectiveEditionId, name: newName } }),
    onSuccess: async () => {
      setNewName("");
      toast.success("Round created");
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Round could not be created"),
  });

  const renameMutation = useMutation({
    mutationFn: () => renameRound({ data: { id: editing!.id, name: editingName } }),
    onSuccess: async () => {
      setEditing(null);
      setEditingName("");
      toast.success("Round renamed");
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Round could not be renamed"),
  });

  async function changeStatus(round: MergedAdminRound, status: "draft" | "open" | "closed") {
    try {
      await setStatus({ data: { id: round.id, status } });
      toast.success(`Round ${status}`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round status could not be changed");
    }
  }

  async function remove(round: MergedAdminRound) {
    if (!confirm(`Delete ${round.name}? Only draft rounds can be deleted.`)) return;
    try {
      await deleteRound({ data: { id: round.id } });
      toast.success("Round deleted");
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round could not be deleted");
    }
  }

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link></div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Televoting organiser</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Rounds</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Create and control voting rounds using the same live Televoting database. Opening a round still requires 2–50 configured entries and only one round may be open at once.</p>
      </header>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading rounds…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Rounds could not be loaded."}</section>
      ) : (
        <div className="space-y-5">
          <section className="glass flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <label htmlFor="televoting-round-edition" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Edition</label>
              <select id="televoting-round-edition" value={effectiveEditionId} onChange={(event) => setEditionId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
                {editions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? " · Active" : ""}{item.is_archived ? " · Archived" : ""}</option>)}
              </select>
            </div>
            <div className="flex w-full gap-2 sm:max-w-md">
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Grand Final" />
              <Button disabled={!effectiveEditionId || !newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}><Plus className="size-4" /> Create</Button>
            </div>
          </section>

          <section className="space-y-3">
            {(edition?.rounds ?? []).map((round) => (
              <article key={round.id} className="glass-strong p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.15em]", round.status === "open" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : round.status === "closed" ? "border-white/10 bg-white/[0.04] text-white/45" : "border-amber-300/20 bg-amber-300/8 text-amber-100")}><CircleDot className="size-3" /> {round.status}</span>
                      <span className="text-[10px] text-muted-foreground">{round.entry_count} entries · {round.participant_mode} · {round.self_voting_mode.replaceAll("_", " ")}</span>
                    </div>
                    {editing?.id === round.id ? (
                      <div className="mt-3 flex max-w-lg gap-2"><Input value={editingName} onChange={(event) => setEditingName(event.target.value)} /><Button size="sm" disabled={!editingName.trim() || renameMutation.isPending} onClick={() => renameMutation.mutate()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
                    ) : (
                      <h2 className="mt-3 text-xl font-medium">{round.name}</h2>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">{round.opened_at ? `Opened ${new Date(round.opened_at).toLocaleString()}` : "Never opened"}{round.closed_at ? ` · Closed ${new Date(round.closed_at).toLocaleString()}` : ""}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={round.status === "open" ? "default" : "outline"} onClick={() => void changeStatus(round, "open")}><PlayCircle className="size-3.5" /> Open</Button>
                    <Button size="sm" variant={round.status === "closed" ? "default" : "outline"} onClick={() => void changeStatus(round, "closed")}>Close</Button>
                    <Button size="sm" variant={round.status === "draft" ? "default" : "outline"} onClick={() => void changeStatus(round, "draft")}>Draft</Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(round); setEditingName(round.name); }}><Pencil className="size-3.5" /> Rename</Button>
                    <Button size="sm" variant="ghost" disabled={round.status !== "draft"} onClick={() => void remove(round)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-sm font-medium">Participant entries</p><p className="mt-1 text-xs text-muted-foreground">Country, custom and mixed entry editing is the next Televoting admin module being transplanted.</p></div>
                    <Button size="sm" variant="outline" disabled><Layers3 className="size-3.5" /> Manage {round.entry_count} entries</Button>
                  </div>
                </div>
              </article>
            ))}
            {!edition?.rounds.length ? <div className="glass-strong p-8 text-center text-sm text-muted-foreground">No rounds in this edition yet.</div> : null}
          </section>
        </div>
      )}
    </div>
  );
}
