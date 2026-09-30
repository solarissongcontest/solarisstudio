import { createFileRoute, Link } from "@tanstack/react-router";
import { EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { INTEGRITY_IDENTITY_MODES } from "@/lib/integrity";

export const Route = createFileRoute("/integrity/privacy")({
  head: () => ({
    meta: [
      { title: "Integrity Privacy & Anonymity — Solaris" },
      {
        name: "description",
        content: "Compare fully anonymous, sealed and confidential Trust & Integrity reporting modes.",
      },
    ],
  }),
  component: IntegrityPrivacyPage,
});

const MODES = [
  {
    id: "anonymous" as const,
    icon: EyeOff,
    reviewer: "Anonymous",
    account: "Not attached",
    reveal: "Not available from the case",
    recovery: "Case code + recovery key",
  },
  {
    id: "sealed" as const,
    icon: LockKeyhole,
    reviewer: "Identity sealed",
    account: "Used for recovery",
    reveal: "No ordinary reviewer access",
    recovery: "Solaris account",
  },
  {
    id: "confidential" as const,
    icon: ShieldCheck,
    reviewer: "Confidential identity",
    account: "Used for recovery",
    reveal: "Authorised access when necessary",
    recovery: "Solaris account",
  },
];

export function IntegrityPrivacyPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Privacy & anonymity</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose privacy based on what you need to recover later and who should be able to identify the reporter. Solaris should make the trade-off visible before you submit anything sensitive.
          </p>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {MODES.map((mode) => {
            const meta = INTEGRITY_IDENTITY_MODES[mode.id];
            const Icon = mode.icon;
            return (
              <section key={mode.id} className="border-t border-emerald-300/25 pt-4">
                <Icon className="size-5 text-emerald-200" />
                <h2 className="mt-3 text-lg font-bold">{meta.label}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{meta.short}</p>
                <dl className="mt-4 divide-y divide-border/60 border-y border-border/60 text-sm">
                  <PrivacyRow label="Reviewer sees" value={mode.reviewer} />
                  <PrivacyRow label="Account" value={mode.account} />
                  <PrivacyRow label="Identity reveal" value={mode.reveal} />
                  <PrivacyRow label="Recovery" value={mode.recovery} />
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{meta.detail}</p>
              </section>
            );
          })}
        </div>

        <section className="mt-7 border-l-2 border-amber-300/40 px-4 py-2">
          <h2 className="text-sm font-bold">Anonymous does not mean the text cannot identify you</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            A fully anonymous case does not attach a Solaris reporter account, but names, emails, handles, screenshots and document metadata can still reveal identity. The V5 report review runs a conservative local privacy check and never silently redacts what you wrote.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/integrity/report/category" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Report a concern</Link>
          <Link to="/integrity/process" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold">How the process works</Link>
        </div>
      </div>
    </AppShell>
  );
}

function PrivacyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
