import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gavel,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { RuleDecisionStrip } from "@/components/rules/RuleDecisionStrip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity-resolution/$caseId")({
  head: () => ({
    meta: [
      { title: "Integrity Resolution — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityResolution,
});

const SANCTION_LABELS = [
  "Official Warning",
  "Loss of 50% of Bonus Points",
  "No Bonus Points Awarded",
  "−5 Contest Points",
  "−25 Contest Points",
  "−50 Contest Points",
  "−100 Contest Points",
  "Disqualification",
  "Disqualification + One-Edition Ban",
  "Lifetime Ban",
] as const;

type CaseDetail = {
  case: { id: string; public_code: string; summary: string; status: string; priority: string };
  findings: Array<{ id: string; outcome: string; summary: string; rationale: string; rule_ids: string[]; created_at: string }>;
};

type Sanction = {
  id: string;
  finding_id: string;
  typical_level: number | null;
  final_level: number;
  sanction_label: string;
  target_type: string;
  target_reference: string | null;
  aggravating_factors: string[];
  mitigating_factors: string[];
  rationale: string;
  status: "active" | "modified_on_appeal" | "overturned";
  supersedes_sanction_id: string | null;
  visible_to_reporter: boolean;
  effective_at: string;
  created_at: string;
};

type Appeal = {
  id: string;
  sanction_id: string;
  grounds: string;
  submitted_via: string;
  submitted_at: string;
  deadline_at: string;
  was_timely: boolean;
  status: string;
  assigned_reviewer: string | null;
  decision_rationale: string | null;
  replacement_sanction_id: string | null;
  decided_at: string | null;
};

type Resolution = { sanctions: Sanction[]; appeals: Appeal[] };
type Organizer = { user_id: string; email: string | null };

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function IntegrityResolution() {
  const { caseId } = Route.useParams();
  const caseQuery = useQuery({
    queryKey: ["integrity-investigation", caseId],
    queryFn: () => rpc<CaseDetail | null>("admin_integrity_case", { _case_id: caseId }),
  });
  const resolutionQuery = useQuery({
    queryKey: ["integrity-resolution", caseId],
    queryFn: () => rpc<Resolution>("admin_integrity_case_resolution", { _case_id: caseId }),
  });
  const organizersQuery = useQuery({
    queryKey: ["integrity-organizers"],
    queryFn: () => rpc<Organizer[]>("admin_organizer_directory"),
  });

  const refresh = async () => {
    await Promise.all([caseQuery.refetch(), resolutionQuery.refetch()]);
  };

  if (caseQuery.isLoading || resolutionQuery.isLoading) {
    return <AdminPage><div className="grid min-h-[60vh] place-items-center"><RefreshCw className="size-6 animate-spin text-sky-200" /></div></AdminPage>;
  }
  if (!caseQuery.data) {
    return <AdminPage><AdminCard><p className="font-bold text-rose-200">Integrity case not found or unavailable.</p></AdminCard></AdminPage>;
  }

  const detail = caseQuery.data;
  const resolution = resolutionQuery.data ?? { sanctions: [], appeals: [] };
  const openAppeals = resolution.appeals.filter((appeal) => ["submitted", "under_review"].includes(appeal.status));

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1450px]">
        <div className="mb-4 flex flex-wrap gap-3">
          <Link to="/admin/integrity-case/$caseId" params={{ caseId }} className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Investigation</Link>
          <Link to="/admin/integrity-investigations" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground">Case queue</Link>
        </div>

        <AdminPageHeader
          eyebrow={`${detail.case.public_code} · Resolution`}
          title={detail.case.summary}
          description="Convert confirmed findings into a structured sanction, preserve the reason for the chosen level, and keep appeals as a separate fresh-review record."
          actions={<div className="flex gap-2"><AdminStatus tone={openAppeals.length ? "attention" : "info"}>{openAppeals.length} open appeal{openAppeals.length === 1 ? "" : "s"}</AdminStatus><button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button></div>}
        />

        <RuleDecisionStrip
          title="Sanctions & appeals"
          description="Start from the canonical ten-level ladder, record the normal starting level separately from the final human decision, and give eligible appeals a genuinely fresh reviewer."
          ruleIds={["17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "18.1", "18.2", "18.3", "18.4"]}
          integrity
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
          <div className="space-y-4">
            <ExistingSanctions sanctions={resolution.sanctions} />
            <NewSanctionPanel caseId={caseId} findings={detail.findings} onSaved={refresh} />
          </div>
          <div className="space-y-4">
            <AppealsPanel
              appeals={resolution.appeals}
              sanctions={resolution.sanctions}
              organizers={organizersQuery.data ?? []}
              onChanged={refresh}
            />
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

function ExistingSanctions({ sanctions }: { sanctions: Sanction[] }) {
  return (
    <AdminCard>
      <SectionTitle icon={Scale} eyebrow="Decision record" title="Sanctions" />
      <div className="mt-4 space-y-3">
        {sanctions.map((sanction) => (
          <div key={sanction.id} className={cn("rounded-2xl border p-4", sanction.status === "active" ? "border-rose-200/15 bg-rose-200/[0.04]" : "border-white/[0.07] bg-white/[0.02]")}> 
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg border border-rose-200/12 bg-rose-200/[0.055] text-xs font-black text-rose-100">{sanction.final_level}</span><div><p className="text-sm font-black">{sanction.sanction_label}</p><p className="text-[9px] uppercase tracking-[.1em] text-muted-foreground">{sanction.status.replaceAll("_", " ")}</p></div></div>
              <span className="text-[9px] text-muted-foreground">{new Date(sanction.effective_at).toLocaleString()}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{sanction.rationale}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <FactorList title="Aggravating" items={sanction.aggravating_factors} />
              <FactorList title="Mitigating" items={sanction.mitigating_factors} />
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">Target: {sanction.target_type}{sanction.target_reference ? ` · ${sanction.target_reference}` : ""}{sanction.typical_level ? ` · typical starting level ${sanction.typical_level}` : ""}</p>
          </div>
        ))}
        {!sanctions.length ? <Empty text="No sanction has been recorded. A confirmed violation finding should come first." /> : null}
      </div>
    </AdminCard>
  );
}

function NewSanctionPanel({ caseId, findings, onSaved }: { caseId: string; findings: CaseDetail["findings"]; onSaved: () => Promise<void> }) {
  const violationFindings = findings.filter((finding) => finding.outcome === "violation");
  const [findingId, setFindingId] = useState(violationFindings[0]?.id ?? "");
  const [typicalLevel, setTypicalLevel] = useState("");
  const [finalLevel, setFinalLevel] = useState("1");
  const [targetType, setTargetType] = useState("participant");
  const [targetReference, setTargetReference] = useState("");
  const [aggravating, setAggravating] = useState("");
  const [mitigating, setMitigating] = useState("");
  const [rationale, setRationale] = useState("");
  const [visible, setVisible] = useState(true);

  const mutation = useMutation({
    mutationFn: () => rpc("admin_record_integrity_sanction", {
      _case_id: caseId,
      _finding_id: findingId,
      _typical_level: typicalLevel ? Number(typicalLevel) : null,
      _final_level: Number(finalLevel),
      _target_type: targetType,
      _target_reference: targetReference || null,
      _aggravating_factors: csv(aggravating),
      _mitigating_factors: csv(mitigating),
      _rationale: rationale,
      _visible_to_reporter: visible,
    }),
    onSuccess: async () => {
      setRationale(""); setAggravating(""); setMitigating("");
      await onSaved();
      toast.success("Structured sanction recorded");
    },
    onError: errorToast,
  });

  const level = Number(finalLevel);
  return (
    <AdminCard>
      <SectionTitle icon={Gavel} eyebrow="New sanction" title="Apply the ten-level scale" />
      {!violationFindings.length ? <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-4 text-xs leading-5 text-amber-50/80"><AlertTriangle className="mr-2 inline size-4" />Record a confirmed violation finding before imposing a sanction.</div> : (
        <div className="mt-4 space-y-3">
          <label className="block"><FieldLabel>Confirmed violation finding</FieldLabel><select value={findingId} onChange={(event) => setFindingId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs">{violationFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.summary}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><FieldLabel>Typical starting level</FieldLabel><select value={typicalLevel} onChange={(event) => setTypicalLevel(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="">Not specified</option>{SANCTION_LABELS.map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</select></label>
            <label><FieldLabel>Final level</FieldLabel><select value={finalLevel} onChange={(event) => setFinalLevel(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs">{SANCTION_LABELS.map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</select></label>
          </div>
          <div className="rounded-xl border border-rose-200/12 bg-rose-200/[0.04] p-3"><p className="text-[9px] font-black uppercase tracking-[.12em] text-rose-200">Final decision</p><p className="mt-1 text-sm font-black">Level {level} · {SANCTION_LABELS[level - 1]}</p>{typicalLevel && Number(typicalLevel) !== level ? <p className="mt-1 text-[10px] text-muted-foreground">Moved from the typical Level {typicalLevel}. Explain why below.</p> : null}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label><FieldLabel>Target type</FieldLabel><select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="participant">Participant</option><option value="delegation">Delegation</option><option value="ballot">Ballot</option><option value="entry">Entry</option><option value="account">Account</option><option value="other">Other</option></select></label><label><FieldLabel>Target reference</FieldLabel><input value={targetReference} onChange={(event) => setTargetReference(event.target.value)} placeholder="Country, ballot, entry…" className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label></div>
          <label className="block"><FieldLabel>Aggravating factors</FieldLabel><input value={aggravating} onChange={(event) => setAggravating(event.target.value)} placeholder="Comma-separated, optional" className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label>
          <label className="block"><FieldLabel>Mitigating factors</FieldLabel><input value={mitigating} onChange={(event) => setMitigating(event.target.value)} placeholder="Early self-report, cooperation…" className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label>
          <label className="block"><FieldLabel>Decision rationale</FieldLabel><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={5} placeholder="Explain the rule breach, normal starting level, relevant factors and why the final level is proportionate." className="mt-1 w-full rounded-lg border p-3 text-xs" /></label>
          <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Share decision with reporter</label><button type="button" disabled={!findingId || rationale.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary"><Scale className="size-4" />Record Level {level}</button></div>
        </div>
      )}
    </AdminCard>
  );
}

function AppealsPanel({ appeals, sanctions, organizers, onChanged }: { appeals: Appeal[]; sanctions: Sanction[]; organizers: Organizer[]; onChanged: () => Promise<void> }) {
  const open = appeals.filter((appeal) => ["submitted", "under_review"].includes(appeal.status));
  const [selectedId, setSelectedId] = useState(open[0]?.id ?? "");
  const selected = appeals.find((appeal) => appeal.id === selectedId) ?? open[0] ?? null;
  const [reviewer, setReviewer] = useState("");
  const [outcome, setOutcome] = useState("upheld");
  const [replacementLevel, setReplacementLevel] = useState("");
  const [rationale, setRationale] = useState("");
  const [aggravating, setAggravating] = useState("");
  const [mitigating, setMitigating] = useState("");

  const assign = useMutation({
    mutationFn: () => rpc("admin_assign_integrity_appeal_reviewer", { _appeal_id: selected?.id, _user_id: reviewer }),
    onSuccess: async () => { await onChanged(); toast.success("Fresh appeal reviewer assigned"); },
    onError: errorToast,
  });
  const decide = useMutation({
    mutationFn: () => rpc("admin_decide_integrity_appeal", {
      _appeal_id: selected?.id,
      _outcome: outcome,
      _decision_rationale: rationale,
      _replacement_level: ["reduced", "increased"].includes(outcome) ? Number(replacementLevel) : null,
      _aggravating_factors: csv(aggravating),
      _mitigating_factors: csv(mitigating),
    }),
    onSuccess: async () => { setRationale(""); setReplacementLevel(""); await onChanged(); toast.success("Appeal decision recorded"); },
    onError: errorToast,
  });

  const sanction = selected ? sanctions.find((item) => item.id === selected.sanction_id) : null;
  const replacementRequired = ["reduced", "increased"].includes(outcome);

  return (
    <AdminCard>
      <SectionTitle icon={ShieldCheck} eyebrow="Fresh review" title="Appeals" />
      <div className="mt-4 space-y-2">{appeals.map((appeal) => <button key={appeal.id} type="button" onClick={() => setSelectedId(appeal.id)} className={cn("w-full rounded-xl border p-3 text-left", selected?.id === appeal.id ? "border-amber-200/20 bg-amber-200/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}><div className="flex justify-between gap-2"><span className="text-xs font-black capitalize">{appeal.status.replaceAll("_", " ")}</span><span className={cn("text-[9px] font-black uppercase", appeal.was_timely ? "text-emerald-200" : "text-rose-200")}>{appeal.was_timely ? "Within 48h" : "Late"}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{appeal.grounds}</p></button>)}</div>
      {!appeals.length ? <Empty text="No appeals have been submitted." /> : null}

      {selected ? <div className="mt-4 border-t border-white/[0.07] pt-4">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Appealed sanction</p><p className="mt-1 text-sm font-black">{sanction ? `Level ${sanction.final_level} · ${sanction.sanction_label}` : selected.sanction_id}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.grounds}</p><p className="mt-2 text-[9px] text-muted-foreground">Deadline {new Date(selected.deadline_at).toLocaleString()}</p></div>

        {selected.status === "submitted" ? <div className="mt-3"><FieldLabel>Fresh appeal reviewer</FieldLabel><div className="mt-1 flex gap-2"><select value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border px-2 text-xs"><option value="">Choose organizer</option>{organizers.map((item) => <option key={item.user_id} value={item.user_id}>{item.email ?? item.user_id}</option>)}</select><button type="button" disabled={!reviewer || assign.isPending} onClick={() => assign.mutate()} className="admin-action-secondary"><UserCheck className="size-4"/>Assign</button></div><p className="mt-1 text-[9px] text-muted-foreground">The database rejects the original finding author and original sanction decision-maker.</p></div> : null}

        {selected.status === "under_review" ? <div className="mt-3 space-y-3"><label className="block"><FieldLabel>Appeal outcome</FieldLabel><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="upheld">Uphold sanction</option><option value="reduced">Reduce sanction</option><option value="increased">Increase sanction</option><option value="overturned">Overturn sanction</option><option value="rejected_ineligible">Reject as ineligible</option></select></label>{replacementRequired ? <label className="block"><FieldLabel>Replacement level</FieldLabel><select value={replacementLevel} onChange={(event) => setReplacementLevel(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="">Choose level</option>{SANCTION_LABELS.map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</select></label> : null}<label className="block"><FieldLabel>Decision rationale</FieldLabel><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={5} placeholder="Reconsider the evidence and explain the fresh-review outcome." className="mt-1 w-full rounded-lg border p-3 text-xs" /></label>{replacementRequired ? <><label className="block"><FieldLabel>Aggravating factors</FieldLabel><input value={aggravating} onChange={(event) => setAggravating(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label><label className="block"><FieldLabel>Mitigating factors</FieldLabel><input value={mitigating} onChange={(event) => setMitigating(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs" /></label></> : null}<button type="button" disabled={rationale.trim().length < 20 || (replacementRequired && !replacementLevel) || decide.isPending} onClick={() => decide.mutate()} className="admin-action-primary w-full justify-center"><Gavel className="size-4"/>Record appeal outcome</button></div> : null}

        {!["submitted", "under_review"].includes(selected.status) && selected.decision_rationale ? <div className="mt-3 rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-3"><div className="flex items-center gap-2 text-emerald-100"><CheckCircle2 className="size-4"/><span className="text-xs font-black capitalize">{selected.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.decision_rationale}</p></div> : null}
      </div> : null}
    </AdminCard>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: typeof ShieldCheck; eyebrow: string; title: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Icon className="size-4 text-sky-200"/></span><div><p className="text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground">{eyebrow}</p><h2 className="mt-0.5 font-black">{title}</h2></div></div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">{children}</span>;
}

function FactorList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-lg border border-white/[0.06] p-2.5"><p className="text-[8px] font-black uppercase tracking-[.1em] text-muted-foreground">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-200/75">{items.length ? items.join(" · ") : "None recorded"}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.09] p-5 text-center text-xs text-muted-foreground">{text}</div>;
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function errorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Integrity resolution action failed");
}
