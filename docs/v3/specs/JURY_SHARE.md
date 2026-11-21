# Solaris Studio V3 — Jury Vote Share Cards
## Implementation-ready Product, UX, Visual, Data, Rendering, Organizer, Security, Testing & Release Specification

### Status

This specification adds **official jury-vote share graphics** to Solaris Studio V3.

It supplements the canonical V3 Public, System and Organizer specifications. It does not replace the existing Jury, Results, Me/History, publication, authorization or edition-branding architecture.

The feature must follow these existing V3 rules:

- canonical contest/result state remains authoritative;
- Results owns official outcomes and jury/televote breakdowns;
- Me owns personal history, submissions and receipts;
- historical edition context must remain historically correct;
- protected data is authorized server-side;
- consequential/publication state is not inferred independently in the browser;
- automated testing must never use production Solaris Supabase. fileciteturn3file7L1961-L2017 fileciteturn3file7L2084-L2134 fileciteturn0file0L5-L23

---

# 1. Product definition

Solaris Studio should allow a jury vote to become a **finished, official-looking social graphic** after the corresponding jury results are allowed to become public.

The feature exists primarily for:

- Instagram Stories;
- native mobile sharing;
- saving to Photos/Files;
- Discord/social posting;
- historical Solaris sharing.

The user does **not** design a graphic from scratch.

They choose from three finished Solaris designs:

> **Default · Edition · Liquid Glass**

The underlying ballot is identical in every design.

Only presentation changes.

---

# 2. Core user promise

After results:

> **My jury votes are available. I can turn them into a beautiful Solaris Story card in a few seconds.**

For an old edition:

> **I can find my old jury vote and generate the same kind of card years later.**

Before results:

> **Solaris does not accidentally help me leak the jury vote.**

A revolutionary combination of aesthetics and not spoiling the contest.

---

# 3. Canonical capability

Register:

```ts id="y8b64s"
results.jury_share_card
```

Recommended child capabilities:

```ts id="he3gmr"
results.jury_share_card.view
results.jury_share_card.render
results.jury_share_card.share
results.jury_share_card.historical
results.jury_share_card.public_country
```

The Public Capability Registry should classify the capability under:

```ts id="688z07"
targetArea: "results"
```

with secondary access from `me`.

Do not create an entirely new top-level product area.

---

# 4. Supported contexts

## 4.1 Personal current-edition jury vote

Primary route:

```text id="wfp2qq"
Results
→ Edition
→ Show
→ Jury
→ Your jury vote
→ Share votes
```

Secondary:

```text id="5gj795"
Me
→ Activity
→ Jury submissions
→ Edition
→ Show
→ Share votes
```

## 4.2 Historical personal jury vote

```text id="q16rim"
Me
→ History
→ SSC 19
→ Jury
→ Grand Final
→ Share votes
```

## 4.3 Public published country jury vote

Where Solaris already exposes an official country jury breakdown publicly:

```text id="m6la24"
Results
→ Show
→ Jury
→ Oland
→ Share vote
```

This uses the same rendering infrastructure.

Authorization is different.

---

# 5. Share availability

## 5.1 Never use `jury.closed` alone

Closing Jury is not enough.

The share feature should depend on the canonical result/publication policy.

The V3 model deliberately separates Jury from Results and publication because those domains can be in different states. fileciteturn3file1L355-L388 fileciteturn3file1L457-L535

Canonical rule:

```ts id="2mnppm"
canRenderJuryShare =
  ballotExists &&
  viewerMayAccessBallot &&
  resultVersionIsPublished &&
  juryBreakdownIsPublicAccordingToPolicy;
```

## 5.2 Before publication

The UI may show:

> 🔒 **Share after results**  
> Your official jury-vote graphic becomes available when these jury results are published.

No image endpoint should exist that leaks the result despite the disabled UI.

## 5.3 After publication

Show:

> **Share votes**

## 5.4 Corrected publication

If published Result Version 4 is replaced by a published correction Version 5:

```text id="zibup4"
all new exports → version 5
```

Existing user-downloaded images obviously cannot be recalled from Photos. Solaris does not command the space-time continuum.

---

# 6. The three visual designs

## 6.1 Default

**Always available.**

This is the permanent Solaris jury-card identity based on the design reference already supplied.

It should remain visually consistent across editions.

### Default must retain

- dark Solaris navy background;
- restrained ambient/star treatment;
- Solaris identity at top;
- ten score rows;
- rounded score-row geometry;
- blue normal rows;
- cream/gold 12-point row;
- country flag on left;
- country in the main row body;
- points aligned right;
- `VOTES OF:` footer;
- large source-country identity.

### Default must not inherit

- edition scoreboard shape;
- edition artwork;
- edition-specific typography;
- edition-specific decorative motifs;
- edition-specific row styling.

Only factual content changes:

```text id="7iht27"
edition number/name
show
countries
flags
points
source country
```

This keeps **Default genuinely default**, rather than eventually becoming “Edition but slightly less Edition.”

---

# 7. Edition design

The **Edition** design should feel as though the jury card came from that edition's real broadcast package.

It preserves the same information architecture:

```text id="euh38z"
contest identity
show/context

12
10
8
7
6
5
4
3
2
1

Votes of [country]
```

but can substantially reinterpret presentation.

## 7.1 Edition inputs

Where available:

```text id="37r7ax"
edition logo
edition artwork
edition typography
edition colour system
edition scoreboard tokens
edition flag treatment
edition decorative motifs
edition visual effects
```

The existing V3 artwork system already anticipates focal points, safe text regions, responsive crops and controlled scrims. fileciteturn3file3L1022-L1037

## 7.2 Scoreboard inheritance

Preferred:

```text id="oc8yyc"
Edition scoreboard tokens
            ↓
Jury Edition theme
```

Not:

```text id="autpfa"
screenshot current scoreboard
↓
crop it into a Story
↓
pretend this is architecture
```

Suggested contract:

```ts id="s5lxhn"
type EditionScoreboardTheme = {
  rowRadius: number;
  rowHeight: number;

  rowBackground: ThemePaint;
  rowForeground: ThemePaint;

  topScoreBackground: ThemePaint;
  topScoreForeground: ThemePaint;

  border?: ThemePaint;
  highlight?: ThemePaint;

  flagTreatment: FlagTreatment;
  scoreTreatment: ScoreTreatment;

  headingTypography: TypographyToken;
  rowTypography: TypographyToken;
  scoreTypography: TypographyToken;
};
```

---

# 8. Edition artwork composition

Edition artwork should be treated as a compositional layer, not merely slapped behind everything at 100% opacity like an intern discovering `background-image`.

Suggested contract:

```ts id="026u25"
type JuryShareArtworkTreatment = {
  assetId: string;

  placement:
    | "top"
    | "top_fade"
    | "background"
    | "bottom"
    | "bottom_fade"
    | "full";

  focalX: number;
  focalY: number;

  scale: "cover" | "contain";

  opacity: number;
  blurPx: number;

  fadeDirection:
    | "none"
    | "up"
    | "down"
    | "radial";

  fadeStart?: number;
  fadeEnd?: number;

  scrimStrength: number;
};
```

### Example SSC 22 Edition composition

```text id="hbbg1n"
top
████ official artwork visible

      artwork progressively fades

──────── clean scoreboard zone ────────

12
10
08
...
01

subtle artwork/motif returns

VOTES OF:
OLAND
```

Another edition may use bottom-fading art or a full-background composition.

The renderer supports the recipe.

It does not hardcode SSC 22.

---

# 9. Edition composition model

Use a composed theme:

```ts id="jur5cz"
type JuryShareEditionTheme = {
  editionId: string;
  version: number;

  artwork: JuryShareArtworkTreatment | null;
  scoreboard: EditionScoreboardTheme;

  header: JuryShareHeaderTheme;
  background: JuryShareBackgroundTheme;
  footer: JuryShareFooterTheme;

  decorativeAssets: JuryShareDecoration[];

  safeArea: JuryShareSafeArea;
};
```

This makes Edition genuinely reusable across future editions rather than building SSC 22 and calling it a framework.

---

# 10. Liquid Glass

**Always available**, provided the rendering engine supports it.

Liquid Glass is a universal Solaris style rather than historical edition branding.

Characteristics:

- translucent/reflective score rows;
- restrained refraction;
- dark neutral substrate;
- soft adaptive highlights;
- glass score capsules;
- mild source/edition colour contamination;
- gold/cream glass 12-point emphasis;
- strong legibility.

The canonical V3 design system treats glass as an elevated material, not something to smear across every interface surface. fileciteturn3file8L2357-L2393

For the exported share graphic, Liquid Glass may be somewhat more expressive because the artifact itself is decorative.

Still avoid:

```text id="ky6ywd"
neon halo
+
rainbow refraction
+
glowing border
+
three blurs
+
animated gradient
+
the visual equivalent of being hit by a nightclub
```

---

# 11. Theme availability

```ts id="ak1is8"
type JuryShareThemeId =
  | "default"
  | "edition"
  | "liquid_glass";

type ShareThemeAvailability = {
  id: JuryShareThemeId;
  state:
    | "available"
    | "unconfigured"
    | "invalid"
    | "unsupported";
  reason?: string;
};
```

Rules:

### Default

```text id="czrt48"
Always available
```

### Edition

Available only when theme validation passes.

### Liquid Glass

Available wherever renderer support exists.

If Edition is invalid:

```text id="0ynm6n"
Default
Liquid Glass
```

remain usable.

Never allow a broken Edition theme to disable sharing altogether.

---

# 12. User-facing share sheet

Tap:

> **Share votes**

Open a mobile-first sheet.

```text id="ff36p1"
SSC 22 · Grand Final
Your jury vote

Choose design

┌────────────┐
│ Default    │
│ preview    │
└────────────┘

┌────────────┐
│ Edition    │
│ preview    │
└────────────┘

┌────────────┐
│ Liquid     │
│ Glass      │
└────────────┘

[ LARGE LIVE PREVIEW ]

Share image
Save PNG

More options
Save JPEG
Copy votes as text
```

On wider layouts the three theme previews may form a horizontal row.

---

# 13. Default selection

Initial selection:

> **Default**

Do not make Edition the implicit default.

Do not make Liquid Glass the implicit default.

The product promise is:

```text id="1kstl2"
Default = Solaris canonical
Edition = special edition interpretation
Liquid Glass = alternative Solaris interpretation
```

A future user preference may remember a previous choice, but V1 should remain predictable.

---

# 14. Preview architecture

Do not generate a full 1080×1920 server PNG every time the user taps a theme.

Use a lightweight preview renderer.

Recommended:

```text id="nskwff"
JuryShareProjection
        ↓
shared render model
      ↙   ↘
DOM preview  high-res renderer
```

The preview and final renderer consume the **same tokens and layout model** so they cannot drift wildly apart.

Final export still reloads/revalidates authoritative data.

---

# 15. Story output

Initial output target:

```ts id="eku169"
type JuryShareOutputTarget = "story";
```

Dimensions:

```text id="cw7lcx"
1080 × 1920 px
9:16
```

Do not scatter literal `1080` and `1920` across components.

Centralize:

```ts id="w04m4y"
const SHARE_TARGETS = {
  story: {
    width: 1080,
    height: 1920,
    aspectRatio: 9 / 16,
  },
};
```

This makes later additions possible without building a second render system.

Possible later targets:

```ts id="wo61h3"
"feed_portrait" // 4:5
"square"        // 1:1
```

Not required for initial implementation.

---

# 16. Story safe area

The 1080×1920 canvas should have an internal protected content area.

Do not rely on a permanent magic “Instagram reserves exactly N pixels forever” value because platform UI changes.

Create a configurable target contract:

```ts id="g8iqq5"
type JuryShareSafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
```

Critical content must stay inside:

- contest/edition identity;
- score rows;
- country names;
- points;
- `VOTES OF`;
- source country.

Decorative elements may extend outside.

This also makes the renderer adaptable if Instagram's Story interface changes later.

---

# 17. PNG and JPEG

## PNG

Primary.

```text id="7hf1rb"
image/png
1080×1920
```

Best for:

- text;
- flags;
- logos;
- crisp score rows.

## JPEG

Secondary.

```text id="g85im0"
image/jpeg
1080×1920
```

Quality:

```ts id="vqebip"
0.90–0.94
```

Use sensible compression rather than creating a 12 MB image that mostly consists of dark blue.

---

# 18. Native share behavior

For the PWA/web app:

1. generate the image;
2. create a `File`;
3. feature-detect file sharing;
4. use `navigator.share()` only when supported;
5. otherwise fall back to saving the file.

MDN explicitly recommends checking `navigator.canShare({ files })`, because file sharing is not supported consistently across browsers. The Web Share API also requires HTTPS and a user-triggered interaction. ([developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare?utm_source=chatgpt.com))

Implementation:

```ts id="brbgm2"
async function shareJuryCard(file: File) {
  if (
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: "Solaris jury votes",
    });

    return "shared";
  }

  return "download_fallback";
}
```

Do **not** label the action:

> Share directly to Instagram Story

The web platform cannot guarantee Instagram will be an available share target.

Use:

> **Share image**

The OS decides which applications appear.

---

# 19. Copy as text

Add:

> **Copy votes as text**

Example:

```text id="m33ydx"
Oland jury votes
Solaris Song Contest 22 · Grand Final

12 · Vendia
10 · Hanvør
8 · Ækâlin
7 · ...
6 · ...
5 · ...
4 · ...
3 · ...
2 · ...
1 · ...
```

Benefits:

- accessibility;
- Discord;
- chat;
- text posts;
- fallback where file sharing is awkward.

The image is an additional representation.

It must never be the only way to access the vote information.

---

# 20. Post-results discovery

This is an important improvement.

The user should not have to remember that a sharing feature exists somewhere inside Me six months later.

After result publication, when an authenticated viewer has a jury ballot:

```text id="eomni6"
Your jury votes are now public

See your full jury result and create a share card.

[ View & share ]
```

Possible surfaces:

- Results post-reveal;
- Result page personal module;
- Me/Activity;
- one non-intrusive in-app notification.

Do not spam push notifications solely for marketing-style sharing.

---

# 21. Canonical data source

Never store a second copy of “share-card jury results.”

Pipeline:

```text id="zjwujg"
canonical finalized jury ballot
+
published result version
+
historical edition identity
+
historical country identities
+
theme version
        ↓
JuryShareProjection
        ↓
render model
        ↓
image
```

The share system is a **projection**, not another source of truth.

The System V3 architecture requires one canonical state with multiple derived consumers. fileciteturn0file4L79-L93

---

# 22. Projection contract

```ts id="d6s96p"
type JuryShareProjection = {
  schemaVersion: number;

  edition: {
    id: string;
    slug: string;
    number: number | null;
    name: string;
    historicalIdentityVersion?: string;
  };

  show: {
    id: string;
    name: string;
    type:
      | "semi_final"
      | "final"
      | "other";
  };

  source: {
    delegationId: string;
    countryId: string;

    displayName: string;
    shortDisplayName?: string;

    flagAsset: PublicAssetRef;
  };

  votes: JuryShareVote[];

  result: {
    resultVersionId: string;
    publishedAt: string;
  };

  themes: ShareThemeAvailability[];

  publication: {
    shareable: boolean;
    reason?:
      | "RESULTS_NOT_PUBLISHED"
      | "JURY_BREAKDOWN_PRIVATE"
      | "BALLOT_NOT_FINAL"
      | "BALLOT_UNAVAILABLE";
  };

  stateVersion: string;
  serverTime: string;
};
```

Vote:

```ts id="w9xypc"
type JuryShareVote = {
  recipientCountryId: string;

  displayName: string;
  shortDisplayName?: string;

  flagAsset: PublicAssetRef;

  points:
    | 12
    | 10
    | 8
    | 7
    | 6
    | 5
    | 4
    | 3
    | 2
    | 1;

  rank: number;
};
```

---

# 23. Historical identity

A historical card must use the identity belonging to that edition.

For SSC 19:

```text id="hep99x"
SSC 19 flag
SSC 19 country display name
SSC 19 recipient identities
```

not current ones.

The Public V3 plan explicitly requires edition-specific names/flags while retaining canonical country lineage. fileciteturn1file4L1349-L1359

Historical correctness applies to:

- source country;
- all recipient countries;
- edition logo;
- Edition-theme artwork;
- Edition-theme typography/tokens where retained.

---

# 24. Theme versioning

Every rendered theme needs a version.

```ts id="pe8agd"
type ShareThemeVersion = {
  themeId: string;
  version: number;
};
```

Examples:

```text id="4b78sq"
default@1
edition:ssc22@3
liquid-glass@2
```

This gives deterministic cache identities and makes it possible to understand what produced an image.

---

# 25. Historical Edition themes

Edition themes should become archival assets after the edition.

```ts id="b3y1sf"
type EditionShareThemeRecord = {
  editionId: string;

  version: number;

  state:
    | "draft"    | "ready"
    | "archived"
    | "invalid";

  composition: JuryShareEditionTheme;

  activatedAt?: string;
  archivedAt?: string;

  updatedAt: string;
};
```

Historical exports should use the archived edition theme, not rebuild the old edition through today's theme configuration.

---

# 26. Default and Liquid Glass historical behavior

Different rule:

### Default

Uses the current canonical Solaris Default design.

### Liquid Glass

Uses the current canonical Liquid Glass design.

### Edition

Uses the archived historical Edition design.

This distinction is intentional:

```text id="suua13"
Default     = Solaris identity
Liquid Glass = Solaris design alternative
Edition     = edition identity
```

---

# 27. Fonts and glyph coverage

The theme validator must verify glyph support.

Solaris uses names containing characters such as:

```text id="9ozo3v"
Å
Æ
Ø
â
ä
ö
š
ž
é
č
```

and future fictional countries will undoubtedly invent something worse because apparently ASCII failed to contain our ambitions.

Validation should test all names that can appear in the target edition.

```ts id="pligw0"
validateFontCoverage({
  font,
  strings: [
    editionName,
    sourceCountry,
    ...recipientCountries,
  ],
});
```

If the primary font lacks glyphs:

```text id="dq5del"
edition font
↓
approved fallback font
```

Never produce missing-character boxes.

---

# 28. Country-name layout

Use deterministic text fitting.

Order:

1. official historical short display name if defined;
2. standard configured font size;
3. reduce font within a defined minimum;
4. slightly tighten tracking within a defined bound;
5. use allowed two-line mode if theme supports it;
6. reject the theme/render if information still does not fit safely.

Never overlap:

- score;
- flag;
- adjacent rows.

Never silently truncate to meaningless text.

---

# 29. Points formatting

Default:

```text id="zz7iit"
12
10
08
07
06
05
04
03
02
01
```

using **tabular numerals**.

The V3 typography specification already requires tabular numerals for points and rankings. fileciteturn3file8L2213-L2218

Edition mode may use an edition-defined score formatter:

```ts id="s4ab78"
scoreFormat:
  | "zero_padded"
  | "plain";
```

Liquid Glass should follow Default unless intentionally changed globally.

---

# 30. Flag treatment

Source flag files should preserve their canonical historical identity.

Default:

```text id="gk9z6i"
3:2 source
→ controlled crop/container
```

Edition:

```text id="akdyrz"
3:2 source
→ edition scoreboard frame
```

Liquid Glass:

```text id="4hokv4"
3:2 source
→ glass flag container
```

Do not distort the flag image itself to fit decorative geometry.

---

# 31. Server render request

Conceptual endpoint:

```http id="7adl32"
POST /api/v3/results/jury-share/render
```

Request:

```ts id="y9bf8u"
type JuryShareRenderRequest = {
  editionId: string;
  showId: string;
  delegationId: string;

  theme:
    | "default"
    | "edition"
    | "liquid_glass";

  outputTarget: "story";

  format:
    | "png"
    | "jpeg";
};
```

**No votes are supplied by the browser.**

No:

```json id="ofmfms"
{
  "votes": [
    { "country": "Vendia", "points": 12 }
  ]
}
```

The server loads canonical data itself.

---

# 32. Render response

```ts id="gbgx7z"
type JuryShareRenderResponse = {
  ok: true;

  renderId: string;

  resultVersionId: string;
  themeId: JuryShareThemeId;
  themeVersion: number;

  outputTarget: "story";

  width: 1080;
  height: 1920;

  format:
    | "png"
    | "jpeg";

  mimeType:
    | "image/png"
    | "image/jpeg";

  delivery:
    | {
        kind: "inline";
        url: string;
        expiresAt: string;
      }
    | {
        kind: "cached_public";
        url: string;
      };
};
```

---

# 33. Server pipeline

```text id="07p3bp"
request
↓
authenticate if required
↓
resolve viewer
↓
verify capability
↓
verify delegation/object access
↓
load edition/show
↓
load canonical jury ballot
↓
load canonical published result version
↓
verify publication policy
↓
resolve historical identities
↓
resolve requested theme
↓
validate theme
↓
build deterministic render model
↓
check render cache
↓
render if needed
↓
deliver
```

Authorization must be performed against the exact object, not merely because the user happens to have reached a Results route. System V3 requires server-side actor/capability/scope/object/state authorization for protected operations. fileciteturn0file4L1241-L1285

---

# 34. Render identity

Use a deterministic fingerprint.

```ts id="nqhlry"
type JuryShareRenderIdentity = {
  ballotId: string;

  resultVersionId: string;

  sourceIdentityVersion: string;
  recipientIdentityVersionSetHash: string;

  themeId: string;
  themeVersion: number;

  outputTarget: string;
  format: string;
};
```

Hash into:

```text id="lc1c1r"
renderKey
```

Example:

```text id="zn9hzx"
jury-share:
4e8df2...
```

This solves corrected-result caching cleanly.

Result v5 cannot accidentally retrieve a render generated from v4.

---

# 35. Render caching

## Public published country card

May use long-lived cache keyed by render identity.

```text id="bcs9vq"
published immutable inputs
↓
edge-cacheable render
```

## Personal/restricted render

Use:

```text id="63nmzk"
private cache
or
short-lived signed asset
```

Never globally edge-cache an account-restricted object.

## Historical public render

Can cache aggressively when all inputs are immutable/versioned.

---

# 36. Asset caching

Static theme assets should be cached independently:

- edition logo;
- archived artwork;
- flag;
- font subset where legally/technically appropriate;
- decorative vector assets.

Do not refetch them for every row.

Do not fetch ten identical edition assets because ten vote rows exist. Apparently this needs stating because software has demonstrated initiative in the wrong direction before.

---

# 37. Render implementation options

Preferred architecture:

### Shared layout engine

```text id="lpg5ch"
theme tokens
+
render model
↓
layout calculation
↓
DOM preview
+
server/high-res renderer
```

Possible rendering technology:

- server-side SVG → PNG/JPEG;
- HTML/CSS → headless rendering;
- Canvas-based deterministic compositor.

## Preferred for this feature

**SVG-first deterministic renderer** is particularly attractive because:

- flags and text remain sharp;
- layout is declarative;
- output scales predictably;
- PNG/JPEG conversion is straightforward;
- themes can share structural primitives.

But the implementation team should reuse existing Solaris rendering infrastructure if one already exists rather than adding another engine because someone enjoys dependencies.

---

# 38. Preview implementation

Preview should use:

```tsx id="acth9x"
<JurySharePreview
  projection={projection}
  theme={theme}
  target="story"
/>
```

with CSS dimensions maintaining 9:16.

Do not request final export until:

> Share image / Save PNG / Save JPEG

is pressed.

---

# 39. Share flow

## Share

```text id="fsh100"
Tap Share image
↓
get/create PNG
↓
construct File
↓
navigator.canShare({ files })
```

Supported:

```text id="t7kul9"
navigator.share(...)
```

Unsupported:

```text id="jhy45k"
Save/share fallback sheet
```

Because browser support for file sharing varies, feature detection is mandatory. ([developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare?utm_source=chatgpt.com))

---

# 40. Save flow

### Save PNG

Download:

```text id="4p3asp"
solaris-ssc22-final-oland-jury.png
```

### Save JPEG

```text id="9q7y61"
solaris-ssc22-final-oland-jury.jpg
```

Filename must be sanitized.

Never include:

- user IDs;
- ballot IDs;
- receipt IDs;
- auth tokens.

---

# 41. Publication changes while share sheet is open

Example:

```text id="v179w5"
user opens share sheet
result version = 4
↓
Organizer corrects result
publishes version 5
↓
user presses Share
```

The export operation must reload/revalidate current publication state.

Do not blindly export the stale preview.

If state changed:

> **Results were updated**  
> We've refreshed your jury card with the latest official result.

Update preview to v5.

---

# 42. Publication withdrawn while open

If publication is withdrawn before export:

> **Sharing is temporarily unavailable**  
> These jury results are no longer publicly available.

Do not generate the image.

---

# 43. Historical ballot missing

If history proves a jury participation exists but canonical detailed points cannot be reconstructed:

Do not invent them.

Show:

> **Detailed jury vote unavailable**  
> Solaris doesn't have enough historical data to recreate this ballot.

This is preferable to a beautiful fabricated historical record, which is a rather poor feature for an archive.

---

# 44. Organizer ownership

Create Organizer configuration under the logical **Contest / Edition visual identity** workspace.

Suggested:

```text id="sh5o7v"
Organizer
→ Control
→ Contest
→ Edition branding
→ Share graphics
```

Do not bury it under Results publication because the theme is edition branding, not official result state.

---

# 45. Organizer page

## Header

```text id="4biusc"
SSC 22
Share graphics

Configure the optional Edition design used for jury share cards.
```

## Sections

### Default

Read-only:

```text id="mtq2v0"
Default Solaris design
Always available
```

No Organizer modification.

### Edition

Editable.

### Liquid Glass

Read-only Solaris-level theme.

---

# 46. Organizer Edition editor

## Artwork

- select edition artwork;
- focal position;
- placement;
- scale;
- opacity;
- blur;
- fade direction;
- fade start;
- fade end;
- scrim strength.

## Scoreboard

- inherit edition scoreboard;
- override permitted token subset;
- 12-point treatment;
- flag frame;
- score typography.

## Header

- logo;
- alignment;
- title treatment.

## Footer

- source-country treatment;
- background treatment;
- edition motif.

## Preview

- sample vote data;
- full 9:16 preview.

---

# 47. Do not expose arbitrary CSS

Organizer controls should produce validated theme configuration.

Do not provide:

```text id="gxe03o"
Custom CSS
Custom HTML
Custom JavaScript
```

That would introduce:

- accessibility failures;
- overflow bugs;
- asset leaks;
- arbitrary styling injection;
- historical non-reproducibility.

Use structured tokens.

---

# 48. Organizer sample data

Before results:

Preview uses non-sensitive sample data.

```text id="htsipo"
Country A 12
Country B 10
Country C 08
...
```

Never require actual hidden jury votes merely to test whether the background art looks nice.

---

# 49. Theme validation

Edition theme cannot become `ready` until it passes:

### Assets

- artwork exists;
- logo exists if required;
- all assets resolve;
- no external unsafe URLs.

### Typography

- fonts resolve;
- glyph coverage passes;
- long-name samples fit.

### Layout

- all ten rows fit;
- score does not overlap text;
- footer stays inside safe zone;
- header stays inside safe zone.

### Contrast

- score rows readable;
- country names readable;
- scores readable;
- header readable;
- footer readable.

### Export

- PNG succeeds;
- JPEG succeeds.

Result:

```ts id="0x5i6n"
type EditionShareThemeValidation = {
  status:
    | "valid"
    | "invalid";

  errors: ThemeValidationIssue[];
  warnings: ThemeValidationIssue[];
};
```

---

# 50. Theme publishing

Organizer workflow:

```text id="hw0q8h"
Draft
↓
Preview
↓
Validate
↓
Ready
```

For an archived edition:

```text id="j8h09u"
Ready
↓
Archive/freeze
```

Changing a Ready theme creates:

```text id="pwzw2p"
version + 1
```

rather than mutating historical configuration invisibly.

---

# 51. Permissions

Suggested Organizer capability:

```text id="h9ddk1"
edition.share_theme.manage
```

Viewing:

```text id="04h9g0"
edition.share_theme.view
```

No result-publishing capability should automatically grant edition-branding modification unless the existing permission model intentionally combines them.

Capabilities determine access, not display-role names. The canonical V3 identity model already follows that rule. fileciteturn1file5L1505-L1549

---

# 52. Accessibility

The creation UI must meet V3 accessibility expectations.

Required:

- semantic buttons;
- theme names exposed to screen readers;
- selected state announced;
- theme choice not represented through colour alone;
- keyboard navigation;
- focus visible;
- 44×44-ish mobile interaction targets;
- reduced-motion preview;
- sufficient contrast;
- textual jury result available separately.

The exported image should have a generated textual description available in the UI.

---

# 53. Generated alternative description

Example:

```text id="5n1iac"
Oland jury vote for the Solaris Song Contest 22 Grand Final.
12 points to Vendia, 10 to Hanvør, 8 to Ækâlin, ...
```

Do not try to cram the entire alt description into embedded image metadata as the only accessibility solution.

Keep it available in the actual Results UI.

---

# 54. Error model

Use domain-level codes.

```ts id="hrrd6m"
type JuryShareErrorCode =
  | "JURY_SHARE_NOT_PUBLISHED"
  | "JURY_SHARE_NOT_AUTHORIZED"
  | "JURY_SHARE_BALLOT_NOT_FOUND"
  | "JURY_SHARE_RESULT_CHANGED"
  | "JURY_SHARE_THEME_UNAVAILABLE"
  | "JURY_SHARE_THEME_INVALID"
  | "JURY_SHARE_RENDER_FAILED"
  | "JURY_SHARE_ASSET_FAILED"
  | "JURY_SHARE_FORMAT_UNSUPPORTED";
```

Do not surface:

> `PostgrestError 42501`

to users.

---

# 55. Error UX

### Not published

> **Available after results**

### Unauthorized

> **You don't have access to this jury vote**

### Edition theme unavailable

> **Edition design isn't available**  
> Default and Liquid Glass are still available.

### Render failed

> **Couldn't create the image**  
> Your jury vote is safe. Try again.

### Connection lost

> **Couldn't create the image while offline**

---

# 56. Analytics

Recommended events:

```text id="mui7ha"
jury_share_opened
jury_share_theme_selected
jury_share_render_started
jury_share_render_succeeded
jury_share_render_failed
jury_share_native_share_opened
jury_share_saved
jury_share_text_copied
```

Useful properties:

```text id="0bwmy8"
edition_id
show_type
theme
format
historical
public_or_personal
cached
```

Avoid collecting:

- full vote contents unless genuinely necessary;
- recipient list;
- receipt IDs;
- personal account details.

---

# 57. No mutation of result state

The share system must have zero ability to:

- submit ballot;
- edit ballot;
- change result;
- correct result;
- publish result;
- alter country identity;
- change edition state.

Render endpoints should be read-oriented except for ephemeral render/cache metadata.

---

# 58. Performance

Targets:

### Opening share sheet

Should use already loaded or focused projection data where safe.

Do not reload the complete result database.

### Preview switching

Local/shared render-model update.

No network roundtrip unless theme assets aren't already loaded.

### Final render

Cache hit preferred.

Cold render should still be bounded.

### Assets

Pre-size artwork appropriately.

Do not pass a 40 MB full-resolution poster into a 1080×1920 card because technically it fits in RAM. Civilization has suffered enough.

---

# 59. Resource protection

Render endpoint should enforce:

- authenticated/user rate limits where applicable;
- bounded formats;
- bounded output sizes;
- allowed theme IDs only;
- allowed asset set only;
- no arbitrary remote image URLs;
- request deduplication;
- cache reuse;
- concurrency limits.

No user-controlled HTML/URL fetches.

---

# 60. Privacy and cache separation

## Public result card

May become a public cache object.

## Personal-only render

Must stay private.

Use:

- access-controlled object;
- signed URL;
- short expiration.

Do not infer publicness solely because:

```text id="02pggq"result published
```

The ballot itself may still have more restrictive publication policy.

---

# 61. Offline

Browsing an already cached jury result may work offline.

Image generation requires authoritative current state unless a future architecture explicitly supports deterministic trusted offline rendering.

Offline export:

> **Connect to create this image**

Do not export from stale local data if publication may have changed.

---

# 62. Result version correction behavior

Render key must include:

```text id="44cylt"
resultVersionId
```

not just:

```text id="7rozpl"
edition + delegation
```

Example:

```text id="tuhp3a"
SSC22 Final Oland v4 Default
≠
SSC22 Final Oland v5 Default
```

This is mandatory.

---

# 63. Theme version behavior

Similarly:

```text id="0tquzc"
SSC22 Final Oland result-v5 Edition-theme-v2
≠
SSC22 Final Oland result-v5 Edition-theme-v3
```

This makes caching deterministic.

---

# 64. Integration into Results

On country jury breakdown:

```text id="yxgvsy"
Oland
Jury vote

12 Vendia
10 Hanvør
...

[ Share vote ]
```

For the user's own ballot:

```text id="n1qbhg"
Your jury vote

[ Share votes ]
```

Do not bury it exclusively in an overflow menu.

Sharing is a meaningful post-result action.

---

# 65. Integration into Me

```text id="hase1c"
Me
→ Activity
→ Jury submissions
```

Example:

```text id="wfu4qx"
SSC 22
Grand Final · Jury
Submitted
[ View ]

SSC 21
Semi-final 1 · Jury
Submitted
[ View ]
```

View opens historical ballot.

Share appears if publication eligibility permits.

This uses the existing V3 concept that Me contains historical activity and receipts rather than becoming a second Task Center. fileciteturn3file7L2084-L2134

---

# 66. Integration into Archive

Archived edition:

```text id="lw54fk"
Explore
→ Editions
→ SSC 19
→ Results
→ Jury
```

Published country breakdowns may support the same share action.

Archived screens must remain historically contextual and should not expose current-edition actions. The Public plan explicitly requires that historical context lock. fileciteturn3file0L247-L270

---

# 67. Notification / attention consequence

When result publication makes a personal jury card available:

Possible in-app update:

```text id="j81kdd"
Your SSC 22 jury vote is now shareable
```

Delivery class:

```text id="6rzcub"
optional
```

Not:

```text id="sfcbrm"
required
```

No repeated reminders.

No deadline.

Do not create an unresolved participation task.

Results are an outcome, not another Journey obligation. fileciteturn3file6L1828-L1850

---

# 68. Optional future extension: transparent sticker

Not initial release.

Potential later output:

```ts id="n93wwr"
outputTarget: "story_sticker";
```

Transparent PNG containing:

```text id="mhdi07"
SOLARIS
OLAND

12 Vendia
10 Hanvør
08 ...
...
01 ...
```

Users could layer it over their own photo/background.

Do not block V1 on this.

---

# 69. Future 4:5 card

Not initial release.

Architecture should allow:

```ts id="hmxuyc"
outputTarget:
  | "story"
  | "feed_portrait";
```

Future feed target:

```text id="f1u8ih"
1080 × 1350
4:5
```

No need to implement until useful.

---

# 70. Test architecture

## Unit

Test:

- vote sorting;
- supported points;
- score formatter;
- theme resolver;
- safe-area calculations;
- long-name fitter;
- font fallback;
- render identity;
- cache key;
- historical identity resolver;
- publication eligibility.

## Contract

Test:

```text id="htl263"
same authoritative inputs
→ same render model
```

## Authorization

Test:

- public published ballot allowed where policy permits;
- hidden ballot rejected;
- unpublished result rejected;
- wrong delegation rejected;
- cross-edition identifier attack rejected;
- revoked capability rejected.

## Historical

Test historical names and flags.

## Result correction

Test:

```text id="gm5r2a"
v4 → render A
publish v5
v5 → render B
```

## Theme

Test:

- Default;
- valid Edition;
- missing Edition;
- invalid Edition;
- Liquid Glass.

---

# 71. Visual regression set

Use a surgical golden set.

### Default

- ordinary country names;
- long country;
- dark flag;
- bright flag.

### Edition

- top-fade artwork;
- full-background artwork;
- extreme artwork brightness;
- custom scoreboard.

### Liquid Glass

- light artwork contamination;
- dark background;
- complex flags.

### Typography

- `Hanvør`;
- `Ækâlin`;
- long multi-word country;
- mixed accented characters.

### Safe areas

Verify no critical content leaves target safe region.

---

# 72. Browser/mobile tests

Focused tests:

### iPhone/PWA

- open share sheet;
- switch theme;
- generate;
- Web Share supported;
- file sharing unsupported fallback;
- save PNG.

### Desktop

- generate;
- save PNG;
- JPEG;
- no native share dependency.

### Reduced motion

No unnecessary preview animation.

### Large text

Share UI remains usable.

The image itself retains controlled graphic typography because it is a designed export artifact.

---

# 73. Production test safety

All automated tests must use local/isolated Supabase.

No:

```text id="uod2ap"
browser test
→ hosted Solaris production Supabase
```

No render test should iterate through every historical delegation against production.

The project's infrastructure rules explicitly prohibit CI, Playwright and automated QA from generating production Supabase traffic. fileciteturn0file0L9-L34

---

# 74. Seed data

Local test seed should include:

```text id="3c9wcv"
1 current published edition
1 unpublished edition
1 archived edition

several jury ballots

edition theme ready
edition theme invalid
edition theme absent

historical flag change
historical country-name change

result correction v1 → v2
```

No need for all 66 delegations for ordinary feature testing.

Use bounded deterministic test data.

---

# 75. Logging/observability

Record:

```text id="kytz6g"
render_id
correlation_id
result_version_id
theme_id
theme_version
output_target
format
cache_hit
duration_ms
result
failure_code
deployment_version
```

Do not log:

- auth tokens;
- full ballot unnecessarily;
- image binary;
- private artwork URLs containing secrets.

---

# 76. Metrics

Useful operational metrics:

```text id="gg37d1"
render success rate
p50/p95 render duration
cache hit rate
asset failure rate
theme validation failures
native share availability by platform
```

This makes failures diagnosable instead of requiring the ancient engineering ritual of staring at console logs until enlightenment arrives.

---

# 77. Implementation ownership under current five-session V3 model

The project currently separates System, Public, Organizer, Navigation and QA ownership, and gives System the default ownership of Supabase migrations. fileciteturn0file7L72-L100

### Session 1 — System

Own:

- schema if required;
- RPC/server contract;
- publication authorization;
- historical identity contract;
- render metadata/cache tables if required;
- RLS;
- capability enforcement.

### Session 2 — Public

Own:

- Results share entry point;
- Me/History entry point;
- share sheet;
- theme chooser;
- preview;
- native sharing;
- text copy;
- Public capability registry.

### Session 3 — Organizer

Own:

- Edition theme configuration UI;
- artwork composition editor;
- preview;
- validation UI;
- branding integration.

### Session 4 — Navigation

No new primary navigation.

Only assist if the share sheet or mobile safe-area behavior requires shared-shell changes.

### Session 5 — QA

Own:

- cross-side integration;
- authorization regression;
- browser matrix;
- generated capability evidence;
- production-isolation verification;
- release certification.

---

# 78. Schema proposal

Only add schema if equivalent infrastructure does not already exist.

Possible tables:

```sql id="hfeeej"
edition_jury_share_themes
jury_share_render_cache
```

Do **not** create a duplicate jury vote table.

## `edition_jury_share_themes`

Conceptual fields:

```text id="a5djyd"
id
edition_id
version
state
composition_json
created_at
updated_at
created_by
archived_at
```

Constraints:

```text id="7j0vwm"
edition_id FK
version >= 1
controlled state
unique edition_id + version
```

Potential partial uniqueness:

```text id="m723ef"
one active Ready theme per edition
```

Exact migration form belongs to System after checking existing schema.

---

# 79. Render cache schema

If persistent metadata is useful:

```text id="2wk3gi"
id
render_key
visibility
result_version_id
theme_id
theme_version
output_target
format
storage_path
created_at
expires_at
```

Unique:

```text id="01r2ep"
render_key
```

Do not store image binary in Postgres.

---

# 80. RLS/security

Theme config:

```text id="gsgs76"
public read only when necessary
Organizer write with capability
```

Render cache:

- private assets not public;
- public render metadata safely readable where required;
- service-level rendering writes server-side.

Critical server keys never enter browser runtime.

---

# 81. Rollout strategy

### Stage 1

Behind feature flag:

```text id="q1js1m"
jury_share_cards_v1
```

### Stage 2

Enable for one test/staging edition with local/isolated test data.

### Stage 3

Enable Default for published historical/current results.

### Stage 4

Enable Edition where configuration passes validation.

### Stage 5

Enable Liquid Glass.

### Stage 6

Enable public country-jury sharing if publication policy permits.

Do not delay Default because one historical Edition theme is incomplete.

---

# 82. Migration of old editions

Historical editions fall into:

### A. Full historical identity + ballot + artwork

Supports:

```text id="3fv0km"
Default
Edition
Liquid Glass
```

### B. Ballot + historical identity, no Edition theme

Supports:

```text id="45yrd2"
Default
Liquid Glass
```

### C. Partial historical ballot

No share graphic if points cannot be reconstructed safely.

### D. No historical ballot

Feature unavailable.

No invented reconstruction.

---

# 83. Acceptance criteria

The feature is **not complete** until all of these are true.

### Data

- [ ] jury share derives from canonical ballot/result;
- [ ] no duplicate share-vote truth;
- [ ] historical identity is correct;
- [ ] corrected result creates a new render identity.

### Security

- [ ] unpublished vote cannot render;
- [ ] direct endpoint bypass cannot leak;
- [ ] object-level authorization tested;
- [ ] private cards not publicly cached.

### Default

- [ ] always available for an eligible share;
- [ ] permanent Solaris design;
- [ ] does not inherit Edition artwork/theme;
- [ ] 12-point row clearly emphasized.

### Edition

- [ ] uses edition branding;
- [ ] can inherit scoreboard visual language;
- [ ] supports artwork fade/composition;
- [ ] has theme versioning;
- [ ] historical Edition render is reproducible;
- [ ] invalid theme safely falls back.

### Liquid Glass

- [ ] universal optional theme;
- [ ] same information hierarchy;
- [ ] readable;
- [ ] restrained V3 material treatment.

### Sharing

- [ ] 1080×1920 Story output;
- [ ] PNG;
- [ ] JPEG;
- [ ] safe area;
- [ ] native file sharing when supported;
- [ ] save fallback when unsupported;
- [ ] Copy votes as text.

### UX

- [ ] current edition;
- [ ] Me/History;
- [ ] archived edition;
- [ ] post-results discovery;
- [ ] clear locked state before publication.

### Accessibility

- [ ] semantic controls;
- [ ] screen-reader theme selection;
- [ ] keyboard support;
- [ ] reduced motion;
- [ ] text alternative;
- [ ] contrast validation.

### QA

- [ ] unit tests;
- [ ] authorization tests;
- [ ] historical tests;
- [ ] correction tests;
- [ ] visual golden tests;
- [ ] PWA share tests;
- [ ] no production Supabase traffic.

---

# 84. Implementation sequence

## JSC-0 — Registry and ownership

Add capability and domain ownership.

No UI yet.

---

## JSC-1 — Read projection

Implement:

```ts id="6qpl5n"
getJuryShareProjection(...)
```

Including:

- canonical ballot;
- publication status;
- historical identity;
- themes;
- result version.

---

## JSC-2 — Eligibility and authorization

Implement server-side:

```ts id="lcztwy"
resolveJuryShareEligibility(...)
```

Test unpublished and unauthorized paths first.

---

## JSC-3 — Default render model

Implement:

```ts id="a2ry6w"
buildDefaultJuryShareModel(...)
```

Then high-resolution Default renderer.

This establishes the fallback.

---

## JSC-4 — Render endpoint and caching

Implement:

- render identity;
- PNG;
- JPEG;
- storage/delivery;
- cache;
- rate/resource limits.

---

## JSC-5 — Public UI

Implement:

- Share votes button;
- share sheet;
- theme selector;
- preview;
- save;
- native share;
- text copy.

---

## JSC-6 — Historical access

Connect:

```text id="uw7onm"
Me → Activity/History
Archive → Results → Jury
```

Add historical identity tests.

---

## JSC-7 — Edition theme backend

Implement:

- theme model;
- versioning;
- validation;
- archived theme behavior.

---

## JSC-8 — Organizer Edition editor

Implement:

- artwork composition;
- scoreboard inheritance;
- preview;
- validation;
- Ready state.

---

## JSC-9 — Liquid Glass

Implement and test the third theme.

---

## JSC-10 — Post-results discovery

Add optional result/publication consequence:

```text id="k81x5e"
Your jury votes are now shareable
```

No required task.

---

## JSC-11 — Public country vote sharing

Enable where publication rules allow.

Reuse same renderer.

---

## JSC-12 — Certification

Run:

- focused integration;
- security;
- historical;
- visual;
- mobile/PWA;
- production-isolation;
- exact final-SHA verification.

---

# 85. Definition of done

A release-ready implementation should allow this exact experience:

```text id="beao9w"
SSC 22 · GRAND FINAL

YOUR JURY VOTE

12  Vendia
10  Hanvør
08  Ækâlin
07  ...
...
01  ...

[ Share votes ]
```

Tap:

```text id="aam4x0"
Choose design

● Default
○ Edition
○ Liquid Glass

[ preview ]

Share image
Save PNG
More options
```

Edition:

```text id="j7zeck"
edition scoreboard styling
+
edition typography
+
official artwork fading into the background
+
same canonical vote
```

Before publication:

```text id="1p1qod"
🔒 Share after results
```

Historical SSC 19:

```text id="77hm9n"
historical ballot
+
historical country identities
+
Default / archived Edition / Liquid Glass
```

And the person using Solaris experiences roughly six seconds of interaction rather than being introduced to the rendering pipeline, result versioning, publication policy, theme archival system, object authorization and browser capability detection hiding underneath it.

**That is the implementation-ready version I would use for Solaris V3.**