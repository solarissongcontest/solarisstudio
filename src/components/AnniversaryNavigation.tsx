import { useEffect } from "react";

import "@/anniversary-navigation.css";
import "@/anniversary-participation-success.css";

const SUCCESS_PHRASES = [
  "Your vote has been recorded",
  "Your jury ballot has been recorded",
  "Your entry is public",
  "Reveal schedule saved",
];

export function AnniversaryNavigation() {
  useEffect(() => {
    const created: HTMLElement[] = [];
    let successNotice: HTMLElement | null = null;
    let successTimeout: number | null = null;

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

    const showSuccessNote = () => {
      successNotice?.remove();
      if (successTimeout) window.clearTimeout(successTimeout);

      const notice = document.createElement("aside");
      notice.className = "anniversary-participation-success";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.innerHTML = `<span aria-hidden="true">✦</span><div><strong>Now part of Solaris history</strong><p>This submission has joined the contest archive. Anniversary effects stay away from the actual controls.</p></div>`;
      document.body.appendChild(notice);
      successNotice = notice;
      successTimeout = window.setTimeout(() => {
        notice.remove();
        if (successNotice === notice) successNotice = null;
      }, 5200);
    };

    const sync = (mutations?: MutationRecord[]) => {
      const desktop = document.querySelector('nav[aria-label="Main navigation"]');
      if (desktop) ensureLink(desktop, "desktop");
      const mobile = document.querySelector('nav[aria-label="Mobile navigation"]');
      if (mobile) ensureLink(mobile, "mobile");

      if (!mutations?.length) return;
      const success = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => {
          const text = node.textContent ?? "";
          return SUCCESS_PHRASES.some((phrase) => text.includes(phrase));
        }),
      );
      if (success) showSuccessNote();
    };

    sync();
    const observer = new MutationObserver((mutations) => sync(mutations));
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (successTimeout) window.clearTimeout(successTimeout);
      successNotice?.remove();
      for (const element of created) element.remove();
      document.querySelectorAll("[data-anniversary-nav]").forEach((element) => element.remove());
    };
  }, []);

  return null;
}
