import { useEffect } from "react";

import "@/anniversary-navigation.css";

export function AnniversaryNavigation() {
  useEffect(() => {
    const created: HTMLElement[] = [];

    const ensureLink = (nav: Element, location: "desktop" | "mobile") => {
      if (nav.querySelector(`[data-anniversary-nav="${location}"]`)) return;
      const anchor = document.createElement("a");
      anchor.href = "/anniversary";
      anchor.dataset.anniversaryNav = location;
      anchor.className = `anniversary-nav-injected anniversary-nav-injected--${location}`;
      anchor.textContent = "✦ Anniversary";

      if (location === "desktop") {
        const predictions = [...nav.querySelectorAll("a")].find((item) => item.textContent?.trim() === "Predict");
        if (predictions) nav.insertBefore(anchor, predictions);
        else nav.appendChild(anchor);
      } else {
        nav.prepend(anchor);
      }
      created.push(anchor);
    };

    const sync = () => {
      const desktop = document.querySelector('nav[aria-label="Main navigation"]');
      if (desktop) ensureLink(desktop, "desktop");
      const mobile = document.querySelector('nav[aria-label="Mobile navigation"]');
      if (mobile) ensureLink(mobile, "mobile");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const element of created) element.remove();
      document.querySelectorAll("[data-anniversary-nav]").forEach((element) => element.remove());
    };
  }, []);

  return null;
}
