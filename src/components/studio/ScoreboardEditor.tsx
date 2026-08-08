"use client";

import { useMemo } from "react";

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

import {
  Field,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "./Controls";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

type ScoreboardEditorProps = {
  config: ScoreboardConfig;

  onChange: (
    next: ScoreboardConfig,
  ) => void;

  rows: BroadcastRowData[];

  theme: ThemeConfig;

  showName: string;

  onReset?: () => void;
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ScoreboardEditor({
  config,
  onChange,
  rows,
  theme,
  showName,
  onReset,
}: ScoreboardEditorProps) {
  const set = (
    patch: Partial<ScoreboardConfig>,
  ) => {
    onChange({
      ...config,
      ...patch,
    });
  };

  const setLayout = (
    patch: Partial<
      ScoreboardConfig["layout"]
    >,
  ) => {
    set({
      layout: {
        ...config.layout,
        ...patch,
      },
    });
  };

  const setCard = (
    patch: Partial<
      ScoreboardConfig["card"]
    >,
  ) => {
    set({
      card: {
        ...config.card,
        ...patch,
      },
    });
  };

  const setHeader = (
    patch: Partial<
      ScoreboardConfig["header"]
    >,
  ) => {
    set({
      header: {
        ...config.header,
        ...patch,
      },
    });
  };

  const setBackground = (
    patch: Partial<
      ScoreboardConfig["background"]
    >,
  ) => {
    set({
      background: {
        ...config.background,
        ...patch,
      },
    });
  };

  const setPanel = (
    patch: Partial<
      ScoreboardConfig["panel"]
    >,
  ) => {
    set({
      panel: {
        ...config.panel,
        ...patch,
      },
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Preview                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * The actual board is 1920 × 1080.
   *
   * Scale it down into the Studio rather than rendering
   * some unrelated fake preview.
   */
  const previewScale =
    useMemo(() => {
      const width =
        config.canvas.width ||
        1920;

      return Math.min(
        0.46,
        820 / width,
      );
    }, [config.canvas.width]);

  /* ------------------------------------------------------------------------ */
  /* Preset selection                                                         */
  /* ------------------------------------------------------------------------ */

  const applyPreset = (
    presetId: PresetId,
  ) => {
    const preset =
      buildPreset(presetId);

    /**
     * Preserve the current background music / control preferences.
     *
     * Selecting a visual preset should not suddenly
     * blast a different YouTube video or move production controls.
     */
    preset.music =
      config.music;

    preset.controls =
      config.controls;

    onChange(
      preset,
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="space-y-7">
      {/* ------------------------------------------------------------------ */}
      {/* Presets                                                            */}
      {/* ------------------------------------------------------------------ */}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">
            Scoreboard style
          </h3>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a starting design.
            You can customise it
            below.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRESET_IDS.map(
            (presetId) => {
              const selected =
                config.card
                  .preset ===
                presetId;

              return (
                <button
                  key={
                    presetId
                  }
                  type="button"
                  onClick={() =>
                    applyPreset(
                      presetId,
                    )
                  }
                  className={cn(
                    "group overflow-hidden rounded-2xl border text-left transition",

                    selected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-surface hover:border-primary/40 hover:bg-surface/70",
                  )}
                >
                  <PresetThumbnail
                    presetId={
                      presetId
                    }
                    theme={
                      theme
                    }
                  />

                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {
                          PRESET_LABELS[
                            presetId
                          ]
                        }
                      </p>

                      {selected && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          Active
                        </span>
                      )}
                    </div>

                    <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                      {
                        PRESET_DESCRIPTIONS[
                          presetId
                        ]
                      }
                    </p>
                  </div>
                </button>
              );
            },
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Main preview                                                       */}
      {/* ------------------------------------------------------------------ */}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Live preview
            </h3>

            <p className="text-xs text-muted-foreground">
              This uses the same
              scoreboard renderer as
              the actual broadcast.
            </p>
          </div>

          <span className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground">
            {
              config.canvas
                .width
            }
            ×
            {
              config.canvas
                .height
            }
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-black">
          <div
            className="origin-top-left"
            style={{
              width:
                config.canvas
                  .width *
                previewScale,

              height:
                config.canvas
                  .height *
                previewScale,
            }}
          >
            <div
              style={{
                width:
                  config.canvas
                    .width,

                height:
                  config.canvas
                    .height,

                transform: `scale(${previewScale})`,

                transformOrigin:
                  "top left",
              }}
            >
              <ScoreboardBoard
                config={
                  config
                }
                theme={
                  theme
                }
                rows={
                  rows
                }
                title="JURY RESULTS"
                subtitle={
                  showName
                }
                progress={
                  0.56
                }
                animate={
                  false
                }
                panelContent={
                  <PreviewVoter />
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Layout                                                             */}
      {/* ------------------------------------------------------------------ */}

      <EditorSection
        title="Board layout"
        description="Overall scoreboard position and column structure."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Columns">
            <Select
              value={
                String(
                  config.layout
                    .columns,
                )
              }
              onChange={(
                e,
              ) =>
                setLayout({
                  columns:
                    Number(
                      e
                        .target
                        .value,
                    ) as
                      | 1
                      | 2
                      | 3
                      | 4,
                })
              }
            >
              <option value="1">
                1 column
              </option>

              <option value="2">
                2 columns
              </option>

              <option value="3">
                3 columns
              </option>

              <option value="4">
                4 columns
              </option>
            </Select>
          </Field>

          <Field label="Distribution">
            <Select
              value={
                config.layout
                  .distribution
              }
              onChange={(
                e,
              ) =>
                setLayout({
                  distribution:
                    e.target
                      .value as
                      ScoreboardConfig["layout"]["distribution"],
                })
              }
            >
              <option value="sequential">
                Sequential
              </option>

              <option value="balanced">
                Balanced
              </option>

              <option value="manual">
                Manual
              </option>
            </Select>
          </Field>

          <Field label="Horizontal alignment">
            <Select
              value={
                config.layout
                  .alignment
              }
              onChange={(
                e,
              ) =>
                setLayout({
                  alignment:
                    e.target
                      .value as
                      ScoreboardConfig["layout"]["alignment"],
                })
              }
            >
              <option value="left">
                Left
              </option>

              <option value="center">
                Center
              </option>

              <option value="right">
                Right
              </option>
            </Select>
          </Field>

          <Field label="Vertical alignment">
            <Select
              value={
                config.layout
                  .verticalAlignment
              }
              onChange={(
                e,
              ) =>
                setLayout({
                  verticalAlignment:
                    e.target
                      .value as
                      ScoreboardConfig["layout"]["verticalAlignment"],
                })
              }
            >
              <option value="top">
                Top
              </option>

              <option value="center">
                Center
              </option>

              <option value="bottom">
                Bottom
              </option>
            </Select>
          </Field>
        </div>

        <Field label="Board width">
          <Slider
            min={500}
            max={1700}
            step={10}
            value={
              config.layout
                .boardWidth
            }
            onChange={(
              value,
            ) =>
              setLayout({
                boardWidth:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Row gap">
          <Slider
            min={0}
            max={30}
            step={1}
            value={
              config.layout
                .rowGap
            }
            onChange={(
              value,
            ) =>
              setLayout({
                rowGap:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Column gap">
          <Slider
            min={0}
            max={80}
            step={1}
            value={
              config.layout
                .columnGap
            }
            onChange={(
              value,
            ) =>
              setLayout({
                columnGap:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Horizontal offset">
            <Slider
              min={-400}
              max={400}
              step={5}
              value={
                config.layout
                  .positionX
              }
              onChange={(
                value,
              ) =>
                setLayout({
                  positionX:
                    value,
                })
              }
              suffix="px"
            />
          </Field>

          <Field label="Vertical offset">
            <Slider
              min={-300}
              max={300}
              step={5}
              value={
                config.layout
                  .positionY
              }
              onChange={(
                value,
              ) =>
                setLayout({
                  positionY:
                    value,
                })
              }
              suffix="px"
            />
          </Field>
        </div>
      </EditorSection>

      {/* ------------------------------------------------------------------ */}
      {/* Card                                                               */}
      {/* ------------------------------------------------------------------ */}

      <EditorSection
        title="Country cards"
        description="Size and basic geometry of each scoreboard row."
      >
        <Field label="Card height">
          <Slider
            min={28}
            max={100}
            step={1}
            value={
              config.card
                .height
            }
            onChange={(
              value,
            ) =>
              setCard({
                height:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Corner radius">
          <Slider
            min={0}
            max={60}
            step={1}
            value={
              Math.min(
                60,
                config.card
                  .radius,
              )
            }
            onChange={(
              value,
            ) =>
              setCard({
                radius:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Internal gap">
          <Slider
            min={0}
            max={30}
            step={1}
            value={
              config.card.gap
            }
            onChange={(
              value,
            ) =>
              setCard({
                gap:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Horizontal padding">
          <Slider
            min={0}
            max={40}
            step={1}
            value={
              config.card
                .paddingX
            }
            onChange={(
              value,
            ) =>
              setCard({
                paddingX:
                  value,
              })
            }
            suffix="px"
          />
        </Field>

        <Field label="Card opacity">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={
              config.card
                .opacity
            }
            onChange={(
              value,
            ) =>
              setCard({
                opacity:
                  value,
              })
            }
          />
        </Field>

        <Toggle
          label="Clip card contents"
          checked={
            config.card
              .overflow ===
            "hidden"
          }
          onChange={(
            value,
          ) =>
            setCard({
              overflow:
                value
                  ? "hidden"
                  : "visible",
            })
          }
        />
      </EditorSection>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <EditorSection
        title="Header"
        description="Titles shown above the scoreboard."
      >
        <Toggle
          label="Show header"
          checked={
            config.header
              .visible
          }
          onChange={(
            value,
          ) =>
            setHeader({
              visible:
                value,
            })
          }
        />

        <Field label="Upper title">
          <TextInput
            value={
              config.header
                .upper.text
            }
            onChange={(
              e,
            ) =>
              setHeader({
                upper: {
                  ...config
                    .header
                    .upper,

                  text:
                    e.target
                      .value,
                },
              })
            }
          />
        </Field>

        <Field label="Main title">
          <TextInput
            value={
              config.header
                .main.text
            }
            placeholder="Leave blank for automatic scene title"
            onChange={(
              e,
            ) =>
              setHeader({
                main: {
                  ...config
                    .header
                    .main,

                  text:
                    e.target
                      .value,
                },
              })
            }
          />
        </Field>

        <Field label="Spacing below header">
          <Slider
            min={0}
            max={100}
            step={1}
            value={
              config.header
                .marginBottom
            }
            onChange={(
              value,
            ) =>
              setHeader({
                marginBottom:
                  value,
              })
            }
            suffix="px"
          />
        </Field>
      </EditorSection>

      {/* ------------------------------------------------------------------ */}
      {/* Background                                                         */}
      {/* ------------------------------------------------------------------ */}

      <EditorSection
        title="Background"
        description="The scoreboard can use the show theme or its own broadcast background."
      >
        <Field label="Background source">
          <Select
            value={
              config.background
                .type
            }
            onChange={(
              e,
            ) =>
              setBackground({
                type:
                  e.target
                    .value as
                    ScoreboardConfig["background"]["type"],
              })
            }
          >
            <option value="theme">
              Show theme
            </option>

            <option value="gradient">
              Gradient
            </option>

            <option value="color">
              Solid colour
            </option>

            <option value="image">
              Image
            </option>

            <option value="transparent">
              Transparent
            </option>
          </Select>
        </Field>

        {config.background
          .type ===
          "color" && (
          <Field label="Colour">
            <TextInput
              value={
                config
                  .background
                  .color
              }
              onChange={(
                e,
              ) =>
                setBackground({
                  color:
                    e.target
                      .value,
                })
              }
            />
          </Field>
        )}

        {config.background
          .type ===
          "gradient" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gradient start">
              <TextInput
                value={
                  config
                    .background
                    .gradientFrom
                }
                onChange={(
                  e,
                ) =>
                  setBackground({
                    gradientFrom:
                      e.target
                        .value,
                  })
                }
              />
            </Field>

            <Field label="Gradient end">
              <TextInput
                value={
                  config
                    .background
                    .gradientTo
                }
                onChange={(
                  e,
                ) =>
                  setBackground({
                    gradientTo:
                      e.target
                        .value,
                  })
                }
              />
            </Field>
          </div>
        )}

        {config.background
          .type ===
          "image" && (
          <Field label="Image URL">
            <TextInput
              value={
                config
                  .background
                  .imageUrl ??
                ""
              }
              placeholder="https://..."
              onChange={(
                e,
              ) =>
                setBackground({
                  imageUrl:
                    e.target
                      .value ||
                    null,
                })
              }
            />
          </Field>
        )}

        <Field label="Dark overlay">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={
              config.background
                .overlay
            }
            onChange={(
              value,
            ) =>
              setBackground({
                overlay:
                  value,
              })
            }
          />
        </Field>

        <Field label="Vignette">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={
              config.background
                .vignette
            }
            onChange={(
              value,
            ) =>
              setBackground({
                vignette:
                  value,
              })
            }
          />
        </Field>
      </EditorSection>

      {/* ------------------------------------------------------------------ */}
      {/* Voter panel                                                        */}
      {/* ------------------------------------------------------------------ */}

      <EditorSection
        title="Current jury panel"
        description="Optional panel showing the voting country, person or organisation."
      >
        <Toggle
          label="Show current voter panel"
          checked={
            config.panel
              .visible
          }
          onChange={(
            value,
          ) =>
            setPanel({
              visible:
                value,
            })
          }
        />

        <Field label="Panel side">
          <Select
            value={
              config.panel
                .side
            }
            onChange={(
              e,
            ) =>
              setPanel({
                side:
                  e.target
                    .value as
                    ScoreboardConfig["panel"]["side"],
              })
            }
          >
            <option value="left">
              Left
            </option>

            <option value="right">
              Right
            </option>

            <option value="top">
              Top
            </option>

            <option value="bottom">
              Bottom
            </option>
          </Select>
        </Field>

        <Field label="Panel size">
          <Slider
            min={180}
            max={600}
            step={10}
            value={
              config.panel
                .size
            }
            onChange={(
              value,
            ) =>
              setPanel({
                size:
                  value,
              })
            }
            suffix="px"
          />
        </Field>
      </EditorSection>

      {/* ------------------------------------------------------------------ */}
      {/* Reset                                                              */}
      {/* ------------------------------------------------------------------ */}

      {onReset && (
        <section className="rounded-2xl border border-border bg-surface/50 p-4">
          <p className="text-sm font-medium">
            Reset broadcast scoreboard
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Returns this show to
            the automatic
            Theme-based live
            broadcast design.
          </p>

          <button
            type="button"
            onClick={
              onReset
            }
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface"
          >
            Reset scoreboard
          </button>
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor section                                                             */
/* -------------------------------------------------------------------------- */

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;

  description?: string;

  children:
    React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface/30 p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {title}
        </h3>

        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Preset thumbnail                                                           */
/* -------------------------------------------------------------------------- */

function PresetThumbnail({
  presetId,
  theme,
}: {
  presetId: PresetId;

  theme: ThemeConfig;
}) {
  const config =
    useMemo(
      () =>
        buildPreset(
          presetId,
        ),
      [presetId],
    );

  const rows =
    useMemo<
      BroadcastRowData[]
    >(
      () => [
        previewRow(
          "A",
          "Oland",
          "OLA",
          1,
          136,
          theme.colors
            .primary,
        ),

        previewRow(
          "B",
          "Fennek",
          "FEN",
          2,
          122,
          theme.colors
            .secondary,
        ),

        previewRow(
          "C",
          "Diaria",
          "DIA",
          3,
          117,
          theme.colors
            .accent,
        ),
      ],
      [theme],
    );

  const scale =
    0.135;

  return (
    <div className="relative h-28 overflow-hidden bg-black">
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width:
            config.canvas
              .width,

          height:
            config.canvas
              .height,

          transform: `scale(${scale})`,

          transformOrigin:
            "top left",
        }}
      >
        <ScoreboardBoard
          config={{
            ...config,

            header: {
              ...config.header,

              visible:
                false,
            },

            footer: {
              ...config.footer,

              visible:
                false,
            },

            logo: {
              ...config.logo,

              visible:
                false,
            },

            panel: {
              ...config.panel,

              visible:
                false,
            },

            layout: {
              ...config.layout,

              safeMarginTop:
                20,

              safeMarginBottom:
                20,

              boardWidth:
                Math.min(
                  config.layout
                    .boardWidth,
                  1000,
                ),
            },
          }}
          theme={
            theme
          }
          rows={
            rows
          }
          animate={
            false
          }
        />
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0",

          presetId ===
            "ssc21" &&
            "ring-1 ring-inset ring-cyan-400/20",
        )}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview voter                                                              */
/* -------------------------------------------------------------------------- */

function PreviewVoter() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="grid aspect-[3/2] w-full max-w-52 place-items-center rounded-xl bg-primary/25 text-3xl font-black">
        OLA
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.3em] opacity-50">
        Now voting
      </p>

      <p className="mt-2 text-xl font-bold">
        Oland
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Thumbnail data                                                             */
/* -------------------------------------------------------------------------- */

function previewRow(
  id: string,
  name: string,
  abbreviation: string,
  rank: number,
  score: number,
  accent: string,
): BroadcastRowData {
  return {
    id,

    entityType:
      "global",

    name,

    abbreviation,

    flagImage:
      null,

    accent,

    rank,

    runningOrder:
      rank,

    score,

    juryScore:
      Math.max(
        0,
        score - 20,
      ),

    televoteScore:
      20,

    movement:
      null,

    qualified:
      null,

    eliminated:
      null,

    active:
      rank === 2,

    highlighted:
      rank === 1,

    leader:
      rank === 1,

    winner:
      false,
  };
}
