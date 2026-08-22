import { useRouterState } from "@tanstack/react-router";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEditions } from "@/lib/data";

const supabase = typedSupabase as any;

type PublicStyle = "cinematic" | "editorial" | "minimal" | "glass";
type GradientValue = { enabled: boolean; colors: string[]; angle: number };

const STYLE_OPTIONS: Array<{ value: PublicStyle; label: string; description: string }> = [
  { value: "cinematic", label: "Cinematic", description: "Large atmosphere, soft glow and dramatic edition identity." },
  { value: "editorial", label: "Editorial", description: "Sharp rectangular magazine layout with structured rules and spacing." },
  { value: "minimal", label: "Minimal", description: "Quiet square surfaces, low decoration and generous breathing room." },
  { value: "glass", label: "Glass", description: "Translucent layered panels with soft depth." },
];

function validHex(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function readGradient(raw: unknown, first: string, second: string): GradientValue {
  if (!raw || typeof raw !== "object") return { enabled: false, colors: [first, second], angle: 135 };
  const value = raw as Record<string, unknown>;
  const colors = Array.isArray(value.colors)
    ? value.colors.slice(0, 3).map((color, index) => validHex(color, index === 0 ? first : second))
    : [first, second];
  while (colors.length < 2) colors.push(second);
  return {
    enabled: value.enabled !== false,
    colors,
    angle: Number.isFinite(Number(value.angle)) ? Math.max(0, Math.min(360, Number(value.angle))) : 135,
  };
}

function gradientCss(value: GradientValue) {
  return `linear-gradient(${value.angle}deg, ${value.colors.join(", ")})`;
}

function styleLocksSquare(style: PublicStyle) {
  return style === "editorial" || style === "minimal";
}

export function EditionPublicDesignPanel() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const match = pathname.match(/^\/admin\/edition-theme\/([^/]+)\/?$/);
  const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
  const { data: editions = [] } = useEditions();
  const qc = useQueryClient();
  const edition = useMemo(() => editions.find((item) => item.slug === slug) as any, [editions, slug]);
  const raw = (edition?.theme_colors && typeof edition.theme_colors === "object" ? edition.theme_colors : {}) as Record<string, unknown>;
  const [style, setStyle] = useState<PublicStyle>("cinematic");
  const [radius, setRadius] = useState(24);
  const [surfaceStrength, setSurfaceStrength] = useState(82);
  const [heroGlow, setHeroGlow] = useState(72);
  const [accentGradient, setAccentGradient] = useState<GradientValue>({ enabled: false, colors: ["#86c9d7", "#123a49"], angle: 135 });
  const [surfaceGradient, setSurfaceGradient] = useState<GradientValue>({ enabled: false, colors: ["#0d2634", "#123a49"], angle: 135 });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const value = raw.publicStyle;
    const nextStyle = STYLE_OPTIONS.some((item) => item.value === value) ? (value as PublicStyle) : "cinematic";
    setStyle(nextStyle);
    const savedRadius = Number.isFinite(Number(raw.publicRadius)) ? Math.max(0, Math.min(40, Number(raw.publicRadius))) : 24;
    setRadius(styleLocksSquare(nextStyle) ? 0 : savedRadius);
    setSurfaceStrength(Number.isFinite(Number(raw.publicSurfaceStrength)) ? Math.max(45, Math.min(100, Number(raw.publicSurfaceStrength))) : 82);
    setHeroGlow(Number.isFinite(Number(raw.publicHeroGlow)) ? Math.max(0, Math.min(100, Number(raw.publicHeroGlow))) : 72);
    const accent = validHex(raw.accent, "#86c9d7");
    const surface = validHex(raw.surface, "#0d2634");
    const secondary = validHex(raw.backgroundSecondary, "#123a49");
    setAccentGradient(readGradient(raw.publicAccentGradient, accent, secondary));
    setSurfaceGradient(readGradient(raw.publicSurfaceGradient, surface, secondary));
  }, [edition?.id, edition?.theme_colors]);

  useEffect(() => {
    if (!slug) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".admin-page .admin-card"));
    const paletteCard = cards.find((card) => card.textContent?.includes("Interface palette"));
    const page = document.querySelector<HTMLElement>(".admin-page");
    if (!paletteCard && !page) return;
    const node = document.createElement("div");
    node.dataset.editionPublicDesignPanel = "true";
    node.className = "mb-4";
    if (paletteCard) paletteCard.insertAdjacentElement("afterend", node);
    else page!.appendChild(node);
    setHost(node);
    return () => { node.remove(); setHost(null); };
  }, [slug]);

  if (!slug || !edition || !host) return null;

  const squareLocked = styleLocksSquare(style);
  const chooseStyle = (next: PublicStyle) => {
    setStyle(next);
    if (styleLocksSquare(next)) setRadius(0);
    else if (radius === 0) setRadius(24);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const next = {
        ...raw,
        publicStyle: style,
        publicRadius: squareLocked ? 0 : Math.round(radius),
        publicSurfaceStrength: Math.round(surfaceStrength),
        publicHeroGlow: Math.round(heroGlow),
        publicAccentGradient: accentGradient.enabled ? accentGradient : null,
        publicSurfaceGradient: surfaceGradient.enabled ? surfaceGradient : null,
      };
      const { error } = await supabase.from("editions").update({ theme_colors: next }).eq("id", edition.id);
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["editions"] }), qc.invalidateQueries({ queryKey: ["edition"] })]);
      setMessage("Public edition and show design saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Public design could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <section className="admin-card rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="admin-section-label">3 · Public page style</p>
          <h3 className="mt-1 font-display text-lg font-bold">Edition & show layout</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">These settings control the public edition page and its semi-final/final pages.</p>
        </div>
        <LayoutTemplate className="mt-1 size-5 shrink-0 text-primary" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {STYLE_OPTIONS.map((option) => (
          <button key={option.value} type="button" onClick={() => chooseStyle(option.value)} className={`rounded-xl border p-3 text-left transition-colors ${style === option.value ? "border-primary/45 bg-primary/10" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
            <span className="text-sm font-semibold text-foreground">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Card roundness</span>
          <input type="range" min="0" max="40" value={squareLocked ? 0 : radius} disabled={squareLocked} onChange={(event) => setRadius(Number(event.target.value))} className="mt-3 w-full disabled:opacity-40" />
          <span className="mt-1 block text-xs text-foreground">{squareLocked ? "0px · fixed by this layout" : `${radius}px`}</span>
        </label>
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Surface strength</span>
          <input type="range" min="45" max="100" value={surfaceStrength} onChange={(event) => setSurfaceStrength(Number(event.target.value))} className="mt-3 w-full" />
          <span className="mt-1 block text-xs text-foreground">{surfaceStrength}%</span>
        </label>
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Hero glow</span>
          <input type="range" min="0" max="100" value={heroGlow} onChange={(event) => setHeroGlow(Number(event.target.value))} className="mt-3 w-full" />
          <span className="mt-1 block text-xs text-foreground">{heroGlow}%</span>
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <GradientEditor label="Accent gradient" description="Highlights, progress, selected states and accent details." value={accentGradient} onChange={setAccentGradient} />
        <GradientEditor label="Surface gradient" description="Cards, panels and large interface surfaces." value={surfaceGradient} onChange={setSurfaceGradient} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" disabled={saving} onClick={() => void save()} className="admin-action-primary sm:min-w-52"><Sparkles className="size-4" /> {saving ? "Saving…" : "Save public page design"}</button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </section>, host,
  );
}

function GradientEditor({ label, description, value, onChange }: { label: string; description: string; value: GradientValue; onChange: (value: GradientValue) => void; }) {
  const setColor = (index: number, color: string) => {
    const colors = [...value.colors]; colors[index] = color; onChange({ ...value, colors });
  };
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-foreground">{label}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p></div>
        <button type="button" onClick={() => onChange({ ...value, enabled: !value.enabled })} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] ${value.enabled ? "border-primary/45 bg-primary/12 text-primary" : "border-white/[0.1] text-muted-foreground"}`}>{value.enabled ? "Gradient on" : "Solid"}</button>
      </div>
      <div className="mt-3 h-14 rounded-xl border border-white/[0.1]" style={{ background: value.enabled ? gradientCss(value) : value.colors[0] }} />
      <div className="mt-3 flex flex-wrap gap-2">
        {value.colors.map((color, index) => (
          <label key={`${index}-${color}`} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-2 py-2">
            <input type="color" value={color} onChange={(event) => setColor(index, event.target.value)} className="h-8 w-10 rounded-md border-0 bg-transparent p-0" />
            <span className="numeric text-[10px] text-muted-foreground">{color}</span>
            {index === 2 ? <button type="button" onClick={() => onChange({ ...value, colors: value.colors.slice(0, 2) })} className="ml-1 text-xs text-muted-foreground" aria-label="Remove third colour">×</button> : null}
          </label>
        ))}
        {value.colors.length < 3 ? <button type="button" onClick={() => onChange({ ...value, colors: [...value.colors, value.colors[value.colors.length - 1]] })} className="rounded-xl border border-dashed border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-muted-foreground">+ Third colour</button> : null}
      </div>
      {value.enabled ? <label className="mt-3 block"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Fade direction · {Math.round(value.angle)}°</span><input type="range" min="0" max="360" value={value.angle} onChange={(event) => onChange({ ...value, angle: Number(event.target.value) })} className="mt-2 w-full" /></label> : null}
    </div>
  );
}
