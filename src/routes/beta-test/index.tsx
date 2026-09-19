import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  BetaBugReports,
  BetaQuestionCard,
  BetaReviewScreen,
  BetaTaskCard,
} from "@/features/beta-test/components";
import {
  BETA_DRAFT_KEY,
  BETA_FORM_VERSION,
  BETA_SUBMITTED_KEY,
  betaSections,
  isBetaAnswerEmpty,
  isBetaQuestionVisible,
} from "@/features/beta-test/sections";
import type { BetaAnswer, BetaAnswers, BetaBugReport } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";
import { completePublicUxBetaTask } from "@/lib/public-ux-events";

export const Route = createFileRoute("/beta-test/")({
  head: () => ({
    meta: [
      { title: "Beta 3 — Solaris Studio" },
      {
        name: "description",
        content: "Structured Beta 3 usability test for Solaris Studio.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BetaTestPage,
});

function BetaTestPage() {
  const [answers, setAnswers] = useState<BetaAnswers>({});
  const [bugs, setBugs] = useState<BetaBugReport[]>([]);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionStartedAt, setSectionStartedAt] = useState(() => Date.now());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BETA_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          answers?: BetaAnswers;
          bugs?: Omit<BetaBugReport, "file">[];
          step?: number;
        };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.bugs) setBugs(parsed.bugs.map((bug) => ({ ...bug })));
        if (typeof parsed.step === "number") {
          setStep(Math.min(Math.max(parsed.step, 0), betaSections.length));
        }
      }
      setSubmitted(window.localStorage.getItem(BETA_SUBMITTED_KEY) === "true");
    } catch {
      // A damaged local draft should never block the test.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || submitted) return;
    const serializableBugs = bugs.map(({ file: _file, ...bug }) => bug);
    window.localStorage.setItem(
      BETA_DRAFT_KEY,
      JSON.stringify({ answers, bugs: serializableBugs, step }),
    );
  }, [answers, bugs, step, hydrated, submitted]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setSectionStartedAt(Date.now());
  }, [step]);

  const current = betaSections[step];
  const isReview = step === betaSections.length;
  const progress = Math.round((Math.min(step, betaSections.length) / betaSections.length) * 100);
  const visibleQuestions = useMemo(
    () => current?.questions.filter((question) => isBetaQuestionVisible(question, answers)) ?? [],
    [answers, current],
  );

  const updateAnswer = (id: string, value: BetaAnswer) => {
    setAnswers((previous) => ({ ...previous, [id]: value }));
    setSectionError(null);
  };

  const recordCurrentSectionTime = () => {
    if (!current) return;
    const key = `_seconds_${current.id}`;
    const elapsed = Math.max(1, Math.round((Date.now() - sectionStartedAt) / 1000));
    setAnswers((previous) => ({
      ...previous,
      [key]: Number(previous[key] ?? 0) + elapsed,
    }));
  };

  const next = () => {
    if (!current) return;

    const missing = visibleQuestions.find(
      (question) => question.required && isBetaAnswerEmpty(answers[question.id]),
    );
    if (missing) {
      setSectionError(`Please answer “${missing.label}” before continuing.`);
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
        setSectionError(
          "For each bug, fill in PAGE, I DID, I EXPECTED and INSTEAD so the problem can actually be reproduced.",
        );
        return;
      }
    }

    if (current.id === "psychology-priorities") {
      const priorities = Array.isArray(answers.priorityAreas) ? answers.priorityAreas : [];
      if (priorities.length !== 3) {
        setSectionError("Choose exactly THREE areas Solaris should improve most before release.");
        return;
      }
    }

    if (current.id === "final") {
      const raw = String(answers.releaseReadinessPercent ?? "").trim().replace("%", "");
      if (raw) {
        const readiness = Number(raw);
        if (!Number.isFinite(readiness) || readiness < 0 || readiness > 100) {
          setSectionError("Release readiness must be a number from 0 to 100%.");
          return;
        }
      }
    }

    if (current.task?.analyticsId) {
      const outcomeQuestion = current.questions.find((question) =>
        question.id.endsWith("Outcome"),
      );
      const outcome = outcomeQuestion ? String(answers[outcomeQuestion.id] ?? "") : "";
      completePublicUxBetaTask(outcome === "Could not find it" ? "abandoned" : "success");
    }

    recordCurrentSectionTime();
    setSectionError(null);
    setStep((value) => Math.min(value + 1, betaSections.length));
  };

  const back = () => {
    setSectionError(null);
    setStep((value) => Math.max(0, value - 1));
  };

  const submit = async () => {
    const testerName = String(answers.testerName ?? "").trim();
    const device = String(answers.device ?? "").trim();
    const priorityOne = String(answers.priorityOne ?? "").trim();
    const bugsFound = String(answers.bugsFound ?? "").trim();

    if (!testerName || !device || !priorityOne || !bugsFound) {
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
          if (bug.file.size > 8 * 1024 * 1024) {
            throw new Error(`Screenshot “${bug.file.name}” is larger than 8 MB.`);
          }
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(bug.file.type)) {
            throw new Error(`Screenshot “${bug.file.name}” is not a supported image type.`);
          }

          const safeName = bug.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
          screenshotPath = `${submissionId}/${bug.id}-${safeName}`;
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

      const activityPoints = calculateActivityPoints(answers, bugs);
      const payload = {
        id: submissionId,
        tester_name: testerName,
        device,
        browser: answers.browser || null,
        familiarity: answers.familiarity || null,
        answers: { ...answers, activityPoints },
        bug_reports: preparedBugs,
        screenshot_paths: uploadedPaths,
        user_agent: navigator.userAgent,
        form_version: BETA_FORM_VERSION,
      };

      const { error: insertError } = await supabase
        .from("beta3_test_submissions" as never)
        .insert(payload as never);

      if (insertError) throw insertError;

      window.localStorage.removeItem(BETA_DRAFT_KEY);
      window.localStorage.setItem(BETA_SUBMITTED_KEY, "true");
      setAnswers((previous) => ({ ...previous, activityPoints }));
      setSubmitted(true);
    } catch (submissionError) {
      console.error("Beta feedback submission failed", submissionError);
      setError(
        submissionError instanceof Error
          ? `Your feedback was not submitted yet: ${submissionError.message}`
          : "Your feedback was not submitted yet. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    window.localStorage.removeItem(BETA_DRAFT_KEY);
    window.localStorage.removeItem(BETA_SUBMITTED_KEY);
    setAnswers({});
    setBugs([]);
    setStep(0);
    setSubmitted(false);
    setError(null);
  };

  if (!hydrated) return null;

  if (submitted) {
    const points = Number(answers.activityPoints ?? calculateActivityPoints(answers, bugs));
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-10 sm:py-16">
          <div className="rounded-[28px] border border-primary/25 bg-surface/80 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-10">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Check className="h-7 w-7" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
              Solaris Studio · Beta 3
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Thank you for testing Beta 3!
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Your feedback is saved. Activity points are based on how much you tested and how useful the feedback
              is, not whether you were positive or negative.
            </p>
            <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-primary/20 bg-primary/[0.07] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Estimated activity points
              </p>
              <p className="mt-1 text-3xl font-black text-primary">{points}</p>
            </div>
            <button
              type="button"
              onClick={restart}
              className="mt-8 min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Submit another response on this device
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-24">
        <header className="mb-6 pt-2 sm:mb-8 sm:pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
                Solaris Studio · Beta 3
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl">
                {isReview ? "Review your Beta 3 feedback" : current.title}
              </h1>
              {!isReview && current.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{current.description}</p>
              ) : null}
            </div>
            <p className="shrink-0 text-xs font-semibold text-muted-foreground">
              {isReview ? "Review" : `${step + 1} of ${betaSections.length}`}
            </p>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${isReview ? 100 : Math.max(progress, 4)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold text-muted-foreground">
            <span>{isReview ? "Ready to submit" : "Your answers save on this device as you go."}</span>
            <span>{isReview ? "100%" : `${progress}%`}</span>
          </div>
        </header>

        {step === 0 ? (
          <div className="mb-6 rounded-2xl border border-border/70 bg-surface/70 p-4 text-sm leading-6 text-muted-foreground sm:p-5">
            <p className="font-semibold text-foreground">
              Beta 3 is a navigation and findability test. It measures whether people can complete real tasks,
              not merely whether the interface looks nice.
            </p>
            <p className="mt-2">
              Open each task in a new tab, complete it as naturally as you can, then return here and record the
              outcome. Search is allowed because finding things efficiently is part of the product.
            </p>
            <p className="mt-2">
              The test records navigation steps, elapsed time, search use and final route through privacy-minimised
              UX telemetry. It does not record search text, votes, messages, form contents or Integrity evidence.
            </p>
            <p className="mt-2">
              Activity points reward the amount and usefulness of testing, never whether your feedback is positive
              or negative.
            </p>
          </div>
        ) : null}

        {isReview ? (
          <BetaReviewScreen answers={answers} bugs={bugs} onEdit={setStep} />
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

        {sectionError ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {sectionError}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="sticky bottom-3 z-30 mt-7 flex gap-3 rounded-2xl border border-border/70 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {isReview ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60 sm:ml-auto sm:flex-none"
            >
              {submitting ? "Submitting…" : "Submit Beta 3 feedback"} <Check className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground sm:ml-auto sm:flex-none"
            >
              {step === betaSections.length - 1 ? "Review answers" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function calculateActivityPoints(answers: BetaAnswers, bugs: BetaBugReport[]) {
  const taskOutcomes = Object.entries(answers).filter(
    ([key, value]) => key.startsWith("beta3") && key.endsWith("Outcome") && typeof value === "string",
  );
  const completed = taskOutcomes.filter(([, value]) => value !== "Could not find it").length;
  let points = 20 + completed * 5;

  for (const bug of bugs) {
    if (!bug.page.trim() || !bug.did.trim() || !bug.expected.trim() || !bug.instead.trim()) continue;
    points += bug.reproducibility === "Every time" ? 5 : 3;
  }

  if (typeof answers.priorityOne === "string" && answers.priorityOne.trim().length >= 20) points += 5;
  if (typeof answers.betterIf === "string" && answers.betterIf.trim().length >= 20) points += 3;

  return Math.min(points, 100);
}
