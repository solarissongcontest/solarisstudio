import { useRouterState } from "@tanstack/react-router";
import { LayoutTemplate, Monitor, Smartphone, Sparkles, Tablet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEditions } from "@/lib/data";
import {
  EDITION_PUBLIC_STYLES,
  type EditionPublicStyle as PublicStyle,
} from "@/lib/edition-public-design";

const supabase = typedSupabase as any;

type GradientValue = { enabled: boolean; colors: string[]; angle: number };

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
  const match = pathname.match(/^\/admin\/(?:design|edition-theme)\/([^/]+)\/?$/);
  const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
  const { data: editions = [] } = useEditions();
  const qc = useQueryClient();
  const edition = useMemo(() => editions.find((item) => item.slug === slug) as any, [editions, slug]);
  const raw = (edition?.theme_colors && typeof edition.theme_colors === "object" ? edition.theme_colors : {}) as Record<string, unknown>;
  const [style, setStyle] = useState<PublicStyle>("cinematic");
  const [radius, setRadius] = useState(24);
  const [surfaceStrength, setSurfaceStrength] = useState(82);
  const [heroGlow, setHeroGlow] = useState(72);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [accentGradient, setAccentGradient] = useState<GradientValue>({ enabled: false, colors: ["#86c9d7", "#123a49"], angle: 135 });
  const [surfaceGradient, setSurfaceGradient] = useState<GradientValue>({ enabled: false, colors: ["#0d2634", "#123a49"], angle: 135 });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const value = raw.publicStyle;
    const nextStyle = EDITION_PUBLIC_STYLES.some((item) => item.id === value) ? (value as PublicStyle) : "cinematic";
    setStyle(nextStyle);
    const savedRadius = Number.isFinite(Number(raw.publicRadius)) ? Math.max(0, Math.min(40, Number(raw.publicRadius))) : 24;
    setRadius(styleLocksSquare(nextStyle) ? 0 : savedRadius);
    setSurfaceStrength(Number.isFinite(Number(raw.publicSurfaceStrength)) ? Math.max(45, Math.min(100, Number(raw.publicSurfaceStrength))) : 82);
    setHeroGlow(Number.isFinite(Number(raw.publicHeroGlow)) ? Math.max(0, Math.min(100, Number(raw.publicHeroGlow))) : 72);
    setFocalX(Number.isFinite(Number(raw.publicFocalX)) ? Math.max(0, Math.min(100, Number(raw.publicFocalX))) : 50);
    setFocalY(Number.isFinite(Number(raw.publicFocalY)) ? Math.max(0, Math.min(100, Number(raw.publicFocalY))) : 50);
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
        publicFocalX: Math.round(focalX),
        publicFocalY: Math.round(focalY),
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

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {EDITION_PUBLIC_STYLES.map((option) => (
          <button key={option.id} type="button" onClick={() => chooseStyle(option.id)} aria-pressed={style === option.id} className={`overflow-hidden rounded-xl border text-left transition-colors ${style === option.id ? "border-primary/60 bg-primary/10" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
            <StyleThumbnail style={option.id} />
            <span className="block p-3">
              <span className="text-sm font-semibold text-foreground">{option.label}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.12em] text-primary">{option.signature}</span>
              <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">{option.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/15 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold">Real-layout preview</p><p className="mt-1 text-[11px] text-muted-foreground">Uses the same composition and artwork rules as the public renderer.</p></div>
          <div className="flex rounded-lg border border-white/[0.08] p-1" aria-label="Preview size">
            {([ ["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone] ] as const).map(([mode, Icon]) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} aria-label={`${mode} preview`} aria-pressed={previewMode === mode} className={`grid size-9 place-items-center rounded-md ${previewMode === mode ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}><Icon className="size-4" /></button>)}
          </div>
        </div>
        <EditionDesignPreview
          style={style}
          mode={previewMode}
          artwork={edition.artwork_url ?? edition.logo}
          logo={edition.logo}
          title={edition.name}
          focalX={focalX}
          focalY={focalY}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Card roundness</span>
          <input type="range" min="0" max="40" value={squareLocked ? 0 : radius} disabled={squareLocked} onChange={(event) => setRadius(Number(event.target.value))} className="mt-3 w-full disabled:opacity-40" />
          <span className="mt-1 block text-xs text-foreground">{squareLocked ? "0px · fixed by this layout" : `${radius}px`}</span>
        </label>
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Artwork focus X</span>
          <input type="range" min="0" max="100" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} className="mt-3 w-full" />
          <span className="mt-1 block text-xs text-foreground">{focalX}%</span>
        </label>
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Artwork focus Y</span>
          <input type="range" min="0" max="100" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} className="mt-3 w-full" />
          <span className="mt-1 block text-xs text-foreground">{focalY}%</span>
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
        <GradientEditor label="Surface gradient" description="Large surfaces and edition atmosphere, without turning every content item into a gradient card." value={surfaceGradient} onChange={setSurfaceGradient} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" disabled={saving} onClick={() => void save()} className="admin-action-primary sm:min-w-52"><Sparkles className="size-4" /> {saving ? "Saving…" : "Save public page design"}</button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </section>, host,
  );
}

function StyleThumbnail({ style }: { style: PublicStyle }) {
  return <span className={`block h-20 border-b border-white/[0.08] p-2 ${style === "minimal" ? "bg-slate-950" : style === "editorial" ? "bg-slate-900" : style === "glass" ? "bg-gradient-to-br from-cyan-950 to-slate-950" : "bg-gradient-to-br from-primary/35 via-slate-950 to-slate-950"}`}>
    <span className={`grid h-full gap-1 ${style === "editorial" ? "grid-cols-[.8fr_1.2fr]" : "grid-cols-[1.2fr_.8fr]"}`}>
      <span className="flex flex-col justify-end gap-1 border-white/20 p-1.5" style={{ borderWidth: style === "minimal" ? "0 0 1px" : style === "editorial" ? "0 1px 0 0" : 0 }}><i className="h-1 w-7 bg-primary/80" /><i className="h-2 w-4/5 bg-white/85" /><i className="h-1 w-3/5 bg-white/35" /></span>
      <span className={`${style === "glass" ? "rounded-lg border border-white/20 bg-white/10 backdrop-blur" : "bg-primary/15"}`} />
    </span>
  </span>;
}

function EditionDesignPreview({ style, mode, artwork, logo, title, focalX, focalY }: { style: PublicStyle; mode: "desktop" | "tablet" | "mobile"; artwork?: string | null; logo?: string | null; title: string; focalX: number; focalY: number }) {
  const width = mode === "mobile" ? "max-w-[16rem]" : mode === "tablet" ? "max-w-[32rem]" : "max-w-full";
  return <div className={`mx-auto overflow-hidden border border-white/10 bg-[#071a2b] text-white transition-[max-width] ${width}`} data-preview-style={style}>
    <div className={`${mode === "mobile" ? "flex flex-col" : "grid grid-cols-[1.15fr_.85fr]"} ${style === "editorial" ? "rounded-none" : "rounded-sm"}`}>
      <div className="flex min-h-48 flex-col justify-end p-5">
        <span className="text-[8px] font-bold uppercase tracking-[.16em] text-cyan-300">Solaris Song Contest</span>
        <strong className="mt-2 line-clamp-2 font-display text-3xl leading-[.88]">{title}</strong>
        <span className="mt-3 max-w-52 text-[9px] leading-relaxed text-white/55">An edition identity with published shows, entries and results.</span>
      </div>
      <div className={`relative min-h-32 overflow-hidden ${artwork ? "bg-black/20" : "bg-gradient-to-br from-cyan-500/25 to-fuchsia-500/10"}`}>
        {artwork ? <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" style={{ objectPosition: `${focalX}% ${focalY}%` }} /> : null}
        {logo ? <div className="absolute inset-0 grid place-items-center bg-black/15 p-5"><img src={logo} alt="" className="max-h-20 max-w-[82%] object-contain drop-shadow-lg" /></div> : null}
      </div>
    </div>
    <div className={`flex gap-2 border-t border-white/10 px-3 py-2 text-[8px] uppercase tracking-wider ${style === "glass" ? "bg-white/10 backdrop-blur" : ""}`}><span>Overview</span><span>Entries</span><span>Results</span><span>Shows</span></div>
  </div>;
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
