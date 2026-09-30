import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { getAnonymousIntegrityCase } from "@/lib/integrity.functions";
import {
  formatIntegrityStatus,
  readAnonymousCasesFromDevice,
  type AnonymousCaseSnapshot,
} from "@/lib/integrity";

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
  const saved = typeof window === "undefined" ? [] : readAnonymousCasesFromDevice();
  const [caseCode, setCaseCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [snapshot, setSnapshot] = useState<AnonymousCaseSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const result = await recover({ data: { caseCode, recoveryKey } });
      if (!result.ok || !result.snapshot) throw new Error(result.error ?? "Case not found");
      setSnapshot(result.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not recover case");
    } finally {
      setBusy(false);
    }
  };

  if (snapshot) {
    const status = formatIntegrityStatus(snapshot.case.status);
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl pb-20">
          <header className="border-b border-border/65 pb-5">
            <p className="font-mono text-xs font-black text-primary">{snapshot.case.public_code}</p>
            <h1 className="mt-2 text-3xl font-black">{snapshot.case.summary}</h1>
            <p className="mt-2 text-sm font-semibold text-emerald-200">{status.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{status.description}</p>
          </header>
          <section className="mt-6">
            <h2 className="text-lg font-bold">Messages</h2>
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {snapshot.messages.length ? snapshot.messages.map((message) => (
                <article key={message.id} className="py-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">{message.author_role === "reporter" ? "You" : "TSBC"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                </article>
              )) : <p className="py-4 text-sm text-muted-foreground">No messages yet.</p>}
            </div>
          </section>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/integrity/anonymous-appeal" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold">Anonymous appeal</Link>
            <button type="button" onClick={() => setSnapshot(null)} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Recover another case</button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Recover an anonymous case</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Anonymous cases are not attached to your Solaris account. The case code and recovery key authenticate access.
          </p>
        </header>

        {saved.length ? (
          <section className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">Saved on this device</p>
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
            <input value={caseCode} onChange={(event) => setCaseCode(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Recovery key</span>
            <input value={recoveryKey} onChange={(event) => setRecoveryKey(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm" />
          </label>
          <button
            type="button"
            disabled={caseCode.trim().length < 5 || recoveryKey.trim().length < 12 || busy}
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
