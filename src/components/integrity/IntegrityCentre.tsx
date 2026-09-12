import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bug,
  Check,
  CheckCircle2,
  CircleHelp,
  Clipboard,
  EyeOff,
  Handshake,
  History,
  KeyRound,
  Landmark,
  LockKeyhole,
  MessageCircle,
  MessageCircleWarning,
  Music2,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Siren,
  UserRoundX,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createAnonymousIntegrityCase,
  getAnonymousIntegrityCase,
  replyToAnonymousIntegrityCase,
} from "@/lib/integrity.functions";
import {
  INTEGRITY_CATEGORIES,
  formatIntegrityStatus,
  getIntegrityCategory,
  readAnonymousCasesFromDevice,
  saveAnonymousCaseOnDevice,
  type AnonymousCaseCredential,
  type AnonymousCaseSnapshot,
  type IntegrityCategory,
} from "@/lib/integrity";
import { cn } from "@/lib/utils";

type View = "home" | "report" | "case";

type ReportDraft = {
  category: IntegrityCategory | null;
  summary: string;
  details: string;
  observedFacts: string;
  uncertainties: string;
  relatedCountries: string;
  editionReference: string;
};

const EMPTY_REPORT: ReportDraft = {
  category: null,
  summary: "",
  details: "",
  observedFacts: "",
  uncertainties: "",
  relatedCountries: "",
  editionReference: "",
};

const ICONS: Record<string, LucideIcon> = {
  Vote,
  Handshake,
  Music2,
  UserRoundX,
  MessageCircleWarning,
  Siren,
  LockKeyhole,
  Bug,
  Landmark,
  CircleHelp,
};

export function IntegrityCentre() {
  const [view, setView] = useState<View>("home");
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_REPORT);
  const [credential, setCredential] = useState<AnonymousCaseCredential | null>(null);
  const [snapshot, setSnapshot] = useState<AnonymousCaseSnapshot | null>(null);
  const [savedCases, setSavedCases] = useState<AnonymousCaseCredential[]>([]);

  useEffect(() => {
    setSavedCases(readAnonymousCasesFromDevice());
  }, []);

  const openCase = (nextCredential: AnonymousCaseCredential, nextSnapshot?: AnonymousCaseSnapshot) => {
    setCredential(nextCredential);
    if (nextSnapshot) setSnapshot(nextSnapshot);
    setView("case");
  };

  return (
    <div className="pb-16">
      <IntegrityHero />

      {view === "home" ? (
        <IntegrityHome
          savedCases={savedCases}
          startReport={() => setView("report")}
          openCase={openCase}
        />
      ) : view === "report" ? (
        <AnonymousReportFlow
          draft={draft}
          setDraft={setDraft}
          cancel={() => setView("home")}
          onCreated={(nextCredential) => {
            saveAnonymousCaseOnDevice(nextCredential);
            setSavedCases(readAnonymousCasesFromDevice());
            setCredential(nextCredential);
            setSnapshot(null);
            setDraft(EMPTY_REPORT);
            setView("case");
          }}
        />
      ) : (
        <AnonymousCaseView
          credential={credential}
          snapshot={snapshot}
          setSnapshot={setSnapshot}
          back={() => {
            setView("home");
            setSnapshot(null);
            setCredential(null);
          }}
        />
      )}
    </div>
  );
}

function IntegrityHero() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[linear-gradient(145deg,rgba(17,60,64,.58),rgba(5,19,42,.97)_55%,rgba(26,37,76,.96))] p-5 shadow-[0_28px_80px_rgba(0,4,28,.24)] sm:p-8 lg:p-10">
      <div aria-hidden="true" className="absolute -right-24 -top-24 size-80 rounded-full bg-emerald-300/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 left-1/4 size-72 rounded-full bg-violet-400/8 blur-3xl" />
      <div className="relative max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[0.07] px-3 py-1 text-[11px] font-black uppercase tracking-[.15em] text-emerald-100">
            <ShieldCheck className="size-3.5" /> Trust & Integrity
          </span>
          <span className="text-xs text-muted-foreground">Protected reporting · two-way cases · fair review</span>
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl lg:text-6xl">
          Report concerns without turning yourself into the evidence.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/80 sm:text-base">
          The Integrity Centre lets you report a possible SSC rule break, continue a protected conversation with TSBC and add information later. A report is information for review, not a verdict against anyone.
        </p>
      </div>
    </section>
  );
}

function IntegrityHome({
  savedCases,
  startReport,
  openCase,
}: {
  savedCases: AnonymousCaseCredential[];
  startReport: () => void;
  openCase: (credential: AnonymousCaseCredential) => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [caseCode, setCaseCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  return (
    <div className="mt-8 space-y-8">
      <section className="grid gap-4 lg:grid-cols-3">
        <button
          type="button"
          onClick={startReport}
          className="group relative overflow-hidden rounded-[1.7rem] border border-emerald-300/15 bg-[linear-gradient(150deg,rgba(28,90,79,.22),rgba(6,22,43,.93))] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-200/25 sm:p-6"
        >
          <EyeOff className="size-7 text-emerald-200" />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-emerald-200/75">Report</p>
          <h2 className="mt-1 text-xl font-black tracking-[-.03em]">Anonymous report</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Create a case that does not store your Solaris account identity. Keep a recovery key to return and talk with TSBC.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-200">Start securely <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </button>

        <button
          type="button"
          onClick={() => setManualOpen((value) => !value)}
          className="group rounded-[1.7rem] border border-sky-300/14 bg-[linear-gradient(150deg,rgba(35,72,110,.27),rgba(6,22,43,.93))] p-5 text-left transition hover:-translate-y-0.5 hover:border-sky-200/25 sm:p-6"
        >
          <KeyRound className="size-7 text-sky-200" />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-sky-200/75">Continue</p>
          <h2 className="mt-1 text-xl font-black tracking-[-.03em]">Open anonymous case</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your case code and recovery key to read TSBC replies and send more information.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-sky-200">Enter credentials <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </button>

        <Link
          to="/rules/$ruleId"
          params={{ ruleId: "16.3" }}
          className="group rounded-[1.7rem] border border-violet-300/14 bg-[linear-gradient(150deg,rgba(75,55,125,.22),rgba(6,22,43,.93))] p-5 transition hover:-translate-y-0.5 hover:border-violet-200/25 sm:p-6"
        >
          <ShieldCheck className="size-7 text-violet-200" />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-violet-200/75">Understand</p>
          <h2 className="mt-1 text-xl font-black tracking-[-.03em]">How protection works</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">See the official rules on anonymity, evidence, anti-retaliation and the difference between a report and a finding.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-violet-200">Read Rule 16.3 <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </Link>
      </section>

      {manualOpen ? (
        <AnonymousCaseAccess
          defaultCaseCode={caseCode}
          defaultRecoveryKey={recoveryKey}
          onCaseCode={setCaseCode}
          onRecoveryKey={setRecoveryKey}
          onOpen={openCase}
        />
      ) : null}

      {savedCases.length ? (
        <section>
          <SectionHeading eyebrow="This device" title="Saved anonymous cases" description="These credentials live only in this browser's local storage. They are not attached to your Solaris account." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savedCases.map((item) => (
              <button
                key={item.caseCode}
                type="button"
                onClick={() => openCase(item)}
                className="group rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-emerald-200/18 hover:bg-emerald-200/[0.04]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-black text-emerald-200">{item.caseCode}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Saved {new Date(item.savedAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading eyebrow="Principles" title="What this system promises" description="The integrity process has to protect both the person reporting and the person being reported. Revolutionary stuff, apparently." />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Principle icon={EyeOff} title="Identity minimised" text="Fully anonymous case records do not contain a reporter Solaris account ID." />
          <Principle icon={MessageCircle} title="Two-way" text="TSBC can ask questions and the reporter can answer without abandoning anonymity." />
          <Principle icon={Scale} title="No instant guilt" text="A report, allegation or automated flag does not itself establish misconduct." />
          <Principle icon={LockKeyhole} title="Need-to-know" text="Sensitive evidence and technical data should not be exposed unnecessarily." />
        </div>
      </section>
    </div>
  );
}

function Principle({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/[0.08] bg-[#081a35]/72 p-4">
      <Icon className="size-5 text-sky-200" />
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function AnonymousReportFlow({
  draft,
  setDraft,
  cancel,
  onCreated,
}: {
  draft: ReportDraft;
  setDraft: (draft: ReportDraft) => void;
  cancel: () => void;
  onCreated: (credential: AnonymousCaseCredential) => void;
}) {
  const createCase = useServerFn(createAnonymousIntegrityCase);
  const [reviewing, setReviewing] = useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      if (!draft.category) throw new Error("Choose what the concern is about.");
      return createCase({
        data: {
          category: draft.category,
          summary: draft.summary,
          details: draft.details,
          observedFacts: draft.observedFacts,
          uncertainties: draft.uncertainties,
          relatedCountries: draft.relatedCountries
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          editionReference: draft.editionReference,
        },
      });
    },
    onSuccess: (result) => {
      const credential = {
        caseCode: result.case_code,
        recoveryKey: result.recovery_key,
        savedAt: new Date().toISOString(),
      };
      onCreated(credential);
      toast.success("Anonymous integrity case created");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not submit report"),
  });

  const valid = Boolean(draft.category && draft.summary.trim().length >= 5 && draft.details.trim().length >= 20);

  return (
    <section className="mt-8">
      <button type="button" onClick={cancel} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Integrity Centre</button>
      <div className="grid gap-5 xl:grid-cols-[1fr_19rem]">
        <div className="rounded-[1.7rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(18,42,71,.82),rgba(5,18,39,.94))] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-200">Fully anonymous report</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-.04em] sm:text-3xl">{reviewing ? "Review before sending" : "What happened?"}</h2>
            </div>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[.1em] text-emerald-100">No account ID stored</span>
          </div>

          {!reviewing ? (
            <div className="mt-6 space-y-6">
              <div>
                <FieldLabel>What is the concern about?</FieldLabel>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {INTEGRITY_CATEGORIES.map((category) => {
                    const Icon = ICONS[category.icon] ?? CircleHelp;
                    const selected = draft.category === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, category: category.id })}
                        className={cn(
                          "flex min-h-24 gap-3 rounded-2xl border p-3.5 text-left transition",
                          selected
                            ? "border-emerald-300/25 bg-emerald-300/[0.08]"
                            : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.13] hover:bg-white/[0.035]",
                        )}
                      >
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", selected ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/[0.07] bg-white/[0.03] text-muted-foreground")}><Icon className="size-4" /></span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{category.label}</span>
                          <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{category.short}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <TextField label="Short summary" value={draft.summary} onChange={(value) => setDraft({ ...draft, summary: value })} placeholder="Example: Possible agreement to exchange high televote scores" maxLength={180} />
              <TextArea label="Describe the concern" value={draft.details} onChange={(value) => setDraft({ ...draft, details: value })} placeholder="Explain what happened and why you think it may be relevant to SSC. You do not need to know the exact rule number." minRows={5} />

              <div className="grid gap-4 md:grid-cols-2">
                <TextArea label="What did you personally observe?" optional value={draft.observedFacts} onChange={(value) => setDraft({ ...draft, observedFacts: value })} placeholder="Facts, messages or events you directly saw." minRows={4} />
                <TextArea label="What are you unsure about?" optional value={draft.uncertainties} onChange={(value) => setDraft({ ...draft, uncertainties: value })} placeholder="Separate suspicions or things you cannot verify yourself." minRows={4} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Countries involved" optional value={draft.relatedCountries} onChange={(value) => setDraft({ ...draft, relatedCountries: value })} placeholder="Oland, Vendia" helper="Comma-separated. Leave blank if not relevant." />
                <TextField label="Edition" optional value={draft.editionReference} onChange={(value) => setDraft({ ...draft, editionReference: value })} placeholder="SSC 20" helper="Use whatever edition reference you know." />
              </div>

              <div className="rounded-2xl border border-amber-300/14 bg-amber-300/[0.045] p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-200" />
                  <div>
                    <p className="text-sm font-bold">Evidence files are not enabled in this first secure slice</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Describe what you have here. The two-way case thread already lets TSBC request more information. File uploads need their own metadata stripping, access controls and redaction path, so they are deliberately not being bolted on carelessly.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={cancel} className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">Cancel</button>
                <button type="button" disabled={!valid} onClick={() => setReviewing(true)} className="min-h-11 rounded-xl bg-emerald-200 px-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40">Review report <ArrowRight className="ml-1 inline size-4" /></button>
              </div>
            </div>
          ) : (
            <ReportReview draft={draft} back={() => setReviewing(false)} submit={() => mutation.mutate()} submitting={mutation.isPending} />
          )}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <PrivacyCard />
          <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Remember</p>
            <p className="mt-2 text-sm font-bold">You do not need to prove the case.</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Submit information you genuinely believe may matter. A concern that cannot later be proven is not automatically a false report.</p>
            <Link to="/rules/$ruleId" params={{ ruleId: "16.2" }} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-200">Read reporting rule <ArrowRight className="size-3.5" /></Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PrivacyCard() {
  return (
    <div className="rounded-[1.4rem] border border-emerald-300/14 bg-emerald-300/[0.045] p-4">
      <EyeOff className="size-5 text-emerald-200" />
      <p className="mt-3 text-sm font-bold">Fully anonymous mode</p>
      <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
        <p className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />The case record stores no reporter account ID.</p>
        <p className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />A sessionless server connection submits the report.</p>
        <p className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />Only a hashed recovery secret is stored.</p>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground/80">Do not put your name, username or other identifying details into the report text if you want the content itself to remain anonymous.</p>
    </div>
  );
}

function ReportReview({ draft, back, submit, submitting }: { draft: ReportDraft; back: () => void; submit: () => void; submitting: boolean }) {
  const category = getIntegrityCategory(draft.category ?? "other");
  return (
    <div className="mt-6 space-y-4">
      <ReviewRow label="Category" value={category.label} />
      <ReviewRow label="Privacy" value="Fully anonymous · no Solaris account ID stored" emphasis />
      <ReviewRow label="Summary" value={draft.summary} />
      <ReviewRow label="Description" value={draft.details} />
      {draft.observedFacts ? <ReviewRow label="Personally observed" value={draft.observedFacts} /> : null}
      {draft.uncertainties ? <ReviewRow label="Uncertain / suspected" value={draft.uncertainties} /> : null}
      {draft.relatedCountries ? <ReviewRow label="Countries" value={draft.relatedCountries} /> : null}
      {draft.editionReference ? <ReviewRow label="Edition" value={draft.editionReference} /> : null}

      <div className="rounded-2xl border border-sky-300/14 bg-sky-300/[0.045] p-4 text-xs leading-5 text-muted-foreground">
        By submitting, you confirm only that you are providing the information in good faith. You are not being asked to prove guilt or guarantee that TSBC will find a violation.
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <button type="button" onClick={back} disabled={submitting} className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="mr-1 inline size-4" /> Edit report</button>
        <button type="button" onClick={submit} disabled={submitting} className="min-h-11 rounded-xl bg-emerald-200 px-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-100 disabled:opacity-50">{submitting ? "Submitting securely…" : "Submit anonymous report"}</button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", emphasis ? "border-emerald-300/14 bg-emerald-300/[0.045]" : "border-white/[0.07] bg-white/[0.02]")}>
      <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", emphasis && "font-bold text-emerald-100")}>{value}</p>
    </div>
  );
}

function AnonymousCaseAccess({ defaultCaseCode, defaultRecoveryKey, onCaseCode, onRecoveryKey, onOpen }: { defaultCaseCode: string; defaultRecoveryKey: string; onCaseCode: (value: string) => void; onRecoveryKey: (value: string) => void; onOpen: (credential: AnonymousCaseCredential, snapshot?: AnonymousCaseSnapshot) => void }) {
  const getCase = useServerFn(getAnonymousIntegrityCase);
  const mutation = useMutation({
    mutationFn: () => getCase({ data: { caseCode: defaultCaseCode, recoveryKey: defaultRecoveryKey } }),
    onSuccess: (result) => {
      if (!result.ok || !result.snapshot) {
        toast.error(result.error ?? "Could not open case");
        return;
      }
      const credential = { caseCode: defaultCaseCode.trim().toUpperCase(), recoveryKey: defaultRecoveryKey.trim(), savedAt: new Date().toISOString() };
      onOpen(credential, result.snapshot);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not open case"),
  });

  return (
    <section className="rounded-[1.6rem] border border-sky-300/14 bg-sky-300/[0.035] p-5 sm:p-6">
      <div className="flex items-center gap-3"><KeyRound className="size-5 text-sky-200" /><div><h2 className="font-black">Open an anonymous case</h2><p className="mt-0.5 text-xs text-muted-foreground">Your code and recovery key are required together.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-[.8fr_1.2fr_auto]">
        <TextField label="Case code" value={defaultCaseCode} onChange={onCaseCode} placeholder="AR-1A2B3C4D5E" />
        <TextField label="Recovery key" value={defaultRecoveryKey} onChange={onRecoveryKey} placeholder="ABCD-EF12-3456-7890-ABCD-EF12" />
        <button type="button" disabled={mutation.isPending || !defaultCaseCode.trim() || !defaultRecoveryKey.trim()} onClick={() => mutation.mutate()} className="mt-[1.55rem] min-h-11 rounded-xl bg-sky-200 px-4 text-sm font-black text-slate-950 disabled:opacity-40">{mutation.isPending ? "Opening…" : "Open case"}</button>
      </div>
    </section>
  );
}

function AnonymousCaseView({ credential, snapshot, setSnapshot, back }: { credential: AnonymousCaseCredential | null; snapshot: AnonymousCaseSnapshot | null; setSnapshot: (snapshot: AnonymousCaseSnapshot | null) => void; back: () => void }) {
  const getCase = useServerFn(getAnonymousIntegrityCase);
  const reply = useServerFn(replyToAnonymousIntegrityCase);
  const [message, setMessage] = useState("");
  const [showKey, setShowKey] = useState(false);

  const loadMutation = useMutation({
    mutationFn: () => {
      if (!credential) throw new Error("Anonymous case credentials are missing.");
      return getCase({ data: { caseCode: credential.caseCode, recoveryKey: credential.recoveryKey } });
    },
    onSuccess: (result) => {
      if (!result.ok || !result.snapshot) {
        toast.error(result.error ?? "Could not open case");
        return;
      }
      setSnapshot(result.snapshot);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not open case"),
  });

  useEffect(() => {
    if (credential && !snapshot && !loadMutation.isPending) loadMutation.mutate();
    // Credentials define the case; the mutation is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential?.caseCode]);

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!credential) throw new Error("Anonymous case credentials are missing.");
      return reply({ data: { caseCode: credential.caseCode, recoveryKey: credential.recoveryKey, body: message } });
    },
    onSuccess: (result) => {
      if (!result.ok || !result.snapshot) {
        toast.error(result.error ?? "Could not send message");
        return;
      }
      setSnapshot(result.snapshot);
      setMessage("");
      toast.success("Additional information sent anonymously");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send message"),
  });

  if (!credential) {
    return <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"><p className="font-bold">No case selected.</p><button type="button" onClick={back} className="mt-3 text-sm font-bold text-sky-200">Back to Integrity Centre</button></div>;
  }

  if (!snapshot) {
    return (
      <div className="mt-8 rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-8 text-center">
        <RefreshCw className={cn("mx-auto size-6 text-sky-200", loadMutation.isPending && "animate-spin")} />
        <p className="mt-3 font-bold">Opening {credential.caseCode}</p>
        {loadMutation.isError ? <button type="button" onClick={() => loadMutation.mutate()} className="mt-4 rounded-xl bg-sky-200 px-4 py-2 text-sm font-black text-slate-950">Try again</button> : null}
      </div>
    );
  }

  const status = formatIntegrityStatus(snapshot.case.status);
  const category = getIntegrityCategory(snapshot.case.category);

  return (
    <section className="mt-8">
      <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Integrity Centre</button>

      <div className="grid gap-5 xl:grid-cols-[1fr_19rem]">
        <main className="min-w-0 space-y-4">
          <div className="rounded-[1.7rem] border border-emerald-300/14 bg-[linear-gradient(150deg,rgba(22,70,67,.25),rgba(6,22,43,.94))] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-black text-emerald-200">{snapshot.case.public_code}</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.035em]">{snapshot.case.summary}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{category.label} · created {new Date(snapshot.case.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full border border-sky-300/14 bg-sky-300/[0.06] px-3 py-1.5 text-xs font-bold text-sky-100">{status.label}</span>
            </div>
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Status</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-200/85">{status.description}</p>
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/[0.08] bg-[#081a35]/82 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-sky-200/75">Secure thread</p><h3 className="mt-1 text-xl font-black">Reporter ↔ TSBC</h3></div><button type="button" onClick={() => loadMutation.mutate()} disabled={loadMutation.isPending} className="grid size-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-muted-foreground transition hover:text-foreground"><RefreshCw className={cn("size-4", loadMutation.isPending && "animate-spin")} /></button></div>

            <div className="mt-5 space-y-3">
              {snapshot.messages.map((item) => (
                <div key={item.id} className={cn("max-w-[90%] rounded-2xl border p-4 sm:max-w-[78%]", item.author_role === "reporter" ? "ml-auto border-emerald-300/14 bg-emerald-300/[0.055]" : "border-sky-300/14 bg-sky-300/[0.055]")}>
                  <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground"><span>{item.author_role === "reporter" ? "You · Anonymous" : "TSBC"}</span><time>{new Date(item.created_at).toLocaleString()}</time></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200/90">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add information or answer TSBC anonymously…" rows={4} className="w-full resize-y border-0 !bg-transparent px-2 py-1 text-sm leading-6 shadow-none outline-none placeholder:text-muted-foreground/70 focus-visible:!shadow-none" />
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <p className="text-[10px] leading-4 text-muted-foreground">Your message is stored as “Anonymous Reporter”.</p>
                <button type="button" onClick={() => replyMutation.mutate()} disabled={replyMutation.isPending || message.trim().length < 2} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-200 px-3 text-xs font-black text-emerald-950 disabled:opacity-40"><Send className="size-3.5" />{replyMutation.isPending ? "Sending…" : "Send"}</button>
              </div>
            </div>
          </div>
        </main>

        <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[1.4rem] border border-emerald-300/14 bg-emerald-300/[0.045] p-4">
            <KeyRound className="size-5 text-emerald-200" />
            <p className="mt-3 text-sm font-bold">Recovery access</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">The key is the only credential that lets this anonymous mailbox be opened.</p>
            <button type="button" onClick={() => setShowKey((value) => !value)} className="mt-3 text-xs font-bold text-emerald-200">{showKey ? "Hide key" : "Show key"}</button>
            {showKey ? <code className="mt-2 block break-all rounded-xl border border-white/[0.07] bg-black/20 p-3 text-[11px] text-slate-200">{credential.recoveryKey}</code> : null}
            <button type="button" onClick={async () => { await navigator.clipboard?.writeText(`${credential.caseCode}\n${credential.recoveryKey}`); toast.success("Case credentials copied"); }} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-sky-200"><Clipboard className="size-3.5" />Copy credentials</button>
          </div>

          <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4">
            <History className="size-5 text-sky-200" />
            <p className="mt-3 text-sm font-bold">Case timeline</p>
            <div className="mt-3 space-y-3">
              {snapshot.events.slice(-8).reverse().map((event) => <div key={event.id} className="border-l border-white/[0.09] pl-3"><p className="text-xs font-semibold">{event.detail ?? event.event_type}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p></div>)}
            </div>
          </div>

          <Link to="/rules/$ruleId" params={{ ruleId: "16.6" }} className="block rounded-[1.4rem] border border-violet-300/14 bg-violet-300/[0.04] p-4 transition hover:bg-violet-300/[0.07]"><ShieldCheck className="size-5 text-violet-200" /><p className="mt-3 text-sm font-bold">Case fairness</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A report and an investigation are not findings of misconduct.</p></Link>
        </aside>
      </div>
    </section>
  );
}

function TextField({ label, optional = false, value, onChange, placeholder, helper, maxLength }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void; placeholder?: string; helper?: string; maxLength?: number }) {
  return (
    <label className="block">
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm" />
      {helper ? <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">{helper}</span> : null}
    </label>
  );
}

function TextArea({ label, optional = false, value, onChange, placeholder, minRows = 4 }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void; placeholder?: string; minRows?: number }) {
  return (
    <label className="block">
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={minRows} className="mt-2 w-full resize-y rounded-xl border p-3 text-sm leading-6" />
    </label>
  );
}

function FieldLabel({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) {
  return <span className="text-xs font-bold text-slate-200">{children}{optional ? <span className="ml-1 font-normal text-muted-foreground">optional</span> : null}</span>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200/75">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-[-.04em] sm:text-3xl">{title}</h2>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
