import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Gavel,
  KeyRound,
  MessageCircleQuestion,
  ShieldCheck,
  Siren,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  readAnonymousCasesFromDevice,
  type ProtectedCaseListItem,
} from "@/lib/integrity";
import {
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";

export function IntegrityHomeV5() {
  const user = useQuery({ queryKey: ["integrity-user", "home-v5"], queryFn: getCurrentIntegrityUser });
  const cases = useQuery({
    queryKey: ["integrity-protected-cases", "home-v5"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(user.data),
  });
  const [anonymousCount, setAnonymousCount] = useState(0);

  useEffect(() => {
    setAnonymousCount(readAnonymousCasesFromDevice().length);
  }, []);

  const attention = useMemo(
    () =>
      (cases.data ?? []).find(
        (item: ProtectedCaseListItem) => item.status === "waiting_for_reporter",
      ) ?? null,
    [cases.data],
  );
  const openCount = (cases.data ?? []).filter(
    (item: ProtectedCaseListItem) => !item.status.startsWith("closed"),
  ).length + anonymousCount;

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <header className="border-b border-border/65 pb-5">
        <div className="flex items-center gap-2 text-emerald-200">
          <ShieldCheck className="size-4" />
          <p className="text-xs font-black uppercase tracking-[0.12em]">Trust & Integrity</p>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Report a concern, get private rule guidance, follow an existing case or challenge an eligible decision.
        </p>
      </header>

      {attention ? (
        <section className="mt-5 border-l-2 border-amber-300/50 bg-amber-300/[0.04] px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-200">Needs your attention</p>
          <h2 className="mt-2 text-lg font-bold">{attention.public_code}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            TSBC requested more information for this case.
          </p>
          <Link
            to="/integrity/cases/$caseId"
            params={{ caseId: attention.id }}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-amber-200 px-4 text-sm font-bold text-slate-950"
          >
            Respond
          </Link>
        </section>
      ) : null}

      <section className="mt-6">
        <Link
          to="/integrity/report/category"
          search={{}}
          className="flex min-h-24 items-center gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.055] p-4"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
            <ShieldCheck className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">Report a concern</span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              Tell TSBC about something that may need review. You do not need to identify the rule yourself.
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>

      <section className="mt-6" aria-label="Trust and Integrity services">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <IntegrityLink
            to="/integrity/cases"
            icon={Users}
            title={openCount ? `My cases · ${openCount}` : "Follow or recover a case"}
            description="See updates, requests, evidence, findings and decisions."
          />
          <IntegrityLink
            to="/integrity/preclearance"
            icon={MessageCircleQuestion}
            title="Ask before acting"
            description="Get private rule guidance when the published rule does not fully answer your situation."
          />
          <IntegrityLink
            to="/integrity/appeals"
            icon={Gavel}
            title="Appeal a decision"
            description="Request fresh review of an eligible Integrity decision."
          />
        </div>
      </section>

      <section className="mt-6 border-l-2 border-rose-300/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <Siren className="mt-0.5 size-4.5 shrink-0 text-rose-200" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Urgent safety or privacy concern</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Threats, doxxing, privacy exposure and serious participant-safety concerns use a dedicated reporting context.
            </p>
            <Link
              to="/integrity/report/category"
              search={{ category: "safety" }}
              className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-rose-200"
            >
              Start safety report <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">About Trust & Integrity</p>
        <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
          <IntegrityLink to="/integrity/process" icon={ShieldCheck} title="How the process works" description="Reporting, review, findings, action and appeals." />
          <IntegrityLink to="/integrity/privacy" icon={KeyRound} title="Privacy & anonymity" description="Compare anonymous, sealed and confidential reporting." />
          <IntegrityLink to="/integrity/decisions" icon={Gavel} title="Published decisions" description="Read anonymised precedents and transparency information." />
        </div>
      </section>
    </div>
  );
}

function IntegrityLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <Link to={to as any} className="flex min-h-16 items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface/55 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
