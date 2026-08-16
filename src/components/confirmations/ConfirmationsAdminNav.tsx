import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  Flag,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { to: "/confirmations/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/confirmations/admin/responses", label: "Responses", icon: FileText },
  { to: "/confirmations/admin/rounds", label: "Rounds", icon: Layers3 },
  { to: "/confirmations/admin/editions", label: "Editions", icon: SlidersHorizontal },
  { to: "/confirmations/admin/countries", label: "Countries", icon: Flag },
  { to: "/confirmations/admin/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/confirmations/admin/recovery-codes", label: "Recovery", icon: KeyRound },
  { to: "/confirmations/admin/settings", label: "Settings", icon: Settings2 },
] as const;

export function ConfirmationsAdminNav({ current }: { current?: string }) {
  return (
    <nav className="mb-7 flex gap-2 overflow-x-auto pb-1" aria-label="Confirmations admin">
      {items.map(({ to, label, icon: Icon }) => {
        const active = current === to;
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs transition",
              active
                ? "border-sky-200/25 bg-sky-200/10 text-sky-100"
                : "border-white/10 bg-white/[0.035] text-white/50 hover:border-white/20 hover:text-white",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
