"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type CardTemplateConfig,
  type CardZoneConfig,
  type ShapeKind,
  type ZoneType,
} from "@/lib/scoreboard";

import {
  Field,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "@/components/studio/Controls";

import { cn } from "@/lib/utils";

const ZONE_TYPES: Array<{ value: ZoneType; label: string }> = [
  { value: "rank", label: "Rank" },
  { value: "running-order", label: "Running order" },
  { value: "flag", label: "Flag" },
  { value: "country-name", label: "Country name" },
  { value: "score", label: "Total score" },
  { value: "jury-score", label: "Jury score" },
  { value: "televote-score", label: "Televote score" },
  { value: "movement", label: "Movement" },
  { value: "qualification", label: "Qualification" },
  { value: "custom-text", label: "Custom text" },
  { value: "image", label: "Image" },
  { value: "spacer", label: "Spacer" },
  { value: "decoration", label: "Decoration placeholder" },
];

const SHAPES: ShapeKind[] = [
  "rect",
  "rounded",
  "pill",
  "circle",
  "square",
  "tab",
  "ribbon",
  "trapezoid",
  "wedge",
  "parallelogram",
  "polygon",
];

const TEXT_ZONE_TYPES = new Set<ZoneType>([
  "rank",
  "running-order",
  "country-name",
  "score",
  "jury-score",
  "televote-score",
  "movement",
  "qualification",
  "custom-text",
]);

export function ScoreboardZoneEditor({
  zones,
  layoutMode,
  onChange,
}: {
  zones: CardZoneConfig[];
  layoutMode: CardTemplateConfig["layoutMode"];
  onChange: (zones: CardZoneConfig[]) => void;
}) {
  const ordered = useMemo(
    () => [...zones].sort((a, b) => a.order - b.order),
    [zones],
  );

  const [selectedId, setSelectedId] = useState<string>(ordered[0]?.id ?? "");
  const [newType, setNewType] = useState<ZoneType>("country-name");

  useEffect(() => {
    if (!ordered.length) {
      setSelectedId("");
      return;
    }
    if (!ordered.some((zone) => zone.id === selectedId)) {
      setSelectedId(ordered[0].id);
    }
  }, [ordered, selectedId]);

  const selected = ordered.find((zone) => zone.id === selectedId) ?? null;

  const commit = (next: CardZoneConfig[]) => {
    onChange(
      [...next]
        .sort((a, b) => a.order - b.order)
        .map((zone, index) => ({ ...zone, order: index })),
    );
  };

  const patchSelected = (patch: Partial<CardZoneConfig>) => {
    if (!selected) return;
    commit(
      zones.map((zone) =>
        zone.id === selected.id ? { ...zone, ...patch } : zone,
      ),
    );
  };

  const replaceSelected = (next: CardZoneConfig) => {
    commit(zones.map((zone) => (zone.id === next.id ? next : zone)));
  };

  const move = (direction: -1 | 1) => {
    if (!selected) return;
    const index = ordered.findIndex((zone) => zone.id === selected.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const duplicate = () => {
    if (!selected) return;

    const copy = cloneZone(selected);
    copy.id = uniqueZoneId(selected.type, zones);
    copy.label = `${selected.label || zoneTypeLabel(selected.type)} copy`;
    copy.locked = false;

    const index = ordered.findIndex((zone) => zone.id === selected.id);
    const next = [...ordered];
    next.splice(index + 1, 0, copy);

    commit(next);
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (!selected || selected.locked) return;
    const index = ordered.findIndex((zone) => zone.id === selected.id);
    const next = ordered.filter((zone) => zone.id !== selected.id);
    commit(next);
    setSelectedId(next[Math.min(index, Math.max(0, next.length - 1))]?.id ?? "");
  };

  const add = () => {
    const zone = createZone(newType, zones);
    commit([...ordered, zone]);
    setSelectedId(zone.id);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-2xl border border-border bg-background/30 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Zones
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Top to bottom here means left to right inside a normal card.
            </p>
          </div>

          <div className="space-y-1.5">
            {ordered.map((zone, index) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedId(zone.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                  selectedId === zone.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-surface hover:bg-surface/70",
                )}
              >
                <span className="numeric w-5 shrink-0 text-center text-[10px] text-muted-foreground">
                  {index + 1}
                </span>

                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    zone.visible ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {zone.label || zoneTypeLabel(zone.type)}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {zone.type}
                    {zone.width ? ` · ${zone.width}px` : zone.grow ? ` · grow ${zone.grow}` : " · auto"}
                  </span>
                </span>

                {zone.locked && (
                  <span
                    title="Locked"
                    className="shrink-0 text-[10px] text-muted-foreground"
                  >
                    ◆
                  </span>
                )}
              </button>
            ))}

            {!ordered.length && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No zones. Add one below.
              </p>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <Select
              value={newType}
              onChange={(e) => setNewType(e.target.value as ZoneType)}
            >
              {ZONE_TYPES.map((type) => (
                <option key={type.value} value={type.value} className="bg-background">
                  {type.label}
                </option>
              ))}
            </Select>

            <button
              type="button"
              onClick={add}
              className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15"
            >
              + Add zone
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          {selected ? (
            <div className="space-y-5 rounded-2xl border border-border bg-background/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Selected zone
                  </p>
                  <h4 className="mt-1 text-base font-semibold">
                    {selected.label || zoneTypeLabel(selected.type)}
                  </h4>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {selected.id}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <MiniButton
                    label="↑"
                    title="Move zone earlier"
                    disabled={ordered[0]?.id === selected.id}
                    onClick={() => move(-1)}
                  />
                  <MiniButton
                    label="↓"
                    title="Move zone later"
                    disabled={ordered[ordered.length - 1]?.id === selected.id}
                    onClick={() => move(1)}
                  />
                  <MiniButton label="Duplicate" onClick={duplicate} />
                  <MiniButton
                    label="Delete"
                    destructive
                    disabled={!!selected.locked}
                    title={
                      selected.locked
                        ? "Unlock this zone before deleting it"
                        : "Delete zone"
                    }
                    onClick={remove}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Editor label">
                  <TextInput
                    value={selected.label ?? ""}
                    placeholder={zoneTypeLabel(selected.type)}
                    onChange={(e) =>
                      patchSelected({ label: e.target.value || undefined })
                    }
                  />
                </Field>

                <Field label="Zone type">
                  <Select
                    value={selected.type}
                    onChange={(e) => {
                      const type = e.target.value as ZoneType;
                      replaceSelected(convertZoneType(selected, type));
                    }}
                  >
                    {ZONE_TYPES.map((type) => (
                      <option key={type.value} value={type.value} className="bg-background">
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  label="Visible"
                  checked={selected.visible}
                  onChange={(visible) => patchSelected({ visible })}
                />
                <Toggle
                  label="Lock zone"
                  checked={!!selected.locked}
                  onChange={(locked) => patchSelected({ locked })}
                />
              </div>

              <Section title="Sizing & spacing">
                <div className="grid gap-3 sm:grid-cols-2">
                  <NullableNumber
                    label="Width"
                    value={selected.width}
                    min={1}
                    max={800}
                    autoLabel="Auto"
                    onChange={(width) => patchSelected({ width })}
                  />

                  <NullableNumber
                    label="Height"
                    value={selected.height}
                    min={1}
                    max={200}
                    autoLabel="Card height"
                    onChange={(height) => patchSelected({ height })}
                  />

                  <NullableNumber
                    label="Min width"
                    value={selected.minWidth}
                    min={1}
                    max={800}
                    onChange={(minWidth) => patchSelected({ minWidth })}
                  />

                  <NullableNumber
                    label="Max width"
                    value={selected.maxWidth}
                    min={1}
                    max={1200}
                    onChange={(maxWidth) => patchSelected({ maxWidth })}
                  />
                </div>

                <Field label="Grow">
                  <Slider
                    min={0}
                    max={6}
                    step={0.25}
                    value={selected.grow}
                    onChange={(grow) => patchSelected({ grow })}
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Horizontal padding">
                    <Slider
                      min={0}
                      max={60}
                      step={1}
                      value={selected.paddingX}
                      onChange={(paddingX) => patchSelected({ paddingX })}
                      suffix="px"
                    />
                  </Field>

                  <Field label="Vertical padding">
                    <Slider
                      min={0}
                      max={40}
                      step={1}
                      value={selected.paddingY}
                      onChange={(paddingY) => patchSelected({ paddingY })}
                      suffix="px"
                    />
                  </Field>

                  <Field label="Outer margin">
                    <Slider
                      min={-60}
                      max={60}
                      step={1}
                      value={selected.marginX}
                      onChange={(marginX) => patchSelected({ marginX })}
                      suffix="px"
                    />
                  </Field>

                  <Field label="Z-index">
                    <Slider
                      min={-10}
                      max={30}
                      step={1}
                      value={selected.z}
                      onChange={(z) => patchSelected({ z })}
                    />
                  </Field>

                  <Field label="Overlap left">
                    <Slider
                      min={-120}
                      max={120}
                      step={1}
                      value={selected.overlapLeft}
                      onChange={(overlapLeft) => patchSelected({ overlapLeft })}
                      suffix="px"
                    />
                  </Field>

                  <Field label="Overlap right">
                    <Slider
                      min={-120}
                      max={120}
                      step={1}
                      value={selected.overlapRight}
                      onChange={(overlapRight) => patchSelected({ overlapRight })}
                      suffix="px"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Alignment">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Horizontal">
                    <Select
                      value={selected.align}
                      onChange={(e) =>
                        patchSelected({
                          align: e.target.value as CardZoneConfig["align"],
                        })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </Select>
                  </Field>

                  <Field label="Vertical">
                    <Select
                      value={selected.valign}
                      onChange={(e) =>
                        patchSelected({
                          valign: e.target.value as CardZoneConfig["valign"],
                        })
                      }
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section title="Shape">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Shape">
                    <Select
                      value={selected.shape.kind}
                      onChange={(e) =>
                        patchSelected({
                          shape: {
                            ...selected.shape,
                            kind: e.target.value as ShapeKind,
                          },
                        })
                      }
                    >
                      {SHAPES.map((shape) => (
                        <option key={shape} value={shape} className="bg-background">
                          {shape}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Direction">
                    <Select
                      value={selected.shape.direction}
                      onChange={(e) =>
                        patchSelected({
                          shape: {
                            ...selected.shape,
                            direction: e.target.value as "left" | "right",
                          },
                        })
                      }
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Radius">
                  <Slider
                    min={0}
                    max={999}
                    step={1}
                    value={selected.shape.radius}
                    onChange={(radius) =>
                      patchSelected({
                        shape: { ...selected.shape, radius },
                      })
                    }
                    suffix="px"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Left slant">
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={selected.shape.leftSlant}
                      onChange={(leftSlant) =>
                        patchSelected({
                          shape: { ...selected.shape, leftSlant },
                        })
                      }
                      suffix="%"
                    />
                  </Field>

                  <Field label="Right slant">
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={selected.shape.rightSlant}
                      onChange={(rightSlant) =>
                        patchSelected({
                          shape: { ...selected.shape, rightSlant },
                        })
                      }
                      suffix="%"
                    />
                  </Field>

                  <Field label="Top inset">
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={selected.shape.topInset}
                      onChange={(topInset) =>
                        patchSelected({
                          shape: { ...selected.shape, topInset },
                        })
                      }
                      suffix="%"
                    />
                  </Field>

                  <Field label="Bottom inset">
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={selected.shape.bottomInset}
                      onChange={(bottomInset) =>
                        patchSelected({
                          shape: { ...selected.shape, bottomInset },
                        })
                      }
                      suffix="%"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Surface">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fill">
                    <Select
                      value={selected.surface.fill}
                      onChange={(e) =>
                        patchSelected({
                          surface: {
                            ...selected.surface,
                            fill: e.target.value as CardZoneConfig["surface"]["fill"],
                          },
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="color">Colour</option>
                      <option value="gradient">Gradient</option>
                      <option value="country">Country colour</option>
                      <option value="theme">Theme</option>
                    </Select>
                  </Field>

                  <Field
                    label="Colour token"
                    hint="Examples: #ffffff, transparent, country, theme:primary, theme:text"
                  >
                    <TextInput
                      value={selected.surface.color}
                      onChange={(e) =>
                        patchSelected({
                          surface: {
                            ...selected.surface,
                            color: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>

                  <Field label="Second colour">
                    <TextInput
                      value={selected.surface.color2}
                      onChange={(e) =>
                        patchSelected({
                          surface: {
                            ...selected.surface,
                            color2: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>

                  <Field label="Gradient angle">
                    <Slider
                      min={0}
                      max={360}
                      step={1}
                      value={selected.surface.angle}
                      onChange={(angle) =>
                        patchSelected({
                          surface: { ...selected.surface, angle },
                        })
                      }
                      suffix="°"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Opacity">
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.surface.opacity}
                      onChange={(opacity) =>
                        patchSelected({
                          surface: { ...selected.surface, opacity },
                        })
                      }
                    />
                  </Field>

                  <Field label="Backdrop blur">
                    <Slider
                      min={0}
                      max={40}
                      step={1}
                      value={selected.surface.blur}
                      onChange={(blur) =>
                        patchSelected({
                          surface: { ...selected.surface, blur },
                        })
                      }
                      suffix="px"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Border">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Style">
                    <Select
                      value={selected.border?.style ?? "none"}
                      onChange={(e) =>
                        patchSelected({
                          border: {
                            width: selected.border?.width ?? 1,
                            color: selected.border?.color ?? "theme:card-border",
                            style: e.target.value as "solid" | "dashed" | "none",
                          },
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                    </Select>
                  </Field>

                  <Field label="Width">
                    <Slider
                      min={0}
                      max={10}
                      step={1}
                      value={selected.border?.width ?? 0}
                      onChange={(width) =>
                        patchSelected({
                          border: {
                            width,
                            color: selected.border?.color ?? "theme:card-border",
                            style:
                              width === 0
                                ? "none"
                                : selected.border?.style === "dashed"
                                  ? "dashed"
                                  : "solid",
                          },
                        })
                      }
                      suffix="px"
                    />
                  </Field>

                  <Field label="Colour">
                    <TextInput
                      value={selected.border?.color ?? "theme:card-border"}
                      onChange={(e) =>
                        patchSelected({
                          border: {
                            width: selected.border?.width ?? 1,
                            color: e.target.value,
                            style: selected.border?.style ?? "solid",
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </Section>

              {TEXT_ZONE_TYPES.has(selected.type) && (
                <TypographyEditor
                  zone={selected}
                  onChange={(typography) => patchSelected({ typography })}
                />
              )}

              {(selected.type === "rank" || selected.type === "running-order") && (
                <Section title="Number formatting">
                  <Toggle
                    label="Leading zero"
                    checked={!!selected.leadingZero}
                    onChange={(leadingZero) => patchSelected({ leadingZero })}
                  />
                  <Field label="Empty text">
                    <TextInput
                      value={selected.emptyText ?? ""}
                      onChange={(e) =>
                        patchSelected({ emptyText: e.target.value })
                      }
                    />
                  </Field>
                </Section>
              )}

              {(selected.type === "score" ||
                selected.type === "jury-score" ||
                selected.type === "televote-score") && (
                <Section title="Score formatting">
                  <Field label="Empty text">
                    <TextInput
                      value={selected.emptyText ?? ""}
                      placeholder="–"
                      onChange={(e) =>
                        patchSelected({ emptyText: e.target.value })
                      }
                    />
                  </Field>
                </Section>
              )}

              {selected.type === "flag" && (
                <Section title="Flag">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fit">
                      <Select
                        value={selected.fit ?? "cover"}
                        onChange={(e) =>
                          patchSelected({
                            fit: e.target.value as "cover" | "contain" | "fill",
                          })
                        }
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fill">Stretch</option>
                      </Select>
                    </Field>

                    <Field label="Object position">
                      <TextInput
                        value={selected.objectPosition ?? "center"}
                        placeholder="center"
                        onChange={(e) =>
                          patchSelected({ objectPosition: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </Section>
              )}

              {selected.type === "custom-text" && (
                <Section title="Custom text">
                  <Field
                    label="Text"
                    hint="Leave blank to use the row subtitle / artist-song text."
                  >
                    <TextInput
                      value={selected.text ?? ""}
                      onChange={(e) => patchSelected({ text: e.target.value })}
                    />
                  </Field>
                </Section>
              )}

              {selected.type === "image" && (
                <Section title="Image">
                  <Field label="Image URL">
                    <TextInput
                      value={selected.imageUrl ?? ""}
                      placeholder="https://..."
                      onChange={(e) =>
                        patchSelected({ imageUrl: e.target.value || null })
                      }
                    />
                  </Field>

                  <Field label="Fit">
                    <Select
                      value={selected.fit ?? "contain"}
                      onChange={(e) =>
                        patchSelected({
                          fit: e.target.value as "cover" | "contain" | "fill",
                        })
                      }
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                      <option value="fill">Stretch</option>
                    </Select>
                  </Field>
                </Section>
              )}

              {layoutMode === "absolute" && (
                <Section title="Absolute position">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="X">
                      <Slider
                        min={-500}
                        max={1500}
                        step={1}
                        value={selected.absolute?.x ?? 0}
                        onChange={(x) =>
                          patchSelected({
                            absolute: { x, y: selected.absolute?.y ?? 0 },
                          })
                        }
                        suffix="px"
                      />
                    </Field>

                    <Field label="Y">
                      <Slider
                        min={-300}
                        max={400}
                        step={1}
                        value={selected.absolute?.y ?? 0}
                        onChange={(y) =>
                          patchSelected({
                            absolute: { x: selected.absolute?.x ?? 0, y },
                          })
                        }
                        suffix="px"
                      />
                    </Field>
                  </div>
                </Section>
              )}
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Add or select a zone to edit it.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Changes are applied directly to <code>card.zones</code>, so the live preview
        and the real broadcast use the same structure. Angled SSC21-style layers are
        made by combining overlap, z-index and shapes such as wedge, trapezoid and
        parallelogram.
      </div>
    </div>
  );
}

function TypographyEditor({
  zone,
  onChange,
}: {
  zone: CardZoneConfig;
  onChange: (typography: NonNullable<CardZoneConfig["typography"]>) => void;
}) {
  const typography = zone.typography ?? defaultTypography(zone.type);

  const set = (patch: Partial<typeof typography>) =>
    onChange({ ...typography, ...patch });

  return (
    <Section title="Typography">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Font family"
          hint='"display" and "body" inherit the show theme.'
        >
          <TextInput
            value={typography.family}
            onChange={(e) => set({ family: e.target.value })}
          />
        </Field>

        <Field label="Colour">
          <TextInput
            value={typography.color}
            onChange={(e) => set({ color: e.target.value })}
          />
        </Field>

        <Field label="Alignment">
          <Select
            value={typography.align}
            onChange={(e) =>
              set({
                align: e.target.value as "left" | "center" | "right",
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </Select>
        </Field>

        <Field label="Weight">
          <Slider
            min={100}
            max={1000}
            step={50}
            value={typography.weight}
            onChange={(weight) => set({ weight })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Font size">
          <Slider
            min={6}
            max={72}
            step={1}
            value={typography.size}
            onChange={(size) => set({ size })}
            suffix="px"
          />
        </Field>

        <Field label="Minimum size">
          <Slider
            min={6}
            max={72}
            step={1}
            value={typography.minSize}
            onChange={(minSize) => set({ minSize })}
            suffix="px"
          />
        </Field>

        <Field label="Letter spacing">
          <Slider
            min={-3}
            max={12}
            step={0.25}
            value={typography.letterSpacing}
            onChange={(letterSpacing) => set({ letterSpacing })}
            suffix="px"
          />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle
          label="Uppercase"
          checked={typography.uppercase}
          onChange={(uppercase) => set({ uppercase })}
        />
        <Toggle
          label="Truncate"
          checked={typography.truncate}
          onChange={(truncate) => set({ truncate })}
        />
        <Toggle
          label="Italic"
          checked={!!typography.italic}
          onChange={(italic) => set({ italic })}
        />
      </div>
    </Section>
  );
}

function NullableNumber({
  label,
  value,
  min,
  max,
  autoLabel = "None",
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  autoLabel?: string;
  onChange: (value: number | null) => void;
}) {
  const enabled = value != null;

  return (
    <div className="space-y-2">
      <Toggle
        label={`${label}: ${enabled ? `${value}px` : autoLabel}`}
        checked={enabled}
        onChange={(next) => onChange(next ? Math.max(min, value ?? min) : null)}
      />

      {enabled && (
        <Slider
          min={min}
          max={max}
          step={1}
          value={value ?? min}
          onChange={(next) => onChange(next)}
          suffix="px"
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h5 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h5>
      {children}
    </section>
  );
}

function MiniButton({
  label,
  onClick,
  disabled,
  destructive,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-35",
        destructive
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-surface",
      )}
    >
      {label}
    </button>
  );
}

function zoneTypeLabel(type: ZoneType) {
  return ZONE_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

function uniqueZoneId(type: ZoneType, zones: CardZoneConfig[]) {
  const base = type.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const used = new Set(zones.map((zone) => zone.id));

  let index = 1;
  let id = `${base}-${index}`;
  while (used.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function createZone(type: ZoneType, zones: CardZoneConfig[]): CardZoneConfig {
  const zone: CardZoneConfig = {
    id: uniqueZoneId(type, zones),
    label: zoneTypeLabel(type),
    type,
    visible: true,
    locked: false,
    order: zones.length,
    width:
      type === "flag"
        ? 64
        : type === "rank" || type === "running-order"
          ? 48
          : type === "score" || type === "jury-score" || type === "televote-score"
            ? 76
            : null,
    minWidth: null,
    maxWidth: null,
    height: null,
    grow:
      type === "country-name" || type === "custom-text" || type === "spacer"
        ? 1
        : 0,
    paddingX: type === "flag" ? 0 : 8,
    paddingY: 0,
    marginX: 0,
    align:
      type === "score" || type === "jury-score" || type === "televote-score"
        ? "right"
        : type === "country-name" || type === "custom-text"
          ? "left"
          : "center",
    valign: "center",
    z: 1,
    overlapLeft: 0,
    overlapRight: 0,
    shape: defaultShape(type),
    surface: defaultSurface(),
    border: {
      width: 0,
      color: "transparent",
      style: "none",
    },
    typography: TEXT_ZONE_TYPES.has(type) ? defaultTypography(type) : undefined,
    fit: type === "flag" ? "cover" : type === "image" ? "contain" : undefined,
    objectPosition: type === "flag" ? "center" : undefined,
    leadingZero: type === "rank" || type === "running-order" ? false : undefined,
    emptyText:
      type === "score" || type === "jury-score" || type === "televote-score"
        ? "–"
        : undefined,
  };

  return zone;
}

function convertZoneType(zone: CardZoneConfig, type: ZoneType): CardZoneConfig {
  const defaults = createZone(type, []);
  return {
    ...zone,
    type,
    label:
      !zone.label || zone.label === zoneTypeLabel(zone.type)
        ? zoneTypeLabel(type)
        : zone.label,
    width:
      zone.width ??
      defaults.width,
    grow:
      zone.grow === 0 && defaults.grow > 0 ? defaults.grow : zone.grow,
    typography: TEXT_ZONE_TYPES.has(type)
      ? zone.typography ?? defaultTypography(type)
      : undefined,
    fit:
      type === "flag"
        ? zone.fit ?? "cover"
        : type === "image"
          ? zone.fit ?? "contain"
          : undefined,
    objectPosition: type === "flag" ? zone.objectPosition ?? "center" : undefined,
    leadingZero:
      type === "rank" || type === "running-order"
        ? zone.leadingZero ?? false
        : undefined,
  };
}

function defaultShape(type: ZoneType): CardZoneConfig["shape"] {
  return {
    kind: type === "flag" ? "rect" : "rounded",
    radius: type === "flag" ? 0 : 6,
    leftSlant: 0,
    rightSlant: 0,
    topInset: 0,
    bottomInset: 0,
    direction: "right",
    points: [],
  };
}

function defaultSurface(): CardZoneConfig["surface"] {
  return {
    fill: "none",
    color: "transparent",
    color2: "transparent",
    angle: 90,
    opacity: 1,
    blur: 0,
  };
}

function defaultTypography(
  type: ZoneType,
): NonNullable<CardZoneConfig["typography"]> {
  const right =
    type === "score" || type === "jury-score" || type === "televote-score";

  return {
    family: type === "country-name" ? "display" : "body",
    size: type === "country-name" ? 15 : 13,
    minSize: 9,
    weight: type === "country-name" || right ? 700 : 600,
    letterSpacing: 0,
    uppercase: false,
    color:
      type === "jury-score"
        ? "theme:jury"
        : type === "televote-score"
          ? "theme:televote"
          : type === "score"
            ? "theme:country-score"
            : type === "rank"
              ? "theme:rank"
              : "theme:country-name",
    align: right ? "right" : type === "country-name" ? "left" : "center",
    truncate: true,
    italic: false,
  };
}

function cloneZone(zone: CardZoneConfig): CardZoneConfig {
  return {
    ...zone,
    shape: {
      ...zone.shape,
      points: [...zone.shape.points],
    },
    surface: { ...zone.surface },
    border: zone.border ? { ...zone.border } : undefined,
    typography: zone.typography ? { ...zone.typography } : undefined,
    absolute: zone.absolute ? { ...zone.absolute } : undefined,
  };
}
