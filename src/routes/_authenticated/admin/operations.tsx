import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  Blend,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

import { useAllParticipants, useAllShows, useCountries, useEditions } from "@/lib/data";

type Tool = {
  label: string;
  description: string;
  to: string;
  icon: typeof Gauge;
};

const studioTools: Tool[] = [
  { label: "Studio readiness", description: "Contest-wide warnings, missing setup and operational health.", to: "/admin/control-room", icon: Gauge },
  { label: "Action Centre", description: "Deadlines, warnings and the next organizer actions that need attention.", to: "/admin/action-centre", icon: Bell },
  { label: "Sync Health", description: "Canonical editions, Confirmations links, Televoting projections and unresolved sync drift.", to: "/admin/sync-health", icon: Activity },
  { label: "Manage editions", description: "Create editions and control the canonical Solaris contest structure.", to: "/admin", icon: Trophy },
  { label: "Hosting", description: "Manage host countries, cities and multi-host edition details.", to: "/admin/hosts", icon: Flag },
  { label: "Country accounts", description: "Delegation access, country ownership and organizer intervention controls.", to: "/admin/country-accounts", icon: Users },
  { label: "Predictions", description: "Configure prediction rounds and engagement features.", to: "/admin/predictions", icon: Sparkles },
  { label: "System & audit", description: "Deadlines, admin history and system-level organizer tools.", to: "/admin/system", icon: Settings },
];

const confirmationTools: Tool[] = [
  { label: "Overview", description: "Confirmation activity, active edition and submission-wave status at a glance.", to: "/confirmations/admin", icon: ClipboardCheck },
  { label: "Responses", description: "Review every delegation response in the live Confirmations records.", to: "/confirmations/admin/responses", icon: ClipboardCheck },
  { label: "Rounds", description: "Open and close confirmation waves and control response editing.", to: "/confirmations/admin/rounds", icon: PlayCircle },
  { label: "Edition projection", description: "View Solaris-owned editions and control only Confirmations-specific response editing.", to: "/confirmations/admin/editions", icon: Trophy },
  { label: "Countries", description: "See delegation status, methods and submitted entry information.", to: "/confirmations/admin/countries", icon: Flag },
  { label: "Calendar", description: "Reveal dates, National Finals and round scheduling in one operational timeline.", to: "/confirmations/admin/calendar", icon: CalendarDays },
  { label: "Recovery codes", description: "Admin-only recovery access for delegation responses.", to: "/confirmations/admin/recovery-codes", icon: History },
  { label: "Settings", description: "Confirmations configuration and public-form information.", to: "/confirmations/admin/settings", icon: Settings },
];

const televotingTools: Tool[] = [
  { label: "Overview", description: "Live round, turnout and integrity status for the Televoting system.", to: "/televoting/admin", icon: Vote },
  { label: "Rounds & entries", description: "Bind voting rounds to Solaris shows, inherit canonical entries and keep custom rounds available when needed.", to: "/televoting/admin/rounds", icon: Vote },
  { label: "Edition projection", description: "View the Solaris-owned edition catalog as synchronized Televoting projections.", to: "/televoting/admin/editions", icon: Trophy },
  { label: "Results", description: "Calculate, validate, lock and publish the official converted televote back into Solaris results.", to: "/televoting/admin/results", icon: ListChecks },
  { label: "Combined Results", description: "Merge website rounds, Instagram, external televotes, activity and corrections into one exact point pool.", to: "/televoting/admin/combined", icon: Blend },
  { label: "Analytics", description: "Turnout, delegation behaviour, scoring patterns and performance analysis.", to: "/televoting/admin/analytics", icon: BarChart3 },
  { label: "Intelligence", description: "Anti-abuse detection, technical evidence and friend-voting relationship analysis in one workspace.", to: "/televoting/admin/intelligence", icon: BrainCircuit },
  { label: "Integrity", description: "Inspect individual ballots, moderate risk states, edit ballots and restore/delete submissions.", to: "/televoting/admin/integrity", icon: ShieldAlert },
  { label: "Audit log", description: "Trace organizer moderation and Televoting administrative history.", to: "/televoting/admin/audit-log", icon: History },
];

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Solaris Operations — Control Room" },
      { name: "description", content: "The organizer workspace for Solaris Studio, Confirmations and Televoting." },
    ],
  }),
  component: UnifiedOperations,
});

function Workspace({ eyebrow, title, description, accent, tools }: {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  tools: Tool[];
}) {
  return (
    <section className="glass-strong overflow-hidden p-4 sm:p-6">
      <div className="mb-5 border-b border-white/10 pb-5">
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${accent}`}>{eyebrow}</p>
        <h2 className="font-display mt-2 text-3xl uppercase leading-none sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to as any}
              className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 transition group-hover:text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{tool.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function UnifiedOperations() {
  const { data: editions = [] } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();

  const stats = [
    { label: "Solaris editions", value: editions.length, icon: Trophy },
    { label: "Shows", value: shows.length, icon: Activity },
    { label: "Countries", value: countries.length, icon: Flag },
    { label: "Participants", value: participants.length, icon: Users },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="glass-strong relative overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-300/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-fuchsia-300/[0.07] blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200/15 bg-sky-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/75">
              <LayoutDashboard className="h-3.5 w-3.5" /> Organizer workspace
            </div>
            <h1 className="font-display text-5xl uppercase leading-[0.9] sm:text-6xl lg:text-7xl">Solaris Operations</h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              One control room for contest operations, delegation confirmations and live Televoting. Every workspace uses the same Solaris organizer identity, navigation and visual system.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" target="_blank" className="rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">Public site</Link>
            <Link to="/participate" target="_blank" className="rounded-xl border border-sky-200/15 bg-sky-200/10 px-4 py-2 text-xs font-semibold text-sky-100">Participation portal</Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
                <Icon className="h-3.5 w-3.5 text-sky-100/55" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">{stat.value}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-5 2xl:grid-cols-3">
        <Workspace
          eyebrow="Core contest"
          title="Studio"
          description="Edition structure, publication, broadcast, countries, predictions and organizer readiness."
          accent="text-violet-100/70"
          tools={studioTools}
        />
        <Workspace
          eyebrow="Delegations"
          title="Confirmations"
          description="Review and manage every delegation response, submission wave, release date and recovery path from the Control Room."
          accent="text-pink-100/70"
          tools={confirmationTools}
        />
        <Workspace
          eyebrow="Audience voting"
          title="Televoting"
          description="Voting, conversion, combined sources, analytics and integrity intelligence in the same Solaris Control Room."
          accent="text-sky-100/70"
          tools={televotingTools}
        />
      </div>

      <section className="glass flex flex-col gap-3 p-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200/70" />
          <p className="max-w-4xl leading-relaxed">
            Solaris Operations is the admin front door. Detailed editors stay on focused routes so dense contest tools have enough room, while authentication, navigation and design remain one continuous workspace.
          </p>
        </div>
        <Link to="/admin/control-room" className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-semibold text-foreground">Studio readiness →</Link>
      </section>
    </div>
  );
}