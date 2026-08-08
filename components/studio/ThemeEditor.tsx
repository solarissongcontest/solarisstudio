import { Collapsible, ColorField, Field, SegButtons, Select, Slider, TextInput, Toggle } from "./Controls";
import { FONT_OPTIONS, THEME_PRESETS, cardBackground, flagStyle, resolveTheme, type ThemeConfig } from "@/lib/theme";
import { hexA } from "@/components/ScoreboardStage";

type Patch = (t: ThemeConfig) => ThemeConfig;

export function ThemeEditor({
  theme,
  onChange,
}: {
  theme: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}) {
  const set = (patch: Patch) => onChange(patch(theme));

  return (
    <div className="space-y-4">
      <PresetBar theme={theme} onChange={onChange} />

      <Collapsible
        title="Background & Branding"
        description="Overall backdrop, logo and colour palette used across the whole show."
        defaultOpen
      >
        <SegButtons
          value={theme.background.type}
          onChange={(v) => set((t) => ({ ...t, background: { ...t.background, type: v } }))}
          options={[
            { label: "Gradient", value: "gradient" },
            { label: "Solid", value: "color" },
            { label: "Image", value: "image" },
          ]}
        />
        {theme.background.type === "gradient" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField
              label="Gradient start"
              description="Top-left colour of the backdrop gradient."
              value={theme.background.gradientFrom}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientFrom: v } }))}
            />
            <ColorField
              label="Gradient end"
              description="Bottom-right colour of the backdrop gradient."
              value={theme.background.gradientTo}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientTo: v } }))}
            />
            <Field label="Angle" hint="Direction the gradient flows.">
              <Slider
                min={0}
                max={360}
                value={theme.background.gradientAngle}
                onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientAngle: v } }))}
                suffix="°"
              />
            </Field>
          </div>
        )}
        {theme.background.type === "color" && (
          <ColorField
            label="Background colour"
            description="Flat colour behind everything."
            value={theme.background.color}
            onChange={(v) => set((t) => ({ ...t, background: { ...t.background, color: v } }))}
          />
        )}
        {theme.background.type === "image" && (
          <Field label="Background image URL" hint="Any public image or animated GIF">
            <TextInput
              value={theme.background.imageUrl ?? ""}
              placeholder="https://…"
              onChange={(e) =>
                set((t) => ({ ...t, background: { ...t.background, imageUrl: e.target.value || null } }))
              }
            />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Overlay darkness" hint="Dims the backdrop so foreground text stays legible.">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={theme.background.overlay}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, overlay: v } }))}
            />
          </Field>
          <Field label="Background blur" hint="Softens the backdrop image/gradient.">
            <Slider
              min={0}
              max={40}
              value={theme.background.blur}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, blur: v } }))}
              suffix="px"
            />
          </Field>
        </div>
        <Field label="Logo URL" hint="Shown in broadcast/branding surfaces that support it.">
          <TextInput
            value={theme.logoUrl ?? ""}
            placeholder="https://…"
            onChange={(e) => set((t) => ({ ...t, logoUrl: e.target.value || null }))}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["primary", "Primary", "Main accent used for highlights, active states and the progress bar."],
              ["secondary", "Secondary", "Paired with primary in gradients (e.g. progress bar, top-award badge)."],
              ["accent", "Accent", "Extra accent colour available for custom surfaces."],
              ["text", "Base text", "Fallback text colour used wherever a specific text colour isn't set."],
              ["jury", "Jury colour", "Colour used to badge jury points."],
              ["televote", "Televote colour", "Colour used to badge televote points."],
              ["gold", "Winner gold", "Used for 1st place, qualification badges and winner celebration."],
            ] as const
          ).map(([key, label, desc]) => (
            <ColorField
              key={key}
              label={label}
              description={desc}
              value={theme.colors[key]}
              onChange={(v) => set((t) => ({ ...t, colors: { ...t.colors, [key]: v } }))}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display font" hint="Used for titles and country names.">
            <Select value={theme.fontDisplay} onChange={(e) => set((t) => ({ ...t, fontDisplay: e.target.value }))}>
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} className="bg-background">
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Body font" hint="Used for supporting text like artist/song.">
            <Select value={theme.fontBody} onChange={(e) => set((t) => ({ ...t, fontBody: e.target.value }))}>
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} className="bg-background">
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Collapsible>

      <Collapsible
        title="Country Cards"
        description="The shape, fill, border, shadow and spacing of each country's row on the scoreboard."
      >
        <Field label="Background mode" hint="How the card fill is generated.">
          <SegButtons
            value={theme.card.backgroundMode}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, backgroundMode: v } }))}
            options={[
              { label: "Solid", value: "solid" },
              { label: "Glass", value: "glass" },
              { label: "Country-tinted", value: "country-tinted" },
              { label: "Gradient", value: "gradient" },
            ]}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Country Card Background"
            description="Base fill colour used for solid/glass/gradient modes."
            value={theme.card.backgroundColor}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, backgroundColor: v } }))}
          />
          <ColorField
            label="Country Card Border"
            description="Border colour drawn around each country row."
            value={theme.card.borderColor}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, borderColor: v } }))}
          />
        </div>
        <SegButtons
          value={theme.card.shape}
          onChange={(v) => set((t) => ({ ...t, card: { ...t.card, shape: v } }))}
          options={[
            { label: "Rounded", value: "rounded" },
            { label: "Square", value: "square" },
            { label: "Pill", value: "pill" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Corner radius">
            <Slider
              min={0}
              max={40}
              value={theme.card.radius}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, radius: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Card height / size">
            <Slider
              min={32}
              max={96}
              value={theme.card.height}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, height: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Spacing" hint="Gap between country rows.">
            <Slider
              min={0}
              max={24}
              value={theme.card.gap}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, gap: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Padding" hint="Inner space on left/right of each card.">
            <Slider
              min={0}
              max={32}
              value={theme.card.padding}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, padding: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Glass strength" hint="0 = fully opaque, higher = heavier liquid-glass blur/translucency.">
            <Slider
              min={0}
              max={1}
              step={0.02}
              value={theme.card.opacity}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, opacity: v } }))}
            />
          </Field>
          <Field label="Card blur" hint="Backdrop blur applied behind the card (liquid-glass effect).">
            <Slider
              min={0}
              max={40}
              value={theme.card.blur}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, blur: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Border thickness">
            <Slider
              min={0}
              max={4}
              value={theme.card.borderWidth}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, borderWidth: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Shadow strength">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={theme.card.shadowStrength}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, shadowStrength: v } }))}
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Tint cards with country colour"
            checked={theme.card.useCountryColor}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, useCountryColor: v } }))}
          />
          <Toggle
            label="Card shadow"
            checked={theme.card.shadow}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, shadow: v } }))}
          />
        </div>

        <CardPreview theme={theme} />
      </Collapsible>

      <Collapsible
        title="Text & Numbers"
        description="Colours for the text drawn on each country row."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Country Name Text"
            description="Colour of the country's name."
            value={theme.text.countryName}
            onChange={(v) => set((t) => ({ ...t, text: { ...t.text, countryName: v } }))}
          />
          <ColorField
            label="Country Score Text"
            description="Colour of the running point total."
            value={theme.text.countryScore}
            onChange={(v) => set((t) => ({ ...t, text: { ...t.text, countryScore: v } }))}
          />
          <ColorField
            label="Artist / Song Text"
            description="Colour of the artist & song subtitle."
            value={theme.text.artistSong}
            onChange={(v) => set((t) => ({ ...t, text: { ...t.text, artistSong: v } }))}
          />
          <ColorField
            label="Rank Text"
            description="Colour of the rank number badge."
            value={theme.text.rank}
            onChange={(v) => set((t) => ({ ...t, text: { ...t.text, rank: v } }))}
          />
        </div>
      </Collapsible>

      <Collapsible
        title="States & Highlights"
        description="Special looks for the leader, currently-voting country, selections and qualified acts."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Leader Card Background"
            description="Background of the country currently in 1st place."
            value={theme.states.leaderBackground}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, leaderBackground: v } }))}
          />
          <ColorField
            label="Leader Border"
            description="Border colour of the leading country's card."
            value={theme.states.leaderBorder}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, leaderBorder: v } }))}
          />
          <ColorField
            label="Leader Text"
            description="Text colour on the leader card."
            value={theme.states.leaderText}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, leaderText: v } }))}
          />
          <ColorField
            label="Highlight Colour"
            description="General-purpose highlight colour (e.g. new points landing)."
            value={theme.states.highlight}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, highlight: v } }))}
          />
          <ColorField
            label="Voting Country Highlight"
            description="Background of the country card currently casting votes."
            value={theme.states.votingBackground}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, votingBackground: v } }))}
          />
          <ColorField
            label="Voting Country Text"
            description="Text colour on the currently-voting country's card."
            value={theme.states.votingText}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, votingText: v } }))}
          />
          <ColorField
            label="Selected Country"
            description="Colour used when an organiser selects a country in the studio."
            value={theme.states.selected}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, selected: v } }))}
          />
          <ColorField
            label="Hover Colour"
            description="Colour shown on hover in interactive editors."
            value={theme.states.hover}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, hover: v } }))}
          />
          <ColorField
            label="Qualified Colour"
            description="Badge colour for countries that qualify."
            value={theme.states.qualified}
            onChange={(v) => set((t) => ({ ...t, states: { ...t.states, qualified: v } }))}
          />
        </div>
        <LeaderPreview theme={theme} />
      </Collapsible>

      <Collapsible
        title="Broadcast Chrome"
        description="Header bar, side panel, progress bar and spokesperson panel used on the broadcast page."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Header Background"
            description="Background of the top broadcast header bar."
            value={theme.chrome.headerBackground}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, headerBackground: v } }))}
          />
          <ColorField
            label="Header Text"
            description="Text colour in the header bar."
            value={theme.chrome.headerText}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, headerText: v } }))}
          />
          <ColorField
            label="Sidebar Background"
            description="Background of side/panel surfaces."
            value={theme.chrome.panelBackground}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, panelBackground: v } }))}
          />
          <ColorField
            label="Sidebar Text"
            description="Text colour on side/panel surfaces."
            value={theme.chrome.panelText}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, panelText: v } }))}
          />
          <ColorField
            label="Progress Bar Track"
            description="Background track of the reveal progress bar."
            value={theme.chrome.progressTrack}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, progressTrack: v } }))}
          />
          <ColorField
            label="Progress Bar Fill"
            description="Filled portion of the reveal progress bar."
            value={theme.chrome.progressFill}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, progressFill: v } }))}
          />
          <ColorField
            label="Spokesperson Panel Background"
            description="Background of the 'now voting' card."
            value={theme.chrome.spokespersonBackground}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, spokespersonBackground: v } }))}
          />
          <ColorField
            label="Spokesperson Panel Text"
            description="Text colour on the 'now voting' card."
            value={theme.chrome.spokespersonText}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, spokespersonText: v } }))}
          />
          <ColorField
            label="Spokesperson Accent"
            description="Accent colour (label, underline) on the 'now voting' card."
            value={theme.chrome.spokespersonAccent}
            onChange={(v) => set((t) => ({ ...t, chrome: { ...t.chrome, spokespersonAccent: v } }))}
          />
        </div>
        <ProgressPreview theme={theme} />
      </Collapsible>

      <Collapsible title="Flags" description="Shape and framing of the country flags shown on each row.">
        <SegButtons
          value={theme.flag.shape}
          onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, shape: v } }))}
          options={[
            { label: "Rectangle", value: "rect" },
            { label: "Rounded", value: "rounded" },
            { label: "Circle", value: "circle" },
            { label: "Square", value: "square" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Flag width">
            <Slider
              min={20}
              max={96}
              value={theme.flag.width}
              onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, width: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Aspect ratio">
            <Slider
              min={1}
              max={2.5}
              step={0.1}
              value={theme.flag.ratio}
              onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, ratio: v } }))}
            />
          </Field>
        </div>
        <Toggle
          label="Flag border"
          checked={theme.flag.border}
          onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, border: v } }))}
        />
      </Collapsible>

      <Collapsible title="Layout" description="Board arrangement and what information is shown per row.">
        <SegButtons
          value={theme.layout.mode}
          onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, mode: v } }))}
          options={[
            { label: "Single list", value: "single" },
            { label: "Two columns", value: "two-column" },
            { label: "Grid", value: "grid" },
          ]}
        />
        <Field label="Countries on screen" hint="e.g. 26 finalists split across the chosen layout">
          <Slider
            min={5}
            max={66}
            value={theme.layout.maxVisible}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, maxVisible: v } }))}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Show rank"
            checked={theme.layout.showRank}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showRank: v } }))}
          />
          <Toggle
            label="Show artist & song"
            checked={theme.layout.showArtist}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showArtist: v } }))}
          />
          <Toggle
            label="Show jury / televote split"
            checked={theme.layout.showSplit}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showSplit: v } }))}
          />
          <Toggle
            label="Centre align text"
            checked={theme.layout.align === "center"}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, align: v ? "center" : "left" } }))}
          />
        </div>
      </Collapsible>

      <Collapsible title="Vote Reveal" description="How jury votes are paced out during the broadcast reveal.">
        <Field
          label="Jury vote presentation"
          hint="All individually: every point is read out one by one. Top 3 individually: lower points are shown together first, then the top 3 awards individually. 12 only: all lower points are shown together, then only the top award is read out individually."
        >
          <SegButtons
            value={theme.reveal.juryPresentation}
            onChange={(v) => set((t) => ({ ...t, reveal: { ...t.reveal, juryPresentation: v } }))}
            options={[
              { label: "All individually", value: "all-individually" },
              { label: "Top 3 individually", value: "top3-individually" },
              { label: "12 only", value: "twelve-only" },
            ]}
          />
        </Field>
      </Collapsible>
    </div>
  );
}

function PresetBar({ theme, onChange }: { theme: ThemeConfig; onChange: (t: ThemeConfig) => void }) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-4">
      <h4 className="mb-1 text-sm font-semibold">Theme Presets</h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Apply a ready-made look in one click, then fine-tune anything below.
      </p>
      <div className="flex flex-wrap gap-2">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            title={p.description}
            onClick={() => onChange(resolveTheme({ ...theme, ...p.make() }))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/60"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function CardPreview({ theme }: { theme: ThemeConfig }) {
  const accent = theme.colors.primary;
  return (
    <div className="pt-2">
      <span className="mb-2 block text-[11px] uppercase tracking-widest text-muted-foreground">Live preview</span>
      <div
        className="flex items-center gap-3 overflow-hidden"
        style={{
          height: theme.card.height,
          borderRadius: theme.card.shape === "pill" ? theme.card.height / 2 : theme.card.shape === "square" ? 0 : theme.card.radius,
          paddingLeft: theme.card.padding,
          paddingRight: theme.card.padding,
          gap: 12,
          background: cardBackground(theme, accent, hexA),
          border: `${theme.card.borderWidth}px solid ${theme.card.borderColor}`,
          backdropFilter: `blur(${theme.card.blur}px)`,
          boxShadow: theme.card.shadow ? `0 12px 30px -18px ${hexA(theme.card.shadowColor, theme.card.shadowStrength)}` : undefined,
        }}
      >
        <span style={{ ...flagStyle(theme), background: accent }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" style={{ color: theme.text.countryName }}>
            Solaris Prime
          </span>
          <span className="block truncate text-[11px]" style={{ color: theme.text.artistSong, opacity: 0.75 }}>
            Nova — "Bright Skies"
          </span>
        </span>
        <span className="font-bold" style={{ color: theme.text.countryScore }}>
          128
        </span>
      </div>
    </div>
  );
}

function LeaderPreview({ theme }: { theme: ThemeConfig }) {
  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-2">
      <div>
        <span className="mb-2 block text-[11px] uppercase tracking-widest text-muted-foreground">Leader card</span>
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold"
          style={{
            background: theme.states.leaderBackground,
            border: `2px solid ${theme.states.leaderBorder}`,
            color: theme.states.leaderText,
          }}
        >
          <span>Solaris Prime</span>
          <span>128</span>
        </div>
      </div>
      <div>
        <span className="mb-2 block text-[11px] uppercase tracking-widest text-muted-foreground">Now voting</span>
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: theme.states.votingBackground, color: theme.states.votingText }}
        >
          <span>Nebula Republic</span>
          <span>●</span>
        </div>
      </div>
    </div>
  );
}

function ProgressPreview({ theme }: { theme: ThemeConfig }) {
  return (
    <div className="pt-2">
      <span className="mb-2 block text-[11px] uppercase tracking-widest text-muted-foreground">Progress bar</span>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: theme.chrome.progressTrack }}>
        <div className="h-full w-2/3 rounded-full" style={{ background: theme.chrome.progressFill }} />
      </div>
    </div>
  );
}
