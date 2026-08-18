import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, FileText, Flag, KeyRound, Layers3, Settings2, SlidersHorizontal } from "lucide-react";

import { AdminMoreMenu } from "@/components/admin/AdminUI";
import { cn } from "@/lib/utils";

const primary = [
  { to: "/confirmations/admin", label: "Overview" },
  { to: "/confirmations/admin/responses", label: "Responses" },
  { to: "/confirmations/admin/countries", label: "Countries" },
] as const;

const secondary = [
  {
    to: "/confirmations/admin/rounds",
    label: "Submission rounds",
    description: "Open, close and schedule confirmation waves.",
    icon: Layers3,
  },
  {
    to: "/confirmations/admin/calendar",
    label: "Calendar",
    description: "Reveal dates, National Finals and deadlines.",
    icon: CalendarDays,
  },
  {
    to: "/confirmations/admin/editions",
    label: "Confirmation editions",
    description: "Advanced Confirmations edition settings.",
    icon: SlidersHorizontal,
  },
  {
    to: "/confirmations/admin/recovery-codes",
    label: "Recovery access",
    description: "Help a delegation regain access to its response.",
    icon: KeyRound,
  },
  {
    to: "/confirmations/admin/settings",
    label: "Advanced settings",
    description: "Editing and public-form configuration.",
    icon: Settings2,
  },
] as const;

export function ConfirmationsAdminNav({ current }: { current?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activePath = current ?? pathname;

  return (
    <div className="mb-5 flex min-w-0 items-center gap-2">
      <nav
        aria-label="Delegations sections"
        className="grid min-w-0 flex-1 grid-cols-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1"
      >
        {primary.map((item) => {
          const active =
            item.to === "/confirmations/admin"
              ? activePath === item.to || activePath === `${item.to}/`
              : activePath.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-10 min-w-0 items-center justify-center rounded-lg px-2 text-center text-xs font-semibold transition",
                active
                  ? "bg-sky-200/[0.09] text-sky-100 shadow-[inset_0_0_0_1px_rgba(186,230,253,.08)]"
                  : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <AdminMoreMenu
        label="More delegation tools"
        title="Delegation tools"
        description="Rounds, calendar and lower-frequency support tools."
      >
        <div className="divide-y divide-white/[0.07]">
          {secondary.map(({ to, label, description, icon: Icon }) => (
            <Link key={to} to={to} className="admin-action-row">
              <span className="admin-action-row-icon">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </AdminMoreMenu>
    </div>
  );
}

export function DelegationQuickLink({
  to,
  title,
  description,
}: {
  to: "/confirmations/admin/responses" | "/confirmations/admin/countries" | "/confirmations/admin/rounds";
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="admin-action-row">
      <span className="admin-action-row-icon">
        {to.endsWith("responses") ? <FileText className="size-4" /> : to.endsWith("countries") ? <Flag className="size-4" /> : <Layers3 className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
