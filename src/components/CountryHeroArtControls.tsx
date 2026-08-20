import { Palette, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  HERO_DECORATIONS,
  HERO_VISUAL_MODES,
  normaliseHeroDecoration,
  normaliseHeroVisualMode,
  useCountryHeroArt,
  useSaveCountryHeroArt,
  type CountryHeroDecoration,
  type CountryHeroVisualMode,
} from "@/lib/country-hero-art";

export function CountryHeroArtControls({
  countryId,
  countryName,
}: {
  countryId: string;
  countryName: string;
}) {
  const { data } = useCountryHeroArt(countryId);
  const save = useSaveCountryHeroArt(countryId);
  const [open, setOpen] = useState(false);
  const [visualMode, setVisualMode] = useState<CountryHeroVisualMode>("auto");
  const [decoration, setDecoration] = useState<CountryHeroDecoration>("auto");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setVisualMode(normaliseHeroVisualMode(data?.hero_visual_mode));
    setDecoration(normaliseHeroDecoration(data?.hero_decoration));
  }, [data?.hero_visual_mode, data?.hero_decoration]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const saveChanges = async () => {
    setMessage(null);
    try {
      await save.mutateAsync({ visualMode, decoration });
      setMessage("Hero art saved. The public country page and Wiki now use it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hero art could not be saved.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-28 right-4 z-[115] inline-flex min-h-12 items-center gap-2 rounded-2xl border border-primary/30 bg-background/95 px-4 text-sm font-semibold shadow-2xl backdrop-blur-xl sm:bottom-6 sm:right-6"
      >
        <Sparkles className="size-4 text-primary" />
        Hero art
      </button>

      {open && (
        <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true" aria-label="Hero art settings">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close hero art settings"
            onClick={() => setOpen(false)}
          />

          <section className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-[1.75rem] border border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-y-6 sm:left-auto sm:right-6 sm:w-[520px] sm:rounded-[1.75rem]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Country appearance</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">Hero art</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Choose whether {countryName}&apos;s flag belongs in the hero at all, then add a graphic element if the flag does not suit the design.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface/70 p-4">
              <div className="flex items-center gap-2">
                <Palette className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Flag in the hero</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Recommended hides the flag from personalities where it tends to look stretched, blurry or pasted on.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {HERO_VISUAL_MODES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setVisualMode(item.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      visualMode === item.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background/70 hover:bg-surface-strong"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface/70 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Graphic decoration</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                These use your country colours, not a stretched flag image. They stay sharp on every screen size.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {HERO_DECORATIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDecoration(item.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      decoration === item.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background/70 hover:bg-surface-strong"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {message && (
              <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>
            )}

            <div className="sticky bottom-0 mt-5 grid grid-cols-[1fr_auto] gap-2 bg-background/95 pt-3 backdrop-blur">
              <button
                type="button"
                onClick={saveChanges}
                disabled={save.isPending}
                className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {save.isPending ? "Saving…" : "Save hero art"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
