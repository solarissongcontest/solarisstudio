import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  ExternalLink,
  RadioTower,
  Settings2,
  Trophy,
} from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/AdminUI";
import { useEditions } from "@/lib/data";
import { useAdminContext } from "@/components/admin/AdminContext";

export const Route = createFileRoute("/_authenticated/admin/menu")({
  head: () => ({ meta: [{ title: "Menu — Solaris Organizer" }] }),
  component: OrganizerMenu,
});

function OrganizerMenu() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const broadcastHref = activeEdition ? `/admin/design/${activeEdition.slug}` : "/admin";

  const items = [
    {
      label: "Delegations",
      description: "Responses, submission rounds, calendar and delegation access.",
      to: "/confirmations/admin",
      icon: ClipboardCheck,
    },
    {
      label: "Broadcast",
      description: "Edition design, scoreboard and live presentation settings.",
      to: broadcastHref,
      icon: RadioTower,
    },
    {
      label: "Administration",
      description: "Accounts, HOD history, predictions, diagnostics and system tools.",
      to: "/admin/more",
      icon: Settings2,
    },
    {
      label: "All editions",
      description: "Create, archive and switch between SSC editions.",
      to: "/admin",
      icon: Trophy,
    },
    {
      label: "Organizer guide",
      description: "Find instructions for the main organizer workflows.",
      to: "/admin/guide",
      icon: BookOpen,
    },
  ] as const;

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        eyebrow="Solaris Organizer"
        title="Menu"
        description="Everything that does not need a permanent place in the mobile bottom bar."
        actions={
          <Link to="/" target="_blank" className="admin-action-secondary">
            <ExternalLink className="size-4" /> Public site
          </Link>
        }
      />

      <AdminCard>
        <div className="divide-y divide-white/[0.07]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} to={item.to as any} className="admin-list-row group">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
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
    </div>
  );
}
