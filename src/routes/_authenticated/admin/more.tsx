import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
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
      { label: "Manage editions", description: "Create editions and change their main settings.", to: "/admin", icon: Trophy },
      { label: "Country accounts", description: "See and manage who can sign in for each country.", to: "/admin/country-accounts", icon: Users },
      { label: "Hosting", description: "Set host countries, host cities and other hosting details.", to: "/admin/hosts", icon: Flag },
      { label: "HOD history", description: "See who managed each country in past editions.", to: "/admin/hod-history", icon: History },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Predictions", description: "Create and manage prediction rounds for visitors.", to: "/admin/predictions", icon: Sparkles },
      { label: "Public beta feedback", description: "Read feedback sent by public-site testers.", to: "/admin/beta-feedback", icon: BarChart3 },
    ],
  },
  {
    title: "Quality assurance",
    items: [
      { label: "Admin acceptance test", description: "Run through the main organizer tasks and record what worked.", to: "/admin/beta-test", icon: ClipboardCheck },
      { label: "Admin beta coverage", description: "Compare recent organizer tests, missing checks and reported bugs.", to: "/admin/admin-beta-feedback", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "System settings", description: "Manage deadlines, site-wide settings and maintenance tools.", to: "/admin/system", icon: Settings },
      { label: "Sync health", description: "Check whether editions, confirmations and televoting are working together.", to: "/admin/sync-health", icon: Settings },
    ],
  },
] as const;

function MoreAdmin() {
  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        eyebrow="Organizer workspace"
        title="More"
        description="Pages you use less often are kept here so the main organizer pages stay focused."
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
