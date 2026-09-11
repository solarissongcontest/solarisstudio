import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, BookOpen, FilePenLine, History, Plus, RefreshCw, Save, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  createRuleInterpretation,
  getAdminRuleInterpretations,
  publishRuleInterpretation,
  supersedeRuleInterpretation,
  updateRuleInterpretation,
  type RuleInterpretation,
  type RuleInterpretationDraft,
} from "@/lib/rule-interpretations";
import { getRuleById } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/rule-interpretations")({
  head: () => ({
    meta: [
      { title: "Rule Interpretations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RuleInterpretationsAdmin,
});

type DraftState = {
  title: string;
  question: string;
  interpretation: string;
  rationale: string;
  rules: string;
  effectiveFrom: string;
};

const EMPTY: DraftState = {
  title: "",
  question: "",
  interpretation: "",
  rationale: "",
  rules: "",
  effectiveFrom: "",
};

function RuleInterpretationsAdmin() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-rule-interpretations"],
    queryFn: getAdminRuleInterpretations,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [replacementId, setReplacementId] = useState("");
  const items = query.data ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const ruleIds = parseRuleIds(draft.rules);
  const invalidRuleIds = ruleIds.filter((ruleId) => !getRuleById(ruleId));
  const currentPublished = items.filter((item) => item.status === "published");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-rule-interpretations"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createRuleInterpretation(toDraftInput(draft)),
    onSuccess: async (result) => {
      await refresh();
      setSelectedId(result.id);
      toast.success(`${result.code} created as draft`);
    },
    onError: errorToast,
  });
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a draft first");
      return updateRuleInterpretation(selected.id, toDraftInput(draft));
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Interpretation draft saved");
    },
    onError: errorToast,
  });
  const publishMutation = useMutation({
    mutationFn: (id: string) => publishRuleInterpretation(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Official interpretation published");
    },
    onError: errorToast,
  });
  const supersedeMutation = useMutation({
    mutationFn: () => {
      if (!selected || !replacementId) throw new Error("Choose a replacement interpretation");
      return supersedeRuleInterpretation(selected.id, replacementId);
    },
    onSuccess: async () => {
      setReplacementId("");
      await refresh();
      toast.success("Older interpretation marked superseded");
    },
    onError: errorToast,
  });

  const selectItem = (item: RuleInterpretation | null) => {
    setSelectedId(item?.id ?? null);
    setReplacementId("");
    if (!item) {
      setDraft(EMPTY);
      return;
    }
    setDraft({
      title: item.title,
      question: item.question,
      interpretation: item.interpretation,
      rationale: item.rationale,
      rules: item.rule_ids.join(", "),
      effectiveFrom: toLocalInput(item.effective_from),
    });
  };

  const valid =
    draft.title.trim().length >= 3 &&
    draft.question.trim().length >= 10 &&
    draft.interpretation.trim().length >= 20 &&
    draft.rationale.trim().length >= 20 &&
    ruleIds.length > 0 &&
    invalidRuleIds.length === 0;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px]">
        <AdminPageHeader
          eyebrow="Rules governance"
          title="Official interpretations"
          description="Clarify how existing SSC regulations apply without silently rewriting the regulation. Published interpretations are immutable and can only be replaced by a published superseding interpretation."
          actions={(
            <div className="flex flex-wrap gap-2">
              <Link to="/rules/interpretations" target="_blank" className="admin-action-secondary"><BookOpen className="size-4" />Public archive</Link>
              <button type="button" onClick={() => void query.refetch()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button>
              <button type="button" onClick={() => selectItem(null)} className="admin-action-primary"><Plus className="size-4" />New interpretation</button>
            </div>
          )}
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
          <AdminCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="admin-section-label">Interpretation register</p>
                <h2 className="mt-1 font-black">{items.length} record{items.length === 1 ? "" : "s"}</h2>
              </div>
              <AdminStatus tone={items.some((item) => item.status === "draft") ? "attention" : "ready"}>
                {items.filter((item) => item.status === "draft").length} draft
              </AdminStatus>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    selectedId === item.id
                      ? "border-violet-200/20 bg-violet-200/[0.06]"
                      : "border-white/[0.07] bg-black/10 hover:bg-white/[0.035]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] font-black text-violet-200">{item.code}</span>
                    <span className="text-[8px] font-black uppercase tracking-[.1em] text-muted-foreground">{item.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-black">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.question}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{item.rule_ids.map((ruleId) => <span key={ruleId} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-sky-200">{ruleId}</span>)}</div>
                </button>
              ))}
              {!items.length && !query.isLoading ? <p className="rounded-xl border border-dashed border-white/[0.08] p-5 text-xs text-muted-foreground">No interpretations yet. The first one gets the ceremonial burden of proving the system works.</p> : null}
            </div>
          </AdminCard>

          <div className="space-y-4">
            <AdminCard strong>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="admin-section-label">{selected ? selected.code : "New draft"}</p>
                  <h2 className="mt-1 text-xl font-black">{selected ? selected.title : "Create an official interpretation"}</h2>
                </div>
                {selected ? <AdminStatus tone={selected.status === "draft" ? "attention" : selected.status === "published" ? "ready" : "info"}>{selected.status}</AdminStatus> : null}
              </div>

              <div className="mt-5 grid gap-4">
                <Field label="Title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} disabled={selected?.status !== undefined && selected.status !== "draft"} />
                <Area label="Question being answered" value={draft.question} onChange={(question) => setDraft({ ...draft, question })} rows={3} disabled={selected?.status !== undefined && selected.status !== "draft"} />
                <Area label="Official interpretation" value={draft.interpretation} onChange={(interpretation) => setDraft({ ...draft, interpretation })} rows={5} disabled={selected?.status !== undefined && selected.status !== "draft"} />
                <Area label="Reasoning" value={draft.rationale} onChange={(rationale) => setDraft({ ...draft, rationale })} rows={5} disabled={selected?.status !== undefined && selected.status !== "draft"} />
                <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
                  <Field label="Affected rule IDs" value={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} placeholder="11.5, 16.6" disabled={selected?.status !== undefined && selected.status !== "draft"} />
                  <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Effective from</span><input type="datetime-local" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} disabled={selected?.status !== undefined && selected.status !== "draft"} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs disabled:opacity-60" /></label>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
                <p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Rule validation</p>
                {ruleIds.length ? <div className="mt-2 flex flex-wrap gap-2">{ruleIds.map((ruleId) => { const rule = getRuleById(ruleId); return <span key={ruleId} className={cn("rounded-lg border px-2 py-1 text-[10px]", rule ? "border-emerald-200/12 bg-emerald-200/[0.035] text-emerald-100" : "border-rose-200/12 bg-rose-200/[0.035] text-rose-100")}>{ruleId}{rule ? ` · ${rule.title}` : " · unknown"}</span>; })}</div> : <p className="mt-1 text-xs text-muted-foreground">Add at least one current v4 rule number.</p>}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {!selected ? (
                  <button type="button" disabled={!valid || createMutation.isPending} onClick={() => createMutation.mutate()} className="admin-action-primary"><FilePenLine className="size-4" />Create draft</button>
                ) : selected.status === "draft" ? (
                  <>
                    <button type="button" disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="admin-action-secondary"><Save className="size-4" />Save draft</button>
                    <button type="button" disabled={!valid || publishMutation.isPending} onClick={() => publishMutation.mutate(selected.id)} className="admin-action-primary"><Send className="size-4" />Publish interpretation</button>
                  </>
                ) : null}
              </div>
            </AdminCard>

            {selected?.status === "published" ? (
              <AdminCard>
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 size-5 text-emerald-200" />
                  <div>
                    <p className="font-black">Published interpretations are immutable</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">If the official position changes, publish the replacement first and mark this interpretation superseded. The old ruling remains visible as history.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)} className="min-h-10 rounded-lg border px-2 text-xs">
                    <option value="">Choose published replacement</option>
                    {currentPublished.filter((item) => item.id !== selected.id).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
                  </select>
                  <button type="button" disabled={!replacementId || supersedeMutation.isPending} onClick={() => supersedeMutation.mutate()} className="admin-action-secondary"><History className="size-4" />Supersede</button>
                </div>
              </AdminCard>
            ) : null}

            {selected?.status === "superseded" ? (
              <AdminCard>
                <div className="flex items-start gap-3"><History className="mt-0.5 size-5 text-muted-foreground"/><div><p className="font-black">Historical interpretation</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This ruling remains part of the public record but is no longer the current interpretation. Replacement ID: {selected.superseded_by ?? "unknown"}.</p></div></div>
              </AdminCard>
            ) : null}

            <AdminCard>
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-sky-200"/><div><p className="font-black">Interpretation is not a hidden rule change</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Use this system to resolve ambiguity inside existing wording. If the underlying obligation itself needs to change, create a new Rulebook release instead.</p></div></div>
            </AdminCard>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

function parseRuleIds(value: string) {
  return Array.from(new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)));
}

function toDraftInput(draft: DraftState): RuleInterpretationDraft {
  return {
    title: draft.title.trim(),
    question: draft.question.trim(),
    interpretation: draft.interpretation.trim(),
    rationale: draft.rationale.trim(),
    ruleIds: parseRuleIds(draft.rules),
    effectiveFrom: draft.effectiveFrom ? new Date(draft.effectiveFrom).toISOString() : null,
  };
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function Field({ label, value, onChange, placeholder, disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  return <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs disabled:opacity-60" /></label>;
}

function Area({ label, value, onChange, rows, disabled = false }: { label: string; value: string; onChange: (value: string) => void; rows: number; disabled?: boolean }) {
  return <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} disabled={disabled} className="mt-1 w-full rounded-lg border p-3 text-xs leading-5 disabled:opacity-60" /></label>;
}

function errorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Rule interpretation action failed");
}
