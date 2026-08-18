import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ExternalLink,
  Flag,
  History,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { AdminCard, AdminCardHeader, AdminPageHeader } from "@/components/admin/AdminUI";

export const Route = createFileRoute("/_authenticated/admin/more")({
  head: () => ({ meta: [{ title: "More — Solaris Organizer" }] }),
  component: MoreAdmin,
});

const groups = [
  {
    title: "Contest management",
    items: [
      { label: "Manage editions", description: "Create editions and manage archive-level edition settings.", to: "/admin", icon: Trophy },
      { label: "Country accounts", description: "Delegation access and country ownership controls.", to: "/admin/country-accounts", icon: Users },
      { label: "Hosting", description: "Host countries, cities and edition hosting details.", to: "/admin/hosts", icon: Flag },
      { label: "HOD history", description: "Historical delegation controllers used by voting analytics.", to: "/admin/hod-history", icon: History },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Predictions", description: "Prediction rounds and audience engagement settings.", to: "/admin/predictions", icon: Sparkles },
      { label: "Beta feedback", description: "Review public beta responses and tester feedback.", to: "/admin/beta-feedback", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "System settings", description: "Deadlines, audit tools and platform-wide organizer settings.", to: "/admin/system", icon: Settings },
      { label: "Sync health", description: "Check edition, confirmation and televoting synchronization.", to: "/admin/sync-health", icon: Settings },
    ],
  },
] as const;

function MoreAdmin() {
  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        eyebrow="Organizer workspace"
        title="More"
        description="Lower-frequency tools live here so the everyday workspace stays focused."
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
