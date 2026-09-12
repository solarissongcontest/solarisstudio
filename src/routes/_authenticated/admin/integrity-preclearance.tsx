import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FileQuestion,
  Gavel,
  MessageCircleQuestion,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import {
  createInterpretationDraftFromPreclearance,
  getAdminPreclearanceRulings,
  recordAdminPreclearanceRuling,
  type IntegrityPreclearanceRuling,
  type PreclearanceOutcome,
} from "@/lib/integrity-preclearance";
import { getRuleById, SSC_RULES } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/_authenticated/admin/integrity-preclearance")({
  head: () => ({
    meta: [
      { title: "Private Rule Rulings — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityPreclearanceWorkspace,
});

type CaseListItem = {
  id: string;
  public_code: string;
  case_kind: string;
  category: string;
  identity_mode: string;
  summary: string;
  status: string;
  priority: string;
  updated_at: string;
};

type CaseDetail = {
  case: {
    id: string;
    public_code: string;
    case_kind: string;
    summary: string;
    details: string;
    status: string;
    priority: string;
  };
  rule_links: Array<{ rule_id: string; relevance: string; note: string | null }>;
  messages: Array<{ id: string; author_role: string; body: string; created_at: string }>;
};

const OUTCOMES: Array<{
  id: PreclearanceOutcome;
  label: string;
  description: string;
}> = [
  { id: "allowed", label: "Allowed", description: "The proposed action is permitted under the cited current rules." },
  { id: "not_allowed", label: "Not allowed", description: "The proposed action would conflict with the cited current rules." },
  { id: "needs_more_information", label: "Needs more information", description: "TSBC cannot give a final position until the participant supplies specific missing facts." },
  { id: "guidance_only", label: "Guidance only", description: "Explain the rule position without promising a factual eligibility outcome." },
];

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function IntegrityPreclearanceWorkspace() {
  const casesQuery = useQuery({
    queryKey: ["admin-integrity-cases", "preclearance"],
    queryFn: () => rpc<CaseListItem[]>("admin_integrity_cases"),
  });
  const questions = useMemo(
    () => (casesQuery.data ?? []).filter((item) => item.case_kind === "rule_question"),
    [casesQuery.data],
  );
  const [selectedCase, setSelectedCase] = useState("");
  const caseId = selectedCase || questions[0]?.id || "";

  const detailQuery = useQuery({
    queryKey: ["admin-integrity-case", "preclearance", caseId],
    queryFn: () => rpc<CaseDetail | null>("admin_integrity_case", { _case_id: caseId }),
    enabled: Boolean(caseId),
  });
  const rulingsQuery = useQuery({
    queryKey: ["admin-integrity-preclearance-rulings", caseId],
    queryFn: () => getAdminPreclearanceRulings(caseId),
    enabled: Boolean(caseId),
  });

  const refresh = async () => {
    await Promise.all([casesQuery.refetch(), detailQuery.refetch(), rulingsQuery.refetch()]);
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1480px]">
        <AdminPageHeader
          eyebrow="Rules · Trust & Integrity"
          title="Private rule rulings"
          description="Answer a participant's rule question before they act, tie the answer to exact current rules, and promote recurring guidance into an unpublished Official Interpretation draft without exposing the private case."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/rule-interpretations" className="admin-action-secondary"><BookOpen className="size-4" />Interpretations</Link>
              <button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Private questions" value={questions.length} tone="info" />
          <Metric label="Rulings on selected case" value={rulingsQuery.data?.length ?? 0} tone={(rulingsQuery.data?.length ?? 0) ? "ready" : "attention"} />
          <Metric label="Public leakage" value={0} tone="ready" suffix="case provenance stays internal" />
        </div>

        <AdminCard className="mt-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block">
              <span className="admin-section-label">Private rule question</span>
              <select
                value={caseId}
                onChange={(event) => setSelectedCase(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm"
              >
                {!questions.length ? <option value="">No private rule questions</option> : null}
                {questions.map((item) => (
                  <option key={item.id} value={item.id}>{item.public_code} · {item.summary}</option>
                ))}
              </select>
            </label>
            {caseId ? <Link to="/admin/integrity-case/$caseId" params={{ caseId }} className="admin-action-secondary">Open full case <ArrowRight className="size-3.5" /></Link> : null}
          </div>
        </AdminCard>

        {!caseId ? (
          <AdminCard className="mt-4"><EmptyState text="No protected rule questions are waiting in the Integrity Centre." /></AdminCard>
        ) : detailQuery.isLoading ? (
          <AdminCard className="mt-4"><LoadingState /></AdminCard>
        ) : detailQuery.data ? (
          <SelectedCaseWorkspace
            detail={detailQuery.data}
            rulings={rulingsQuery.data ?? []}
            rulingsLoading={rulingsQuery.isLoading}
            onChanged={refresh}
          />
        ) : (
          <AdminCard className="mt-4"><EmptyState text="The selected rule question is no longer available." /></AdminCard>
        )}
      </div>
    </AdminPage>
  );
}

function SelectedCaseWorkspace({
  detail,
  rulings,
  rulingsLoading,
  onChanged,
}: {
  detail: CaseDetail;
  rulings: IntegrityPreclearanceRuling[];
  rulingsLoading: boolean;
  onChanged: () => Promise<unknown>;
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,.92fr)]">
      <div className="space-y-4">
        <AdminCard strong>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-black text-sky-200">{detail.case.public_code}</p>
              <h2 className="mt-2 text-xl font-black">{detail.case.summary}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.case.details}</p>
            </div>
            <AdminStatus tone={detail.case.status === "waiting_for_reporter" ? "attention" : "info"}>{detail.case.status.replaceAll("_", " ")}</AdminStatus>
          </div>
          {detail.rule_links.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.rule_links.map((item) => (
                <Link key={item.rule_id} to="/rules/$ruleId" params={{ ruleId: item.rule_id }} target="_blank" className="rounded-lg border border-sky-200/12 bg-sky-200/[0.045] px-2.5 py-1.5 text-[10px] font-bold text-sky-100">
                  Rule {item.rule_id} · {getRuleById(item.rule_id)?.title ?? "Current rule"}
                </Link>
              ))}
            </div>
          ) : null}
        </AdminCard>

        <RulingComposer detail={detail} onChanged={onChanged} />
      </div>

      <AdminCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="admin-section-label">Ruling history</p>
            <h2 className="mt-1 text-lg font-black">Participant-visible answers</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Every ruling is a dated record. Later clarification should be another ruling, not an edit to history.</p>
          </div>
          <Gavel className="size-5 text-violet-200" />
        </div>
        <div className="mt-4 space-y-3">
          {rulings.map((ruling) => <RulingCard key={ruling.id} caseId={detail.case.id} ruling={ruling} onChanged={onChanged} />)}
          {!rulingsLoading && !rulings.length ? <EmptyState text="No pre-clearance ruling has been issued for this question yet." /> : null}
          {rulingsLoading ? <LoadingState /> : null}
        </div>
      </AdminCard>
    </div>
  );
}

function RulingComposer({ detail, onChanged }: { detail: CaseDetail; onChanged: () => Promise<unknown> }) {
  const [outcome, setOutcome] = useState<PreclearanceOutcome>("guidance_only");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [ruleInput, setRuleInput] = useState(detail.rule_links.map((item) => item.rule_id).join(", "));

  const ruleIds = useMemo(
    () => Array.from(new Set(ruleInput.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))),
    [ruleInput],
  );
  const invalidRules = ruleIds.filter((id) => !getRuleById(id));
  const mutation = useMutation({
    mutationFn: () => recordAdminPreclearanceRuling(detail.case.id, { outcome, summary, rationale, ruleIds }),
    onSuccess: async () => {
      setSummary("");
      setRationale("");
      await onChanged();
      toast.success("Private rule ruling recorded");
    },
    onError: errorToast,
  });

  const selectedOutcome = OUTCOMES.find((item) => item.id === outcome)!;
  const canSubmit = summary.trim().length >= 5 && rationale.trim().length >= 20 && ruleIds.length > 0 && invalidRules.length === 0;

  return (
    <AdminCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="admin-section-label">Issue ruling</p>
          <h2 className="mt-1 text-lg font-black">Answer before the participant acts</h2>
        </div>
        <MessageCircleQuestion className="size-5 text-sky-200" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {OUTCOMES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOutcome(item.id)}
            className={`rounded-xl border p-3 text-left transition ${outcome === item.id ? "border-sky-200/25 bg-sky-200/[0.07]" : "border-white/[0.07] bg-black/10 hover:border-white/[0.12]"}`}
          >
            <p className="text-xs font-black">{item.label}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <p className="text-[10px] font-bold text-sky-100">Current selection: {selectedOutcome.label}</p>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Short ruling summary shown to the participant" className="mt-3 min-h-10 w-full rounded-lg border px-3 text-xs" />
        <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={5} placeholder="Explain how the facts presented apply to the cited current rules. State assumptions and limits." className="mt-2 w-full rounded-lg border p-3 text-xs leading-5" />
        <label className="mt-2 block">
          <span className="text-[10px] font-bold text-muted-foreground">Rule IDs · comma or space separated</span>
          <input value={ruleInput} onChange={(event) => setRuleInput(event.target.value)} placeholder="6.4, 6.6" className="mt-1 min-h-10 w-full rounded-lg border px-3 font-mono text-xs" />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ruleIds.map((id) => <RuleBadge key={id} ruleId={id} invalid={!getRuleById(id)} />)}
        </div>
        {invalidRules.length ? <p className="mt-2 text-[10px] font-semibold text-rose-200">Unknown current rule IDs: {invalidRules.join(", ")}</p> : null}
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary">
            <Gavel className="size-4" />{mutation.isPending ? "Recording…" : "Record ruling"}
          </button>
        </div>
      </div>
    </AdminCard>
  );
}

function RulingCard({ caseId, ruling, onChanged }: { caseId: string; ruling: IntegrityPreclearanceRuling; onChanged: () => Promise<unknown> }) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [rationale, setRationale] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");

  const mutation = useMutation({
    mutationFn: () => createInterpretationDraftFromPreclearance(caseId, ruling.id, {
      title,
      interpretation,
      rationale,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
    }),
    onSuccess: async (result) => {
      await onChanged();
      toast.success(`${result.code} created as an unpublished interpretation draft`);
      setDraftOpen(false);
      setTitle("");
      setInterpretation("");
      setRationale("");
      setEffectiveFrom("");
    },
    onError: errorToast,
  });

  const canCreateDraft = title.trim().length >= 5 && interpretation.trim().length >= 20 && rationale.trim().length >= 20;

  return (
    <article className="rounded-xl border border-violet-200/10 bg-violet-200/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${outcomeClass(ruling.outcome)}`}>
            {outcomeIcon(ruling.outcome)}{OUTCOMES.find((item) => item.id === ruling.outcome)?.label ?? ruling.outcome}
          </span>
          <p className="mt-2 text-sm font-black">{ruling.summary}</p>
        </div>
        <span className="text-[9px] text-muted-foreground">{new Date(ruling.created_at).toLocaleString()}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{ruling.rationale}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{ruling.rule_ids.map((id) => <RuleBadge key={id} ruleId={id} />)}</div>

      <button type="button" onClick={() => setDraftOpen((value) => !value)} className="admin-action-secondary mt-4">
        <FileQuestion className="size-3.5" />{draftOpen ? "Close interpretation draft" : "Promote recurring guidance"}
      </button>

      {draftOpen ? (
        <div className="mt-3 rounded-xl border border-sky-200/10 bg-sky-200/[0.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-[.12em] text-sky-100">Create unpublished Official Interpretation draft</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">The public draft question is seeded from this organizer-authored ruling summary. Protected participant text and the case identifier are not copied into the public interpretation record.</p>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Interpretation title" className="mt-3 min-h-10 w-full rounded-lg border px-3 text-xs" />
          <textarea value={interpretation} onChange={(event) => setInterpretation(event.target.value)} rows={4} placeholder="General rule interpretation, written without private-case facts" className="mt-2 w-full rounded-lg border p-3 text-xs leading-5" />
          <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={3} placeholder="Why this interpretation follows from the existing rules" className="mt-2 w-full rounded-lg border p-3 text-xs leading-5" />
          <label className="mt-2 block text-[10px] font-bold text-muted-foreground">Proposed effective time · optional<input type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] text-muted-foreground">Creating this does not publish anything.</p>
            <button type="button" disabled={!canCreateDraft || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary">
              <BookOpen className="size-4" />{mutation.isPending ? "Creating…" : "Create interpretation draft"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function RuleBadge({ ruleId, invalid = false }: { ruleId: string; invalid?: boolean }) {
  const rule = getRuleById(ruleId);
  return invalid || !rule ? (
    <span className="rounded-md border border-rose-200/15 bg-rose-200/[0.04] px-2 py-1 font-mono text-[9px] text-rose-100">{ruleId}</span>
  ) : (
    <Link to="/rules/$ruleId" params={{ ruleId }} target="_blank" className="rounded-md border border-white/[0.08] px-2 py-1 font-mono text-[9px] text-sky-200 hover:bg-white/[0.04]">{ruleId}</Link>
  );
}

function outcomeIcon(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return <CheckCircle2 className="size-3" />;
  if (outcome === "not_allowed") return <XCircle className="size-3" />;
  if (outcome === "needs_more_information") return <CircleHelp className="size-3" />;
  return <ShieldCheck className="size-3" />;
}

function outcomeClass(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return "border-emerald-200/15 bg-emerald-200/[0.05] text-emerald-100";
  if (outcome === "not_allowed") return "border-rose-200/15 bg-rose-200/[0.05] text-rose-100";
  if (outcome === "needs_more_information") return "border-amber-200/15 bg-amber-200/[0.05] text-amber-100";
  return "border-sky-200/15 bg-sky-200/[0.05] text-sky-100";
}

function Metric({ label, value, tone, suffix }: { label: string; value: number; tone: "blocked" | "attention" | "ready" | "info"; suffix?: string }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}>{suffix ?? (value ? "Available" : "None")}</AdminStatus></div></AdminCard>;
}

function LoadingState() {
  return <div className="grid min-h-28 place-items-center"><RefreshCw className="size-5 animate-spin text-sky-200" /></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function errorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : "The ruling action could not be completed");
}
