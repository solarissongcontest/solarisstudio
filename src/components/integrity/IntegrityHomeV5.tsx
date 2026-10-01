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
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
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
    <SolarisDepthPage tone="integrity">
      <SolarisDepthSafeZone>
        <header>
          <SolarisDepthEyebrow tone="integrity">Trust & Integrity</SolarisDepthEyebrow>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.025em]">What do you need help with?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Report a concern, get private rule guidance, follow a case or challenge an eligible decision.
          </p>
          <GovernanceStatusStrip context="integrity" className="mt-3" />
        </header>
      </SolarisDepthSafeZone>

      {attention ? (
        <SolarisDepthSafeZone className="mt-5">
          <SolarisDepthSurface variant="action" className="border-amber-300/20">
            <SolarisDepthEyebrow tone="urgent">Needs your attention</SolarisDepthEyebrow>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-mono text-sm font-bold">{attention.public_code}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  TSBC requested more information for this case.
                </p>
              </div>
              <Link
                to="/integrity/cases/$caseId"
                params={{ caseId: attention.id }}
                className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-amber-200 px-3 text-xs font-bold text-slate-950"
              >
                Respond
              </Link>
            </div>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      ) : null}

      <SolarisDepthSafeZone className="mt-6">
        <Link to="/integrity/report/category" search={{ category: undefined }} className="block">
          <SolarisDepthSurface variant="action" className="border-emerald-300/20">
            <div className="flex items-center gap-4">
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
            </div>
          </SolarisDepthSurface>
        </Link>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-5">
        <SolarisDepthSurface variant="reading" className="!py-1">
          <IntegrityLink
            to="/integrity/cases"
            icon={Users}
            title={openCount ? `My cases · ${openCount}` : "Follow or recover a case"}
            description="Updates, requests, evidence, findings and decisions."
          />
          <IntegrityLink
            to="/integrity/preclearance"
            icon={MessageCircleQuestion}
            title="Ask before acting"
            description="Get private guidance when the published rule does not fully answer your situation."
          />
          <IntegrityLink
            to="/integrity/appeals"
            icon={Gavel}
            title="Appeal a decision"
            description="Request fresh review of an eligible Integrity decision."
          />
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-6">
        <SolarisDepthEyebrow tone="urgent">Urgent</SolarisDepthEyebrow>
        <Link to="/integrity/report/category" search={{ category: "safety" }} className="mt-2 block">
          <SolarisDepthSurface variant="quiet" className="border-rose-300/15">
            <div className="flex items-center gap-3">
              <Siren className="size-4.5 shrink-0 text-rose-200" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Safety or privacy concern</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Threats, doxxing, sensitive information or participant safety.
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          </SolarisDepthSurface>
        </Link>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-7">
        <SolarisDepthEyebrow>About</SolarisDepthEyebrow>
        <SolarisDepthSurface variant="reading" className="mt-2 !py-1">
          <IntegrityLink to="/integrity/process" icon={ShieldCheck} title="How the process works" description="Reporting, review, findings, action and appeals." />
          <IntegrityLink to="/integrity/privacy" icon={KeyRound} title="Privacy & anonymity" description="Anonymous, sealed and confidential reporting." />
          <IntegrityLink to="/integrity/decisions" icon={Gavel} title="Published decisions" description="Anonymised precedent and transparency information." />
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>
    </SolarisDepthPage>
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
    <Link to={to as any} className="solaris-depth-row">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-emerald-200">
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
