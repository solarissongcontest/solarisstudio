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

/* -------------------------------------------------------------------------- */
/* Friendly editor vocabulary                                                 */
/* -------------------------------------------------------------------------- */

const ZONE_TYPES: Array<{ value: ZoneType; label: string; hint: string }> = [
  { value: "rank", label: "Rank", hint: "Number" },
  { value: "running-order", label: "Running order", hint: "Number" },
  { value: "flag", label: "Flag", hint: "Image" },
  { value: "country-name", label: "Country name", hint: "Text" },
  { value: "score", label: "Total score", hint: "Number" },
  { value: "jury-score", label: "Jury score", hint: "Number" },
  { value: "televote-score", label: "Televote score", hint: "Number" },
  { value: "movement", label: "Movement", hint: "Indicator" },
  { value: "qualification", label: "Qualification", hint: "Indicator" },
  { value: "custom-text", label: "Custom text", hint: "Text" },
  { value: "image", label: "Image", hint: "Image" },
  { value: "spacer", label: "Spacer", hint: "Flexible space" },
  { value: "decoration", label: "Decoration", hint: "Visual layer" },
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

const RAW_SHAPES: ShapeKind[] = [
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

type SimpleShape =
  | "rectangle"
  | "rounded"
  | "pill"
  | "angled-left"
  | "angled-right"
  | "wedge";

type SimpleBackground =
  | "none"
  | "country"
  | "primary"
  | "secondary"
  | "dark"
  | "light"
  | "jury"
  | "televote"
  | "custom";

type EditorMode = "simple" | "advanced";

/* -------------------------------------------------------------------------- */
/* Main editor                                                                */
/* -------------------------------------------------------------------------- */

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

  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>("simple");
  const [newType, setNewType] = useState<ZoneType>("country-name");

  useEffect(() => {
    if (!ordered.length) {
      setSelectedId("");
      setEditorOpen(false);
      return;
    }

    if (!ordered.some((zone) => zone.id === selectedId)) {
      setSelectedId(ordered[0].id);
    }
  }, [ordered, selectedId]);

  const selected = ordered.find((zone) => zone.id === selectedId) ?? null;

  const commit = (next: CardZoneConfig[]) => {
    onChange(
      next.map((zone, index) => ({
        ...zone,
        order: index,
      })),
    );
  };

  const updateZone = (id: string, patch: Partial<CardZoneConfig>) => {
    commit(
      ordered.map((zone) =>
        zone.id === id ? { ...zone, ...patch } : zone,
      ),
    );
  };

  const replaceZone = (id: string, next: CardZoneConfig) => {
    commit(ordered.map((zone) => (zone.id === id ? next : zone)));
  };

  const openZone = (id: string) => {
    setSelectedId(id);
    setMode("simple");
    setEditorOpen(true);
  };

  const moveZone = (id: string, direction: -1 | 1) => {
    const index = ordered.findIndex((zone) => zone.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const addZone = () => {
    const zone = createZone(newType, ordered);
    commit([...ordered, zone]);
    setSelectedId(zone.id);
    setMode("simple");
    setEditorOpen(true);
  };

  const duplicateZone = (zone: CardZoneConfig) => {
    const copy = cloneZone(zone);
    copy.id = uniqueZoneId(zone.type, ordered);
    copy.label = `${displayName(zone)} copy`;
    copy.locked = false;

    const index = ordered.findIndex((item) => item.id === zone.id);
    const next = [...ordered];
    next.splice(index + 1, 0, copy);

    commit(next);
    setSelectedId(copy.id);
    setMode("simple");
    setEditorOpen(true);
  };

  const deleteZone = (zone: CardZoneConfig) => {
    if (zone.locked) return;

    const index = ordered.findIndex((item) => item.id === zone.id);
    const next = ordered.filter((item) => item.id !== zone.id);

    commit(next);

    const nextSelection =
      next[Math.min(index, Math.max(0, next.length - 1))]?.id ?? "";

    setSelectedId(nextSelection);

    if (!nextSelection) {
      setEditorOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Friendly layer list                                                */}
      {/* ------------------------------------------------------------------ */}

      <div className="rounded-2xl border border-border bg-background/30 p-3 sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Card layers</h4>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Tap a layer to edit it. The order here is the order inside each country card.
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-[10px] text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "layer" : "layers"}
          </span>
        </div>

        <div className="space-y-2">
          {ordered.map((zone, index) => (
            <ZoneListRow
              key={zone.id}
              zone={zone}
              index={index}
              first={index === 0}
              last={index === ordered.length - 1}
              selected={zone.id === selectedId}
              onOpen={() => openZone(zone.id)}
              onToggle={() => updateZone(zone.id, { visible: !zone.visible })}
              onMoveUp={() => moveZone(zone.id, -1)}
              onMoveDown={() => moveZone(zone.id, 1)}
            />
          ))}

          {!ordered.length && (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium">This card has no layers</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a flag, country name, score or another layer below.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Select
            value={newType}
            onChange={(e) => setNewType(e.target.value as ZoneType)}
            aria-label="New zone type"
          >
            {ZONE_TYPES.map((type) => (
              <option key={type.value} value={type.value} className="bg-background">
                {type.label}
              </option>
            ))}
          </Select>

          <button
            type="button"
            onClick={addZone}
            className="min-h-11 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15"
          >
            + Add layer
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Desktop editor: always visible. Mobile: full-screen sheet.         */}
      {/* ------------------------------------------------------------------ */}

      {selected && (
        <>
          <div className="hidden lg:block">
            <ZoneEditPanel
              zone={selected}
              mode={mode}
              layoutMode={layoutMode}
              onModeChange={setMode}
              onChange={(next) => replaceZone(selected.id, next)}
              onDuplicate={() => duplicateZone(selected)}
              onDelete={() => deleteZone(selected)}
            />
          </div>

          {editorOpen && (
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-background lg:hidden">
              <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
                <div className="mx-auto flex max-w-3xl items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border bg-surface text-lg"
                    aria-label="Close layer editor"
                  >
                    ←
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{displayName(selected)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {zoneHint(selected.type)}
                    </p>
                  </div>

                  <VisibilityButton
                    visible={selected.visible}
                    onClick={() =>
                      updateZone(selected.id, { visible: !selected.visible })
                    }
                  />
                </div>
              </div>

              <div className="mx-auto max-w-3xl p-3 pb-24">
                <ZoneEditPanel
                  zone={selected}
                  mode={mode}
                  layoutMode={layoutMode}
                  mobile
                  onModeChange={setMode}
                  onChange={(next) => replaceZone(selected.id, next)}
                  onDuplicate={() => duplicateZone(selected)}
                  onDelete={() => deleteZone(selected)}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-border bg-surface/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Simple mode changes the settings you normally need. Advanced mode exposes the
        underlying zone geometry when you actually need wedges, overlaps, exact padding
        or custom tokens.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Layer list                                                                 */
/* -------------------------------------------------------------------------- */

function ZoneListRow({
  zone,
  index,
  first,
  last,
  selected,
  onOpen,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  zone: CardZoneConfig;
  index: number;
  first: boolean;
  last: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-stretch gap-2 rounded-xl border bg-surface p-2 transition",
        selected ? "border-primary/50" : "border-border",
        !zone.visible && "opacity-60",
      )}
    >
      <div className="flex w-10 shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={first}
          className="grid min-h-8 place-items-center rounded-lg border border-border text-xs disabled:opacity-25"
          aria-label={`Move ${displayName(zone)} earlier`}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={last}
          className="grid min-h-8 place-items-center rounded-lg border border-border text-xs disabled:opacity-25"
          aria-label={`Move ${displayName(zone)} later`}
        >
          ↓
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left"
      >
        <ZoneIcon type={zone.type} />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{displayName(zone)}</span>
            {zone.locked && (
              <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                LOCKED
              </span>
            )}
          </span>

          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {zoneHint(zone.type)} · {friendlyWidth(zone)}
          </span>
        </span>

        <span className="shrink-0 text-lg text-muted-foreground">›</span>
      </button>

      <VisibilityButton visible={zone.visible} onClick={onToggle} />
    </div>
  );
}

function VisibilityButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 min-w-11 shrink-0 rounded-xl border text-[11px] font-semibold",
        visible
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground",
      )}
      aria-label={visible ? "Hide layer" : "Show layer"}
      title={visible ? "Visible" : "Hidden"}
    >
      {visible ? "ON" : "OFF"}
    </button>
  );
}

function ZoneIcon({ type }: { type: ZoneType }) {
  const glyph =
    type === "flag"
      ? "▰"
      : type === "country-name" || type === "custom-text"
        ? "T"
        : type === "image"
          ? "▣"
          : type === "spacer"
            ? "↔"
            : type === "decoration"
              ? "◆"
              : "#";

  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background text-xs font-black text-muted-foreground">
      {glyph}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit panel                                                                 */
/* -------------------------------------------------------------------------- */

function ZoneEditPanel({
  zone,
  mode,
  layoutMode,
  mobile = false,
  onModeChange,
  onChange,
  onDuplicate,
  onDelete,
}: {
  zone: CardZoneConfig;
  mode: EditorMode;
  layoutMode: CardTemplateConfig["layoutMode"];
  mobile?: boolean;
  onModeChange: (mode: EditorMode) => void;
  onChange: (next: CardZoneConfig) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const patch = (next: Partial<CardZoneConfig>) =>
    onChange({ ...zone, ...next });

  const patchTypography = (
    next: Partial<NonNullable<CardZoneConfig["typography"]>>,
  ) => {
    const current = zone.typography ?? defaultTypography(zone.type);
    patch({ typography: { ...current, ...next } });
  };

  const typography = zone.typography ?? defaultTypography(zone.type);

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-border bg-background/30 p-3 sm:p-4",
        mobile && "border-0 bg-transparent p-0",
      )}
    >
      {!mobile && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Editing layer
            </p>
            <h4 className="mt-1 text-lg font-semibold">{displayName(zone)}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {zoneHint(zone.type)}
            </p>
          </div>

          <VisibilityButton
            visible={zone.visible}
            onClick={() => patch({ visible: !zone.visible })}
          />
        </div>
      )}

      <ModeSwitch value={mode} onChange={onModeChange} />

      {mode === "simple" ? (
        <SimpleEditor
          zone={zone}
          typography={typography}
          onPatch={patch}
          onTypography={patchTypography}
        />
      ) : (
        <AdvancedEditor
          zone={zone}
          layoutMode={layoutMode}
          typography={typography}
          onPatch={patch}
          onTypography={patchTypography}
        />
      )}

      <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onDuplicate}
          className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium"
        >
          Duplicate layer
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={!!zone.locked}
          className="min-h-11 rounded-xl border border-destructive/40 px-4 text-sm font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-35"
        >
          {zone.locked ? "Unlock to delete" : "Delete layer"}
        </button>
      </div>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: EditorMode;
  onChange: (value: EditorMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-xl bg-surface p-1">
      {(["simple", "advanced"] as EditorMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "min-h-10 rounded-lg px-3 text-sm font-medium capitalize transition",
            value === mode
              ? "bg-surface-strong text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Simple mode                                                                */
/* -------------------------------------------------------------------------- */

function SimpleEditor({
  zone,
  typography,
  onPatch,
  onTypography,
}: {
  zone: CardZoneConfig;
  typography: NonNullable<CardZoneConfig["typography"]>;
  onPatch: (next: Partial<CardZoneConfig>) => void;
  onTypography: (
    next: Partial<NonNullable<CardZoneConfig["typography"]>>,
  ) => void;
}) {
  const simpleShape = detectSimpleShape(zone);
  const simpleBackground = detectSimpleBackground(zone);

  return (
    <div className="space-y-5">
      <SimpleSection title="Basics">
        <Toggle
          label="Show this layer"
          checked={zone.visible}
          onChange={(visible) => onPatch({ visible })}
        />

        <Field label="Width">
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton
              active={zone.width == null}
              onClick={() => onPatch({ width: null })}
            >
              Auto
            </ChoiceButton>
            <ChoiceButton
              active={zone.width != null}
              onClick={() =>
                onPatch({
                  width: zone.width ?? recommendedWidth(zone.type),
                  grow: 0,
                })
              }
            >
              Fixed
            </ChoiceButton>
          </div>
        </Field>

        {zone.width != null && (
          <Field label="Layer width">
            <Slider
              min={20}
              max={500}
              step={2}
              value={zone.width}
              onChange={(width) => onPatch({ width })}
              suffix="px"
            />
          </Field>
        )}

        {TEXT_ZONE_TYPES.has(zone.type) && (
          <Field label="Text size">
            <Slider
              min={8}
              max={40}
              step={1}
              value={typography.size}
              onChange={(size) => onTypography({ size })}
              suffix="px"
            />
          </Field>
        )}

        {TEXT_ZONE_TYPES.has(zone.type) && (
          <Field label="Text alignment">
            <div className="grid grid-cols-3 gap-2">
              {(["left", "center", "right"] as const).map((align) => (
                <ChoiceButton
                  key={align}
                  active={zone.align === align}
                  onClick={() => {
                    onPatch({ align });
                    onTypography({ align });
                  }}
                >
                  {capitalize(align)}
                </ChoiceButton>
              ))}
            </div>
          </Field>
        )}
      </SimpleSection>

      <SimpleSection title="Look">
        <Field label="Background">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["none", "None"],
                ["country", "Country"],
                ["primary", "Primary"],
                ["secondary", "Secondary"],
                ["dark", "Dark"],
                ["light", "Light"],
                ["jury", "Jury"],
                ["televote", "Televote"],
                ["custom", "Custom"],
              ] as Array<[SimpleBackground, string]>
            ).map(([value, label]) => (
              <ChoiceButton
                key={value}
                active={simpleBackground === value}
                onClick={() => onPatch({ surface: simpleSurface(value, zone.surface) })}
              >
                {label}
              </ChoiceButton>
            ))}
          </div>
        </Field>

        {simpleBackground === "custom" && (
          <Field
            label="Custom colour"
            hint="Hex colour or theme token, for example #ffffff or theme:accent."
          >
            <TextInput
              value={zone.surface.color}
              onChange={(e) =>
                onPatch({
                  surface: {
                    ...zone.surface,
                    fill: "color",
                    color: e.target.value,
                    color2: e.target.value,
                  },
                })
              }
            />
          </Field>
        )}

        <Field label="Shape">
          <Select
            value={simpleShape}
            onChange={(e) =>
              onPatch({
                shape: applySimpleShape(
                  zone.shape,
                  e.target.value as SimpleShape,
                ),
              })
            }
          >
            <option value="rectangle">Rectangle</option>
            <option value="rounded">Rounded</option>
            <option value="pill">Pill</option>
            <option value="angled-left">Angled left</option>
            <option value="angled-right">Angled right</option>
            <option value="wedge">Wedge</option>
          </Select>
        </Field>
      </SimpleSection>

      {zone.type === "flag" && (
        <SimpleSection title="Flag">
          <Field label="Image fit">
            <div className="grid grid-cols-3 gap-2">
              {(["cover", "contain", "fill"] as const).map((fit) => (
                <ChoiceButton
                  key={fit}
                  active={(zone.fit ?? "cover") === fit}
                  onClick={() => onPatch({ fit })}
                >
                  {fit === "fill" ? "Stretch" : capitalize(fit)}
                </ChoiceButton>
              ))}
            </div>
          </Field>
        </SimpleSection>
      )}

      {zone.type === "custom-text" && (
        <SimpleSection title="Text">
          <Field
            label="Text"
            hint="Leave blank to use the entry subtitle / artist and song."
          >
            <TextInput
              value={zone.text ?? ""}
              onChange={(e) => onPatch({ text: e.target.value })}
            />
          </Field>
        </SimpleSection>
      )}

      {zone.type === "image" && (
        <SimpleSection title="Image">
          <Field label="Image URL">
            <TextInput
              value={zone.imageUrl ?? ""}
              placeholder="https://..."
              onChange={(e) => onPatch({ imageUrl: e.target.value || null })}
            />
          </Field>
        </SimpleSection>
      )}

      {(zone.type === "score" ||
        zone.type === "jury-score" ||
        zone.type === "televote-score") && (
        <SimpleSection title="Score">
          <Field label="When no score exists">
            <TextInput
              value={zone.emptyText ?? "–"}
              onChange={(e) => onPatch({ emptyText: e.target.value })}
            />
          </Field>
        </SimpleSection>
      )}

      {(zone.type === "rank" || zone.type === "running-order") && (
        <SimpleSection title="Number">
          <Toggle
            label="Use leading zero (01, 02, 03)"
            checked={!!zone.leadingZero}
            onChange={(leadingZero) => onPatch({ leadingZero })}
          />
        </SimpleSection>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Advanced mode                                                              */
/* -------------------------------------------------------------------------- */

function AdvancedEditor({
  zone,
  layoutMode,
  typography,
  onPatch,
  onTypography,
}: {
  zone: CardZoneConfig;
  layoutMode: CardTemplateConfig["layoutMode"];
  typography: NonNullable<CardZoneConfig["typography"]>;
  onPatch: (next: Partial<CardZoneConfig>) => void;
  onTypography: (
    next: Partial<NonNullable<CardZoneConfig["typography"]>>,
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <AdvancedBlock title="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Editor label">
            <TextInput
              value={zone.label ?? ""}
              placeholder={zoneTypeLabel(zone.type)}
              onChange={(e) =>
                onPatch({ label: e.target.value || undefined })
              }
            />
          </Field>

          <Field label="Layer type">
            <Select
              value={zone.type}
              onChange={(e) =>
                onPatch(convertZoneTypePatch(zone, e.target.value as ZoneType))
              }
            >
              {ZONE_TYPES.map((type) => (
                <option key={type.value} value={type.value} className="bg-background">
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Toggle
          label="Lock layer"
          checked={!!zone.locked}
          onChange={(locked) => onPatch({ locked })}
        />
      </AdvancedBlock>

      <AdvancedBlock title="Sizing & spacing">
        <div className="grid gap-3 sm:grid-cols-2">
          <NullableSize
            label="Width"
            value={zone.width}
            min={1}
            max={800}
            onChange={(width) => onPatch({ width })}
          />
          <NullableSize
            label="Height"
            value={zone.height}
            min={1}
            max={200}
            autoLabel="Card height"
            onChange={(height) => onPatch({ height })}
          />
          <NullableSize
            label="Minimum width"
            value={zone.minWidth}
            min={1}
            max={800}
            onChange={(minWidth) => onPatch({ minWidth })}
          />
          <NullableSize
            label="Maximum width"
            value={zone.maxWidth}
            min={1}
            max={1200}
            onChange={(maxWidth) => onPatch({ maxWidth })}
          />
        </div>

        <Field label="Flexible grow">
          <Slider
            min={0}
            max={6}
            step={0.25}
            value={zone.grow}
            onChange={(grow) => onPatch({ grow })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Horizontal padding">
            <Slider
              min={0}
              max={60}
              value={zone.paddingX}
              onChange={(paddingX) => onPatch({ paddingX })}
              suffix="px"
            />
          </Field>
          <Field label="Vertical padding">
            <Slider
              min={0}
              max={40}
              value={zone.paddingY}
              onChange={(paddingY) => onPatch({ paddingY })}
              suffix="px"
            />
          </Field>
          <Field label="Outer margin">
            <Slider
              min={-60}
              max={60}
              value={zone.marginX}
              onChange={(marginX) => onPatch({ marginX })}
              suffix="px"
            />
          </Field>
          <Field label="Z-index">
            <Slider
              min={-10}
              max={30}
              value={zone.z}
              onChange={(z) => onPatch({ z })}
            />
          </Field>
          <Field label="Overlap left">
            <Slider
              min={-120}
              max={120}
              value={zone.overlapLeft}
              onChange={(overlapLeft) => onPatch({ overlapLeft })}
              suffix="px"
            />
          </Field>
          <Field label="Overlap right">
            <Slider
              min={-120}
              max={120}
              value={zone.overlapRight}
              onChange={(overlapRight) => onPatch({ overlapRight })}
              suffix="px"
            />
          </Field>
        </div>
      </AdvancedBlock>

      <AdvancedBlock title="Exact shape">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shape">
            <Select
              value={zone.shape.kind}
              onChange={(e) =>
                onPatch({
                  shape: {
                    ...zone.shape,
                    kind: e.target.value as ShapeKind,
                  },
                })
              }
            >
              {RAW_SHAPES.map((shape) => (
                <option key={shape} value={shape} className="bg-background">
                  {shape}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Direction">
            <Select
              value={zone.shape.direction}
              onChange={(e) =>
                onPatch({
                  shape: {
                    ...zone.shape,
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Radius">
            <Slider
              min={0}
              max={999}
              value={zone.shape.radius}
              onChange={(radius) =>
                onPatch({ shape: { ...zone.shape, radius } })
              }
              suffix="px"
            />
          </Field>
          <Field label="Left slant">
            <Slider
              min={0}
              max={50}
              value={zone.shape.leftSlant}
              onChange={(leftSlant) =>
                onPatch({ shape: { ...zone.shape, leftSlant } })
              }
              suffix="%"
            />
          </Field>
          <Field label="Right slant">
            <Slider
              min={0}
              max={50}
              value={zone.shape.rightSlant}
              onChange={(rightSlant) =>
                onPatch({ shape: { ...zone.shape, rightSlant } })
              }
              suffix="%"
            />
          </Field>
          <Field label="Top inset">
            <Slider
              min={0}
              max={50}
              value={zone.shape.topInset}
              onChange={(topInset) =>
                onPatch({ shape: { ...zone.shape, topInset } })
              }
              suffix="%"
            />
          </Field>
          <Field label="Bottom inset">
            <Slider
              min={0}
              max={50}
              value={zone.shape.bottomInset}
              onChange={(bottomInset) =>
                onPatch({ shape: { ...zone.shape, bottomInset } })
              }
              suffix="%"
            />
          </Field>
        </div>
      </AdvancedBlock>

      <AdvancedBlock title="Surface">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fill type">
            <Select
              value={zone.surface.fill}
              onChange={(e) =>
                onPatch({
                  surface: {
                    ...zone.surface,
                    fill: e.target.value as CardZoneConfig["surface"]["fill"],
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="color">Colour</option>
              <option value="gradient">Gradient</option>
              <option value="country">Country</option>
              <option value="theme">Theme</option>
            </Select>
          </Field>

          <Field label="Colour token">
            <TextInput
              value={zone.surface.color}
              onChange={(e) =>
                onPatch({
                  surface: { ...zone.surface, color: e.target.value },
                })
              }
            />
          </Field>

          <Field label="Second colour">
            <TextInput
              value={zone.surface.color2}
              onChange={(e) =>
                onPatch({
                  surface: { ...zone.surface, color2: e.target.value },
                })
              }
            />
          </Field>

          <Field label="Gradient angle">
            <Slider
              min={0}
              max={360}
              value={zone.surface.angle}
              onChange={(angle) =>
                onPatch({ surface: { ...zone.surface, angle } })
              }
              suffix="°"
            />
          </Field>

          <Field label="Opacity">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={zone.surface.opacity}
              onChange={(opacity) =>
                onPatch({ surface: { ...zone.surface, opacity } })
              }
            />
          </Field>

          <Field label="Blur">
            <Slider
              min={0}
              max={40}
              value={zone.surface.blur}
              onChange={(blur) =>
                onPatch({ surface: { ...zone.surface, blur } })
              }
              suffix="px"
            />
          </Field>
        </div>
      </AdvancedBlock>

      <AdvancedBlock title="Border">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Style">
            <Select
              value={zone.border?.style ?? "none"}
              onChange={(e) =>
                onPatch({
                  border: {
                    width: zone.border?.width ?? 1,
                    color: zone.border?.color ?? "theme:card-border",
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
              value={zone.border?.width ?? 0}
              onChange={(width) =>
                onPatch({
                  border: {
                    width,
                    color: zone.border?.color ?? "theme:card-border",
                    style:
                      width === 0
                        ? "none"
                        : zone.border?.style === "dashed"
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
              value={zone.border?.color ?? "theme:card-border"}
              onChange={(e) =>
                onPatch({
                  border: {
                    width: zone.border?.width ?? 1,
                    color: e.target.value,
                    style: zone.border?.style ?? "solid",
                  },
                })
              }
            />
          </Field>
        </div>
      </AdvancedBlock>

      {TEXT_ZONE_TYPES.has(zone.type) && (
        <AdvancedBlock title="Typography">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Font family">
              <TextInput
                value={typography.family}
                onChange={(e) => onTypography({ family: e.target.value })}
              />
            </Field>

            <Field label="Text colour">
              <TextInput
                value={typography.color}
                onChange={(e) => onTypography({ color: e.target.value })}
              />
            </Field>

            <Field label="Font size">
              <Slider
                min={6}
                max={72}
                value={typography.size}
                onChange={(size) => onTypography({ size })}
                suffix="px"
              />
            </Field>

            <Field label="Minimum size">
              <Slider
                min={6}
                max={72}
                value={typography.minSize}
                onChange={(minSize) => onTypography({ minSize })}
                suffix="px"
              />
            </Field>

            <Field label="Weight">
              <Slider
                min={100}
                max={1000}
                step={50}
                value={typography.weight}
                onChange={(weight) => onTypography({ weight })}
              />
            </Field>

            <Field label="Letter spacing">
              <Slider
                min={-3}
                max={12}
                step={0.25}
                value={typography.letterSpacing}
                onChange={(letterSpacing) =>
                  onTypography({ letterSpacing })
                }
                suffix="px"
              />
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              label="Uppercase"
              checked={typography.uppercase}
              onChange={(uppercase) => onTypography({ uppercase })}
            />
            <Toggle
              label="Italic"
              checked={!!typography.italic}
              onChange={(italic) => onTypography({ italic })}
            />
            <Toggle
              label="Truncate"
              checked={typography.truncate}
              onChange={(truncate) => onTypography({ truncate })}
            />
          </div>
        </AdvancedBlock>
      )}

      {layoutMode === "absolute" && (
        <AdvancedBlock title="Absolute position">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="X position">
              <Slider
                min={-500}
                max={1500}
                value={zone.absolute?.x ?? 0}
                onChange={(x) =>
                  onPatch({
                    absolute: { x, y: zone.absolute?.y ?? 0 },
                  })
                }
                suffix="px"
              />
            </Field>

            <Field label="Y position">
              <Slider
                min={-300}
                max={400}
                value={zone.absolute?.y ?? 0}
                onChange={(y) =>
                  onPatch({
                    absolute: { x: zone.absolute?.x ?? 0, y },
                  })
                }
                suffix="px"
              />
            </Field>
          </div>
        </AdvancedBlock>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small UI helpers                                                           */
/* -------------------------------------------------------------------------- */

function SimpleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h5 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h5>
      <div className="space-y-3 rounded-xl border border-border bg-surface/30 p-3">
        {children}
      </div>
    </section>
  );
}

function AdvancedBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h5 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h5>
      {children}
    </section>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border px-3 text-sm font-medium transition",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NullableSize({
  label,
  value,
  min,
  max,
  autoLabel = "Auto",
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
        onChange={(next) =>
          onChange(next ? Math.max(min, value ?? min) : null)
        }
      />

      {enabled && (
        <Slider
          min={min}
          max={max}
          value={value ?? min}
          onChange={onChange}
          suffix="px"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Friendly mapping                                                           */
/* -------------------------------------------------------------------------- */

function displayName(zone: CardZoneConfig) {
  return zone.label || zoneTypeLabel(zone.type);
}

function zoneTypeLabel(type: ZoneType) {
  return ZONE_TYPES.find((item) => item.value === type)?.label ?? type;
}

function zoneHint(type: ZoneType) {
  return ZONE_TYPES.find((item) => item.value === type)?.hint ?? "Layer";
}

function friendlyWidth(zone: CardZoneConfig) {
  if (zone.width != null) return `${zone.width}px`;
  if (zone.grow > 0) return "Flexible width";
  return "Auto width";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function recommendedWidth(type: ZoneType) {
  if (type === "flag") return 64;
  if (type === "rank" || type === "running-order") return 48;
  if (type === "score" || type === "jury-score" || type === "televote-score")
    return 76;
  if (type === "movement" || type === "qualification") return 48;
  return 140;
}

/* -------------------------------------------------------------------------- */
/* Simple shape mapping                                                       */
/* -------------------------------------------------------------------------- */

function detectSimpleShape(zone: CardZoneConfig): SimpleShape {
  if (zone.shape.kind === "pill") return "pill";
  if (zone.shape.kind === "wedge") return "wedge";

  if (
    zone.shape.kind === "parallelogram" ||
    zone.shape.kind === "trapezoid"
  ) {
    return zone.shape.direction === "left" ? "angled-left" : "angled-right";
  }

  if (zone.shape.kind === "rounded" && zone.shape.radius > 0) return "rounded";

  return "rectangle";
}

function applySimpleShape(
  source: CardZoneConfig["shape"],
  simple: SimpleShape,
): CardZoneConfig["shape"] {
  switch (simple) {
    case "rounded":
      return {
        ...source,
        kind: "rounded",
        radius: Math.max(8, Math.min(source.radius || 10, 30)),
        leftSlant: 0,
        rightSlant: 0,
        topInset: 0,
        bottomInset: 0,
      };

    case "pill":
      return {
        ...source,
        kind: "pill",
        radius: 999,
        leftSlant: 0,
        rightSlant: 0,
        topInset: 0,
        bottomInset: 0,
      };

    case "angled-left":
      return {
        ...source,
        kind: "parallelogram",
        radius: 0,
        leftSlant: 12,
        rightSlant: 12,
        topInset: 0,
        bottomInset: 0,
        direction: "left",
      };

    case "angled-right":
      return {
        ...source,
        kind: "parallelogram",
        radius: 0,
        leftSlant: 12,
        rightSlant: 12,
        topInset: 0,
        bottomInset: 0,
        direction: "right",
      };

    case "wedge":
      return {
        ...source,
        kind: "wedge",
        radius: 0,
        leftSlant: 0,
        rightSlant: 18,
        topInset: 0,
        bottomInset: 0,
        direction: "right",
      };

    case "rectangle":
    default:
      return {
        ...source,
        kind: "rect",
        radius: 0,
        leftSlant: 0,
        rightSlant: 0,
        topInset: 0,
        bottomInset: 0,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Simple surface mapping                                                     */
/* -------------------------------------------------------------------------- */

function detectSimpleBackground(zone: CardZoneConfig): SimpleBackground {
  const { fill, color } = zone.surface;

  if (fill === "none" || color === "transparent") return "none";
  if (fill === "country" || color === "country") return "country";
  if (color === "theme:primary") return "primary";
  if (color === "theme:secondary") return "secondary";
  if (color === "theme:jury") return "jury";
  if (color === "theme:televote") return "televote";
  if (color === "#ffffff" || color === "#fff") return "light";
  if (
    color === "#08101f" ||
    color === "#0a1030" ||
    color === "#07132f" ||
    color === "#111827"
  )
    return "dark";

  return "custom";
}

function simpleSurface(
  value: SimpleBackground,
  current: CardZoneConfig["surface"],
): CardZoneConfig["surface"] {
  const base = {
    ...current,
    angle: current.angle ?? 90,
    opacity: current.opacity ?? 1,
    blur: current.blur ?? 0,
  };

  switch (value) {
    case "none":
      return {
        ...base,
        fill: "none",
        color: "transparent",
        color2: "transparent",
      };
    case "country":
      return {
        ...base,
        fill: "country",
        color: "country",
        color2: "country",
      };
    case "primary":
      return {
        ...base,
        fill: "color",
        color: "theme:primary",
        color2: "theme:primary",
      };
    case "secondary":
      return {
        ...base,
        fill: "color",
        color: "theme:secondary",
        color2: "theme:secondary",
      };
    case "jury":
      return {
        ...base,
        fill: "color",
        color: "theme:jury",
        color2: "theme:jury",
      };
    case "televote":
      return {
        ...base,
        fill: "color",
        color: "theme:televote",
        color2: "theme:televote",
      };
    case "light":
      return {
        ...base,
        fill: "color",
        color: "#ffffff",
        color2: "#ffffff",
      };
    case "dark":
      return {
        ...base,
        fill: "color",
        color: "#08101f",
        color2: "#08101f",
      };
    case "custom":
    default:
      return {
        ...base,
        fill: "color",
        color:
          current.color && current.color !== "transparent"
            ? current.color
            : "#ffffff",
        color2:
          current.color2 && current.color2 !== "transparent"
            ? current.color2
            : "#ffffff",
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Zone creation / conversion                                                 */
/* -------------------------------------------------------------------------- */

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
  return {
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
          : type === "score" ||
              type === "jury-score" ||
              type === "televote-score"
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
      type === "score" ||
      type === "jury-score" ||
      type === "televote-score"
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
    typography: TEXT_ZONE_TYPES.has(type)
      ? defaultTypography(type)
      : undefined,
    fit: type === "flag" ? "cover" : type === "image" ? "contain" : undefined,
    objectPosition: type === "flag" ? "center" : undefined,
    text: type === "custom-text" ? "" : undefined,
    imageUrl: type === "image" ? null : undefined,
    leadingZero:
      type === "rank" || type === "running-order" ? false : undefined,
    emptyText:
      type === "score" ||
      type === "jury-score" ||
      type === "televote-score"
        ? "–"
        : undefined,
  };
}

function convertZoneTypePatch(
  zone: CardZoneConfig,
  type: ZoneType,
): Partial<CardZoneConfig> {
  const defaults = createZone(type, []);

  return {
    type,
    label:
      !zone.label || zone.label === zoneTypeLabel(zone.type)
        ? zoneTypeLabel(type)
        : zone.label,
    width: zone.width ?? defaults.width,
    grow:
      zone.grow === 0 && defaults.grow > 0
        ? defaults.grow
        : zone.grow,
    typography: TEXT_ZONE_TYPES.has(type)
      ? zone.typography ?? defaultTypography(type)
      : undefined,
    fit:
      type === "flag"
        ? zone.fit ?? "cover"
        : type === "image"
          ? zone.fit ?? "contain"
          : undefined,
    objectPosition:
      type === "flag"
        ? zone.objectPosition ?? "center"
        : undefined,
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
    type === "score" ||
    type === "jury-score" ||
    type === "televote-score";

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
    align: right
      ? "right"
      : type === "country-name"
        ? "left"
        : "center",
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
