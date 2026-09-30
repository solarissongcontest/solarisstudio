import { Link } from "@tanstack/react-router";
import {
  CircleHelp,
  FolderSearch2,
  LogOut,
  Scale,
  Settings,
  ShieldCheck,
  Tv2,
  UserRound,
  X,
} from "lucide-react";

import { SheetClose } from "@/components/ui/sheet";
import type { AccountAccess } from "@/lib/country-account";

const LINKS = [
  { to: "/show-mode", label: "Show Mode", icon: Tv2 },
  { to: "/site-directory", label: "All Solaris pages", icon: FolderSearch2 },
  { to: "/guide", label: "Help", icon: CircleHelp },
  { to: "/rules", label: "Rules", icon: Scale },
  { to: "/integrity", label: "Trust & Integrity", icon: ShieldCheck },
] as const;

export function AppMoreNavigation({
  signedIn,
  access,
  onSignOut,
}: {
  signedIn: boolean;
  access: AccountAccess;
  onSignOut: () => void;
}) {
  return (
    <div className="solaris-app-more">
      <div className="solaris-app-more-header">
        <div>
          <p className="solaris-app-more-eyebrow">Solaris Studio</p>
          <h2 className="text-xl font-semibold">More</h2>
        </div>
        <SheetClose asChild>
          <button type="button" className="solaris-app-sheet-close" aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </SheetClose>
      </div>

      <nav
        className="mt-5 grid gap-2"
        aria-label="More Solaris Studio destinations"
      >
        {LINKS.map(({ to, label, icon: Icon }) => (
          <SheetClose asChild key={to}>
            <Link to={to as any} className="solaris-app-more-link">
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </SheetClose>
        ))}

        <SheetClose asChild>
          <Link to="/settings" className="solaris-app-more-link">
            <Settings className="size-4" aria-hidden="true" />
            <span>App Settings</span>
          </Link>
        </SheetClose>

        {signedIn ? (
          <SheetClose asChild>
            <Link to="/my-solaris/account" className="solaris-app-more-link">
              <UserRound className="size-4" aria-hidden="true" />
              <span>Account & security</span>
            </Link>
          </SheetClose>
        ) : null}

        {access.isOrganizer ? (
          <SheetClose asChild>
            <Link to="/admin/action-center" className="solaris-app-more-link">
              <UserRound className="size-4" aria-hidden="true" />
              <span>Organizer</span>
            </Link>
          </SheetClose>
        ) : null}
      </nav>

      <div className="mt-5 border-t border-border/70 pt-4">
        {signedIn ? (
          <button type="button" onClick={onSignOut} className="solaris-app-more-link w-full">
            <LogOut className="size-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        ) : (
          <SheetClose asChild>
            <Link to="/auth" className="solaris-app-more-primary">
              Sign in to Solaris
            </Link>
          </SheetClose>
        )}
      </div>
    </div>
  );
}
