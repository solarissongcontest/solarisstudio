import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, CheckCircle2, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  activateMergedTelevotingEdition,
  archiveMergedTelevotingEdition,
  createMergedTelevotingEdition,
  listMergedTelevotingEditions,
  renameMergedTelevotingEdition,
  type MergedTelevotingEdition,
} from "@/integrations/televoting/editions.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/editions")({
  head: () => ({ meta: [{ title: "Televoting Editions — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingEditionsPage,
});

function TelevotingEditionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const listEditions = useServerFn(listMergedTelevotingEditions);
  const createEdition = useServerFn(createMergedTelevotingEdition);
  const renameEdition = useServerFn(renameMergedTelevotingEdition);
  const activateEdition = useServerFn(activateMergedTelevotingEdition);
  const archiveEdition = useServerFn(archiveMergedTelevotingEdition);

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MergedTelevotingEdition | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: editions = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-editions"],
    queryFn: () => listEditions(),
    enabled: Boolean(admin),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-editions"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => createEdition({ data: { name: newName } }),
    onSuccess: async () => { setNewName(""); toast.success("Edition created"); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Edition could not be created"),
  });

  const renameMutation = useMutation({
    mutationFn: () => renameEdition({ data: { id: editing!.id, name: editingName } }),
    onSuccess: async () => { setEditing(null); setEditingName(""); toast.success("Edition renamed"); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Edition could not be renamed"),
  });

  async function activate(edition: MergedTelevotingEdition) {
    try {
      await activateEdition({ data: { id: edition.id } });
      toast.success(`${edition.name} is now active`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Edition could not be activated");
    }
  }

  async function setArchived(edition: MergedTelevotingEdition, archived: boolean) {
    try {
      await archiveEdition({ data: { id: edition.id, archived } });
      toast.success(archived ? "Edition archived" : "Edition restored");
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Edition status could not be changed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link></div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Contest structure</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Editions</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Manage the Televoting system's editions without deleting historical rounds or votes. One edition may be active at a time; older editions can be archived and restored.</p>
      </header>

      <section className="glass mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Solaris Song Contest 23" className="flex-1" />
        <Button disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}><Plus className="size-4" /> Create edition</Button>
      </section>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading editions…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Editions could not be loaded."}</section>
      ) : (
        <section className="space-y-3">
          {editions.map((edition) => (
            <article key={edition.id} className={cn("glass-strong p-5", edition.is_archived && "opacity-65")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {edition.is_active ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-emerald-100"><CheckCircle2 className="size-3" /> Active</span> : null}
                    {edition.is_archived ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Archived</span> : null}
                  </div>
                  {editing?.id === edition.id ? <div className="mt-3 flex max-w-lg gap-2"><Input value={editingName} onChange={(event) => setEditingName(event.target.value)} /><Button size="sm" disabled={!editingName.trim() || renameMutation.isPending} onClick={() => renameMutation.mutate()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div> : <h2 className="mt-3 text-xl font-medium">{edition.name}</h2>}
                  <p className="mt-2 text-xs text-muted-foreground">{edition.round_count} rounds · {edition.vote_count} submitted ballots · created {new Date(edition.created_at).toLocaleDateString()}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!edition.is_active && !edition.is_archived ? <Button size="sm" onClick={() => void activate(edition)}><CheckCircle2 className="size-3.5" /> Make active</Button> : null}
                  <Button size="sm" variant="outline" onClick={() => { setEditing(edition); setEditingName(edition.name); }}><Pencil className="size-3.5" /> Rename</Button>
                  {edition.is_archived ? <Button size="sm" variant="outline" onClick={() => void setArchived(edition, false)}><RotateCcw className="size-3.5" /> Restore</Button> : <Button size="sm" variant="outline" disabled={edition.is_active} onClick={() => void setArchived(edition, true)}><Archive className="size-3.5" /> Archive</Button>}
                </div>
              </div>
            </article>
          ))}
          {!editions.length ? <div className="glass-strong p-8 text-center text-sm text-muted-foreground">No Televoting editions exist yet.</div> : null}
        </section>
      )}
    </div>
  );
}
