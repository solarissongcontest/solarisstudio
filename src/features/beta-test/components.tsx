import { Check, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

import {
  betaSections,
  formatBetaAnswer,
  isBetaAnswerEmpty,
  isBetaQuestionVisible,
  toggleBetaMulti,
} from "./sections";
import type { BetaAnswer, BetaAnswers, BetaBugReport, BetaQuestion, BetaSection } from "./types";

export function BetaTaskCard({ body, href, linkLabel }: NonNullable<BetaSection["task"]>) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/8 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Task</p>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-foreground">{body}</p>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-surface px-4 text-sm font-semibold text-foreground"
          >
            {linkLabel ?? "Open"} <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function BetaQuestionCard({
  question,
  answers,
  value,
  onChange,
}: {
  question: BetaQuestion;
  answers: BetaAnswers;
  value: BetaAnswer | undefined;
  onChange: (value: BetaAnswer) => void;
}) {
  const options = question.optionsFrom
    ? ((answers[question.optionsFrom] as string[] | undefined) ?? []).filter(
        (option) => option !== "None of these",
      )
    : question.options ?? [];

  return (
    <section className="rounded-2xl border border-border/70 bg-surface/72 p-4 shadow-sm sm:p-5">
      <div className="mb-3">
        <label className="text-sm font-bold leading-5 text-foreground">
          {question.label} {question.required ? <span className="text-primary">*</span> : null}
        </label>
        {question.helper ? (
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{question.helper}</p>
        ) : null}
      </div>

      {question.type === "text" ? (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          className="min-h-12 w-full rounded-xl border border-border bg-background/65 px-3.5 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
      ) : null}

      {question.type === "textarea" ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          rows={4}
          className="w-full resize-y rounded-xl border border-border bg-background/65 px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
      ) : null}

      {question.type === "single" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selected = value === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={choiceClass(selected)}
                aria-pressed={selected}
              >
                <span>{option}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
          {!options.length ? (
            <p className="text-xs text-muted-foreground">
              Choose the relevant items in the previous question first.
            </p>
          ) : null}
        </div>
      ) : null}

      {question.type === "multi" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selectedValues = Array.isArray(value) ? value : [];
            const selected = selectedValues.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(toggleBetaMulti(selectedValues, option))}
                className={choiceClass(selected)}
                aria-pressed={selected}
              >
                <span>{option}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "rating" ? (
        <div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => {
              const selected = value === number;
              return (
                <button
                  key={number}
                  type="button"
                  onClick={() => onChange(number)}
                  className={cn(
                    "min-h-11 rounded-xl border text-sm font-bold transition",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background/55 hover:border-primary/40 hover:bg-surface-strong",
                  )}
                >
                  {number}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-4 text-[10px] font-semibold text-muted-foreground">
            <span>1 · {question.lowLabel}</span>
            <span className="text-right">10 · {question.highLabel}</span>
          </div>
        </div>
      ) : null}

      {question.type === "matrix" ? (
        <div className="space-y-3">
          {(question.rows ?? []).map((row) => {
            const matrix = (
              value && !Array.isArray(value) && typeof value === "object" ? value : {}
            ) as Record<string, string>;
            return (
              <div key={row} className="rounded-xl border border-border/60 bg-background/35 p-3">
                <p className="mb-2 text-xs font-semibold leading-5">{row}</p>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {options.map((option) => {
                    const selected = matrix[row] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onChange({ ...matrix, [row]: option })}
                        className={cn(
                          "min-h-10 rounded-lg border px-2 py-2 text-[11px] font-semibold transition",
                          selected
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function BetaBugReports({
  bugs,
  onChange,
}: {
  bugs: BetaBugReport[];
  onChange: (bugs: BetaBugReport[]) => void;
}) {
  useEffect(() => {
    if (!bugs.length) onChange([newBetaBug()]);
  }, [bugs.length, onChange]);

  const patch = (id: string, changes: Partial<BetaBugReport>) =>
    onChange(bugs.map((bug) => (bug.id === id ? { ...bug, ...changes } : bug)));

  return (
    <div className="space-y-4">
      {bugs.map((bug, index) => (
        <section
          key={bug.id}
          className="rounded-2xl border border-primary/25 bg-surface/75 p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
                Bug report
              </p>
              <h3 className="mt-1 text-lg font-black">Bug {index + 1}</h3>
            </div>
            {bugs.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(bugs.filter((item) => item.id !== bug.id))}
                className="grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground"
                aria-label={`Remove bug ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="grid gap-3">
            <BugField label="PAGE — where were you?" value={bug.page} onChange={(value) => patch(bug.id, { page: value })} />
            <BugField label="I DID — what did you click / change / open?" value={bug.did} onChange={(value) => patch(bug.id, { did: value })} />
            <BugField label="I EXPECTED — what should have happened?" value={bug.expected} onChange={(value) => patch(bug.id, { expected: value })} />
            <BugField label="INSTEAD — what actually happened?" value={bug.instead} onChange={(value) => patch(bug.id, { instead: value })} />

            <div className="grid gap-3 sm:grid-cols-2">
              <BugSelect
                label="Can you make it happen again?"
                value={bug.reproducibility}
                options={["Every time", "Sometimes", "Only happened once", "Haven't tried"]}
                onChange={(value) => patch(bug.id, { reproducibility: value })}
              />
              <BugSelect
                label="How serious is it?"
                value={bug.severity}
                options={[
                  "Tiny visual problem",
                  "Annoying but usable",
                  "Makes a feature difficult to use",
                  "Feature doesn't work",
                  "Major problem / blocks normal use",
                ]}
                onChange={(value) => patch(bug.id, { severity: value })}
              />
            </div>

            <label className="flex min-h-12 cursor-pointer flex-col justify-center gap-1 rounded-xl border border-dashed border-border bg-background/40 px-3.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {bug.file ? bug.file.name : "Optional screenshot"}
              </span>
              <span className="text-[10px] text-muted-foreground">PNG/JPG/WebP/GIF · max 8 MB</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => patch(bug.id, { file: event.target.files?.[0] })}
              />
            </label>
            {bug.file ? (
              <p className="text-[10px] text-muted-foreground">
                Screenshots cannot survive a browser refresh, so reattach it if you refresh before submitting.
              </p>
            ) : null}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => onChange([...bugs, newBetaBug()])}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" /> Report another bug
      </button>
    </div>
  );
}

export function BetaReviewScreen({
  answers,
  bugs,
  onEdit,
}: {
  answers: BetaAnswers;
  bugs: BetaBugReport[];
  onEdit: (step: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-surface/70 p-4 text-sm text-muted-foreground">
        Check the important bits. Optional unanswered questions are left alone rather than being treated like a moral failure.
      </div>
      {betaSections.map((section, index) => {
        const visible = section.questions.filter((question) => isBetaQuestionVisible(question, answers));
        return (
          <section key={section.id} className="rounded-2xl border border-border/70 bg-surface/72 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-black">{section.title}</h2>
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="min-h-10 rounded-xl border border-border bg-background/55 px-3 text-xs font-bold"
              >
                Edit
              </button>
            </div>
            <div className="mt-3 divide-y divide-border/55">
              {visible.map((question) => (
                <ReviewRow key={question.id} label={question.label} value={answers[question.id]} />
              ))}
              {section.id === "bugs" && answers.bugsFound !== "No" ? (
                <ReviewRow
                  label="Structured bug reports"
                  value={`${bugs.length} report${bugs.length === 1 ? "" : "s"}`}
                />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: BetaAnswer | string | undefined }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-5">
      <p className="text-xs font-semibold leading-5 text-muted-foreground">{label}</p>
      <p
        className={cn(
          "break-words text-xs leading-5 sm:text-right",
          isBetaAnswerEmpty(value as BetaAnswer | undefined)
            ? "italic text-muted-foreground/60"
            : "text-foreground",
        )}
      >
        {formatBetaAnswer(value)}
      </p>
    </div>
  );
}

function BugField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function BugSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm"
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function choiceClass(selected: boolean) {
  return cn(
    "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition",
    selected
      ? "border-primary bg-primary/12 text-foreground ring-1 ring-primary/20"
      : "border-border bg-background/45 text-foreground hover:border-primary/35 hover:bg-surface-strong",
  );
}

export function newBetaBug(): BetaBugReport {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    page: "",
    did: "",
    expected: "",
    instead: "",
    reproducibility: "",
    severity: "",
  };
}
