import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  formatIntegrityStatus,
  getIntegrityCategory,
  readAnonymousCasesFromDevice,
  type AnonymousCaseCredential,
} from "@/lib/integrity";
import {
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/cases/")({
  head: () => ({
    meta: [
      { title: "My Integrity Cases — Solaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityCasesPage,
});

function IntegrityCasesPage() {
  const user = useQuery({ queryKey: ["integrity-user", "cases-v5"], queryFn: getCurrentIntegrityUser });
  const cases = useQuery({
    queryKey: ["integrity-protected-cases", "cases-v5"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(user.data),
  });
  const [anonymous, setAnonymous] = useState<AnonymousCaseCredential[]>([]);

  useEffect(() => setAnonymous(readAnonymousCasesFromDevice()), []);

  const protectedCases = cases.data ?? [];
  const attention = protectedCases.filter((item) => item.status === "waiting_for_reporter");
  const others = protectedCases.filter((item) => item.status !== "waiting_for_reporter");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">My cases</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cases needing your action appear first. Protected cases use your Solaris account; fully anonymous cases remain separate.
          </p>
        </header>

        {attention.length ? (
          <section className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-200">Needs your attention</p>
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {attention.map((item) => <ProtectedCaseRow key={item.id} item={item} />)}
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Protected cases</p>
          {!user.isLoading && !user.data ? (
            <div className="mt-2 border-y border-border/60 py-5">
              <p className="text-sm text-muted-foreground">Sign in to see sealed and confidential cases attached to your account.</p>
              <Link to="/auth" className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-primary">Sign in</Link>
            </div>
          ) : cases.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading cases…</p>
          ) : others.length ? (
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {others.map((item) => <ProtectedCaseRow key={item.id} item={item} />)}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No other protected cases.</p>
          )}
        </section>

        <section className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Anonymous cases on this device</p>
          {anonymous.length ? (
            <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {anonymous.map((item) => (
                <div key={item.caseCode} className="flex min-h-16 items-center gap-3 py-3">
                  <KeyRound className="size-4.5 shrink-0 text-emerald-200" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-foreground">{item.caseCode}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recovery details were explicitly saved on this device.
                    </p>
                  </div>
                  <Link
                    to="/integrity/recover"
                    className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-bold"
                  >
                    Recover
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No anonymous recovery details are saved on this device.</p>
          )}
          <Link
            to="/integrity/recover"
            className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary"
          >
            <KeyRound className="size-4" /> Recover another anonymous case
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

function ProtectedCaseRow({ item }: { item: Awaited<ReturnType<typeof listProtectedIntegrityCases>>[number] }) {
  const status = formatIntegrityStatus(item.status);
  const category = getIntegrityCategory(item.category);
  return (
    <Link
      to="/integrity/cases/$caseId"
      params={{ caseId: item.id }}
      className="flex min-h-20 items-center gap-3 py-4"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface/55 text-primary">
        <LockKeyhole className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-black text-primary">{item.public_code}</span>
          <span className="text-xs font-semibold">{status.label}</span>
        </span>
        <span className="mt-1 block text-sm font-semibold">{item.summary}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{category.label}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
