import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TOOLS = [
  { to: "/archive-games", eyebrow: "Challenge", title: "4 Years Challenge", detail: "Ten questions across every archive game format." },
  { to: "/taste-dna", eyebrow: "Personal analytics", title: "Find your Solaris era", detail: "Compare saved Taste DNA rankings across contest years." },
  { to: "/result-lab", eyebrow: "What-if history", title: "Historic Result Lab", detail: "Load anniversary presets into the existing simulator." },
  { to: "/broadcast-intelligence", eyebrow: "Replay", title: "Legendary scoreboard moments", detail: "Revisit published turning points and record editions." },
  { to: "/compare", eyebrow: "Across four years", title: "Anniversary comparisons", detail: "Open archive-leader comparison presets." },
  { to: "/records", eyebrow: "Legacy", title: "Records that survived", detail: "All-time, anniversary-year and oldest-standing records." },
] as const;

export function AnniversaryToolsCollection() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".app-main");
      if (!main) return;
      const mount = document.createElement("div");
      mount.className = "anniv-deep-host";
      const header = main.querySelector<HTMLElement>(".page-header");
      if (header?.parentElement) header.insertAdjacentElement("afterend", mount);
      else main.prepend(mount);
      setHost(mount);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      setHost((current) => {
        current?.remove();
        return null;
      });
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <section className="anniv-deep" aria-label="Anniversary tools collection">
      <div className="anniv-deep-head">
        <div>
          <p>Anniversary collection</p>
          <h2>Tools for four years of Solaris history</h2>
          <span>The archive is more useful when you can compare it, replay it, simulate it and then quiz yourself on the resulting nonsense.</span>
        </div>
        <Link to="/anniversary" className="anniv-deep-hub-link">Anniversary hub →</Link>
      </div>
      <div className="anniv-deep-preset-row">
        {TOOLS.map((tool) => (
          <Link key={tool.to} to={tool.to}>
            <small>{tool.eyebrow}</small>
            <strong>{tool.title}</strong>
            <span>{tool.detail}</span>
          </Link>
        ))}
      </div>
    </section>,
    host,
  );
}
