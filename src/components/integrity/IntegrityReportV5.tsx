import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { IntegrityReportShell } from "@/components/integrity/IntegrityReportShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { createAnonymousIntegrityCase } from "@/lib/integrity.functions";
import {
  INTEGRITY_CATEGORIES,
  INTEGRITY_IDENTITY_MODES,
  saveAnonymousCaseOnDevice,
  type IntegrityCategory,
  type IntegrityIdentityMode,
} from "@/lib/integrity";
import {
  clearIntegrityReportV5Draft,
  detectIntegrityPrivacySignals,
  integrityCategoryPrompt,
  readIntegrityReportV5Draft,
  readIntegrityReportV5Receipt,
  writeIntegrityReportV5Draft,
  writeIntegrityReportV5Receipt,
} from "@/lib/integrity-report-v5";
import {
  createProtectedIntegrityCase,
  getCurrentIntegrityUser,
} from "@/lib/integrity-portal";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold";

export function IntegrityCategoryStep({ initialCategory }: { initialCategory?: string }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<IntegrityCategory | "">(() => {
    const existing = readIntegrityReportV5Draft().category;
    if (existing) return existing;
    return INTEGRITY_CATEGORIES.some((item) => item.id === initialCategory)
      ? (initialCategory as IntegrityCategory)
      : "";
  });

  useEffect(() => {
    if (selected) writeIntegrityReportV5Draft({ category: selected });
  }, [selected]);

  return (
    <IntegrityReportShell
      step={1}
      title="What are you concerned about?"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!selected}
            onClick={() => void navigate({ to: "/integrity/report/privacy" })}
            className={buttonClass + " bg-primary text-primary-foreground disabled:opacity-40"}
          >
            Continue <ArrowRight className="ml-1 size-4" />
          </button>
        </div>
      }
    >
      <fieldset>
        <legend className="sr-only">Choose a concern category</legend>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Choose the closest match. You do not need to know which rule may have been broken, and “something else” is completely valid.
        </p>
        <div className="divide-y divide-border/60 border-y border-border/60">
          {INTEGRITY_CATEGORIES.map((item) => (
            <label key={item.id} className="flex min-h-16 cursor-pointer items-start gap-3 py-3">
              <input
                type="radio"
                name="integrity-category"
                value={item.id}
                checked={selected === item.id}
                onChange={() => setSelected(item.id)}
                className="mt-1 size-5"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </IntegrityReportShell>
  );
}

export function IntegrityPrivacyStep() {
  const navigate = useNavigate();
  const user = useQuery({ queryKey: ["integrity-user", "report-v5"], queryFn: getCurrentIntegrityUser });
  const [mode, setMode] = useState<IntegrityIdentityMode | "">(
    () => readIntegrityReportV5Draft().identityMode,
  );

  useEffect(() => {
    if (mode) writeIntegrityReportV5Draft({ identityMode: mode });
  }, [mode]);

  const meta = mode ? INTEGRITY_IDENTITY_MODES[mode] : null;

  return (
    <IntegrityReportShell
      step={2}
      title="How should Solaris protect your identity?"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link to="/integrity/report/category" search={{}} className={buttonClass + " border border-border bg-surface"}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Link>
          <button
            type="button"
            disabled={!mode}
            onClick={() => void navigate({ to: "/integrity/report/details" })}
            className={buttonClass + " bg-primary text-primary-foreground disabled:opacity-40"}
          >
            Continue <ArrowRight className="ml-1 size-4" />
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm leading-6 text-muted-foreground">
        This choice controls recovery and who can identify the reporter. You can inspect exactly what an ordinary reviewer sees before continuing.
      </p>

      <div className="space-y-2">
        {(["anonymous", "sealed", "confidential"] as const).map((id) => {
          const item = INTEGRITY_IDENTITY_MODES[id];
          const Icon = id === "anonymous" ? EyeOff : id === "sealed" ? LockKeyhole : ShieldCheck;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`w-full rounded-2xl border p-4 text-left ${mode === id ? "border-emerald-300/30 bg-emerald-300/[0.06]" : "border-border/70 bg-surface/35"}`}
            >
              <div className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                <span>
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.short}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {meta && mode ? (
        <section className="mt-5 border-t border-border/65 pt-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">What an ordinary reviewer sees</p>
          <dl className="mt-3 divide-y divide-border/60 border-y border-border/60 text-sm">
            <PrivacyRow label="Reporter" value={mode === "anonymous" ? "Anonymous" : mode === "sealed" ? "Identity sealed" : "Confidential identity"} />
            <PrivacyRow label="Solaris account" value={mode === "anonymous" ? "Not attached" : "Used for recovery"} />
            <PrivacyRow label="Ordinary reviewer can reveal identity" value={mode === "anonymous" || mode === "sealed" ? "No" : "Not by default"} />
            <PrivacyRow label="Recovery" value={mode === "anonymous" ? "Case code + recovery key" : "Your Solaris account"} />
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{meta.detail}</p>
        </section>
      ) : null}

      {mode !== "anonymous" && mode && !user.isLoading && !user.data ? (
        <div className="mt-4 border-l-2 border-sky-300/40 px-4 py-2">
          <p className="text-sm font-semibold">Protected reporting requires sign-in</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            You can continue reviewing the form, but Solaris will require your account before the protected case can be submitted.
          </p>
          <Link to="/auth" className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-primary">Sign in</Link>
        </div>
      ) : null}
    </IntegrityReportShell>
  );
}

export function IntegrityDetailsStep() {
  const navigate = useNavigate();
  const initial = useMemo(readIntegrityReportV5Draft, []);
  const [summary, setSummary] = useState(initial.summary);
  const [details, setDetails] = useState(initial.details);
  const valid = summary.trim().length >= 5 && details.trim().length >= 20;

  useEffect(() => {
    writeIntegrityReportV5Draft({ summary, details });
  }, [details, summary]);

  return (
    <IntegrityReportShell
      step={3}
      title="Tell us what happened"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link to="/integrity/report/privacy" className={buttonClass + " border border-border bg-surface"}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Link>
          <button
            type="button"
            disabled={!valid}
            onClick={() => void navigate({ to: "/integrity/report/support" })}
            className={buttonClass + " bg-primary text-primary-foreground disabled:opacity-40"}
          >
            Continue <ArrowRight className="ml-1 size-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-semibold">Short summary</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">A neutral description helps reviewers understand the issue quickly.</span>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={180}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">What happened?</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">Write in your own words. You do not need to identify a rule or prove guilt.</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={8}
            maxLength={12000}
            className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6"
          />
        </label>
      </div>
    </IntegrityReportShell>
  );
}

export function IntegritySupportStep() {
  const navigate = useNavigate();
  const initial = useMemo(readIntegrityReportV5Draft, []);
  const prompt = integrityCategoryPrompt(initial.category);
  const [observedFacts, setObservedFacts] = useState(initial.observedFacts);
  const [uncertainties, setUncertainties] = useState(initial.uncertainties);
  const [relatedCountries, setRelatedCountries] = useState(initial.relatedCountries);
  const [editionReference, setEditionReference] = useState(initial.editionReference);

  useEffect(() => {
    writeIntegrityReportV5Draft({
      observedFacts,
      uncertainties,
      relatedCountries,
      editionReference,
    });
  }, [editionReference, observedFacts, relatedCountries, uncertainties]);

  return (
    <IntegrityReportShell
      step={4}
      title={prompt.title}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link to="/integrity/report/details" className={buttonClass + " border border-border bg-surface"}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Link>
          <button
            type="button"
            onClick={() => void navigate({ to: "/integrity/report/review" })}
            className={buttonClass + " bg-primary text-primary-foreground"}
          >
            Review <ArrowRight className="ml-1 size-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-semibold">{prompt.observed}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Optional</span>
          <textarea value={observedFacts} onChange={(event) => setObservedFacts(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{prompt.uncertainty}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Optional</span>
          <textarea value={uncertainties} onChange={(event) => setUncertainties(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Related countries</span>
          <span className="mt-1 block text-xs text-muted-foreground">Optional · separate multiple countries with commas</span>
          <input value={relatedCountries} onChange={(event) => setRelatedCountries(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Edition reference</span>
          <span className="mt-1 block text-xs text-muted-foreground">Optional · for example SSC 22</span>
          <input value={editionReference} onChange={(event) => setEditionReference(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
        <div className="border-l-2 border-sky-300/35 px-4 py-2 text-xs leading-5 text-muted-foreground">
          Evidence files can be added from the case after submission. Images are re-encoded before upload where supported to remove common camera and location metadata.
        </div>
      </div>
    </IntegrityReportShell>
  );
}

export function IntegrityReviewStep() {
  const navigate = useNavigate();
  const { connectivity } = useSolarisApp();
  const createAnonymous = useServerFn(createAnonymousIntegrityCase);
  const user = useQuery({ queryKey: ["integrity-user", "report-review-v5"], queryFn: getCurrentIntegrityUser });
  const [draft] = useState(readIntegrityReportV5Draft);
  const signals = detectIntegrityPrivacySignals(draft);

  const mutation = useMutation({
    mutationFn: async () => {
      if (connectivity.status !== "online") {
        throw new Error("Solaris cannot safely acknowledge a new report while the data service is unavailable.");
      }
      if (!draft.category || !draft.identityMode) throw new Error("Return to the earlier steps and complete the report.");
      const relatedCountries = draft.relatedCountries.split(",").map((item) => item.trim()).filter(Boolean);

      if (draft.identityMode === "anonymous") {
        const result = await createAnonymous({
          data: {
            category: draft.category,
            summary: draft.summary,
            details: draft.details,
            observedFacts: draft.observedFacts,
            uncertainties: draft.uncertainties,
            relatedCountries,
            editionReference: draft.editionReference,
          },
        });
        writeIntegrityReportV5Receipt({
          kind: "anonymous",
          caseCode: result.case_code,
          recoveryKey: result.recovery_key,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (!user.data) throw new Error("Sign in before submitting a sealed or confidential report.");
      const result = await createProtectedIntegrityCase({
        identityMode: draft.identityMode,
        caseKind: "report",
        category: draft.category,
        summary: draft.summary,
        details: draft.details,
        observedFacts: draft.observedFacts,
        uncertainties: draft.uncertainties,
        relatedCountries,
        editionReference: draft.editionReference,
      });
      writeIntegrityReportV5Receipt({
        kind: "protected",
        caseCode: result.case_code,
        caseId: result.case_id,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      clearIntegrityReportV5Draft();
      void navigate({ to: "/integrity/report/receipt" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not submit report"),
  });

  return (
    <IntegrityReportShell
      step={5}
      title="Review your report"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link to="/integrity/report/support" className={buttonClass + " border border-border bg-surface"}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Link>
          <button
            type="button"
            disabled={mutation.isPending || connectivity.status !== "online" || (draft.identityMode !== "anonymous" && !user.data)}
            onClick={() => mutation.mutate()}
            className={buttonClass + " bg-primary text-primary-foreground disabled:opacity-40"}
          >
            {mutation.isPending ? "Submitting…" : "Submit report"}
          </button>
        </div>
      }
    >
      <p className="mb-5 rounded-xl border border-border/70 bg-surface/35 p-3 text-sm font-semibold">
        Nothing has been submitted yet.
      </p>

      <div className="divide-y divide-border/60 border-y border-border/60">
        <ReviewRow label="Concern" value={INTEGRITY_CATEGORIES.find((item) => item.id === draft.category)?.label ?? "Not selected"} to="/integrity/report/category" />
        <ReviewRow label="Privacy" value={draft.identityMode ? INTEGRITY_IDENTITY_MODES[draft.identityMode].label : "Not selected"} to="/integrity/report/privacy" />
        <ReviewRow label="Summary" value={draft.summary} to="/integrity/report/details" />
        <ReviewRow label="Details" value={draft.details} to="/integrity/report/details" />
        <ReviewRow label="Supporting context" value={draft.observedFacts || draft.uncertainties || "None added"} to="/integrity/report/support" />
      </div>

      {draft.identityMode === "anonymous" && signals.length ? (
        <section className="mt-5 border-l-2 border-amber-300/45 px-4 py-2">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-200" />
            <div>
              <h2 className="text-sm font-bold">Anonymous privacy check</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The case has no reporter account attached, but the text itself may still identify you. Solaris found:
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {signals.map((signal) => <li key={signal.kind + signal.value}>• {signal.kind}: {signal.value}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Solaris does not silently remove this information. Go back and edit it if you want.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-bold">What happens next</h2>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {["Received — Solaris creates a case and receipt.", "Triage — an authorised reviewer decides what review is needed.", "Review — evidence is assessed and more information may be requested.", "Finding — a report is not itself proof of a violation.", "Action — any sanction or remedy is recorded separately.", "Appeal — eligible decisions can be challenged through fresh review."].map((item, index) => (
            <li key={item} className="flex gap-3"><span className="font-mono text-xs font-black text-primary">{String(index + 1).padStart(2, "0")}</span><span>{item}</span></li>
          ))}
        </ol>
      </section>

      <RulesApplyingHere context="integrity.report" initiallyExpanded primaryLimit={3} className="mt-6" />

      {draft.identityMode !== "anonymous" && !user.isLoading && !user.data ? (
        <div className="mt-5 border-l-2 border-sky-300/40 px-4 py-2">
          <p className="text-sm font-semibold">Sign in to submit this protected report</p>
          <Link to="/auth" className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-primary">Sign in</Link>
        </div>
      ) : null}
    </IntegrityReportShell>
  );
}

export function IntegrityReceiptStep() {
  const [receipt] = useState(readIntegrityReportV5Receipt);
  const [saved, setSaved] = useState(false);

  if (!receipt) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-black">No report receipt is available</h1>
        <Link to="/integrity" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Trust & Integrity</Link>
      </div>
    );
  }

  if (receipt.kind === "protected") {
    return (
      <div className="mx-auto max-w-xl pb-20 pt-8">
        <Check className="size-9 text-emerald-200" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Report received</p>
        <h1 className="mt-2 text-3xl font-black">{receipt.caseCode}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This protected case is linked to your Solaris account for recovery. You can return through My Integrity Cases.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/integrity/cases/$caseId" params={{ caseId: receipt.caseId }} className={buttonClass + " bg-primary text-primary-foreground"}>View case</Link>
          <Link to="/integrity" className={buttonClass + " border border-border bg-surface"}>Done</Link>
        </div>
      </div>
    );
  }

  const saveDevice = () => {
    saveAnonymousCaseOnDevice({
      caseCode: receipt.caseCode,
      recoveryKey: receipt.recoveryKey,
      savedAt: new Date().toISOString(),
    });
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl pb-20 pt-8">
      <Check className="size-9 text-emerald-200" />
      <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Anonymous report received</p>
      <h1 className="mt-2 text-3xl font-black">{receipt.caseCode}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        No Solaris reporter account is attached to this case. The recovery key below is required to prove that this anonymous case belongs to you.
      </p>

      <section className="mt-5 border-y border-border/65 py-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Recovery key</p>
        <p className="mt-2 break-all font-mono text-lg font-black text-primary">{receipt.recoveryKey}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(`${receipt.caseCode}\n${receipt.recoveryKey}`);
            toast.success("Recovery details copied");
          }}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold"
        >
          <Copy className="size-3.5" /> Copy recovery details
        </button>
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-bold">Optional device recovery</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Solaris does not silently save anonymous recovery details. If you choose this option, anyone with access to this browser profile may be able to discover that an Integrity case is stored here.
        </p>
        <button
          type="button"
          disabled={saved}
          onClick={saveDevice}
          className={buttonClass + " mt-3 border border-border bg-surface"}
        >
          <Save className="mr-2 size-4" /> {saved ? "Saved on this device" : "Save on this device"}
        </button>
      </section>

      <Link to="/integrity" className={buttonClass + " mt-6 bg-primary text-primary-foreground"}>Done</Link>
    </div>
  );
}

function PrivacyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

function ReviewRow({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-6">{value || "—"}</p>
      <Link to={to as any} className="text-xs font-bold text-primary">Change</Link>
    </div>
  );
}
