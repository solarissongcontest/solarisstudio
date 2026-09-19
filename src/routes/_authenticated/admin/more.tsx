import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  Flag,
  History,
  KeyRound,
  ListTree,
  Rocket,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { AdminCard, AdminCardHeader, AdminPageHeader } from "@/components/admin/AdminUI";

export const Route = createFileRoute("/_authenticated/admin/more")({
  head: () => ({ meta: [{ title: "Administration — Solaris Organizer" }] }),
  component: AdministrationAdmin,
});

const groups = [
  {
    title: "People & access",
    items: [
      { label: "Access & permissions", description: "Users, roles, capabilities, access simulation and authorization health.", to: "/admin/access-permissions", icon: KeyRound },
      { label: "Country accounts", description: "Manage who can sign in for each delegation.", to: "/admin/country-accounts", icon: Users },
      { label: "HOD history", description: "See who managed each delegation in past editions.", to: "/admin/hod-history", icon: History },
    ],
  },
  {
    title: "Editions & configuration",
    items: [
      { label: "Manage editions", description: "Create editions and change their main settings.", to: "/admin", icon: Trophy },
      { label: "Edition dates", description: "Set the exact Grand Final or main event date for past editions.", to: "/admin/anniversary-dates", icon: CalendarDays },
      { label: "Feature rollout", description: "See and control which Solaris Studio capabilities are enabled.", to: "/admin/feature-rollout", icon: Rocket },
      { label: "Organizer guide", description: "Plain-language instructions for the main Organizer workflows.", to: "/admin/guide", icon: BookOpen },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Predictions", description: "Create and manage prediction rounds for visitors.", to: "/admin/predictions", icon: Sparkles },
      { label: "Public UX", description: "Review public navigation, search and task-completion telemetry.", to: "/admin/public-ux", icon: BarChart3 },
      { label: "Beta 3 feedback", description: "Review navigation and findability study results.", to: "/admin/beta3-feedback", icon: BarChart3 },
      { label: "Beta 2 feedback", description: "See current public-site usability results and comparisons.", to: "/admin/beta2-feedback", icon: BarChart3 },
      { label: "Beta 1 archive", description: "Read the original closed Beta 1 responses and benchmarks.", to: "/admin/beta1-feedback", icon: History },
    ],
  },
  {
    title: "Quality assurance",
    items: [
      { label: "Organizer acceptance test", description: "Run through the main organizer tasks and record what worked.", to: "/admin/beta-test", icon: ClipboardCheck },
      { label: "Organizer beta coverage", description: "Compare organizer tests, missing checks and reported bugs.", to: "/admin/admin-beta-feedback", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "All Organizer tools", description: "Open the complete categorized directory when you need a specialist page.", to: "/admin/menu", icon: ListTree },
      { label: "System health", description: "Check data synchronization, stale bindings and integration failures.", to: "/admin/sync-health", icon: Settings },
      { label: "System settings", description: "Manage deadlines, audit history and maintenance settings.", to: "/admin/system", icon: Settings },
    ],
  },
] as const;

function AdministrationAdmin() {
  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        eyebrow="Solaris Organizer"
        title="Administration"
        description="Accounts, contest history, diagnostics and other low-frequency organizer tools."
      />

      <div className="space-y-4">
        {groups.map((group) => (
          <AdminCard key={group.title}>
            <AdminCardHeader title={group.title} />
            <div className="divide-y divide-white/[0.07]">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to as any} className="admin-list-row group">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground group-hover:text-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                    </span>
                    <span className="text-muted-foreground">›</span>
                  </Link>
                );
              })}
            </div>
          </AdminCard>
        ))}

        <AdminCard>
          <AdminCardHeader title="Public site" description="Open the public Solaris Studio in a new tab." />
          <Link to="/" target="_blank" className="admin-action-secondary w-full">
            <ExternalLink className="size-4" /> Open public site
          </Link>
        </AdminCard>
      </div>
    </div>
  );
}
