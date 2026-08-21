import { useRouterState } from "@tanstack/react-router";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEditions } from "@/lib/data";

const supabase = typedSupabase as any;

type PublicStyle = "cinematic" | "editorial" | "minimal" | "glass";

const STYLE_OPTIONS: Array<{ value: PublicStyle; label: string; description: string }> = [
  { value: "cinematic", label: "Cinematic", description: "Large atmosphere, soft glow and dramatic edition identity." },
  { value: "editorial", label: "Editorial", description: "Sharper hierarchy and calmer magazine-like sections." },
  { value: "minimal", label: "Minimal", description: "Quiet surfaces, less decoration and more breathing room." },
  { value: "glass", label: "Glass", description: "Translucent layered panels with soft depth." },
];

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
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const value = raw.publicStyle;
    setStyle(STYLE_OPTIONS.some((item) => item.value === value) ? (value as PublicStyle) : "cinematic");
    setRadius(Number.isFinite(Number(raw.publicRadius)) ? Math.max(8, Math.min(40, Number(raw.publicRadius))) : 24);
    setSurfaceStrength(Number.isFinite(Number(raw.publicSurfaceStrength)) ? Math.max(45, Math.min(100, Number(raw.publicSurfaceStrength))) : 82);
    setHeroGlow(Number.isFinite(Number(raw.publicHeroGlow)) ? Math.max(0, Math.min(100, Number(raw.publicHeroGlow))) : 72);
  }, [edition?.id, edition?.theme_colors]);

  useEffect(() => {
    if (!slug) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".admin-page .admin-card"));
    const paletteCard = cards.find((card) => card.textContent?.includes("Interface palette"));
    const anchor = paletteCard ?? document.querySelector<HTMLElement>(".admin-page");
    if (!anchor?.parentElement && !paletteCard) return;
    const node = document.createElement("div");
    node.dataset.editionPublicDesignPanel = "true";
    node.className = "mb-4";
    if (paletteCard) paletteCard.insertAdjacentElement("afterend", node);
    else anchor.appendChild(node);
    setHost(node);
    return () => {
      node.remove();
      setHost(null);
    };
  }, [slug]);

  if (!slug || !edition || !host) return null;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const next = {
        ...raw,
        publicStyle: style,
        publicRadius: Math.round(radius),
        publicSurfaceStrength: Math.round(surfaceStrength),
        publicHeroGlow: Math.round(heroGlow),
      };
      const { error } = await supabase.from("editions").update({ theme_colors: next }).eq("id", edition.id);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
      ]);
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
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            These settings control the public edition page and its semi-final/final pages. They replace the old generic blue-accent layout instead of merely painting over it.
          </p>
        </div>
        <LayoutTemplate className="mt-1 size-5 shrink-0 text-primary" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {STYLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStyle(option.value)}
            className={`rounded-xl border p-3 text-left transition-colors ${style === option.value ? "border-primary/45 bg-primary/10" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"}`}
          >
            <span className="text-sm font-semibold text-foreground">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Card roundness</span>
          <input type="range" min="8" max="40" value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-3 w-full" />
          <span className="mt-1 block text-xs text-foreground">{radius}px</span>
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

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" disabled={saving} onClick={() => void save()} className="admin-action-primary sm:min-w-52">
          <Sparkles className="size-4" /> {saving ? "Saving…" : "Save public page design"}
        </button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </section>,
    host,
  );
}
