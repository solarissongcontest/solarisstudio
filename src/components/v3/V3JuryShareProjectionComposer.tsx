import { useMemo, useState } from "react";

import {
  buildDefaultJuryShareModel,
  type JuryShareProjection,
  type JuryShareThemeAvailability,
  type JuryShareThemeId,
} from "@/lib/v3-jury-share-card-foundation";
import {
  buildJuryShareAltDescription,
  copyJuryShareText,
  downloadJuryShareImage,
  renderDefaultJuryShareImage,
  shareJuryShareImage,
} from "@/lib/v3-jury-share-export";
import { V3Section, V3Surface } from "./V3Foundation";

const THEME_LABELS: Record<JuryShareThemeId, string> = {
  default: "Default",
  edition: "Edition",
  liquid_glass: "Liquid Glass",
};

const FALLBACK_THEMES = Object.freeze([
  { id: "default", state: "available" },
  {
    id: "edition",
    state: "unconfigured",
    reason: "Edition share theme is not configured",
  },
  {
    id: "liquid_glass",
    state: "unsupported",
    reason: "Liquid Glass renderer unavailable",
  },
] satisfies JuryShareThemeAvailability[]);

function JurySharePreview({ projection }: { projection: JuryShareProjection }) {
  const model = useMemo(() => buildDefaultJuryShareModel(projection), [projection]);
  const alt = useMemo(() => buildJuryShareAltDescription(projection), [projection]);

  return (
    <figure className="mx-auto w-full max-w-[360px]">
      <div
        className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-white/10 bg-[#07152F] p-[8%] shadow-2xl"
        role="img"
        aria-label={alt}
      >
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <span className="absolute left-[12%] top-[7%] size-1 rounded-full bg-white/30" />
          <span className="absolute right-[18%] top-[12%] size-1 rounded-full bg-white/25" />
          <span className="absolute bottom-[9%] left-[24%] size-1 rounded-full bg-white/20" />
        </div>

        <div className="relative flex h-full min-h-0 flex-col">
          <header className="shrink-0">
            <p className="text-[clamp(1.05rem,5vw,1.65rem)] font-black tracking-[0.08em] text-white">
              {model.contestLabel}
            </p>
            <p className="mt-1 truncate text-[clamp(0.7rem,3vw,0.95rem)] font-bold text-[#B8C9E6]">
              {model.editionLabel}
            </p>
            <p className="truncate text-[clamp(0.62rem,2.5vw,0.82rem)] font-semibold text-[#B8C9E6]/85">
              {model.showLabel}
            </p>
          </header>

          <div className="mt-[8%] grid min-h-0 flex-1 grid-rows-10 gap-[1.2%]">
            {model.rows.map((row) => (
              <div
                key={row.recipientCountryId}
                className={`flex min-h-0 items-center gap-[3%] rounded-[clamp(0.6rem,3vw,1rem)] px-[3%] ${
                  row.emphasized
                    ? "bg-[#F0D596] text-[#13213B]"
                    : "bg-[#2B63A6] text-white"
                }`}
              >
                <div className="aspect-[3/2] h-[64%] shrink-0 overflow-hidden rounded-md bg-black/15">
                  <img
                    src={row.flagAsset.url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-[clamp(0.62rem,3vw,0.9rem)] font-bold">
                  {row.country}
                </span>
                <span className="font-mono text-[clamp(0.72rem,3.4vw,1rem)] font-black tabular-nums">
                  {row.pointsLabel}
                </span>
              </div>
            ))}
          </div>

          <footer className="mt-[7%] flex shrink-0 items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[clamp(0.55rem,2.5vw,0.72rem)] font-black tracking-[0.12em] text-[#B8C9E6]">
                {model.footerLabel}
              </p>
              <p className="mt-1 truncate text-[clamp(1rem,5vw,1.55rem)] font-black text-white">
                {model.footerCountry}
              </p>
            </div>
            <div className="aspect-[3/2] w-[27%] shrink-0 overflow-hidden rounded-lg bg-white/10">
              <img
                src={projection.source.flagAsset.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </footer>
        </div>
      </div>
      <figcaption className="sr-only">{alt}</figcaption>
    </figure>
  );
}

export function V3JuryShareProjectionComposer({
  projection,
  refreshProjection,
  scopeNote,
}: {
  projection: JuryShareProjection;
  refreshProjection: () => Promise<JuryShareProjection>;
  scopeNote?: string;
}) {
  const [theme, setTheme] = useState<JuryShareThemeId>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const themes = projection.themes ?? FALLBACK_THEMES;
  const selectedTheme = themes.find((item) => item.id === theme);
  const exportEnabled = theme === "default" && selectedTheme?.state === "available";

  async function freshProjection() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Connect to create this image.");
    }
    const previousState = projection.stateVersion;
    const refreshed = await refreshProjection();
    if (refreshed.stateVersion !== previousState) {
      setMessage("Results were updated. The export uses the latest official jury vote.");
    }
    return refreshed;
  }

  async function runExport(action: "share" | "png" | "jpeg" | "copy") {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const fresh = await freshProjection();
      if (action === "copy") {
        await copyJuryShareText(fresh);
        setMessage("Votes copied as text.");
        return;
      }
      const image = await renderDefaultJuryShareImage(fresh, action === "jpeg" ? "jpeg" : "png");
      if (action === "share") {
        const outcome = await shareJuryShareImage(image);
        setMessage(
          outcome === "shared"
            ? "Share sheet opened."
            : "Image saved because file sharing is unavailable.",
        );
      } else {
        downloadJuryShareImage(image);
        setMessage(action === "png" ? "PNG saved." : "JPEG saved.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Couldn't create the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-v3-jury-share-projection-composer="">
      <V3Section title="Choose design" meta={`${projection.edition.name} · ${projection.show.name}`}>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Jury share design">
          {themes.map((option) => {
            const available = option.state === "available" && option.id === "default";
            const selected = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!available}
                onClick={() => setTheme(option.id)}
                className="min-h-16 rounded-xl border border-[var(--v3-border)] px-2 py-3 text-left disabled:opacity-45 aria-checked:bg-white/10"
                title={available ? undefined : option.reason ?? `${THEME_LABELS[option.id]} is not available`}
              >
                <span className="block text-sm font-semibold">{THEME_LABELS[option.id]}</span>
                <span className="mt-1 block text-[11px] text-[var(--v3-text-secondary)]">
                  {available ? "Available" : option.state.replace("_", " ")}
                </span>
              </button>
            );
          })}
        </div>
      </V3Section>

      <V3Section title="Preview">
        <V3Surface className="p-4 sm:p-6">
          <JurySharePreview projection={projection} />
        </V3Surface>
      </V3Section>

      <V3Section title="Share or save">
        <V3Surface className="grid gap-2 p-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy || !exportEnabled}
            onClick={() => void runExport("share")}
            className="min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)] disabled:opacity-50"
          >
            Share image
          </button>
          <button
            type="button"
            disabled={busy || !exportEnabled}
            onClick={() => void runExport("png")}
            className="min-h-11 rounded-xl border border-[var(--v3-border)] px-4 font-semibold disabled:opacity-50"
          >
            Save PNG
          </button>
          <button
            type="button"
            disabled={busy || !exportEnabled}
            onClick={() => void runExport("jpeg")}
            className="min-h-11 rounded-xl border border-[var(--v3-border)] px-4 font-semibold disabled:opacity-50"
          >
            Save JPEG
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runExport("copy")}
            className="min-h-11 rounded-xl border border-[var(--v3-border)] px-4 font-semibold disabled:opacity-50"
          >
            Copy votes as text
          </button>
          {message ? (
            <p role="status" className="pt-2 text-sm text-[var(--v3-text-secondary)] sm:col-span-2">
              {message}
            </p>
          ) : null}
        </V3Surface>
      </V3Section>

      <p className="px-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
        Every export rechecks the canonical published Result Version before creating the file.
        {scopeNote ? ` ${scopeNote}` : ""}
      </p>
    </div>
  );
}
