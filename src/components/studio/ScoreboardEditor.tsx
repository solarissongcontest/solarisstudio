"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  PRESET_DESCRIPTIONS,
  PRESET_IDS,
  PRESET_LABELS,
  buildPreset,
  type BroadcastRowData,
  type PresetId,
  type ScoreboardConfig,
} from "@/lib/scoreboard";

import type { ThemeConfig } from "@/lib/theme";

import { ScoreboardBoard } from "@/components/broadcast/ScoreboardBoard";
import { ScoreboardZoneEditor } from "@/components/studio/ScoreboardZoneEditor";
import {
  Field,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "@/components/studio/Controls";

import { cn } from "@/lib/utils";

type EditorTab =
  | "style"
  | "layout"
  | "card"
  | "layers"
  | "background"
  | "panel";

const EDITOR_TABS: Array<{
  id: EditorTab;
  label: string;
  short: string;
}> = [
  { id: "style", label: "Style", short: "Style" },
  { id: "layout", label: "Layout", short: "Layout" },
  { id: "card", label: "Card", short: "Card" },
  { id: "layers", label: "Layers", short: "Layers" },
  { id: "background", label: "Background", short: "BG" },
  { id: "panel", label: "Jury panel", short: "Panel" },
];

type ScoreboardEditorProps = {
  config: ScoreboardConfig;
  onChange: (next: ScoreboardConfig) => void;
  rows: BroadcastRowData[];
  theme: ThemeConfig;
  showName: string;
  onReset?: () => void;
};

export function ScoreboardEditor({
  config,
  onChange,
  rows,
  theme,
  showName,
  onReset,
}: ScoreboardEditorProps) {
  const [tab, setTab] = useState<EditorTab>("style");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const set = (patch: Partial<ScoreboardConfig>) =>
    onChange({ ...config, ...patch });

  const setLayout = (patch: Partial<ScoreboardConfig["layout"]>) =>
    set({ layout: { ...config.layout, ...patch } });

  const setCard = (patch: Partial<ScoreboardConfig["card"]>) =>
    set({ card: { ...config.card, ...patch } });

  const setHeader = (patch: Partial<ScoreboardConfig["header"]>) =>
    set({ header: { ...config.header, ...patch } });

  const setBackground = (patch: Partial<ScoreboardConfig["background"]>) =>
    set({ background: { ...config.background, ...patch } });

  const setPanel = (patch: Partial<ScoreboardConfig["panel"]>) =>
    set({ panel: { ...config.panel, ...patch } });

  const applyPreset = (presetId: PresetId) => {
    const preset = buildPreset(presetId);

    // Production controls and music belong to the show, not to a visual preset.
    preset.music = config.music;
    preset.controls = config.controls;

    onChange(preset);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* ONE preview only                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div className="sticky top-0 z-30">
        <section className="overflow-hidden rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Broadcast preview</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {config.name || PRESET_LABELS[config.card.preset as PresetId] || "Custom scoreboard"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-lg bg-surface px-2 py-1 text-[10px] text-muted-foreground sm:inline">
                {config.canvas.width}×{config.canvas.height}
              </span>

              <button
                type="button"
                onClick={() => setPreviewModalOpen(true)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium"
              >
                Full preview
              </button>
            </div>
          </div>

          <ResponsivePreview
            config={config}
            theme={theme}
            rows={rows}
            showName={showName}
            expanded={false}
          />
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Editor navigation                                                  */}
      {/* ------------------------------------------------------------------ */}

      <div className="scroll-slim sticky top-[10.1rem] z-20 overflow-x-auto rounded-2xl border border-border bg-background/95 p-1 backdrop-blur sm:top-[18.5rem]">
        <div className="flex min-w-max gap-1">
          {EDITOR_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "min-h-10 rounded-xl px-3 text-sm font-medium transition sm:px-4",
                tab === item.id
                  ? "bg-surface-strong text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pb-3">
      {/* ------------------------------------------------------------------ */}
      {/* Style / presets                                                    */}
      {/* ------------------------------------------------------------------ */}

      {tab === "style" && (
        <EditorCard
          title="Scoreboard style"
          description="Start from a preset, then customise only what you need."
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PRESET_IDS.map((presetId) => {
              const selected = config.card.preset === presetId;

              return (
                <button
                  key={presetId}
                  type="button"
                  onClick={() => applyPreset(presetId)}
                  className={cn(
                    "overflow-hidden rounded-xl border text-left transition",
                    selected
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                      : "border-border bg-surface hover:border-primary/30",
                  )}
                >
                  <PresetSwatch presetId={presetId} theme={theme} />

                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {PRESET_LABELS[presetId]}
                      </p>

                      {selected && (
                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">
                          Active
                        </span>
                      )}
                    </div>

                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {PRESET_DESCRIPTIONS[presetId]}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Toggle
              label="Show header"
              checked={config.header.visible}
              onChange={(visible) => setHeader({ visible })}
            />

            <Field label="Main title">
              <TextInput
                value={config.header.main.text}
                placeholder="Automatic scene title"
                onChange={(e) =>
                  setHeader({
                    main: {
                      ...config.header.main,
                      text: e.target.value,
                    },
                  })
                }
              />
            </Field>

            <Field label="Upper title">
              <TextInput
                value={config.header.upper.text}
                onChange={(e) =>
                  setHeader({
                    upper: {
                      ...config.header.upper,
                      text: e.target.value,
                    },
                  })
                }
              />
            </Field>

            <Field label="Header spacing">
              <Slider
                min={0}
                max={100}
                step={1}
                value={config.header.marginBottom}
                onChange={(marginBottom) => setHeader({ marginBottom })}
                suffix="px"
              />
            </Field>
          </div>

          {onReset && (
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={onReset}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                Reset to automatic theme design
              </button>
            </div>
          )}
        </EditorCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Layout                                                             */}
      {/* ------------------------------------------------------------------ */}

      {tab === "layout" && (
        <EditorCard
          title="Board layout"
          description="Position and organise the scoreboard without touching the card design."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Columns">
              <Select
                value={String(config.layout.columns)}
                onChange={(e) =>
                  setLayout({
                    columns: Number(e.target.value) as 1 | 2 | 3 | 4,
                  })
                }
              >
                <option value="1">1 column</option>
                <option value="2">2 columns</option>
                <option value="3">3 columns</option>
                <option value="4">4 columns</option>
              </Select>
            </Field>

            <Field label="Distribution">
              <Select
                value={config.layout.distribution}
                onChange={(e) =>
                  setLayout({
                    distribution:
                      e.target.value as ScoreboardConfig["layout"]["distribution"],
                  })
                }
              >
                <option value="sequential">Sequential</option>
                <option value="balanced">Balanced</option>
                <option value="manual">Manual</option>
              </Select>
            </Field>

            <Field label="Horizontal alignment">
              <Select
                value={config.layout.alignment}
                onChange={(e) =>
                  setLayout({
                    alignment:
                      e.target.value as ScoreboardConfig["layout"]["alignment"],
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </Select>
            </Field>

            <Field label="Vertical alignment">
              <Select
                value={config.layout.verticalAlignment}
                onChange={(e) =>
                  setLayout({
                    verticalAlignment:
                      e.target.value as ScoreboardConfig["layout"]["verticalAlignment"],
                  })
                }
              >
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </Select>
            </Field>
          </div>

          <ControlGrid>
            <Field label="Board width">
              <Slider
                min={500}
                max={1700}
                step={10}
                value={config.layout.boardWidth}
                onChange={(boardWidth) => setLayout({ boardWidth })}
                suffix="px"
              />
            </Field>

            <Field label="Row gap">
              <Slider
                min={0}
                max={30}
                value={config.layout.rowGap}
                onChange={(rowGap) => setLayout({ rowGap })}
                suffix="px"
              />
            </Field>

            <Field label="Column gap">
              <Slider
                min={0}
                max={80}
                value={config.layout.columnGap}
                onChange={(columnGap) => setLayout({ columnGap })}
                suffix="px"
              />
            </Field>

            <Field label="Horizontal offset">
              <Slider
                min={-400}
                max={400}
                step={5}
                value={config.layout.positionX}
                onChange={(positionX) => setLayout({ positionX })}
                suffix="px"
              />
            </Field>

            <Field label="Vertical offset">
              <Slider
                min={-300}
                max={300}
                step={5}
                value={config.layout.positionY}
                onChange={(positionY) => setLayout({ positionY })}
                suffix="px"
              />
            </Field>
          </ControlGrid>
        </EditorCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Card                                                               */}
      {/* ------------------------------------------------------------------ */}

      {tab === "card" && (
        <EditorCard
          title="Country card"
          description="Change the overall row. Individual pieces such as flag and score are under Layers."
        >
          <ControlGrid>
            <Field label="Card height">
              <Slider
                min={28}
                max={100}
                value={config.card.height}
                onChange={(height) => setCard({ height })}
                suffix="px"
              />
            </Field>

            <Field label="Corner radius">
              <Slider
                min={0}
                max={60}
                value={Math.min(config.card.radius, 60)}
                onChange={(radius) => setCard({ radius })}
                suffix="px"
              />
            </Field>

            <Field label="Internal gap">
              <Slider
                min={0}
                max={30}
                value={config.card.gap}
                onChange={(gap) => setCard({ gap })}
                suffix="px"
              />
            </Field>

            <Field label="Horizontal padding">
              <Slider
                min={0}
                max={40}
                value={config.card.paddingX}
                onChange={(paddingX) => setCard({ paddingX })}
                suffix="px"
              />
            </Field>

            <Field label="Opacity">
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={config.card.opacity}
                onChange={(opacity) => setCard({ opacity })}
              />
            </Field>
          </ControlGrid>

          <Toggle
            label="Clip card contents"
            checked={config.card.overflow === "hidden"}
            onChange={(value) =>
              setCard({
                overflow: value ? "hidden" : "visible",
              })
            }
          />
        </EditorCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Layers                                                             */}
      {/* ------------------------------------------------------------------ */}

      {tab === "layers" && (
        <EditorCard
          title="Card layers"
          description="Edit the flag, country name, score and decorative bands."
          flush
        >
          <ScoreboardZoneEditor
            zones={config.card.zones}
            layoutMode={config.card.layoutMode}
            onChange={(zones) => setCard({ zones })}
          />
        </EditorCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Background                                                         */}
      {/* ------------------------------------------------------------------ */}

      {tab === "background" && (
        <EditorCard
          title="Background"
          description="Choose what sits behind the scoreboard."
        >
          <Field label="Background source">
            <Select
              value={config.background.type}
              onChange={(e) =>
                setBackground({
                  type:
                    e.target.value as ScoreboardConfig["background"]["type"],
                })
              }
            >
              <option value="theme">Show theme</option>
              <option value="gradient">Gradient</option>
              <option value="color">Solid colour</option>
              <option value="image">Image</option>
              <option value="transparent">Transparent</option>
            </Select>
          </Field>

          {config.background.type === "color" && (
            <Field label="Colour">
              <TextInput
                value={config.background.color}
                onChange={(e) =>
                  setBackground({
                    color: e.target.value,
                  })
                }
              />
            </Field>
          )}

          {config.background.type === "gradient" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gradient start">
                <TextInput
                  value={config.background.gradientFrom}
                  onChange={(e) =>
                    setBackground({
                      gradientFrom: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Gradient end">
                <TextInput
                  value={config.background.gradientTo}
                  onChange={(e) =>
                    setBackground({
                      gradientTo: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Gradient angle">
                <Slider
                  min={0}
                  max={360}
                  value={config.background.gradientAngle}
                  onChange={(gradientAngle) =>
                    setBackground({
                      gradientAngle,
                    })
                  }
                  suffix="°"
                />
              </Field>
            </div>
          )}

          {config.background.type === "image" && (
            <Field label="Image URL">
              <TextInput
                value={config.background.imageUrl ?? ""}
                placeholder="https://..."
                onChange={(e) =>
                  setBackground({
                    imageUrl: e.target.value || null,
                  })
                }
              />
            </Field>
          )}

          <ControlGrid>
            <Field label="Dark overlay">
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={config.background.overlay}
                onChange={(overlay) => setBackground({ overlay })}
              />
            </Field>

            <Field label="Vignette">
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={config.background.vignette}
                onChange={(vignette) => setBackground({ vignette })}
              />
            </Field>

            <Field label="Blur">
              <Slider
                min={0}
                max={30}
                value={config.background.blur}
                onChange={(blur) => setBackground({ blur })}
                suffix="px"
              />
            </Field>
          </ControlGrid>
        </EditorCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Jury panel                                                         */}
      {/* ------------------------------------------------------------------ */}

      {tab === "panel" && (
        <EditorCard
          title="Current jury panel"
          description="Optional area for the country, person or organisation currently voting."
        >
          <Toggle
            label="Show current voter panel"
            checked={config.panel.visible}
            onChange={(visible) => setPanel({ visible })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Position">
              <Select
                value={config.panel.side}
                onChange={(e) =>
                  setPanel({
                    side: e.target.value as ScoreboardConfig["panel"]["side"],
                  })
                }
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="floating">Floating</option>
              </Select>
            </Field>

            <Field label="Panel size">
              <Slider
                min={160}
                max={600}
                step={10}
                value={config.panel.size}
                onChange={(size) => setPanel({ size })}
                suffix="px"
              />
            </Field>
          </div>

          <Field label="Panel label">
            <TextInput
              value={config.panel.label}
              placeholder="Now voting"
              onChange={(e) =>
                setPanel({
                  label: e.target.value,
                })
              }
            />
          </Field>

          <Field label="Corner radius">
            <Slider
              min={0}
              max={60}
              value={config.panel.radius}
              onChange={(radius) => setPanel({ radius })}
              suffix="px"
            />
          </Field>
        </EditorCard>
      )}
      </div>
      {previewModalOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black px-3 py-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Full broadcast preview</p>
              <p className="text-[11px] text-white/55">
                {config.canvas.width}×{config.canvas.height}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPreviewModalOpen(false)}
              className="min-h-10 rounded-xl border border-white/20 px-3 text-sm"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <FullScreenPreview
              config={config}
              theme={theme}
              rows={rows}
              showName={showName}
            />
          </div>
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Responsive preview                                                        */
/* -------------------------------------------------------------------------- */

function ResponsivePreview({
  config,
  theme,
  rows,
  showName,
  expanded,
}: {
  config: ScoreboardConfig;
  theme: ThemeConfig;
  rows: BroadcastRowData[];
  showName: string;
  expanded: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    const update = () => setWidth(element.clientWidth);

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const sourceWidth = config.canvas.width || 1920;
  const sourceHeight = config.canvas.height || 1080;
  const scale = width > 0 ? width / sourceWidth : 0;
  const naturalHeight = sourceHeight * scale;

  // The editor preview is intentionally capped. The actual broadcast remains 1920×1080.
  const maxHeight = expanded ? 520 : 300;
  const mobileMaxHeight = expanded ? 220 : 160;

  return (
    <div
      ref={hostRef}
      className="relative w-full overflow-hidden bg-black"
      style={{
        height:
          width === 0
            ? 180
            : `min(${naturalHeight}px, ${maxHeight}px)`,
        maxHeight: `min(${maxHeight}px, 48vh)`,
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          [data-scoreboard-preview-host="true"] {
            max-height: ${mobileMaxHeight}px !important;
          }
        }
      `}</style>

      <div
        data-scoreboard-preview-host="true"
        className="absolute inset-0 overflow-hidden bg-black"
      >
        {scale > 0 && (
          <div
            className="absolute left-0 top-0"
            style={{
              width: sourceWidth,
              height: sourceHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <ScoreboardBoard
              config={config}
              theme={theme}
              rows={rows}
              title="JURY RESULTS"
              subtitle={showName}
              progress={0.56}
              animate={false}
              panelContent={<PreviewVoter />}
            />
          </div>
        )}
      </div>

      {!rows.length && (
        <div className="absolute inset-0 grid place-items-center bg-black/45 p-6 text-center">
          <p className="rounded-xl bg-black/55 px-3 py-2 text-xs text-white/70 backdrop-blur">
            Add entries to see real countries in the preview.
          </p>
        </div>
      )}
    </div>
  );
}

function FullScreenPreview({
  config,
  theme,
  rows,
  showName,
}: {
  config: ScoreboardConfig;
  theme: ThemeConfig;
  rows: BroadcastRowData[];
  showName: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    const update = () =>
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const sourceWidth = config.canvas.width || 1920;
  const sourceHeight = config.canvas.height || 1080;
  const scale =
    size.width && size.height
      ? Math.min(size.width / sourceWidth, size.height / sourceHeight)
      : 0;

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden bg-black">
      {scale > 0 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: sourceWidth,
            height: sourceHeight,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <ScoreboardBoard
            config={config}
            theme={theme}
            rows={rows}
            title="JURY RESULTS"
            subtitle={showName}
            progress={0.56}
            animate={false}
            panelContent={<PreviewVoter />}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lightweight preset swatches                                               */
/* -------------------------------------------------------------------------- */

function PresetSwatch({
  presetId,
  theme,
}: {
  presetId: PresetId;
  theme: ThemeConfig;
}) {
  const preset = useMemo(() => buildPreset(presetId), [presetId]);

  const zones = preset.card.zones
    .filter((zone) => zone.visible)
    .slice(0, 7);

  return (
    <div
      className="relative h-20 overflow-hidden border-b border-border"
      style={{
        background:
          preset.background.type === "color"
            ? preset.background.color
            : preset.background.type === "gradient"
              ? `linear-gradient(${preset.background.gradientAngle}deg, ${preset.background.gradientFrom}, ${preset.background.gradientTo})`
              : `linear-gradient(135deg, ${theme.background.gradientFrom}, ${theme.background.gradientTo})`,
      }}
    >
      <div className="absolute inset-x-3 top-3 space-y-2">
        {[0, 1].map((row) => (
          <div
            key={row}
            className="flex h-5 overflow-hidden"
            style={{
              borderRadius: Math.min(preset.card.radius, 10),
              opacity: row === 1 ? 0.72 : 1,
              background: "rgba(255,255,255,.08)",
            }}
          >
            {zones.map((zone, index) => (
              <span
                key={`${zone.id}-${index}`}
                style={{
                  width:
                    zone.width != null
                      ? Math.max(10, Math.min(zone.width / 3, 46))
                      : zone.grow > 0
                        ? 80
                        : 24,
                  flexGrow: zone.grow > 0 ? 1 : 0,
                  background:
                    zone.type === "flag"
                      ? theme.colors.primary
                      : zone.surface.fill === "country"
                        ? theme.colors.accent
                        : zone.type.includes("score")
                          ? theme.colors.secondary
                          : index % 2
                            ? "rgba(255,255,255,.14)"
                            : "rgba(255,255,255,.08)",
                  clipPath:
                    zone.shape.kind === "parallelogram" ||
                    zone.shape.kind === "trapezoid" ||
                    zone.shape.kind === "wedge"
                      ? "polygon(12% 0,100% 0,88% 100%,0 100%)"
                      : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* General UI                                                                */
/* -------------------------------------------------------------------------- */

function EditorCard({
  title,
  description,
  children,
  flush = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface/30",
        !flush && "p-3 sm:p-4",
      )}
    >
      <div className={cn(flush && "px-3 pt-3 sm:px-4 sm:pt-4")}>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <div
        className={cn(
          "space-y-4",
          flush ? "mt-3" : "mt-4",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function ControlGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function PreviewVoter() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="grid aspect-[3/2] w-full max-w-52 place-items-center rounded-xl bg-primary/25 text-3xl font-black">
        OLA
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.3em] opacity-50">
        Now voting
      </p>
      <p className="mt-2 text-xl font-bold">Oland</p>
    </div>
  );
}
