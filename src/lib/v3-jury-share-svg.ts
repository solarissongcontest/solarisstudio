import {
  buildDefaultJuryShareModel,
  DEFAULT_JURY_SHARE_THEME_VERSION,
  JURY_SHARE_TARGETS,
  type JuryShareProjection,
  type JuryShareThemeId,
} from "./v3-jury-share-card-foundation";

/**
 * A pure, deterministic SVG compositor. It never fetches an asset or checks access.
 * The caller must obtain a server-authorized JuryShareProjection and resolve flag
 * bytes through a trusted asset loader before calling it.
 *
 * The export endpoint must recheck publication and authorization immediately
 * before rendering. A browser preview is not evidence of permission to export.
 */
export type JuryShareRasterAssets = Readonly<Record<string, string>>;

export type EditionJuryShareVisuals = {
  editionId: string;
  version: number;
  colors: {
    background: string;
    row: string;
    rowText: string;
    twelveRow: string;
    twelveText: string;
    accent: string;
  };
  artworkAssetId?: string;
  artworkOpacity?: number;
};

export type JuryShareSvgOptions = {
  theme?: JuryShareThemeId;
  assets: JuryShareRasterAssets;
  editionTheme?: EditionJuryShareVisuals;
};

export class JuryShareSvgError extends Error {
  constructor(
    public readonly code:
      | "ASSET_UNAVAILABLE"
      | "UNSAFE_ASSET"
      | "THEME_UNAVAILABLE"
      | "INVALID_THEME"
      | "TEXT_OVERFLOW",
    message: string,
  ) {
    super(message);
    this.name = "JuryShareSvgError";
  }
}

const RASTER_DATA_URI = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_ASSET_URI_LENGTH = 1_500_000;

function rasterAsset(id: string, assets: JuryShareRasterAssets): string {
  const value = Object.hasOwn(assets, id) ? assets[id] : undefined;
  if (!value) {
    throw new JuryShareSvgError("ASSET_UNAVAILABLE", "Missing raster asset: " + id);
  }
  if (value.length > MAX_ASSET_URI_LENGTH || !RASTER_DATA_URI.test(value)) {
    throw new JuryShareSvgError("UNSAFE_ASSET", "Expected a bounded, inlined raster asset: " + id);
  }
  return value;
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function color(value: string): string {
  if (!HEX_COLOR.test(value)) {
    throw new JuryShareSvgError("INVALID_THEME", "Edition theme contains an invalid color");
  }
  return value;
}

// Conservative deterministic fallback. The high-resolution exporter must
// additionally validate glyph coverage using its actual installed fonts.
function fitFontSize(label: string, width: number, desired: number, minimum: number): number {
  const units = [...label].reduce((total, char) => {
    if (/[\u0300-\u036f]/u.test(char)) return total;
    if (/[ilI1.,'’ ]/u.test(char)) return total + 0.3;
    if (/[MW@]/u.test(char)) return total + 0.9;
    return total + 0.62;
  }, 0);
  const size = Math.min(desired, Math.floor(width / Math.max(units, 0.5)));
  if (!label.trim() || size < minimum) {
    throw new JuryShareSvgError("TEXT_OVERFLOW", "Country or contest label cannot fit safely");
  }
  return size;
}

function editionColors(
  projection: JuryShareProjection,
  theme: EditionJuryShareVisuals | undefined,
): EditionJuryShareVisuals {
  if (!theme) {
    throw new JuryShareSvgError("THEME_UNAVAILABLE", "Edition share design is not configured");
  }
  if (theme.editionId !== projection.edition.id ||
      !Number.isSafeInteger(theme.version) || theme.version < 1 ||
      (theme.artworkOpacity !== undefined &&
        (!Number.isFinite(theme.artworkOpacity) ||
          theme.artworkOpacity < 0 || theme.artworkOpacity > 0.65))) {
    throw new JuryShareSvgError("INVALID_THEME", "Edition design does not match its historical edition");
  }
  // JSON and archived themes may omit required palette keys despite their TypeScript shape.
  // Validate each required token before it can become a serialized SVG attribute.
  for (const key of ["background", "row", "rowText", "twelveRow", "twelveText", "accent"] as const) {
    const value = theme.colors?.[key];
    if (typeof value !== "string") {
      throw new JuryShareSvgError("INVALID_THEME", "Edition theme is missing required color: " + key);
    }
    color(value);
  }
  return theme;
}

function flagMarkup(x: number, y: number, width: number, height: number, href: string): string {
  // Explicit image dimensions are 3:2; cover crop without stretching the flag.
  return '<svg x="' + x + '" y="' + y + '" width="' + width + '" height="' + height +
    '" viewBox="0 0 3 2" overflow="hidden"><image href="' + xml(href) +
    '" width="3" height="2" preserveAspectRatio="xMidYMid slice"/></svg>';
}

export function buildJuryShareAltDescription(projection: JuryShareProjection): string {
  const model = buildDefaultJuryShareModel(projection);
  return model.footerCountry + " jury vote for " + model.editionLabel +
    ", " + model.showLabel + ". " +
    model.rows.map((row) => row.points + " points to " + row.country).join(", ") + ".";
}

export function renderJuryShareSvg(
  projection: JuryShareProjection,
  options: JuryShareSvgOptions,
): string {
  // The foundation rejects unpublished, non-final or unavailable ballots.
  const model = buildDefaultJuryShareModel(projection);
  const themeId = options.theme ?? "default";
  const edition = themeId === "edition"
    ? editionColors(projection, options.editionTheme)
    : null;
  if (themeId !== "default" && themeId !== "edition" && themeId !== "liquid_glass") {
    throw new JuryShareSvgError("THEME_UNAVAILABLE", "Unsupported jury share design");
  }

  const defaultDesign = model.design;
  const palette = edition
    ? edition.colors
    : themeId === "liquid_glass"
      ? {
          background: "#08182D", row: "#294A72", rowText: "#FFFFFF",
          twelveRow: "#E9D6A7", twelveText: "#13213B", accent: "#9CBDE5",
        }
      : {
          background: defaultDesign.background,
          row: defaultDesign.standardRow,
          rowText: defaultDesign.standardRowForeground,
          twelveRow: defaultDesign.twelvePointRow,
          twelveText: defaultDesign.twelvePointForeground,
          accent: defaultDesign.secondaryForeground,
        };
  const { width, height, safeArea } = JURY_SHARE_TARGETS.story;
  const left = safeArea.left;
  const rowWidth = width - safeArea.left - safeArea.right;
  const rowY = 414;
  const rowHeight = 92;
  const rowStep = 102;
  const glass = themeId === "liquid_glass";
  const fontFamily = "Arial, Noto Sans, sans-serif";
  const result: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
      '" height="' + height + '" viewBox="0 0 ' + width + " " + height +
      '" role="img" aria-labelledby="jury-share-title jury-share-desc">',
    '<title id="jury-share-title">Solaris jury votes</title>',
    '<desc id="jury-share-desc">' + xml(buildJuryShareAltDescription(projection)) + "</desc>",
    "<defs>",
    '<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">' +
      '<stop stop-color="' + palette.background + '"/>' +
      '<stop offset="1" stop-color="#12294D"/></linearGradient>',
    '<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">' +
      '<stop stop-color="#C7E4FF" stop-opacity=".37"/>' +
      '<stop offset=".45" stop-color="#A2C6E8" stop-opacity=".12"/>' +
      '<stop offset="1" stop-color="#FFFFFF" stop-opacity=".06"/></linearGradient>',
    '<linearGradient id="art-fade" x1="0" y1="0" x2="0" y2="1">' +
      '<stop stop-color="#FFFFFF" stop-opacity="1"/>' +
      '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>',
    '<mask id="art-mask"><rect width="' + width + '" height="650" fill="url(#art-fade)"/></mask>',
    "</defs>",
    '<rect width="' + width + '" height="' + height +
      '" fill="' + (edition ? palette.background : "url(#background)") + '"/>',
    '<circle cx="120" cy="143" r="2" fill="#B0CCE9" opacity=".45"/>',
    '<circle cx="959" cy="290" r="3" fill="#B0CCE9" opacity=".28"/>',
    '<circle cx="874" cy="1710" r="2" fill="#B0CCE9" opacity=".38"/>',
  ];

  if (edition?.artworkAssetId) {
    const art = rasterAsset(edition.artworkAssetId, options.assets);
    result.push('<image href="' + xml(art) +
      '" width="' + width + '" height="650" preserveAspectRatio="xMidYMid slice" mask="url(#art-mask)" opacity="' +
      (edition.artworkOpacity ?? 0.35) + '"/>');
  }

  const editionSize = fitFontSize(model.editionLabel, rowWidth, 48, 27);
  const showSize = fitFontSize(model.showLabel, rowWidth, 34, 23);
  result.push(
    '<text x="' + left + '" y="222" fill="' + palette.accent +
      '" font-family="' + fontFamily +
      '" font-size="25" font-weight="800" letter-spacing="9">SOLARIS</text>',
    '<text x="' + left + '" y="297" fill="#FFFFFF" font-family="' +
      fontFamily + '" font-size="' + editionSize + '" font-weight="800">' +
      xml(model.editionLabel) + "</text>",
    '<text x="' + left + '" y="348" fill="' + palette.accent +
      '" font-family="' + fontFamily + '" font-size="' + showSize + '">' +
      xml(model.showLabel) + "</text>",
  );

  model.rows.forEach((row, index) => {
    const y = rowY + rowStep * index;
    const fill = row.emphasized ? palette.twelveRow : palette.row;
    const foreground = row.emphasized ? palette.twelveText : palette.rowText;
    const href = rasterAsset(row.flagAsset.id, options.assets);
    const nameFont = fitFontSize(row.country, 598, 42, 24);
    result.push(
      '<g data-jury-row="' + row.points + '">',
      '<rect x="' + left + '" y="' + y + '" width="' + rowWidth +
        '" height="' + rowHeight + '" rx="' + model.design.rowRadius + '" fill="' + fill + '"/>',
    );
    if (glass && !row.emphasized) {
      result.push('<rect x="' + left + '" y="' + y + '" width="' + rowWidth +
        '" height="' + rowHeight +
        '" rx="' + model.design.rowRadius + '" fill="url(#glass)" stroke="#E4F5FF" stroke-opacity=".24"/>');
    }
    result.push(
      '<rect x="95" y="' + (y + 15) + '" width="98" height="62" rx="8" fill="' +
        (row.emphasized ? "#CFB579" : "#183455") + '"/>',
      flagMarkup(99, y + 17, 90, 60, href),
      '<text x="221" y="' + (y + 61) + '" fill="' + foreground +
        '" font-family="' + fontFamily + '" font-size="' + nameFont +
        '" font-weight="700">' + xml(row.country) + "</text>",
      '<text x="967" y="' + (y + 62) + '" text-anchor="end" fill="' +
        foreground + '" font-family="' + fontFamily +
        '" font-size="51" font-weight="800" font-variant-numeric="tabular-nums">' +
        row.pointsLabel + "</text>",
      "</g>",
    );
  });

  const footerFlag = rasterAsset(projection.source.flagAsset.id, options.assets);
  const sourceSize = fitFontSize(model.footerCountry, rowWidth - 157, 53, 28);
  result.push(
    '<path d="M72 1512H1008" stroke="' + palette.accent + '" stroke-opacity=".34"/>',
    '<text x="72" y="1556" fill="' + palette.accent + '" font-family="' +
      fontFamily + '" font-size="25" font-weight="800" letter-spacing="4">VOTES OF:</text>',
    flagMarkup(72, 1590, 114, 76, footerFlag),
    '<text x="218" y="1644" fill="#FFFFFF" font-family="' + fontFamily +
      '" font-size="' + sourceSize + '" font-weight="900">' +
      xml(model.footerCountry) + "</text>",
    "</svg>",
  );
  return result.join("\n");
}

export function juryShareThemeVersion(
  theme: JuryShareThemeId,
  editionTheme?: EditionJuryShareVisuals,
): number {
  if (theme === "edition") {
    if (!editionTheme || !Number.isSafeInteger(editionTheme.version) || editionTheme.version < 1) {
      throw new JuryShareSvgError("THEME_UNAVAILABLE", "Edition theme version is missing");
    }
    return editionTheme.version;
  }
  if (theme === "default") return DEFAULT_JURY_SHARE_THEME_VERSION;
  if (theme === "liquid_glass") return 1;
  throw new JuryShareSvgError("THEME_UNAVAILABLE", "Unsupported jury share design");
}
