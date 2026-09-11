import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bug,
  Download,
  EyeOff,
  FileUp,
  KeyRound,
  LockKeyhole,
  MessageCircleQuestion,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Siren,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IntegrityCentre } from "@/components/integrity/IntegrityCentre";
import {
  INTEGRITY_CATEGORIES,
  INTEGRITY_IDENTITY_MODES,
  formatIntegrityStatus,
  getIntegrityCategory,
  type IntegrityCaseKind,
  type IntegrityCategory,
  type IntegrityIdentityMode,
  type ProtectedCaseListItem,
} from "@/lib/integrity";
import { getProtectedEvidenceDownloadUrl } from "@/lib/integrity-evidence";
import {
  createProtectedIntegrityCase,
  getCurrentIntegrityUser,
  getProtectedIntegrityCase,
  getPublicIntegrityDecisions,
  getPublicIntegrityStats,
  listProtectedIntegrityCases,
  replyProtectedIntegrityCase,
  uploadProtectedEvidence,
} from "@/lib/integrity-portal";
import { cn } from "@/lib/utils";

type PortalView =
  | "home"
  | "anonymous"
  | "protected-report"
  | "question"
  | "self-report"
  | "vulnerability"
  | "safety"
  | "my-cases"
  | "how"
  | "transparency";

type Draft = {
  identityMode: Exclude<IntegrityIdentityMode, "anonymous">;
  category: IntegrityCategory;
  summary: string;
  details: string;
  observedFacts: string;
  uncertainties: string;
  relatedCountries: string;
  editionReference: string;
};

const EMPTY_DRAFT: Draft = {
  identityMode: "sealed",
  category: "other",
  summary: "",
  details: "",
  observedFacts: "",
  uncertainties: "",
  relatedCountries: "",
  editionReference: "",
};

export function TrustIntegrityHub() {
  const [view, setView] = useState<PortalView>("home");

  if (view === "anonymous") {
    return (
      <div className="pb-16">
        <BackButton onClick={() => setView("home")} />
        <IntegrityCentre />
      </div>
    );
  }

  if (["protected-report", "question", "self-report", "vulnerability", "safety"].includes(view)) {
    const mapping: Record<string, { kind: IntegrityCaseKind; title: string; subtitle: string; category?: IntegrityCategory }> = {
      "protected-report": { kind: "report", title: "Protected report", subtitle: "Use a sealed or confidential identity instead of a recovery key." },
      question: { kind: "rule_question", title: "Ask TSBC privately", subtitle: "Get a private ruling before doing something that may be unclear." },
      "self-report": { kind: "self_report", title: "Report your own mistake", subtitle: "Disclose an issue early. Cooperation can matter when TSBC assesses what response is proportionate." },
      vulnerability: { kind: "vulnerability", title: "Report a technical vulnerability", subtitle: "Tell TSBC about a bug or exploit without publishing the method to everyone first. Humanity survives another afternoon.", category: "technical_exploit" },
      safety: { kind: "safety", title: "Urgent safety concern", subtitle: "Threats, doxxing or a serious privacy/safety issue are prioritised for review.", category: "safety" },
    };
    const config = mapping[view];
    return (
      <ProtectedCaseForm
        {...config}
        back={() => setView("home")}
        onCreated={() => setView("my-cases")}
      />
    );
  }

  if (view === "my-cases") return <MyProtectedCases back={() => setView("home")} />;
  if (view === "how") return <HowIntegrityWorks back={() => setView("home")} />;
  if (view === "transparency") return <IntegrityTransparency back={() => setView("home")} />;

  return <PortalHome setView={setView} />;
}

function PortalHome({ setView }: { setView: (view: PortalView) => void }) {
  const cards = [
    { id: "anonymous" as const, icon: EyeOff, title: "Fully anonymous", eyebrow: "NO ACCOUNT LINK", text: "Use a recovery key. The case row contains no Solaris reporter account ID.", className: "border-emerald-300/16 bg-emerald-300/[0.045]", iconClass: "text-emerald-200" },
    { id: "protected-report" as const, icon: LockKeyhole, title: "Sealed or confidential", eyebrow: "PROTECTED IDENTITY", text: "Recover through your account while controlling whether reviewers can ever identify you.", className: "border-sky-300/16 bg-sky-300/[0.045]", iconClass: "text-sky-200" },
    { id: "question" as const, icon: MessageCircleQuestion, title: "Ask TSBC privately", eyebrow: "BEFORE YOU ACT", text: "Check an artist, promotion, permission or unclear rule before creating a problem that requires three meetings later.", className: "border-violet-300/16 bg-violet-300/[0.045]", iconClass: "text-violet-200" },
    { id: "self-report" as const, icon: UserRoundCheck, title: "Self-report", eyebrow: "DISCLOSE A MISTAKE", text: "Tell TSBC about your own error or concern and keep the correction in the formal case record.", className: "border-amber-300/16 bg-amber-300/[0.045]", iconClass: "text-amber-200" },
    { id: "vulnerability" as const, icon: Bug, title: "Technical vulnerability", eyebrow: "SECURITY", text: "Report an exploit or platform weakness through a protected channel.", className: "border-cyan-300/16 bg-cyan-300/[0.045]", iconClass: "text-cyan-200" },
    { id: "safety" as const, icon: Siren, title: "Safety concern", eyebrow: "PRIORITISED", text: "Use this for threats, doxxing, privacy exposure or another serious participant-safety concern.", className: "border-rose-300/16 bg-rose-300/[0.045]", iconClass: "text-rose-200" },
  ];

  return (
    <div className="pb-20">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-emerald-300/15 bg-[linear-gradient(145deg,rgba(16,62,66,.58),rgba(5,19,42,.98)_56%,rgba(41,31,78,.94))] p-6 shadow-[0_30px_80px_rgba(0,4,28,.28)] sm:p-9 lg:p-11">
        <div className="absolute -right-20 -top-24 size-80 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-100"><ShieldCheck className="size-3.5" /> Trust & Integrity</span>
            <span className="text-xs text-muted-foreground">Report · ask · review · resolve</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-black tracking-[-.06em] text-white sm:text-6xl">A concern should become a case, not a Discord archaeology project.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">Choose how your identity is protected, keep a two-way record with TSBC, add evidence, follow the review status and see what an investigation actually found.</p>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ id, icon: Icon, title, eyebrow, text, className, iconClass }) => (
          <button key={id} type="button" onClick={() => setView(id)} className={cn("group min-h-52 rounded-[1.6rem] border p-5 text-left transition hover:-translate-y-0.5 hover:border-white/20", className)}>
            <Icon className={cn("size-7", iconClass)} />
            <p className="mt-6 text-[9px] font-black uppercase tracking-[.17em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-black tracking-[-.03em]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-slate-200">Open <ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></span>
          </button>
        ))}
      </section>

      <section className="mt-8 grid gap-3 lg:grid-cols-3">
        <SecondaryCard icon={Users} title="My protected cases" text="Open sealed and confidential cases tied to your Solaris account." onClick={() => setView("my-cases")} />
        <SecondaryCard icon={Scale} title="How investigations work" text="See the difference between a report, evidence, a finding, action and appeal." onClick={() => setView("how")} />
        <SecondaryCard icon={BadgeCheck} title="Transparency & decisions" text="See anonymised published precedents and aggregate Integrity Centre statistics." onClick={() => setView("transparency")} />
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link to="/rules/$ruleId" params={{ ruleId: "16.3" }} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs font-bold text-sky-200">Anonymous & confidential reporting rule</Link>
        <Link to="/rules/$ruleId" params={{ ruleId: "16.6" }} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs font-bold text-sky-200">Investigation fairness rule</Link>
        <Link to="/rules/$ruleId" params={{ ruleId: "18.3" }} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs font-bold text-sky-200">Conflict-of-interest rule</Link>
      </div>
    </div>
  );
}

function SecondaryCard({ icon: Icon, title, text, onClick }: { icon: typeof Users; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[1.35rem] border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-sky-200/18 hover:bg-white/[0.04]">
      <Icon className="size-5 text-sky-200" />
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </button>
  );
}

function ProtectedCaseForm({ kind, title, subtitle, category, back, onCreated }: { kind: IntegrityCaseKind; title: string; subtitle: string; category?: IntegrityCategory; back: () => void; onCreated: () => void }) {
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, category: category ?? "other" });
  const userQuery = useQuery({ queryKey: ["integrity-user"], queryFn: getCurrentIntegrityUser });
  const mutation = useMutation({
    mutationFn: () => createProtectedIntegrityCase({
      identityMode: draft.identityMode,
      caseKind: kind,
      category: draft.category,
      summary: draft.summary,
      details: draft.details,
      observedFacts: draft.observedFacts,
      uncertainties: draft.uncertainties,
      relatedCountries: draft.relatedCountries.split(",").map((item) => item.trim()).filter(Boolean),
      editionReference: draft.editionReference,
    }),
    onSuccess: (result) => {
      toast.success(`Case ${result.case_code} created`);
      onCreated();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create case"),
  });

  if (userQuery.isLoading) return <LoadingFrame label="Checking sign-in…" back={back} />;
  if (!userQuery.data) {
    return (
      <div className="pb-16">
        <BackButton onClick={back} />
        <div className="mx-auto mt-8 max-w-2xl rounded-[1.7rem] border border-sky-300/14 bg-sky-300/[0.04] p-6 text-center sm:p-8">
          <KeyRound className="mx-auto size-8 text-sky-200" />
          <h1 className="mt-4 text-2xl font-black">Sign in for protected reporting</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sealed and confidential cases use your account for recovery. For no account link at all, use Fully Anonymous instead.</p>
          <Link to="/auth" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-sky-200 px-4 text-sm font-black text-slate-950">Sign in</Link>
        </div>
      </div>
    );
  }

  const lockedCategory = Boolean(category);
  const valid = draft.summary.trim().length >= 5 && draft.details.trim().length >= 20;

  return (
    <div className="pb-20">
      <BackButton onClick={back} />
      <div className="mx-auto mt-5 max-w-5xl">
        <p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-200">Protected Integrity Case</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-.05em]">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          {(["sealed", "confidential"] as const).map((mode) => {
            const meta = INTEGRITY_IDENTITY_MODES[mode];
            return (
              <button key={mode} type="button" onClick={() => setDraft({ ...draft, identityMode: mode })} className={cn("rounded-[1.4rem] border p-4 text-left", draft.identityMode === mode ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/[0.08] bg-white/[0.02]")}>
                <div className="flex items-center gap-2"><LockKeyhole className="size-4 text-emerald-200" /><span className="font-bold">{meta.label}</span></div>
                <p className="mt-2 text-xs font-semibold text-slate-200/80">{meta.short}</p>
                <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{meta.detail}</p>
              </button>
            );
          })}
        </section>

        <section className="mt-5 rounded-[1.6rem] border border-white/[0.08] bg-[#081a35]/78 p-5 sm:p-6">
          {!lockedCategory ? (
            <label className="block"><FieldLabel>Category</FieldLabel><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as IntegrityCategory })} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm">{INTEGRITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          ) : null}
          <div className="mt-4"><TextField label="Short summary" value={draft.summary} onChange={(summary) => setDraft({ ...draft, summary })} placeholder={kind === "rule_question" ? "Example: Can another country use our previous artist?" : "Briefly describe the concern"} /></div>
          <div className="mt-4"><TextArea label={kind === "rule_question" ? "What do you want TSBC to clarify?" : "What happened?"} value={draft.details} onChange={(details) => setDraft({ ...draft, details })} rows={5} /></div>
          {kind !== "rule_question" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><TextArea label="What did you personally observe?" optional value={draft.observedFacts} onChange={(observedFacts) => setDraft({ ...draft, observedFacts })} rows={4} /><TextArea label="What are you unsure about?" optional value={draft.uncertainties} onChange={(uncertainties) => setDraft({ ...draft, uncertainties })} rows={4} /></div> : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2"><TextField label="Countries involved" optional value={draft.relatedCountries} onChange={(relatedCountries) => setDraft({ ...draft, relatedCountries })} placeholder="Oland, Vendia" /><TextField label="Edition" optional value={draft.editionReference} onChange={(editionReference) => setDraft({ ...draft, editionReference })} placeholder="SSC 20" /></div>
          <div className="mt-6 flex justify-end"><button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()} className="min-h-11 rounded-xl bg-emerald-200 px-4 text-sm font-black text-emerald-950 disabled:opacity-40">{mutation.isPending ? "Creating case…" : "Create protected case"}</button></div>
        </section>
      </div>
    </div>
  );
}

function MyProtectedCases({ back }: { back: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const userQuery = useQuery({ queryKey: ["integrity-user"], queryFn: getCurrentIntegrityUser });
  const casesQuery = useQuery({ queryKey: ["integrity-protected-cases"], queryFn: listProtectedIntegrityCases, enabled: Boolean(userQuery.data) });

  if (userQuery.isLoading) return <LoadingFrame label="Loading cases…" back={back} />;
  if (!userQuery.data) return <ProtectedSignIn back={back} />;

  return (
    <div className="pb-20">
      <BackButton onClick={back} />
      <div className="mt-5 grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-3">
          <p className="px-2 py-2 text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">My protected cases</p>
          {casesQuery.isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p> : (casesQuery.data ?? []).length ? (casesQuery.data ?? []).map((item) => <CaseListButton key={item.id} item={item} active={selected === item.id} onClick={() => setSelected(item.id)} />) : <p className="p-4 text-sm text-muted-foreground">No sealed or confidential cases yet.</p>}
        </section>
        {selected ? <ProtectedCaseThread caseId={selected} /> : <div className="grid min-h-[420px] place-items-center rounded-[1.5rem] border border-dashed border-white/[0.08] bg-white/[0.015] p-8 text-center"><div><ShieldCheck className="mx-auto size-8 text-sky-200" /><p className="mt-3 font-bold">Select a case</p><p className="mt-1 text-sm text-muted-foreground">Messages, requests, evidence and findings appear here.</p></div></div>}
      </div>
    </div>
  );
}

function CaseListButton({ item, active, onClick }: { item: ProtectedCaseListItem; active: boolean; onClick: () => void }) {
  const status = formatIntegrityStatus(item.status);
  return <button type="button" onClick={onClick} className={cn("mb-1 w-full rounded-xl border p-3 text-left", active ? "border-sky-300/20 bg-sky-300/[0.07]" : "border-transparent hover:bg-white/[0.03]")}><div className="flex justify-between gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{item.public_code}</span><span className="text-[9px] uppercase text-muted-foreground">{item.identity_mode}</span></div><p className="mt-1 line-clamp-2 text-sm font-bold">{item.summary}</p><p className="mt-2 text-[10px] text-muted-foreground">{status.label}</p></button>;
}

function ProtectedCaseThread({ caseId }: { caseId: string }) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const query = useQuery({ queryKey: ["integrity-protected-case", caseId], queryFn: () => getProtectedIntegrityCase(caseId) });
  const replyMutation = useMutation({ mutationFn: () => replyProtectedIntegrityCase(caseId, message), onSuccess: () => { query.refetch(); setMessage(""); toast.success("Response sent"); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reply") });
  const evidenceMutation = useMutation({ mutationFn: () => { if (!file) throw new Error("Choose a file"); return uploadProtectedEvidence(caseId, file); }, onSuccess: () => { setFile(null); query.refetch(); toast.success("Evidence added"); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not upload evidence") });
  const downloadMutation = useMutation({
    mutationFn: (evidenceId: string) => getProtectedEvidenceDownloadUrl(caseId, evidenceId),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not prepare secure evidence download"),
  });

  if (query.isLoading) return <LoadingFrame label="Opening case…" />;
  if (!query.data) return <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-5">Could not open this case.</div>;
  const snapshot = query.data;
  const status = formatIntegrityStatus(snapshot.case.status);

  return <section className="space-y-4"><div className="rounded-[1.5rem] border border-sky-300/14 bg-sky-300/[0.035] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-black text-sky-200">{snapshot.case.public_code}</p><h2 className="mt-2 text-2xl font-black">{snapshot.case.summary}</h2><p className="mt-1 text-xs text-muted-foreground">{INTEGRITY_IDENTITY_MODES[snapshot.case.identity_mode].label} · {getIntegrityCategory(snapshot.case.category).label}</p></div><span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold">{status.label}</span></div></div>
    {snapshot.requests.filter((item) => item.status === "open").map((request) => <div key={request.id} className="rounded-xl border border-amber-300/16 bg-amber-300/[0.05] p-4"><p className="text-[9px] font-black uppercase tracking-[.14em] text-amber-200">TSBC REQUEST</p><p className="mt-2 text-sm font-semibold">{request.prompt}</p></div>)}
    <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5"><h3 className="font-black">Secure thread</h3><div className="mt-4 space-y-3">{snapshot.messages.map((item) => <div key={item.id} className={cn("max-w-[85%] rounded-xl border p-3", item.author_role === "reporter" ? "ml-auto border-emerald-300/12 bg-emerald-300/[0.04]" : "border-sky-300/12 bg-sky-300/[0.04]")}><p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">{item.author_role === "reporter" ? "You" : "TSBC"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.body}</p></div>)}</div><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Reply securely…" className="mt-4 w-full rounded-xl border p-3 text-sm"/><div className="mt-2 flex justify-end"><button type="button" disabled={message.trim().length < 2 || replyMutation.isPending} onClick={() => replyMutation.mutate()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-200 px-3 text-xs font-black text-slate-950 disabled:opacity-40"><Send className="size-3.5" />Send</button></div></div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.02] p-4"><div className="flex items-center gap-2"><FileUp className="size-4 text-emerald-200"/><h3 className="font-bold">Evidence vault</h3></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Images are re-encoded before upload to remove ordinary image metadata. PDFs and text files may still contain identifying information inside the document itself.</p><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs"/><button type="button" disabled={!file || evidenceMutation.isPending} onClick={() => evidenceMutation.mutate()} className="mt-3 rounded-xl border border-emerald-300/16 bg-emerald-300/[0.05] px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40">{evidenceMutation.isPending ? "Uploading…" : "Add evidence"}</button><div className="mt-4 space-y-2">{snapshot.evidence.map((item) => <div key={item.id} className="rounded-lg border border-white/[0.06] p-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.evidence_type} · {item.source_role}</p>{item.original_name ? <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.original_name}</p> : null}</div>{item.evidence_type === "file" && item.original_name ? <button type="button" disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate(item.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-300/15 bg-sky-300/[0.05] px-2.5 py-1.5 text-[10px] font-bold text-sky-100 disabled:opacity-40"><Download className="size-3" />{downloadMutation.isPending && downloadMutation.variables === item.id ? "Preparing…" : "Secure download"}</button> : null}</div>{item.evidence_type === "file" && item.original_name ? <p className="mt-2 text-[9px] leading-4 text-muted-foreground">Audited access · signed link expires after 60 seconds.</p> : null}</div>)}</div></div>
      <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.02] p-4"><h3 className="font-bold">Findings</h3>{snapshot.findings.length ? <div className="mt-3 space-y-2">{snapshot.findings.map((finding) => <div key={finding.id} className="rounded-xl border border-violet-300/12 bg-violet-300/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-violet-200">{finding.outcome.replaceAll("_", " ")}</p><p className="mt-1 text-sm font-bold">{finding.summary}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{finding.rationale}</p><div className="mt-2 flex flex-wrap gap-1">{finding.rule_ids.map((rule) => <Link key={rule} to="/rules/$ruleId" params={{ ruleId: rule }} className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-sky-200">Rule {rule}</Link>)}</div></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No formal finding has been published to you yet.</p>}</div></div>
  </section>;
}

function HowIntegrityWorks({ back }: { back: () => void }) {
  const steps = [
    ["01", "Report or signal", "A report, self-disclosure, technical signal or other credible information enters the system."],
    ["02", "Triage", "TSBC classifies urgency and assigns an eligible reviewer. A conflict can trigger recusal."],
    ["03", "Evidence review", "Messages, files, statements, voting data and context are assessed. A statistical flag is not a verdict."],
    ["04", "Participant response", "Where fairness requires it, the affected participant receives enough sanitised information to respond without unnecessary source exposure."],
    ["05", "Finding", "TSBC records what was established, not established or left uncertain and ties the reasoning to exact rules."],
    ["06", "Resolution", "No violation, insufficient evidence, administrative correction, confirmed violation or another appropriate outcome is recorded."],
    ["07", "Appeal / precedent", "Eligible sanctions can be appealed. Useful anonymised decisions may be published as precedent without exposing private case material."],
  ];
  return <div className="pb-20"><BackButton onClick={back}/><div className="mx-auto mt-5 max-w-4xl"><p className="text-[10px] font-black uppercase tracking-[.17em] text-violet-200">PROCESS</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">How an integrity case works</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The design deliberately separates allegation, evidence, finding and sanction. Turning all four into one red “suspicious” badge would be easier, which is precisely why it would be awful.</p><div className="relative mt-7 space-y-3">{steps.map(([number,title,text]) => <div key={number} className="grid grid-cols-[3rem_1fr] gap-3"><div className="grid size-12 place-items-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] font-mono text-xs font-black text-violet-200">{number}</div><div className="rounded-[1.3rem] border border-white/[0.08] bg-white/[0.02] p-4"><h2 className="font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div></div>)}</div></div></div>;
}

function IntegrityTransparency({ back }: { back: () => void }) {
  const stats = useQuery({ queryKey: ["public-integrity-stats"], queryFn: getPublicIntegrityStats });
  const decisions = useQuery({ queryKey: ["public-integrity-decisions"], queryFn: getPublicIntegrityDecisions });
  return <div className="pb-20"><BackButton onClick={back}/><div className="mt-5"><p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-200">TRANSPARENCY</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Integrity decisions & statistics</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Only aggregate figures and deliberately published anonymised precedents appear here. Private reports do not become public entertainment.</p>{stats.data ? <div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric value={stats.data.total_cases} label="Cases received"/><Metric value={stats.data.open_cases} label="Open"/><Metric value={stats.data.resolved_cases} label="Resolved"/><Metric value={stats.data.violations_confirmed} label="Violations confirmed"/></div> : null}<div className="mt-8"><h2 className="text-xl font-black">Published decisions</h2>{decisions.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : decisions.data?.length ? <div className="mt-3 grid gap-3 lg:grid-cols-2">{decisions.data.map((item) => <article key={item.id} className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.02] p-4"><p className="text-[9px] font-black uppercase tracking-[.14em] text-sky-200">{item.category.replaceAll("_"," ")}</p><h3 className="mt-2 font-black">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p><p className="mt-3 text-xs leading-5 text-slate-200/80">{item.rationale}</p><div className="mt-3 flex flex-wrap gap-1">{item.rule_ids.map((rule) => <Link key={rule} to="/rules/$ruleId" params={{ ruleId: rule }} className="rounded-md bg-sky-300/[0.06] px-2 py-1 text-[10px] text-sky-200">Rule {rule}</Link>)}</div></article>)}</div> : <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] p-6 text-sm text-muted-foreground">No anonymised decisions have been published yet.</div>}</div></div></div>;
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-[1.3rem] border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-3xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div>; }
function BackButton({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5"/> Trust & Integrity</button>; }
function ProtectedSignIn({ back }: { back: () => void }) { return <div className="pb-16"><BackButton onClick={back}/><div className="mx-auto mt-8 max-w-xl rounded-[1.5rem] border border-sky-300/14 bg-sky-300/[0.04] p-6 text-center"><KeyRound className="mx-auto size-7 text-sky-200"/><h1 className="mt-4 text-xl font-black">Sign in to see protected cases</h1><p className="mt-2 text-sm text-muted-foreground">Fully anonymous cases remain available through their separate recovery keys.</p><Link to="/auth" className="mt-4 inline-flex rounded-xl bg-sky-200 px-4 py-2 text-sm font-black text-slate-950">Sign in</Link></div></div>; }
function LoadingFrame({ label, back }: { label: string; back?: () => void }) { return <div className="pb-16">{back ? <BackButton onClick={back}/> : null}<div className="mt-8 rounded-xl border border-white/[0.08] p-8 text-center"><RefreshCw className="mx-auto size-5 animate-spin text-sky-200"/><p className="mt-3 text-sm text-muted-foreground">{label}</p></div></div>; }
function FieldLabel({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) { return <span className="text-xs font-bold">{children}{optional ? <span className="ml-1 font-normal text-muted-foreground">optional</span> : null}</span>; }
function TextField({ label, optional = false, value, onChange, placeholder }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block"><FieldLabel optional={optional}>{label}</FieldLabel><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm"/></label>; }
function TextArea({ label, optional = false, value, onChange, rows }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void; rows: number }) { return <label className="block"><FieldLabel optional={optional}>{label}</FieldLabel><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="mt-2 w-full resize-y rounded-xl border p-3 text-sm leading-6"/></label>; }
