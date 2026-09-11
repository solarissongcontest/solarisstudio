import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileClock,
  GitCompareArrows,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRuleSnapshot,
  fetchAdminRulebookReleases,
  type RuleSnapshot,
  type RulebookChange,
  type RulebookRelease,
} from "@/lib/rules-governance";
import { SSC_RULEBOOK, SSC_RULES, getRuleById, type RuleTone } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/rules-manager")({
  head: () => ({
    meta: [
      { title: "Rules Manager — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RulesManager,
});

type EditorState = {
  ruleId: string;
  changeKind: "modified" | "interpretation";
  title: string;
  summary: string;
  tone: RuleTone;
  body: string;
  important: string;
  rationale: string;
};

const EMPTY_EDITOR: EditorState = {
  ruleId: "",
  changeKind: "modified",
  title: "",
  summary: "",
  tone: "information",
  body: "",
  important: "",
  rationale: "",
};

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function RulesManager() {
  const queryClient = useQueryClient();
  const releasesQuery = useQuery({
    queryKey: ["admin-rulebook-releases"],
    queryFn: fetchAdminRulebookReleases,
  });
  const releases = releasesQuery.data ?? [];
  const current = releases.find((release) => release.is_current) ?? null;
  const drafts = releases.filter((release) => release.status === "draft");
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const selected = releases.find((release) => release.id === selectedReleaseId) ?? drafts[0] ?? current;
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [publishArmed, setPublishArmed] = useState(false);

  useEffect(() => {
    if (!selectedReleaseId && drafts[0]?.id) setSelectedReleaseId(drafts[0].id);
  }, [drafts, selectedReleaseId]);

  useEffect(() => {
    setPublishArmed(false);
    setEditor(EMPTY_EDITOR);
  }, [selected?.id]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-rulebook-releases"] }),
      queryClient.invalidateQueries({ queryKey: ["public-rulebook-release"] }),
      queryClient.invalidateQueries({ queryKey: ["public-rulebook-release-history"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: { version: string; title: string; summary: string; baseVersion: string | null }) =>
      rpc("admin_create_rulebook_release", {
        _version: input.version,
        _title: input.title,
        _summary: input.summary,
        _base_version: input.baseVersion,
      }),
    onSuccess: async (data) => {
      await refresh();
      if (data?.id) setSelectedReleaseId(data.id);
      setNotice({ tone: "success", message: `Draft v${data?.version ?? ""} created.` });
    },
    onError: (error) => setNotice({ tone: "error", message: error.message }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ releaseId, state }: { releaseId: string; state: EditorState }) => {
      const before = buildRuleSnapshot(state.ruleId);
      if (!before) throw new Error("Select an existing rule before saving a change.");
      const after: RuleSnapshot = {
        ...before,
        id: state.ruleId,
        title: state.title.trim(),
        summary: state.summary.trim(),
        tone: state.tone,
        body: splitOfficialWording(state.body),
        important: state.important.trim() || undefined,
      };
      return rpc("admin_upsert_rulebook_change", {
        _release_id: releaseId,
        _rule_id: state.ruleId,
        _change_kind: state.changeKind,
        _before_snapshot: before,
        _after_snapshot: after,
        _rationale: state.rationale.trim(),
      });
    },
    onSuccess: async () => {
      await refresh();
      setNotice({ tone: "success", message: `Draft change for Rule ${editor.ruleId} saved.` });
    },
    onError: (error) => setNotice({ tone: "error", message: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ releaseId, ruleId }: { releaseId: string; ruleId: string }) =>
      rpc("admin_delete_rulebook_change", { _release_id: releaseId, _rule_id: ruleId }),
    onSuccess: async () => {
      await refresh();
      setEditor(EMPTY_EDITOR);
      setNotice({ tone: "success", message: "Draft change removed." });
    },
    onError: (error) => setNotice({ tone: "error", message: error.message }),
  });

  const publishMutation = useMutation({
    mutationFn: (releaseId: string) =>
      rpc("admin_publish_rulebook_release", { _release_id: releaseId, _effective_from: new Date().toISOString() }),
    onSuccess: async (data) => {
      await refresh();
      setPublishArmed(false);
      setNotice({ tone: "success", message: `Rulebook v${data?.version ?? ""} published and made current.` });
    },
    onError: (error) => {
      setPublishArmed(false);
      setNotice({ tone: "error", message: error.message });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (releaseId: string) => rpc("admin_archive_rulebook_release", { _release_id: releaseId }),
    onSuccess: async () => {
      await refresh();
      setNotice({ tone: "success", message: "Release archived." });
    },
    onError: (error) => setNotice({ tone: "error", message: error.message }),
  });

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px]">
        <AdminPageHeader
          eyebrow="Governance"
          title="Rules Manager"
          description="Prepare rule changes as versioned drafts, compare the official wording, record why a rule changed and publish one current rulebook without silently rewriting history."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/rules/changes" target="_blank" className="admin-action-secondary"><FileClock className="size-4" /> Public history</Link>
              <Link to="/rules" target="_blank" className="admin-action-secondary"><BookOpen className="size-4" /> Current rules</Link>
            </div>
          }
        />

        {notice ? <Notice notice={notice} onClose={() => setNotice(null)} /> : null}

        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <AdminCard>
              <div className="flex items-center justify-between gap-3">
                <div><p className="admin-section-label">Rulebook versions</p><p className="mt-1 text-xs text-muted-foreground">Current, drafts and archived releases.</p></div>
                <AdminStatus tone="info">v{current?.version ?? SSC_RULEBOOK.version}</AdminStatus>
              </div>
              <div className="mt-4 space-y-2">
                {releases.map((release) => (
                  <button key={release.id ?? release.version} type="button" onClick={() => release.id && setSelectedReleaseId(release.id)} className={cn("w-full rounded-xl border p-3 text-left transition", selected?.id === release.id ? "border-sky-200/20 bg-sky-200/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]")}> 
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-black text-sky-100">v{release.version}</span><ReleaseStatus release={release}/></div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{release.title}</p>
                    <p className="mt-2 text-[9px] text-muted-foreground/70">{release.changes?.length ?? release.change_count ?? 0} recorded changes</p>
                  </button>
                ))}
                {!releasesQuery.isLoading && !releases.length ? <p className="rounded-xl border border-white/[0.07] p-3 text-xs text-muted-foreground">No rulebook governance records yet.</p> : null}
              </div>
            </AdminCard>

            <CreateDraftCard currentVersion={current?.version ?? SSC_RULEBOOK.version} busy={createMutation.isPending} onCreate={(input) => createMutation.mutate(input)} />
          </aside>

          <main className="min-w-0 space-y-4">
            {selected ? (
              <ReleaseWorkspace
                release={selected}
                editor={editor}
                setEditor={setEditor}
                savePending={saveMutation.isPending}
                deletePending={deleteMutation.isPending}
                publishPending={publishMutation.isPending}
                archivePending={archiveMutation.isPending}
                publishArmed={publishArmed}
                setPublishArmed={setPublishArmed}
                onSave={(state) => selected.id && saveMutation.mutate({ releaseId: selected.id, state })}
                onDelete={(ruleId) => selected.id && deleteMutation.mutate({ releaseId: selected.id, ruleId })}
                onPublish={() => selected.id && publishMutation.mutate(selected.id)}
                onArchive={() => selected.id && archiveMutation.mutate(selected.id)}
              />
            ) : (
              <AdminCard><div className="py-20 text-center"><FileClock className="mx-auto size-8 text-sky-200"/><h2 className="mt-4 text-lg font-black">Create the first governed release</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">The bundled v{SSC_RULEBOOK.version} rulebook remains active until a draft is deliberately published.</p></div></AdminCard>
            )}
          </main>
        </div>
      </div>
    </AdminPage>
  );
}

function CreateDraftCard({ currentVersion, busy, onCreate }: { currentVersion: string; busy: boolean; onCreate: (input: { version: string; title: string; summary: string; baseVersion: string | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");

  const submit = () => {
    if (!version.trim() || !title.trim() || !summary.trim()) return;
    onCreate({ version: version.trim(), title: title.trim(), summary: summary.trim(), baseVersion: currentVersion });
    setOpen(false);
    setVersion(""); setTitle(""); setSummary("");
  };

  return <AdminCard>{!open ? <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.055] text-xs font-black text-sky-100 hover:bg-sky-200/[0.09]"><Plus className="size-4"/>New draft version</button> : <div><div className="flex items-center justify-between"><div><p className="admin-section-label">New draft</p><p className="mt-1 text-[10px] text-muted-foreground">Base: v{currentVersion}</p></div><button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.04]"><X className="size-4"/></button></div><div className="mt-4 space-y-3"><Field label="Version"><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="4.1" className="admin-input w-full"/></Field><Field label="Release title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Integrity clarification update" className="admin-input w-full"/></Field><Field label="Public release summary"><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="Explain the purpose of this rulebook version…" className="admin-input w-full resize-y"/></Field><button type="button" disabled={busy || !version.trim() || !title.trim() || summary.trim().length < 10} onClick={submit} className="admin-action-primary w-full justify-center disabled:opacity-50"><Plus className="size-4"/>{busy ? "Creating…" : "Create draft"}</button></div></div>}</AdminCard>;
}

function ReleaseWorkspace(props: {
  release: RulebookRelease;
  editor: EditorState;
  setEditor: (state: EditorState) => void;
  savePending: boolean;
  deletePending: boolean;
  publishPending: boolean;
  archivePending: boolean;
  publishArmed: boolean;
  setPublishArmed: (value: boolean) => void;
  onSave: (state: EditorState) => void;
  onDelete: (ruleId: string) => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const { release, editor, setEditor } = props;
  const isDraft = release.status === "draft";
  const currentChange = release.changes?.find((change) => change.rule_id === editor.ruleId) ?? null;

  return <>
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-sky-100">v{release.version}</span><ReleaseStatus release={release}/>{release.base_version ? <span className="text-[9px] text-muted-foreground">based on v{release.base_version}</span> : null}</div><h2 className="mt-3 text-xl font-black">{release.title}</h2><p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">{release.summary}</p></div>
        {isDraft ? <div className="flex gap-2"><button type="button" disabled={props.archivePending} onClick={props.onArchive} className="admin-action-secondary text-rose-100"><Trash2 className="size-4"/>Archive draft</button><button type="button" disabled={props.publishPending || !(release.changes?.length)} onClick={() => props.setPublishArmed(true)} className="admin-action-primary disabled:opacity-50"><Send className="size-4"/>Publish version</button></div> : null}
      </div>
      {props.publishArmed && isDraft ? <div className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-100"/><div><p className="font-black text-amber-50">Publish v{release.version} as the current official rulebook?</p><p className="mt-1 text-xs leading-5 text-amber-50/70">This will make its recorded modifications live across the Rules Hub and contextual rule drawers. The previous version remains in public history.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => props.setPublishArmed(false)} className="admin-action-secondary">Cancel</button><button type="button" disabled={props.publishPending} onClick={props.onPublish} className="admin-action-primary"><CheckCircle2 className="size-4"/>{props.publishPending ? "Publishing…" : "Confirm publication"}</button></div></div></div></div> : null}
    </AdminCard>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AdminCard>
        <div className="flex items-center justify-between gap-3"><div><p className="admin-section-label">Rule editor</p><p className="mt-1 text-xs text-muted-foreground">Edit an existing current rule, then save a before/after snapshot into this draft.</p></div><GitCompareArrows className="size-5 text-violet-200"/></div>
        {!isDraft ? <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs text-muted-foreground">Published and archived versions are read-only. Create a new draft rather than rewriting history.</div> : <RuleEditor editor={editor} setEditor={setEditor} currentChange={currentChange} savePending={props.savePending} onSave={props.onSave}/>} 
      </AdminCard>

      <AdminCard>
        <div className="flex items-center justify-between"><div><p className="admin-section-label">Changes in this release</p><p className="mt-1 text-[10px] text-muted-foreground">{release.changes?.length ?? 0} rule-level records</p></div><FileClock className="size-4 text-sky-200"/></div>
        <div className="mt-4 space-y-2">{release.changes?.map((change) => <ChangeListItem key={change.id ?? change.rule_id} change={change} selected={editor.ruleId === change.rule_id} disabled={!isDraft} deleting={props.deletePending} onOpen={() => setEditor(editorFromChange(change))} onDelete={() => props.onDelete(change.rule_id)}/>)}</div>
        {!release.changes?.length ? <div className="mt-4 rounded-xl border border-dashed border-white/[0.09] p-5 text-center text-[11px] text-muted-foreground">No rule changes recorded yet.</div> : null}
      </AdminCard>
    </div>
  </>;
}

function RuleEditor({ editor, setEditor, currentChange, savePending, onSave }: { editor: EditorState; setEditor: (state: EditorState) => void; currentChange: RulebookChange | null; savePending: boolean; onSave: (state: EditorState) => void }) {
  const selectedRule = editor.ruleId ? getRuleById(editor.ruleId) : null;
  const selectRule = (ruleId: string) => {
    const existing = currentChange?.rule_id === ruleId ? currentChange : null;
    if (existing) { setEditor(editorFromChange(existing)); return; }
    const rule = getRuleById(ruleId);
    if (!rule) { setEditor(EMPTY_EDITOR); return; }
    setEditor({ ruleId: rule.id, changeKind: "modified", title: rule.title, summary: rule.summary, tone: rule.tone, body: rule.body.join("\n\n"), important: rule.important ?? "", rationale: "" });
  };

  const preview = editor.ruleId ? ({ ...(selectedRule ?? {}), title: editor.title, summary: editor.summary, tone: editor.tone, body: splitOfficialWording(editor.body), important: editor.important || undefined } as RuleSnapshot) : null;
  const valid = Boolean(editor.ruleId && editor.title.trim().length >= 3 && editor.summary.trim().length >= 5 && splitOfficialWording(editor.body).length && editor.rationale.trim().length >= 5);

  return <div className="mt-5 space-y-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
      <Field label="Rule"><select value={editor.ruleId} onChange={(e) => selectRule(e.target.value)} className="admin-input w-full"><option value="">Select a rule…</option>{SSC_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.id} · {rule.title}</option>)}</select></Field>
      <Field label="Change type"><select value={editor.changeKind} onChange={(e) => setEditor({ ...editor, changeKind: e.target.value as EditorState["changeKind"] })} className="admin-input w-full"><option value="modified">Modified</option><option value="interpretation">Interpretation</option></select></Field>
    </div>
    {editor.ruleId ? <>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]"><Field label="Rule title"><input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} className="admin-input w-full"/></Field><Field label="Status tone"><select value={editor.tone} onChange={(e) => setEditor({ ...editor, tone: e.target.value as RuleTone })} className="admin-input w-full"><option value="information">Information</option><option value="allowed">Allowed</option><option value="prohibited">Not allowed</option><option value="conditional">Depends</option><option value="integrity">Integrity</option><option value="administrative">Official process</option></select></Field></div>
      <Field label="Short answer / summary"><textarea value={editor.summary} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} rows={3} className="admin-input w-full resize-y"/></Field>
      <Field label="Official wording"><textarea value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} rows={9} className="admin-input w-full resize-y"/><p className="mt-1 text-[9px] text-muted-foreground">Separate official paragraphs with a blank line.</p></Field>
      <Field label="Important callout"><textarea value={editor.important} onChange={(e) => setEditor({ ...editor, important: e.target.value })} rows={3} placeholder="Optional" className="admin-input w-full resize-y"/></Field>
      <Field label="Why this changed"><textarea value={editor.rationale} onChange={(e) => setEditor({ ...editor, rationale: e.target.value })} rows={4} placeholder="Public explanation for the change log…" className="admin-input w-full resize-y"/></Field>
      {preview ? <DraftPreview snapshot={preview} current={selectedRule ? buildRuleSnapshot(selectedRule.id) : null}/> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[9px] leading-4 text-muted-foreground"><ShieldCheck className="mr-1 inline size-3 text-emerald-200"/>Publishing changes only existing rule IDs in this editor. Major-version add/remove tooling stays locked until chapter-index migration is implemented safely.</p><button type="button" disabled={!valid || savePending} onClick={() => onSave(editor)} className="admin-action-primary disabled:opacity-50"><Save className="size-4"/>{savePending ? "Saving…" : currentChange ? "Update draft change" : "Save draft change"}</button></div>
    </> : <div className="rounded-2xl border border-dashed border-white/[0.09] p-10 text-center"><BookOpen className="mx-auto size-7 text-sky-200"/><p className="mt-3 text-sm font-black">Choose a rule to edit</p><p className="mt-1 text-[10px] text-muted-foreground">The current official text becomes the immutable “before” snapshot.</p></div>}
  </div>;
}

function DraftPreview({ snapshot, current }: { snapshot: RuleSnapshot; current: RuleSnapshot | null }) {
  const changedTitle = Boolean(current?.title && current.title !== snapshot.title);
  const changedSummary = Boolean(current?.summary && current.summary !== snapshot.summary);
  const changedBody = JSON.stringify(current?.body ?? []) !== JSON.stringify(snapshot.body ?? []);
  return <div className="rounded-2xl border border-violet-200/12 bg-violet-200/[0.035] p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-[.14em] text-violet-100">Draft preview</p><span className="text-[9px] text-muted-foreground">{[changedTitle,changedSummary,changedBody].filter(Boolean).length} core fields changed</span></div><h3 className="mt-3 text-base font-black">{snapshot.title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-sky-50/85">{snapshot.summary}</p><div className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">{snapshot.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{snapshot.important ? <div className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.04] p-3 text-[10px] leading-5 text-amber-50/75">{snapshot.important}</div> : null}</div>;
}

function ChangeListItem({ change, selected, disabled, deleting, onOpen, onDelete }: { change: RulebookChange; selected: boolean; disabled: boolean; deleting: boolean; onOpen: () => void; onDelete: () => void }) {
  return <div className={cn("rounded-xl border p-3", selected ? "border-violet-200/20 bg-violet-200/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}><button type="button" onClick={onOpen} className="w-full text-left"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] font-black text-sky-200">Rule {change.rule_id}</span><span className="text-[8px] font-black uppercase tracking-[.08em] text-muted-foreground">{change.change_kind}</span></div><p className="mt-1 line-clamp-2 text-[10px] font-bold">{change.after_snapshot?.title ?? change.before_snapshot?.title ?? "Rule change"}</p><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-muted-foreground">{change.rationale}</p></button>{!disabled ? <button type="button" disabled={deleting} onClick={onDelete} className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-rose-200/70 hover:text-rose-100"><Trash2 className="size-3"/>Remove from draft</button> : null}</div>;
}

function Notice({ notice, onClose }: { notice: { tone: "success" | "error"; message: string }; onClose: () => void }) {
  return <div className={cn("mb-4 flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs", notice.tone === "success" ? "border-emerald-200/15 bg-emerald-200/[0.05] text-emerald-100" : "border-rose-200/15 bg-rose-200/[0.05] text-rose-100")}><div className="flex items-center gap-2">{notice.tone === "success" ? <CheckCircle2 className="size-4"/> : <AlertTriangle className="size-4"/>}<span>{notice.message}</span></div><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-white/[0.05]"><X className="size-4"/></button></div>;
}

function ReleaseStatus({ release }: { release: RulebookRelease }) {
  const label = release.is_current ? "Current" : release.status === "draft" ? "Draft" : release.status === "archived" ? "Archived" : "Published";
  const tone = release.is_current ? "ready" : release.status === "draft" ? "info" : "neutral";
  return <AdminStatus tone={tone as any}>{label}</AdminStatus>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</span>{children}</label>;
}

function splitOfficialWording(value: string) {
  return value.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function editorFromChange(change: RulebookChange): EditorState {
  const source = change.after_snapshot ?? change.before_snapshot ?? {};
  return {
    ruleId: change.rule_id,
    changeKind: change.change_kind === "interpretation" ? "interpretation" : "modified",
    title: source.title ?? "",
    summary: source.summary ?? "",
    tone: source.tone ?? "information",
    body: source.body?.join("\n\n") ?? "",
    important: source.important ?? "",
    rationale: change.rationale,
  };
}
