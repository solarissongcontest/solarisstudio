"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  PRESET_IDS,
  PRESET_LABELS,
  buildPreset,
  type BroadcastRowData,
  type PresetId,
  type ScoreboardConfig,
} from "@/lib/scoreboard";

import type {
  ThemeConfig,
} from "@/lib/theme";

import {
  ScoreboardBoard,
} from "@/components/broadcast/ScoreboardBoard";

import {
  ColorField,
  Field,
  SegButtons,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "@/components/studio/Controls";

type ScoreboardEditorProps = {
  config: ScoreboardConfig;
  onChange: (next: ScoreboardConfig) => void;
  rows: BroadcastRowData[];
  theme: ThemeConfig;
  showName: string;
  onReset?: () => void;
};

type BackgroundChoice = "theme" | "image" | "gradient" | "color";
type CardFill = "country" | "theme" | "color" | "gradient" | "none";

export function ScoreboardEditor({
  config,
  onChange,
  rows,
  theme,
  showName,
  onReset,
}: ScoreboardEditorProps) {
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const automaticColumns = columnsForCount(rows.length);

  const set = (patch: Partial<ScoreboardConfig>) =>
    onChange({ ...config, ...patch });

  const setLayout = (patch: Partial<ScoreboardConfig["layout"]>) =>
    set({ layout: { ...config.layout, ...patch } });

  const setCard = (patch: Partial<ScoreboardConfig["card"]>) =>
    set({ card: { ...config.card, ...patch } });

  const editionBackground = (type: ScoreboardConfig["background"]["type"] = config.background.type) => ({
    ...config.background,
    type,
    color: theme.background.color,
    gradientFrom: theme.background.gradientFrom,
    gradientTo: theme.background.gradientTo,
    gradientAngle: theme.background.gradientAngle,
    pattern: "none" as const,
    patternOpacity: 0,
  });

  const setBackground = (patch: Partial<ScoreboardConfig["background"]>) =>
    set({
      background: {
        ...editionBackground(),
        ...patch,
      },
    });

  const setHeader = (patch: Partial<ScoreboardConfig["header"]>) =>
    set({ header: { ...config.header, ...patch } });

  const setZoneVisible = (types: string[], visible: boolean) =>
    setCard({
      zones: config.card.zones.map((zone) =>
        types.includes(zone.type) ? { ...zone, visible } : zone,
      ),
    });

  const zoneVisible = (types: string[]) =>
    config.card.zones.some((zone) => types.includes(zone.type) && zone.visible);

  /* Keep every non-image scoreboard background attached to the edition palette.
     This repairs old saved configs that still contain preset/background colours from before
     Artwork & colours became the single source of truth. */
  useEffect(() => {
    if (config.background.type === "image") return;
    const next = editionBackground(config.background.type);
    const changed =
      config.background.color !== next.color ||
      config.background.gradientFrom !== next.gradientFrom ||
      config.background.gradientTo !== next.gradientTo ||
      config.background.gradientAngle !== next.gradientAngle ||
      config.background.pattern !== "none" ||
      config.background.patternOpacity !== 0;
    if (changed) onChange({ ...config, background: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    theme.background.color,
    theme.background.gradientFrom,
    theme.background.gradientTo,
    theme.background.gradientAngle,
    config.background.type,
  ]);

  const applyPreset = (presetId: PresetId) => {
    const preset = buildPreset(presetId);
    preset.music = config.music;
    preset.controls = config.controls;
    preset.background = {
      ...preset.background,
      color: theme.background.color,
      gradientFrom: theme.background.gradientFrom,
      gradientTo: theme.background.gradientTo,
      gradientAngle: theme.background.gradientAngle,
      pattern: "none",
      patternOpacity: 0,
    };
    preset.layout = {
      ...preset.layout,
      columns: automaticColumns,
      rowsPerColumn:
        automaticColumns > 1
          ? Math.ceil(Math.max(rows.length, 1) / automaticColumns)
          : null,
      boardWidth: boardWidthForColumns(automaticColumns),
    };
    onChange(preset);
  };

  const backgroundChoice =
    (config.background.type === "transparent" ? "theme" : config.background.type) as BackgroundChoice;
  const cardFill = config.card.background.fill as CardFill;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-background/95 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Preview</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {showName} · {rows.length} entries · {automaticColumns} column{automaticColumns === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium"
          >
            Full preview
          </button>
        </div>
        <ResponsivePreview config={config} theme={theme} rows={rows} showName={showName} />
      </section>

      <SimpleSection
        title="1. Starting look"
        description="Choose a base style. Everything below can still be changed."
      >
        <Field label="Style">
          <Select
            value={config.card.preset}
            onChange={(event) => applyPreset(event.target.value as PresetId)}
          >
            {PRESET_IDS.map((presetId) => (
              <option key={presetId} value={presetId} className="bg-background">
                {PRESET_LABELS[presetId]}
              </option>
            ))}
          </Select>
        </Field>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 min-h-10 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            Reset to edition default
          </button>
        )}
      </SimpleSection>

      <SimpleSection
        title="2. Background"
        description="Uses the colours from Artwork & colours. Choose only how those edition colours are presented here."
      >
        <Field label="Background">
          <SegButtons
            value={backgroundChoice}
            onChange={(value) => {
              const next = value as BackgroundChoice;
              if (next === "image") return setBackground({ type: "image" });
              if (next === "gradient") return setBackground({ type: "gradient", gradientFrom: theme.background.gradientFrom, gradientTo: theme.background.gradientTo, gradientAngle: theme.background.gradientAngle });
              if (next === "color") return setBackground({ type: "color", color: theme.background.color });
              setBackground({ type: "theme", color: theme.background.color, gradientFrom: theme.background.gradientFrom, gradientTo: theme.background.gradientTo, gradientAngle: theme.background.gradientAngle });
            }}
            options={[
              { label: "Edition", value: "theme" },
              { label: "Image", value: "image" },
              { label: "Gradient", value: "gradient" },
              { label: "Solid", value: "color" },
            ]}
          />
        </Field>

        {backgroundChoice === "image" && (
          <div className="mt-4 space-y-3">
            <Field label="Background image" hint="Paste the direct public URL of the image.">
              <TextInput
                value={config.background.imageUrl ?? ""}
                placeholder="https://..."
                onChange={(event) =>
                  setBackground({ type: "image", imageUrl: event.target.value || null })
                }
              />
            </Field>
            {config.background.imageUrl && (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <img
                  src={config.background.imageUrl}
                  alt="Background preview"
                  className="aspect-video w-full object-cover"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setBackground({ imageUrl: null, type: "theme" })}
              className="min-h-10 rounded-xl border border-border px-3 text-sm"
            >
              Remove image
            </button>
          </div>
        )}

        {backgroundChoice === "gradient" && (
          <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
            Gradient colours are inherited automatically from <strong className="text-foreground">Artwork & colours</strong>: {theme.background.gradientFrom} → {theme.background.gradientTo}.
          </div>
        )}

        {backgroundChoice === "color" && (
          <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
            Solid background uses the edition's saved <strong className="text-foreground">Background</strong> colour: {theme.background.color}.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Darkness" hint="Dark overlay on top of the background.">
            <Slider
              min={0}
              max={0.8}
              step={0.05}
              value={config.background.overlay}
              onChange={(overlay) => setBackground({ overlay })}
            />
          </Field>
          <Field label="Soft blur" hint="Blur the background slightly, not the country cards.">
            <Slider
              min={0}
              max={18}
              step={1}
              value={config.background.blur}
              onChange={(blur) => setBackground({ blur })}
              suffix="px"
            />
          </Field>
        </div>
      </SimpleSection>

      <SimpleSection
        title="3. Country cards"
        description="One card design is reused everywhere this edition shows country rows."
      >
        <Field label="Card fill">
          <SegButtons
            value={cardFill}
            onChange={(value) =>
              setCard({
                background: {
                  ...config.card.background,
                  fill: value as CardFill,
                },
              })
            }
            options={[
              { label: "Country", value: "country" },
              { label: "Edition", value: "theme" },
              { label: "Solid", value: "color" },
              { label: "Gradient", value: "gradient" },
              { label: "None", value: "none" },
            ]}
          />
        </Field>

        {(cardFill === "color" || cardFill === "gradient") && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ColorField
              label="Card colour"
              value={config.card.background.color}
              onChange={(color) =>
                setCard({ background: { ...config.card.background, color } })
              }
            />
            {cardFill === "gradient" && (
              <ColorField
                label="Second colour"
                value={config.card.background.color2}
                onChange={(color2) =>
                  setCard({ background: { ...config.card.background, color2 } })
                }
              />
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Card height">
            <Slider min={30} max={90} step={1} value={config.card.height} onChange={(height) => setCard({ height })} suffix="px" />
          </Field>
          <Field label="Roundness">
            <Slider min={0} max={40} step={1} value={Math.min(config.card.radius, 40)} onChange={(radius) => setCard({ radius })} suffix="px" />
          </Field>
          <Field label="Card opacity">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={config.card.background.opacity}
              onChange={(opacity) => setCard({ background: { ...config.card.background, opacity } })}
            />
          </Field>
          <Field label="Card blur">
            <Slider
              min={0}
              max={30}
              step={1}
              value={config.card.background.blur}
              onChange={(blur) => setCard({ background: { ...config.card.background, blur } })}
              suffix="px"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle label="Show rank" checked={zoneVisible(["rank"])} onChange={(visible) => setZoneVisible(["rank"], visible)} />
          <Toggle label="Show flag" checked={zoneVisible(["flag"])} onChange={(visible) => setZoneVisible(["flag"], visible)} />
          <Toggle label="Show country name" checked={zoneVisible(["country-name"])} onChange={(visible) => setZoneVisible(["country-name"], visible)} />
          <Toggle label="Show score" checked={zoneVisible(["score"])} onChange={(visible) => setZoneVisible(["score"], visible)} />
          <Toggle
            label="Show jury / televote split"
            checked={zoneVisible(["jury-score", "televote-score"])}
            onChange={(visible) => setZoneVisible(["jury-score", "televote-score"], visible)}
          />
          <Toggle
            label="Show running-order number"
            checked={zoneVisible(["running-order"])}
            onChange={(visible) => setZoneVisible(["running-order"], visible)}
          />
        </div>
      </SimpleSection>

      <SimpleSection
        title="4. Title"
        description="Optional heading shown above the scoreboard."
      >
        <Toggle
          label="Show title"
          checked={config.header.visible}
          onChange={(visible) => setHeader({ visible })}
        />
        {config.header.visible && (
          <div className="mt-4 space-y-3">
            <Field label="Main title">
              <TextInput
                value={config.header.main.text}
                placeholder="Results"
                onChange={(event) =>
                  setHeader({ main: { ...config.header.main, text: event.target.value } })
                }
              />
            </Field>
            <Field label="Small title">
              <TextInput
                value={config.header.upper.text}
                placeholder="Grand Final"
                onChange={(event) =>
                  setHeader({ upper: { ...config.header.upper, text: event.target.value } })
                }
              />
            </Field>
          </div>
        )}
      </SimpleSection>

      <details className="rounded-2xl border border-border bg-surface/35">
        <summary className="cursor-pointer list-none p-4">
          <p className="text-sm font-semibold">More options</p>
          <p className="mt-1 text-xs text-muted-foreground">Only open this if something actually needs adjusting.</p>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <Field label="Row spacing">
            <Slider min={0} max={24} step={1} value={config.layout.rowGap} onChange={(rowGap) => setLayout({ rowGap })} suffix="px" />
          </Field>
          <Field label="Column spacing">
            <Slider min={0} max={60} step={1} value={config.layout.columnGap} onChange={(columnGap) => setLayout({ columnGap })} suffix="px" />
          </Field>
          <Field label="Horizontal card padding">
            <Slider min={0} max={30} step={1} value={config.card.paddingX} onChange={(paddingX) => setCard({ paddingX })} suffix="px" />
          </Field>
          <Field label="Card border">
            <Slider
              min={0}
              max={4}
              step={1}
              value={config.card.border.width}
              onChange={(width) =>
                setCard({
                  border: {
                    ...config.card.border,
                    width,
                    style: width === 0 ? "none" : "solid",
                  },
                })
              }
              suffix="px"
            />
          </Field>
          {config.card.border.width > 0 && (
            <ColorField
              label="Border colour"
              value={config.card.border.color}
              onChange={(color) => setCard({ border: { ...config.card.border, color } })}
            />
          )}
        </div>
      </details>

      {previewModalOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black px-3 py-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Full preview</p>
              <p className="text-[11px] text-white/55">{showName}</p>
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
            <FullScreenPreview config={config} theme={theme} rows={rows} showName={showName} />
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ResponsivePreview({
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

  return (
    <div
      ref={hostRef}
      className="relative w-full overflow-hidden bg-black"
      style={{
        height: width === 0 ? 180 : Math.min(naturalHeight, 240),
        maxHeight: "34vh",
      }}
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
            config={{
              ...config,
              background: {
                ...config.background,
                pattern: "none",
                patternOpacity: 0,
              },
            }}
            theme={theme}
            rows={rows}
            title={showName}
            scale={1}
            animate={false}
          />
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
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
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
            transformOrigin: "center",
          }}
        >
          <ScoreboardBoard
            config={{
              ...config,
              background: {
                ...config.background,
                pattern: "none",
                patternOpacity: 0,
              },
            }}
            theme={theme}
            rows={rows}
            title={showName}
            scale={1}
            animate={false}
          />
        </div>
      )}
    </div>
  );
}

function columnsForCount(count: number): 1 | 2 | 3 | 4 {
  if (count <= 14) return 1;
  if (count <= 30) return 2;
  if (count <= 48) return 3;
  return 4;
}

function boardWidthForColumns(columns: 1 | 2 | 3 | 4) {
  switch (columns) {
    case 1:
      return 920;
    case 2:
      return 1280;
    case 3:
      return 1460;
    case 4:
      return 1600;
  }
}