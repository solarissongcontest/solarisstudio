import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { FlagFrame } from "@/components/FlagMedia";

export const Route = createFileRoute("/dev/flag-media")({
  head: () => ({ meta: [{ title: "Flag display fixtures — Solaris Studio" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FlagMediaFixtures,
});

const cases = [
  { name: "Wide source 2:1", width: 600, height: 300, colors: ["#e6ad50", "#101f41"] },
  { name: "Square source 1:1", width: 300, height: 300, colors: ["#517fca", "#f3db79"] },
  { name: "Tall source 6:5", width: 360, height: 300, colors: ["#7a58ac", "#e2b950"] },
] as const;

function fixtureImage(width: number, height: number, colors: readonly [string, string]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="${colors[0]}" d="M0 0h${width}v${height}H0z"/><path fill="${colors[1]}" d="M0 ${height / 2}h${width}v${height / 2}H0z"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 8}" fill="white"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function FlagMediaFixtures() {
  return <AppShell><main className="mx-auto max-w-4xl px-4 py-8"><h1 className="font-display text-3xl font-bold">Flag display fixtures</h1><p className="mt-2 text-muted-foreground">Original proportions remain unchanged; each displayed flag fills the same 3:2 frame with uniform scaling.</p><div className="mt-7 grid gap-5 sm:grid-cols-3">{cases.map((item) => { const image = fixtureImage(item.width, item.height, item.colors); return <section key={item.name} className="rounded-2xl border border-border bg-surface p-4"><h2 className="mb-3 font-semibold">{item.name}</h2><FlagFrame image={image} alt={item.name} fallback="?" className="w-full rounded-lg" /><p className="mt-2 text-xs text-muted-foreground">{item.width} × {item.height} original → 3:2 display</p></section>; })}</div></main></AppShell>;
}
