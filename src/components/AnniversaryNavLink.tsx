import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AnniversaryCompletionExperience } from "@/components/AnniversaryCompletionExperience";

export function AnniversaryNavLink() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
    setHost(nav);
  }, [pathname]);

  return (
    <>
      <AnniversaryCompletionExperience />
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
