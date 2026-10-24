import { Check, Copy, Download, ImageDown, Share2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  JURY_SHARE_TARGETS,
  buildDefaultJuryShareModel,
  type DefaultJuryShareModel,
  type JuryShareFormat,
  type JuryShareProjection,
  type JuryShareThemeAvailability,
  type JuryShareThemeId,
} from "@/lib/v3-jury-share-card-foundation";

const THEME_ORDER = ["default", "edition", "liquid_glass"] as const satisfies readonly JuryShareThemeId[];

const THEME_COPY: Record<JuryShareThemeId, { label: string; detail: string }> = {
  default: {
    label: "Default",
    detail: "The permanent Solaris jury-card design.",
  },
  edition: {
    label: "Edition",
    detail: "Official styling from this edition when configured.",
  },
  liquid_glass: {
    label: "Liquid Glass",
    detail: "The alternate Solaris glass treatment.",
  },
};

export type JuryShareSheetActionContext = {
  themeId: JuryShareThemeId;
  outputTarget: "story";
};

export type V3JuryShareSheetProps = {
  projection: JuryShareProjection;
  themes: readonly JuryShareThemeAvailability[];
  previewByTheme?: Partial<Record<Exclude<JuryShareThemeId, "default">, ReactNode>>;
  onShareImage?: (context: JuryShareSheetActionContext) => Promise<void>;
  onSaveImage?: (
    format: JuryShareFormat,
    context: JuryShareSheetActionContext,
  ) => Promise<void>;
  onCopyText?: () => Promise<void>;
  className?: string;
};

function resolveThemeAvailability(
  themes: readonly JuryShareThemeAvailability[],
  themeId: JuryShareThemeId,
): JuryShareThemeAvailability {
  return (
    themes.find((theme) => theme.id === themeId) ?? {
      id: themeId,
      state: "unsupported",
      reason: "This design is not available from the current Solaris projection.",
    }
  );
}

function buildSafeDefaultModel(projection: JuryShareProjection): DefaultJuryShareModel | null {
  if (!projection.publication.shareable) return null;
  try {
    return buildDefaultJuryShareModel(projection);
  } catch {
    return null;
  }
}

function DefaultJurySharePreview({ model }: { model: DefaultJuryShareModel }) {
  return (
    <div
      aria-label={`${model.footerCountry} jury-vote share-card preview`}
      className="mx-auto flex aspect-[9/16] w-full max-w-[18rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 p-5 shadow-2xl"
      style={{ background: model.design.background, color: model.design.primaryForeground }}
      role="img"
    >
      <div className="space-y-0.5 text-center">
        <p className="text-[0.62rem] font-black tracking-[0.34em]">{model.contestLabel}</p>
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] opacity-70">
          {model.editionLabel}
        </p>
        <p className="text-[0.56rem] font-medium uppercase tracking-[0.1em] opacity-60">
          {model.showLabel}
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-1.5">
        {model.rows.map((row) => (
          <div
            key={row.recipientCountryId}
            className="flex min-h-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5"
            style={{
              background: row.emphasized
                ? model.design.twelvePointRow
                : model.design.standardRow,
              color: row.emphasized
                ? model.design.twelvePointForeground
                : model.design.standardRowForeground,
            }}
          >
            <div className="aspect-[3/2] h-4 shrink-0 overflow-hidden rounded-[0.2rem] bg-black/10">
              <img
                src={row.flagAsset.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <span className="min-w-0 flex-1 truncate text-[0.62rem] font-bold">{row.country}</span>
            <span className="font-mono text-[0.72rem] font-black tabular-nums">
              {row.pointsLabel}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-center">
        <p
          className="text-[0.52rem] font-bold tracking-[0.2em]"
          style={{ color: model.design.secondaryForeground }}
        >
          {model.footerLabel}
        </p>
        <p className="mt-0.5 text-lg font-black uppercase tracking-[0.04em]">
          {model.footerCountry}
        </p>
      </div>
    </div>
  );
}

export function V3JuryShareSheet({
  projection,
  themes,
  previewByTheme,
  onShareImage,
  onSaveImage,
  onCopyText,
  className,
}: V3JuryShareSheetProps) {
  const [selectedTheme, setSelectedTheme] = useState<JuryShareThemeId>("default");
  const [busyAction, setBusyAction] = useState<"share" | "png" | "jpeg" | "copy" | null>(null);
  const defaultModel = useMemo(() => buildSafeDefaultModel(projection), [projection]);
  const projectionValid = Boolean(defaultModel);
  const selectedAvailability = resolveThemeAvailability(themes, selectedTheme);
  const selectedAvailable = selectedAvailability.state === "available";
  const actionsAvailable = projection.publication.shareable && projectionValid && selectedAvailable;
  const actionContext: JuryShareSheetActionContext = {
    themeId: selectedTheme,
    outputTarget: "story",
  };

  useEffect(() => {
    const selected = resolveThemeAvailability(themes, selectedTheme);
    if (selected.state !== "available") setSelectedTheme("default");
  }, [selectedTheme, themes]);

  async function runAction(
    action: "share" | "png" | "jpeg" | "copy",
    callback: (() => Promise<void>) | undefined,
  ) {
    if (!callback || busyAction || !actionsAvailable) return;
    setBusyAction(action);
    try {
      await callback();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Jury Share action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className={className} disabled={!projection.publication.shareable || !projectionValid}>
          <Share2 aria-hidden="true" />
          Share votes
        </Button>
      </SheetTrigger>

      <SheetContent
        side="responsive"
        className="overflow-y-auto bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[min(34rem,56vw)] sm:max-w-[34rem]"
      >
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>
            {projection.edition.name} · {projection.show.name}
          </SheetTitle>
          <SheetDescription>{projection.source.displayName} jury vote</SheetDescription>
        </SheetHeader>

        <section className="mt-6" aria-labelledby="jury-share-design-heading">
          <div className="mb-3">
            <h3 id="jury-share-design-heading" className="text-sm font-semibold">
              Choose design
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Default is selected first. Edition and Liquid Glass unlock only when the authoritative theme projection marks them available.
            </p>
          </div>

          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Share-card design"
          >
            {THEME_ORDER.map((themeId) => {
              const availability = resolveThemeAvailability(themes, themeId);
              const selected = selectedTheme === themeId;
              const disabled = availability.state !== "available";
              return (
                <button
                  key={themeId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setSelectedTheme(themeId)}
                  className="min-h-24 rounded-2xl border border-border bg-card p-3 text-left transition-[border-color,background-color,transform] hover:bg-muted/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:active:scale-100"
                  data-selected={selected ? "true" : "false"}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{THEME_COPY[themeId].label}</span>
                    {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {disabled ? availability.reason ?? "Unavailable" : THEME_COPY[themeId].detail}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6" aria-labelledby="jury-share-preview-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 id="jury-share-preview-heading" className="text-sm font-semibold">
                Preview
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Story · {JURY_SHARE_TARGETS.story.width} × {JURY_SHARE_TARGETS.story.height} · 9:16
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {THEME_COPY[selectedTheme].label}
            </span>
          </div>

          <div className="rounded-[2rem] border border-border bg-muted/25 p-4 sm:p-6">
            {selectedTheme === "default" && defaultModel ? (
              <DefaultJurySharePreview model={defaultModel} />
            ) : previewByTheme?.[selectedTheme as Exclude<JuryShareThemeId, "default">] ? (
              previewByTheme[selectedTheme as Exclude<JuryShareThemeId, "default">]
            ) : (
              <div className="mx-auto grid aspect-[9/16] w-full max-w-[18rem] place-items-center rounded-[1.75rem] border border-dashed border-border bg-background p-6 text-center">
                <div>
                  <ImageDown className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">Official preview pending</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    This presentation primitive does not invent an Edition or Liquid Glass renderer.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 space-y-2" aria-label="Share actions">
          <Button
            className="h-11 w-full"
            disabled={!actionsAvailable || !onShareImage || busyAction !== null}
            onClick={() => void runAction("share", () => onShareImage?.(actionContext) ?? Promise.resolve())}
          >
            <Share2 aria-hidden="true" />
            {busyAction === "share" ? "Preparing image…" : "Share image"}
          </Button>
          <Button
            variant="secondary"
            className="h-11 w-full"
            disabled={!actionsAvailable || !onSaveImage || busyAction !== null}
            onClick={() => void runAction("png", () => onSaveImage?.("png", actionContext) ?? Promise.resolve())}
          >
            <Download aria-hidden="true" />
            {busyAction === "png" ? "Preparing PNG…" : "Save PNG"}
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={!actionsAvailable || !onCopyText || busyAction !== null}
            onClick={() => void runAction("copy", onCopyText)}
          >
            <Copy aria-hidden="true" />
            {busyAction === "copy" ? "Copying…" : "Copy votes as text"}
          </Button>

          <details className="rounded-xl border border-border bg-card px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium">More options</summary>
            <div className="pt-2">
              <Button
                variant="ghost"
                className="h-11 w-full justify-start"
                disabled={!actionsAvailable || !onSaveImage || busyAction !== null}
                onClick={() => void runAction("jpeg", () => onSaveImage?.("jpeg", actionContext) ?? Promise.resolve())}
              >
                <Download aria-hidden="true" />
                {busyAction === "jpeg" ? "Preparing JPEG…" : "Save JPEG"}
              </Button>
            </div>
          </details>
        </section>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          The owning consumer must revalidate the current published Result Version before every export. This sheet only presents the verified projection and delegates authoritative actions.
        </p>

        <div className="sr-only" aria-live="polite">
          {busyAction ? `Jury Share ${busyAction} action in progress` : ""}
        </div>
      </SheetContent>
    </Sheet>
  );
}
