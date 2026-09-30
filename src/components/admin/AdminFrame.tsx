import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Inbox,
  LayoutDashboard,
  Layers3,
  MoreHorizontal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { DelegationColourOverview } from "@/components/confirmations/DelegationColourOverview";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { useEditions } from "@/lib/data";
import {
  consumeOrganizerNavigationRestore,
  getOrganizerSectionDestination,
  markOrganizerNavigationRestore,
  organizerSectionForPath,
  rememberOrganizerLocation,
  resetOrganizerSection,
  updateOrganizerScroll,
  type OrganizerSectionId,
} from "@/lib/organizer-navigation";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
import { AdminFeatureBoundary } from "./AdminFeatureBoundary";
import { AdminNav } from "./AdminNav";
import { AdminSectionNav } from "./AdminSectionNav";

type MobileItem = {
  section: OrganizerSectionId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export function AdminFrame({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAppMode } = useSolarisApp();
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const scrollFrame = useRef<number | null>(null);

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const slug = activeEdition?.slug;
  const editionHref = slug ? `/admin/${slug}` : "/admin";
  const editionContextKey = activeEdition?.id ?? null;

  const mobileItems: MobileItem[] = [
    {
      section: "home",
      label: "Home",
      href: "/admin/operations",
      icon: LayoutDashboard,
    },
    {
      section: "inbox",
      label: "Inbox",
      href: "/admin/inbox",
      icon: Inbox,
    },
    {
      section: "edition",
      label: activeEdition?.edition_number ? `SSC${activeEdition.edition_number}` : "Edition",
      href: editionHref,
      icon: Layers3,
    },
    {
      section: "cases",
      label: "Cases",
      href: "/admin/integrity-investigations",
      icon: ShieldCheck,
    },
    {
      section: "more",
      label: "More",
      href: "/admin/more",
      icon: MoreHorizontal,
    },
  ];

  const activeSection = organizerSectionForPath(pathname, editionHref);

  useEffect(() => {
    if (!isAppMode) return;

    const restoreY = consumeOrganizerNavigationRestore(pathname);
    rememberOrganizerLocation(
      pathname,
      editionHref,
      editionContextKey,
      restoreY ?? undefined,
    );

    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: restoreY, behavior: "auto" });
        });
      });
    }

    const persistScroll = () => {
      scrollFrame.current = null;
      updateOrganizerScroll(
        pathname,
        editionHref,
        editionContextKey,
        window.scrollY,
      );
    };

    const onScroll = () => {
      if (scrollFrame.current != null) return;
      scrollFrame.current = window.requestAnimationFrame(persistScroll);
    };

    const onPageHide = () => {
      updateOrganizerScroll(
        pathname,
        editionHref,
        editionContextKey,
        window.scrollY,
      );
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (scrollFrame.current != null) {
        window.cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
      updateOrganizerScroll(
        pathname,
        editionHref,
        editionContextKey,
        window.scrollY,
      );
    };
  }, [editionContextKey, editionHref, isAppMode, pathname]);

  const openOrganizerSection = (item: MobileItem, active: boolean) => {
    const contextKey = item.section === "edition" ? editionContextKey : null;

    if (active) {
      if (pathname !== item.href) {
        const target = resetOrganizerSection(
          item.section,
          item.href,
          contextKey,
        );
        markOrganizerNavigationRestore(target);
        void runAppViewTransition("pop", () =>
          navigate({ to: target.pathname as any }),
        );
        return;
      }

      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      window.scrollTo({
        top: 0,
        behavior: reducedMotion ? "auto" : "smooth",
      });
      return;
    }

    const target = getOrganizerSectionDestination(
      item.section,
      item.href,
      contextKey,
    );
    markOrganizerNavigationRestore(target);
    void runAppViewTransition("tab", () =>
      navigate({ to: target.pathname as any }),
    );
  };

  return (
    <div className="admin-frame min-h-[calc(100vh-4rem)]">
      <aside className="admin-sidebar border-r border-white/[0.07]">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto scroll-slim">
          <AdminFeatureBoundary
            name="desktop-navigation"
            fallback={
              <div className="p-3">
                <Link to="/admin/operations" className="admin-action-secondary w-full justify-start">
                  Home
                </Link>
                <Link
                  to="/admin/menu"
                  className="admin-action-secondary mt-2 w-full justify-start"
                >
                  All Organizer tools
                </Link>
              </div>
            }
          >
            <AdminNav />
          </AdminFeatureBoundary>
        </div>
      </aside>

      <main className="admin-page admin-main min-w-0">
        <AdminFeatureBoundary
          name="section-navigation"
          fallback={
            <div className="mb-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3 text-xs">
              Section navigation could not load.{" "}
              <Link to="/admin/menu" className="font-semibold text-sky-100 underline">
                Open all Organizer tools
              </Link>
              .
            </div>
          }
        >
          <AdminSectionNav />
        </AdminFeatureBoundary>
        {children}
        {pathname === "/confirmations/admin/countries" ? (
          <AdminFeatureBoundary name="delegation-colour-overview">
            <DelegationColourOverview />
          </AdminFeatureBoundary>
        ) : null}
      </main>

      <nav
        className="admin-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] px-2 pt-2"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
        aria-label="Organizer navigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.section;

            return (
              <Link
                key={item.section}
                to={item.href as any}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (!isAppMode) return;
                  event.preventDefault();
                  openOrganizerSection(item, active);
                }}
                className={cn(
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-sky-200/[0.09] text-sky-50"
                    : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <Icon className="size-[1.08rem]" aria-hidden="true" />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
