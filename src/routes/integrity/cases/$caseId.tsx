import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  FileUp,
  Gavel,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { formatIntegrityStatus, getIntegrityCategory } from "@/lib/integrity";
import {
  getProtectedIntegrityCase,
  getProtectedIntegrityResolution,
  replyProtectedIntegrityCase,
  uploadProtectedEvidence,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Integrity Case — Solaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProtectedIntegrityCasePage,
});

function ProtectedIntegrityCasePage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const caseQuery = useQuery({
    queryKey: ["integrity-protected-case", caseId],
    queryFn: () => getProtectedIntegrityCase(caseId),
  });
  const resolution = useQuery({
    queryKey: ["integrity-protected-resolution", caseId],
    queryFn: () => getProtectedIntegrityResolution(caseId),
  });

  const replyMutation = useMutation({
    mutationFn: () => replyProtectedIntegrityCase(caseId, reply.trim()),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["integrity-protected-case", caseId], snapshot);
      setReply("");
      toast.success("Response sent");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send response"),
  });

  const evidenceMutation = useMutation({
    mutationFn: (file: File) => uploadProtectedEvidence(caseId, file),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["integrity-protected-case", caseId], snapshot);
      toast.success("Evidence added");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add evidence"),
  });

  if (caseQuery.isLoading) {
    return <AppShell><p className="py-10 text-sm text-muted-foreground">Loading protected case…</p></AppShell>;
  }
  if (caseQuery.isError || !caseQuery.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <h1 className="text-2xl font-black">This case is not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with the Solaris account that owns the protected case.</p>
          <Link to="/integrity/cases" className="mt-4 inline-flex text-sm font-bold text-primary">My cases</Link>
        </div>
      </AppShell>
    );
  }

  const snapshot = caseQuery.data;
  const item = snapshot.case;
  const status = formatIntegrityStatus(item.status);
  const category = getIntegrityCategory(item.category);
  const waiting = item.status === "waiting_for_reporter";
  const activeSanctions = (resolution.data?.sanctions ?? []).filter((sanction) => sanction.status === "active");
  const appealed = new Set((resolution.data?.appeals ?? []).map((appeal) => appeal.sanction_id));

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-black text-primary">{item.public_code}</span>
            <span className={waiting ? "text-xs font-bold text-amber-200" : "text-xs font-bold text-emerald-200"}>
              {status.label}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{item.summary}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{category.label} · {item.identity_mode === "sealed" ? "Sealed identity" : "Confidential"}</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{status.description}</p>
        </header>

        {waiting ? (
          <section className="mt-5 border-l-2 border-amber-300/50 px-4 py-2">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-200">Needs your attention</p>
            <h2 className="mt-1 text-lg font-bold">TSBC requested more information</h2>
            <p className="mt-1 text-sm text-muted-foreground">Respond below. Your existing report and evidence remain unchanged.</p>
          </section>
        ) : (
          <p className="mt-5 border-l-2 border-emerald-300/35 px-4 py-2 text-sm text-muted-foreground">
            No action is currently required from you.
          </p>
        )}

        <section className="mt-7" aria-labelledby="case-timeline">
          <h2 id="case-timeline" className="text-lg font-bold">Timeline</h2>
          <div className="mt-3 border-l border-border/70 pl-4">
            {snapshot.events.map((event) => (
              <div key={event.id} className="relative pb-4">
                <span className="absolute -left-[1.18rem] top-1.5 size-2 rounded-full bg-primary" />
                <p className="text-sm font-semibold">{humanEvent(event.event_type)}</p>
                {event.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7 grid gap-5 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold">Your report</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.details}</p>
            {item.observed_facts ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">Direct observations</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.observed_facts}</p>
              </div>
            ) : null}
            {item.uncertainties ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">Uncertainties</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.uncertainties}</p>
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="text-lg font-bold">Messages</h2>
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {snapshot.messages.length ? snapshot.messages.map((message) => (
                <article key={message.id} className="py-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                    {message.author_role === "reporter" ? "You" : "TSBC"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                </article>
              )) : <p className="py-4 text-sm text-muted-foreground">No messages yet.</p>}
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
              <MessageCircle className="size-4" /> {replyMutation.isPending ? "Sending…" : "Send response"}
            </button>
          </div>
        </section>

        <section className="mt-7" aria-labelledby="case-evidence">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="case-evidence" className="text-lg font-bold">Evidence</h2>
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
            {snapshot.evidence.length ? snapshot.evidence.map((evidence) => (
              <div key={evidence.id} className="py-3">
                <p className="text-sm font-semibold">{evidence.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{evidence.evidence_type} · {evidence.original_name ?? "Protected evidence"}</p>
              </div>
            )) : <p className="py-4 text-sm text-muted-foreground">No evidence has been added.</p>}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="case-findings">
          <h2 id="case-findings" className="text-lg font-bold">Findings</h2>
          {snapshot.findings.length ? (
            <div className="mt-3 space-y-4">
              {snapshot.findings.map((finding) => (
                <article key={finding.id} className="border-l-2 border-primary/35 pl-4">
                  <p className="text-sm font-bold">{finding.summary}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{finding.rationale}</p>
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
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">No finding has been issued. A report or investigation is not itself a finding of misconduct.</p>
              <RulesApplyingHere context="integrity.report" primaryLimit={1} className="mt-4" />
            </div>
          )}
        </section>

        {activeSanctions.length ? (
          <section className="mt-7" aria-labelledby="case-decisions">
            <h2 id="case-decisions" className="text-lg font-bold">Decision & your options</h2>
            <div className="mt-3 space-y-3">
              {activeSanctions.map((sanction) => (
                <article key={sanction.id} className="border-t border-border/65 pt-4">
                  <div className="flex items-start gap-3">
                    <Gavel className="mt-0.5 size-4.5 shrink-0 text-amber-200" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{sanction.sanction_label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{sanction.rationale}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Appeal deadline: {new Date(sanction.appeal_deadline).toLocaleString()}</p>
                      {!appealed.has(sanction.id) ? (
                        <Link
                          to="/integrity/appeal/$caseId"
                          params={{ caseId }}
                          className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary"
                        >
                          Appeal this decision <ArrowRight className="size-3.5" />
                        </Link>
                      ) : (
                        <p className="mt-2 text-xs font-semibold text-emerald-200">Appeal submitted</p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {item.identity_mode === "sealed" ? (
          <section className="mt-7 border-t border-border/65 pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-emerald-200" /> Identity protection · Sealed</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ordinary reviewers cannot reveal a sealed reporter identity. Any exceptional identity-access event is recorded through the separate break-glass process.
            </p>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function humanEvent(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/w/g, (letter) => letter.toUpperCase());
}
