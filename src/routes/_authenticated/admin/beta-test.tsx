import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard } from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import {
  BetaBugReports,
  BetaQuestionCard,
  BetaTaskCard,
} from "@/features/beta-test/components";
import {
  formatBetaAnswer,
  isBetaAnswerEmpty,
  isBetaQuestionVisible,
} from "@/features/beta-test/sections";
import type { BetaAnswer, BetaAnswers, BetaBugReport, BetaSection } from "@/features/beta-test/types";
import {
  ADMIN_BETA_DRAFT_KEY,
  ADMIN_BETA_FORM_VERSION,
  ADMIN_BETA_SUBMITTED_KEY,
  buildAdminBetaSections,
} from "@/features/admin-beta-test/sections";
import { supabase } from "@/integrations/supabase/client";
import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/beta-test")({
  head: () => ({
    meta: [
      { title: "Admin Beta Test — Solaris Studio" },
      { name: "description", content: "Task-based beta test for the Solaris Studio organizer workspace." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminBetaTestPage,
});

function AdminBetaTestPage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const sections = useMemo(() => buildAdminBetaSections(activeEdition?.slug), [activeEdition?.slug]);

  const [answers, setAnswers] = useState<BetaAnswers>({});
  const [bugs, setBugs] = useState<BetaBugReport[]>([]);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_BETA_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          answers?: BetaAnswers;
          bugs?: Omit<BetaBugReport, "file">[];
          step?: number;
        };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.bugs) setBugs(parsed.bugs.map((bug) => ({ ...bug })));
        if (typeof parsed.step === "number") setStep(Math.min(Math.max(parsed.step, 0), sections.length));
      }
      setSubmitted(window.localStorage.getItem(ADMIN_BETA_SUBMITTED_KEY) === "true");
    } catch {
      // A damaged draft should not block testing.
    } finally {
      setHydrated(true);
    }
  }, [sections.length]);

  useEffect(() => {
    if (!hydrated || submitted) return;
    const serializableBugs = bugs.map(({ file: _file, ...bug }) => bug);
    window.localStorage.setItem(
      ADMIN_BETA_DRAFT_KEY,
      JSON.stringify({ answers, bugs: serializableBugs, step }),
    );
  }, [answers, bugs, step, hydrated, submitted]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const current = sections[step];
  const isReview = step === sections.length;
  const progress = Math.round((Math.min(step, sections.length) / sections.length) * 100);
  const visibleQuestions = useMemo(
    () => current?.questions.filter((question) => isBetaQuestionVisible(question, answers)) ?? [],
    [answers, current],
  );

  function updateAnswer(id: string, value: BetaAnswer) {
    setAnswers((previous) => ({ ...previous, [id]: value }));
    setSectionError(null);
  }

  function next() {
    if (!current) return;
    const missing = visibleQuestions.find(
      (question) => question.required && isBetaAnswerEmpty(answers[question.id]),
    );
    if (missing) {
      setSectionError(`Please answer “${missing.label.replace(/^\d+[A-Z]?\.\s*/, "")}” before continuing.`);
      return;
    }

    if (current.id === "bugs" && answers.bugsFound !== "No") {
      if (!bugs.length) {
        setSectionError("Add at least one bug report, or change the answer to “No”.");
        return;
      }
      const incompleteBug = bugs.find(
        (bug) => !bug.page.trim() || !bug.did.trim() || !bug.expected.trim() || !bug.instead.trim(),
      );
      if (incompleteBug) {
        setSectionError("For each bug, fill in PAGE, I DID, I EXPECTED and INSTEAD so it can actually be reproduced.");
        return;
      }
    }

    setSectionError(null);
    setStep((value) => Math.min(value + 1, sections.length));
  }

  function back() {
    setSectionError(null);
    setStep((value) => Math.max(0, value - 1));
  }

  async function submit() {
    const testerName = String(answers.testerName ?? "").trim();
    const device = String(answers.device ?? "").trim();
    const priorityOne = String(answers.priorityOne ?? "").trim();
    const bugsFound = String(answers.bugsFound ?? "").trim();
    const overallNow = answers.overallNow;

    if (!testerName || !device || !priorityOne || !bugsFound || typeof overallNow !== "number") {
      setError("A required answer is missing. Use the Edit buttons below to fix it before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const submissionId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    try {
      const preparedBugs: Omit<BetaBugReport, "file">[] = [];

      for (const bug of bugs) {
        let screenshotPath = bug.screenshotPath;
        if (bug.file) {
          if (bug.file.size > 8 * 1024 * 1024) throw new Error(`Screenshot “${bug.file.name}” is larger than 8 MB.`);
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(bug.file.type)) {
            throw new Error(`Screenshot “${bug.file.name}” is not a supported image type.`);
          }

          const safeName = bug.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
          screenshotPath = `admin/${submissionId}/${bug.id}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("beta-feedback")
            .upload(screenshotPath, bug.file, {
              cacheControl: "3600",
              contentType: bug.file.type,
              upsert: false,
            });
          if (uploadError) throw uploadError;
          uploadedPaths.push(screenshotPath);
        }

        const { file: _file, ...bugData } = bug;
        preparedBugs.push({ ...bugData, screenshotPath });
      }

      const payload = {
        id: submissionId,
        tester_name: testerName,
        device,
        browser: answers.browser || null,
        familiarity: answers.familiarity || null,
        answers,
        bug_reports: preparedBugs,
        screenshot_paths: uploadedPaths,
        user_agent: navigator.userAgent,
        form_version: ADMIN_BETA_FORM_VERSION,
      };

      const { error: insertError } = await supabase
        .from("admin_beta_test_submissions" as never)
        .insert(payload as never);
      if (insertError) throw insertError;

      window.localStorage.removeItem(ADMIN_BETA_DRAFT_KEY);
      window.localStorage.setItem(ADMIN_BETA_SUBMITTED_KEY, "true");
      setSubmitted(true);
    } catch (submissionError) {
      console.error("Admin beta feedback submission failed", submissionError);
      setError(
        submissionError instanceof Error
          ? `Your feedback was not submitted yet: ${submissionError.message}`
          : "Your feedback was not submitted yet. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    window.localStorage.removeItem(ADMIN_BETA_DRAFT_KEY);
    window.localStorage.removeItem(ADMIN_BETA_SUBMITTED_KEY);
    setAnswers({});
    setBugs([]);
    setStep(0);
    setSubmitted(false);
    setError(null);
  }

  if (!hydrated) return null;

  if (submitted) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-3xl py-8 sm:py-12">
          <AdminCard className="!p-6 text-center sm:!p-10">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-emerald-200/20 bg-emerald-200/10 text-emerald-100">
              <Check className="size-7" />
            </div>
            <p className="admin-section-label">Admin beta</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Feedback submitted</h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Thank you. The useful bits here are not only bugs: confusion, risky controls, slow workflows and anything that made you hesitate during normal organizer work all matter.
            </p>
            <button type="button" onClick={restart} className="admin-action-secondary mt-8">
              Submit another response on this device
            </button>
          </AdminCard>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-4xl pb-24">
        <header className="mb-6 sm:mb-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="admin-section-label">Solaris Studio · Admin beta</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl">
                {isReview ? "Review your feedback" : current.title}
              </h1>
              {!isReview && current.description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{current.description}</p> : null}
            </div>
            <p className="shrink-0 text-xs font-semibold text-muted-foreground">
              {isReview ? "Review" : `${step + 1} of ${sections.length}`}
            </p>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-sky-200 transition-all duration-300" style={{ width: `${isReview ? 100 : Math.max(progress, 4)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold text-muted-foreground">
            <span>{isReview ? "Ready to submit" : "Your answers save on this device as you go."}</span>
            <span>{isReview ? "100%" : `${progress}%`}</span>
          </div>
        </header>

        {step === 0 ? (
          <div className="mb-6 space-y-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4 text-sm leading-6 text-muted-foreground sm:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-100" />
              <div>
                <p className="font-semibold text-foreground">Test the workflow, not the integrity of the official archive.</p>
                <p className="mt-1">Do not change official results, jury points, televote totals, point scales or published data just to prove a button works. Use a designated test edition/show where available, or inspect the flow and stop before confirming a destructive or publishing action.</p>
              </div>
            </div>
            <p>You do not have to test every area. Short answers are completely fine. “Nothing”, “No” and “Didn't test” are valid answers when they are true.</p>
          </div>
        ) : null}

        {isReview ? (
          <AdminBetaReviewScreen sections={sections} answers={answers} bugs={bugs} onEdit={setStep} />
        ) : (
          <>
            {current.task ? <BetaTaskCard {...current.task} /> : null}
            <div className="space-y-4">
              {visibleQuestions.map((question) => (
                <BetaQuestionCard
                  key={question.id}
                  question={question}
                  answers={answers}
                  value={answers[question.id]}
                  onChange={(value) => updateAnswer(question.id, value)}
                />
              ))}
              {current.id === "bugs" && answers.bugsFound !== "No" && answers.bugsFound ? (
                <BetaBugReports bugs={bugs} onChange={setBugs} />
              ) : null}
            </div>
          </>
        )}

        {sectionError ? <div className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/[0.08] p-3 text-sm text-rose-100">{sectionError}</div> : null}
        {error ? <div className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/[0.08] p-3 text-sm text-rose-100">{error}</div> : null}

        <div className="sticky bottom-3 z-30 mt-7 flex gap-3 rounded-2xl border border-white/[0.1] bg-[#071122]/95 p-3 shadow-2xl backdrop-blur-xl">
          <button type="button" onClick={back} disabled={step === 0 || submitting} className="admin-action-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
            <ArrowLeft className="size-4" /> Back
          </button>
          {isReview ? (
            <button type="button" onClick={() => void submit()} disabled={submitting} className="admin-action-primary flex-[2] sm:ml-auto sm:flex-none">
              {submitting ? "Submitting…" : "Submit admin feedback"} <Check className="size-4" />
            </button>
          ) : (
            <button type="button" onClick={next} className="admin-action-primary flex-[2] sm:ml-auto sm:flex-none">
              {step === sections.length - 1 ? "Review answers" : "Continue"} <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </AdminPage>
  );
}

function AdminBetaReviewScreen({
  sections,
  answers,
  bugs,
  onEdit,
}: {
  sections: BetaSection[];
  answers: BetaAnswers;
  bugs: BetaBugReport[];
  onEdit: (step: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm text-muted-foreground">
        Check the important bits before submitting. Optional unanswered questions stay optional. Civilization survives.
      </div>
      {sections.map((section, index) => {
        const visible = section.questions.filter((question) => isBetaQuestionVisible(question, answers));
        return (
          <AdminCard key={section.id} className="!p-4 sm:!p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-black">{section.title}</h2>
              <button type="button" onClick={() => onEdit(index)} className="admin-action-secondary !min-h-9 !px-3">Edit</button>
            </div>
            <div className="mt-3 divide-y divide-white/[0.07]">
              {visible.map((question) => (
                <div key={question.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-5">
                  <p className="text-xs font-semibold leading-5 text-muted-foreground">{question.label}</p>
                  <p className={cn("break-words text-xs leading-5 sm:text-right", isBetaAnswerEmpty(answers[question.id]) ? "italic text-muted-foreground/60" : "text-foreground")}>{formatBetaAnswer(answers[question.id])}</p>
                </div>
              ))}
              {section.id === "bugs" && answers.bugsFound !== "No" ? (
                <div className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-5">
                  <p className="text-xs font-semibold text-muted-foreground">Structured bug reports</p>
                  <p className="text-xs sm:text-right">{bugs.length} report{bugs.length === 1 ? "" : "s"}</p>
                </div>
              ) : null}
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
