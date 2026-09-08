import { Link, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AnniversaryFeatureBoundary } from "@/components/AnniversaryFeatureBoundary";

const LazyAnniversaryCompletionExperience = lazy(() =>
  import("@/components/AnniversaryCompletionExperience").then((module) => ({
    default: module.AnniversaryCompletionExperience,
  })),
);

function needsCompletionExperience(pathname: string) {
  return (
    pathname.startsWith("/records") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/relationships") ||
    pathname === "/countries" ||
    pathname === "/countries/" ||
    pathname.startsWith("/shows/")
  );
}

export function AnniversaryNavLink() {
  return (
    <AnniversaryFeatureBoundary name="anniversary-nav-link">
      <AnniversaryNavLinkInner />
    </AnniversaryFeatureBoundary>
  );
}

function AnniversaryNavLinkInner() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
    setHost(nav);
    return () => setHost(null);
  }, [pathname]);

  return (
    <>
      {needsCompletionExperience(pathname) ? (
        <AnniversaryFeatureBoundary name={`anniversary-completion:${pathname}`}>
          <Suspense fallback={null}>
            <LazyAnniversaryCompletionExperience />
          </Suspense>
        </AnniversaryFeatureBoundary>
      ) : null}
      {host
        ? createPortal(
            <Link
              to="/anniversary"
              aria-current={pathname.startsWith("/anniversary") ? "page" : undefined}
              className="anniversary-main-nav-link"
              data-anniversary-action="major"
            >
              <span aria-hidden="true">✦</span> Anniversary
            </Link>,
            host,
          )
        : null}
    </>
  );
}
