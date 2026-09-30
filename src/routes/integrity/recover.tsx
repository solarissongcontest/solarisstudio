import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp, KeyRound, MessageCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  getAnonymousIntegrityCase,
  replyToAnonymousIntegrityCase,
} from "@/lib/integrity.functions";
import {
  formatIntegrityStatus,
  readAnonymousCasesFromDevice,
  type AnonymousCaseSnapshot,
} from "@/lib/integrity";
import { uploadAnonymousEvidence } from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/recover")({
  head: () => ({
    meta: [
      { title: "Recover Anonymous Integrity Case — Solaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecoverAnonymousCasePage,
});

function RecoverAnonymousCasePage() {
  const recover = useServerFn(getAnonymousIntegrityCase);
  const replyCase = useServerFn(replyToAnonymousIntegrityCase);
  const saved = typeof window === "undefined" ? [] : readAnonymousCasesFromDevice();
  const [caseCode, setCaseCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [snapshot, setSnapshot] = useState<AnonymousCaseSnapshot | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const result = await recover({ data: { caseCode, recoveryKey } });
      if (!result.ok || !result.snapshot) {
        throw new Error(result.error ?? "Case not found");
      }
      setSnapshot(result.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not recover case");
    } finally {
      setBusy(false);
    }
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      const result = await replyCase({
        data: { caseCode, recoveryKey, body: reply.trim() },
      });
      if (!result.ok || !result.snapshot) {
        throw new Error(result.error ?? "Could not send response");
      }
      return result.snapshot;
    },
    onSuccess: (next) => {
      setSnapshot(next);
      setReply("");
      toast.success("Response sent");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send response"),
  });

  const evidenceMutation = useMutation({
    mutationFn: (file: File) =>
      uploadAnonymousEvidence(caseCode, recoveryKey, file),
    onSuccess: (next) => {
      setSnapshot(next as AnonymousCaseSnapshot);
      toast.success("Evidence added");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add evidence"),
  });

  if (snapshot) {
    const status = formatIntegrityStatus(snapshot.case.status);
    const openRequests = snapshot.requests.filter((request) => request.status === "open");

    return (
      <AppShell>
        <div className="mx-auto max-w-4xl pb-20">
          <header className="border-b border-border/65 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-black text-primary">
                {snapshot.case.public_code}
              </span>
              <span className="text-xs font-bold text-emerald-200">{status.label}</span>
              <span className="text-xs text-muted-foreground">Fully anonymous</span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
              {snapshot.case.summary}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {status.description}
            </p>
          </header>

          {openRequests.length ? (
            <section className="mt-5 border-l-2 border-amber-300/50 px-4 py-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-200">
                Needs your attention
              </p>
              {openRequests.map((request) => (
                <div key={request.id} className="mt-2">
                  <p className="text-sm font-semibold">{request.prompt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reply below or add evidence if that is what TSBC requested.
                  </p>
                </div>
              ))}
            </section>
          ) : (
            <p className="mt-5 border-l-2 border-emerald-300/35 px-4 py-2 text-sm text-muted-foreground">
              No action is currently required from you.
            </p>
          )}

          <section className="mt-7" aria-labelledby="anonymous-timeline">
            <h2 id="anonymous-timeline" className="text-lg font-bold">Timeline</h2>
            <div className="mt-3 border-l border-border/70 pl-4">
              {snapshot.events.map((event) => (
                <div key={event.id} className="relative pb-4">
                  <span className="absolute -left-[1.18rem] top-1.5 size-2 rounded-full bg-primary" />
                  <p className="text-sm font-semibold">{humanEvent(event.event_type)}</p>
                  {event.detail ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {event.detail}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold">Your report</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {snapshot.case.details}
              </p>
              {snapshot.case.observed_facts ? (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                    Direct observations
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                    {snapshot.case.observed_facts}
                  </p>
                </div>
              ) : null}
              {snapshot.case.uncertainties ? (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                    Uncertainties
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                    {snapshot.case.uncertainties}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <h2 className="text-lg font-bold">Messages</h2>
              <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                {snapshot.messages.length ? (
                  snapshot.messages.map((message) => (
                    <article key={message.id} className="py-3">
                      <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                        {message.author_role === "reporter" ? "You" : "TSBC"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {message.body}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">No messages yet.</p>
                )}
              </div>

              <label className="mt-4 block">
                <span className="text-sm font-semibold">Reply</span>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={reply.trim().length < 2 || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                <MessageCircle className="size-4" />
                {replyMutation.isPending ? "Sending…" : "Send response"}
              </button>
            </div>
          </section>

          <section className="mt-7" aria-labelledby="anonymous-evidence">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="anonymous-evidence" className="text-lg font-bold">Evidence</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Images are re-encoded before upload where supported, removing common camera and location metadata.
                </p>
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold">
                <FileUp className="size-4" /> Add evidence
                <input
                  type="file"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) evidenceMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
              {snapshot.evidence.length ? (
                snapshot.evidence.map((evidence) => (
                  <div key={evidence.id} className="py-3">
                    <p className="text-sm font-semibold">{evidence.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {evidence.evidence_type} · {evidence.original_name ?? "Protected evidence"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No evidence has been added.</p>
              )}
            </div>
          </section>

          <section className="mt-7" aria-labelledby="anonymous-findings">
            <h2 id="anonymous-findings" className="text-lg font-bold">Findings</h2>
            {snapshot.findings.length ? (
              <div className="mt-3 space-y-4">
                {snapshot.findings.map((finding) => (
                  <article key={finding.id} className="border-l-2 border-primary/35 pl-4">
                    <p className="text-sm font-bold">{finding.summary}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {finding.rationale}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {finding.rule_ids.map((ruleId) => (
                        <Link
                          key={ruleId}
                          to="/rules/$ruleId"
                          params={{ ruleId }}
                          className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 font-mono text-xs font-bold text-primary"
                        >
                          Rule {ruleId}
                        </Link>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No finding has been issued. A report or investigation is not itself a finding of misconduct.
              </p>
            )}
          </section>

          <section className="mt-7 border-t border-border/65 pt-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-emerald-200" />
              Anonymous recovery remains credential-based
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This view was opened with the case code and recovery key. It did not attach the case to a Solaris account.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/integrity/anonymous-appeal"
                className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold"
              >
                Review appeal options
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSnapshot(null);
                  setReply("");
                }}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Recover another case
              </button>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <div className="flex items-center gap-2 text-emerald-200">
            <KeyRound className="size-4" />
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              Trust & Integrity
            </p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Recover an anonymous case
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Anonymous cases are not attached to your Solaris account. The case code and recovery key authenticate access.
          </p>
        </header>

        {saved.length ? (
          <section className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
              Explicitly saved on this device
            </p>
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {saved.map((item) => (
                <button
                  key={item.caseCode}
                  type="button"
                  onClick={() => {
                    setCaseCode(item.caseCode);
                    setRecoveryKey(item.recoveryKey);
                  }}
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="font-mono text-xs font-bold">{item.caseCode}</span>
                  <span className="text-xs font-bold text-primary">Use</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">Case code</span>
            <input
              value={caseCode}
              onChange={(event) => setCaseCode(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Recovery key</span>
            <input
              value={recoveryKey}
              onChange={(event) => setRecoveryKey(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
            />
          </label>
          <button
            type="button"
            disabled={
              caseCode.trim().length < 5 ||
              recoveryKey.trim().length < 12 ||
              busy
            }
            onClick={() => void load()}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Recovering…" : "Open case"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function humanEvent(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
