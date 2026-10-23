export type JuryShareThemeLifecycleState = "draft" | "ready" | "archived";

export type JuryShareArtworkPlacement =
  | "top"
  | "top_fade"
  | "background"
  | "bottom"
  | "bottom_fade"
  | "full";

export type JuryShareArtworkScale = "cover" | "contain";
export type JuryShareFadeDirection = "none" | "up" | "down" | "radial";
export type JuryShareHeaderAlignment = "left" | "center" | "right";
export type JuryShareScoreFormat = "zero_padded" | "plain";
export type JuryShareTopScoreTreatment = "solaris_gold" | "edition" | "neutral";
export type JuryShareFlagFrame = "edition" | "soft" | "none";
export type JuryShareScoreTypography = "edition" | "solaris" | "compact";
export type JuryShareTitleTreatment = "edition" | "solaris" | "compact";
export type JuryShareSourceCountryTreatment = "edition" | "solaris" | "large";
export type JuryShareFooterBackground = "clear" | "panel" | "fade";
export type JuryShareMotifTreatment = "edition" | "none";

export type JuryShareArtworkTheme = {
  enabled: boolean;
  assetId: string | null;
  placement: JuryShareArtworkPlacement;
  focalX: number;
  focalY: number;
  scale: JuryShareArtworkScale;
  opacity: number;
  blurPx: number;
  fadeDirection: JuryShareFadeDirection;
  fadeStart: number;
  fadeEnd: number;
  scrimStrength: number;
};

export type JuryShareScoreboardTheme = {
  inheritEditionScoreboard: boolean;
  topScoreTreatment: JuryShareTopScoreTreatment;
  flagFrame: JuryShareFlagFrame;
  scoreTypography: JuryShareScoreTypography;
  scoreFormat: JuryShareScoreFormat;
};

export type JuryShareHeaderTheme = {
  useEditionLogo: boolean;
  alignment: JuryShareHeaderAlignment;
  titleTreatment: JuryShareTitleTreatment;
};

export type JuryShareFooterTheme = {
  sourceCountryTreatment: JuryShareSourceCountryTreatment;
  backgroundTreatment: JuryShareFooterBackground;
  motifTreatment: JuryShareMotifTreatment;
};

export type JuryShareSafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type JuryShareEditionTheme = {
  editionId: string;
  version: number;
  state: JuryShareThemeLifecycleState;
  artwork: JuryShareArtworkTheme;
  scoreboard: JuryShareScoreboardTheme;
  header: JuryShareHeaderTheme;
  footer: JuryShareFooterTheme;
  safeArea: JuryShareSafeArea;
};

export type JuryShareSampleVote = {
  country: string;
  points: 12 | 10 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1;
};

export type JuryShareValidationEvidence = {
  artworkResolves: boolean;
  logoResolves: boolean;
  fontsResolve: boolean;
  glyphCoverage: boolean;
  longNamesFit: boolean;
  allRowsFit: boolean;
  scoreDoesNotOverlap: boolean;
  footerInsideSafeArea: boolean;
  headerInsideSafeArea: boolean;
  rowsHaveSufficientContrast: boolean;
  countryNamesHaveSufficientContrast: boolean;
  scoresHaveSufficientContrast: boolean;
  headerHasSufficientContrast: boolean;
  footerHasSufficientContrast: boolean;
  pngExportSucceeds: boolean;
  jpegExportSucceeds: boolean;
};

export type JuryShareValidationIssue = {
  code: string;
  severity: "error" | "warning";
  section: "identity" | "artwork" | "scoreboard" | "header" | "footer" | "layout" | "export";
  message: string;
};

export type EditionShareThemeValidation = {
  status: "valid" | "invalid";
  errors: JuryShareValidationIssue[];
  warnings: JuryShareValidationIssue[];
};

export const JURY_SHARE_STORY_SIZE = {
  width: 1080,
  height: 1920,
  aspectRatio: 9 / 16,
} as const;

export const JURY_SHARE_SAMPLE_VOTES: readonly JuryShareSampleVote[] = [
  { country: "Country A", points: 12 },
  { country: "Country B", points: 10 },
  { country: "Country C", points: 8 },
  { country: "Country D", points: 7 },
  { country: "Country E", points: 6 },
  { country: "Country F", points: 5 },
  { country: "Country G", points: 4 },
  { country: "Country H", points: 3 },
  { country: "Country I", points: 2 },
  { country: "Country J", points: 1 },
] as const;

export const DEFAULT_JURY_SHARE_SAFE_AREA: JuryShareSafeArea = {
  top: 108,
  right: 72,
  bottom: 132,
  left: 72,
};

export function createDefaultJuryShareEditionTheme(
  editionId: string,
  artworkAssetId: string | null = null,
): JuryShareEditionTheme {
  return {
    editionId,
    version: 1,
    state: "draft",
    artwork: {
      enabled: artworkAssetId != null,
      assetId: artworkAssetId,
      placement: "top_fade",
      focalX: 0.5,
      focalY: 0.5,
      scale: "cover",
      opacity: 0.82,
      blurPx: 0,
      fadeDirection: "down",
      fadeStart: 0.2,
      fadeEnd: 0.58,
      scrimStrength: 0.42,
    },
    scoreboard: {
      inheritEditionScoreboard: true,
      topScoreTreatment: "edition",
      flagFrame: "edition",
      scoreTypography: "edition",
      scoreFormat: "zero_padded",
    },
    header: {
      useEditionLogo: true,
      alignment: "center",
      titleTreatment: "edition",
    },
    footer: {
      sourceCountryTreatment: "edition",
      backgroundTreatment: "fade",
      motifTreatment: "edition",
    },
    safeArea: { ...DEFAULT_JURY_SHARE_SAFE_AREA },
  };
}

export function cloneJuryShareEditionTheme(theme: JuryShareEditionTheme): JuryShareEditionTheme {
  return {
    ...theme,
    artwork: { ...theme.artwork },
    scoreboard: { ...theme.scoreboard },
    header: { ...theme.header },
    footer: { ...theme.footer },
    safeArea: { ...theme.safeArea },
  };
}

export function formatJuryShareScore(
  points: JuryShareSampleVote["points"],
  format: JuryShareScoreFormat,
) {
  if (format === "plain") return String(points);
  return String(points).padStart(2, "0");
}

function issue(
  code: string,
  section: JuryShareValidationIssue["section"],
  message: string,
  severity: JuryShareValidationIssue["severity"] = "error",
): JuryShareValidationIssue {
  return { code, section, message, severity };
}

function inUnitRange(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function positiveFinite(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function validateJuryShareThemeStructure(
  theme: JuryShareEditionTheme,
): EditionShareThemeValidation {
  const errors: JuryShareValidationIssue[] = [];
  const warnings: JuryShareValidationIssue[] = [];

  if (!theme.editionId.trim()) {
    errors.push(issue("EDITION_REQUIRED", "identity", "The Edition theme must be bound to one exact edition."));
  }
  if (!Number.isInteger(theme.version) || theme.version < 1) {
    errors.push(issue("VERSION_INVALID", "identity", "Theme version must be a positive integer."));
  }

  if (theme.artwork.enabled && !theme.artwork.assetId?.trim()) {
    errors.push(issue("ARTWORK_REQUIRED", "artwork", "Artwork is enabled but no edition artwork asset is selected."));
  }
  if (!inUnitRange(theme.artwork.focalX) || !inUnitRange(theme.artwork.focalY)) {
    errors.push(issue("FOCAL_POINT_INVALID", "artwork", "Artwork focal position must stay inside the image bounds."));
  }
  if (!inUnitRange(theme.artwork.opacity)) {
    errors.push(issue("ARTWORK_OPACITY_INVALID", "artwork", "Artwork opacity must be between 0 and 1."));
  }
  if (!positiveFinite(theme.artwork.blurPx) || theme.artwork.blurPx > 48) {
    errors.push(issue("ARTWORK_BLUR_INVALID", "artwork", "Artwork blur must be between 0 and 48 pixels."));
  }
  if (!inUnitRange(theme.artwork.fadeStart) || !inUnitRange(theme.artwork.fadeEnd)) {
    errors.push(issue("ARTWORK_FADE_INVALID", "artwork", "Artwork fade positions must be between 0 and 1."));
  } else if (theme.artwork.fadeStart > theme.artwork.fadeEnd) {
    errors.push(issue("ARTWORK_FADE_ORDER", "artwork", "Artwork fade must start before it ends."));
  }
  if (!inUnitRange(theme.artwork.scrimStrength)) {
    errors.push(issue("ARTWORK_SCRIM_INVALID", "artwork", "Artwork scrim strength must be between 0 and 1."));
  }

  const { safeArea } = theme;
  for (const [edge, value] of Object.entries(safeArea)) {
    if (!positiveFinite(value)) {
      errors.push(issue("SAFE_AREA_INVALID", "layout", `${edge} safe-area inset must be zero or greater.`));
    }
  }
  if (safeArea.left + safeArea.right >= JURY_SHARE_STORY_SIZE.width) {
    errors.push(issue("SAFE_AREA_WIDTH_INVALID", "layout", "Horizontal safe-area insets leave no usable Story width."));
  }
  if (safeArea.top + safeArea.bottom >= JURY_SHARE_STORY_SIZE.height) {
    errors.push(issue("SAFE_AREA_HEIGHT_INVALID", "layout", "Vertical safe-area insets leave no usable Story height."));
  }

  if (!theme.scoreboard.inheritEditionScoreboard) {
    warnings.push(
      issue(
        "SCOREBOARD_OVERRIDE_ACTIVE",
        "scoreboard",
        "This design overrides part of the Edition scoreboard treatment. Keep overrides deliberate and bounded.",
        "warning",
      ),
    );
  }

  return {
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
    warnings,
  };
}

const EVIDENCE_MESSAGES: ReadonlyArray<{
  key: keyof JuryShareValidationEvidence;
  section: JuryShareValidationIssue["section"];
  code: string;
  message: string;
}> = [
  { key: "artworkResolves", section: "artwork", code: "ARTWORK_UNRESOLVED", message: "Selected artwork must resolve." },
  { key: "logoResolves", section: "header", code: "LOGO_UNRESOLVED", message: "The required Edition logo must resolve." },
  { key: "fontsResolve", section: "header", code: "FONT_UNRESOLVED", message: "Configured fonts must resolve." },
  { key: "glyphCoverage", section: "header", code: "GLYPH_COVERAGE", message: "Typography must cover the required glyph set." },
  { key: "longNamesFit", section: "layout", code: "LONG_NAME_OVERFLOW", message: "Long country-name samples must fit." },
  { key: "allRowsFit", section: "layout", code: "ROW_OVERFLOW", message: "All ten score rows must fit inside the Story layout." },
  { key: "scoreDoesNotOverlap", section: "layout", code: "SCORE_OVERLAP", message: "Scores must not overlap country text." },
  { key: "footerInsideSafeArea", section: "footer", code: "FOOTER_SAFE_AREA", message: "The footer must remain inside the protected Story safe area." },
  { key: "headerInsideSafeArea", section: "header", code: "HEADER_SAFE_AREA", message: "The header must remain inside the protected Story safe area." },
  { key: "rowsHaveSufficientContrast", section: "scoreboard", code: "ROW_CONTRAST", message: "Score rows must meet the required contrast." },
  { key: "countryNamesHaveSufficientContrast", section: "scoreboard", code: "COUNTRY_CONTRAST", message: "Country names must meet the required contrast." },
  { key: "scoresHaveSufficientContrast", section: "scoreboard", code: "SCORE_CONTRAST", message: "Scores must meet the required contrast." },
  { key: "headerHasSufficientContrast", section: "header", code: "HEADER_CONTRAST", message: "Header content must meet the required contrast." },
  { key: "footerHasSufficientContrast", section: "footer", code: "FOOTER_CONTRAST", message: "Footer content must meet the required contrast." },
  { key: "pngExportSucceeds", section: "export", code: "PNG_EXPORT_FAILED", message: "PNG export must succeed before the Edition design can become Ready." },
  { key: "jpegExportSucceeds", section: "export", code: "JPEG_EXPORT_FAILED", message: "JPEG export must succeed before the Edition design can become Ready." },
];

export function validateJuryShareThemeForReady(
  theme: JuryShareEditionTheme,
  evidence: Partial<JuryShareValidationEvidence>,
): EditionShareThemeValidation {
  const structural = validateJuryShareThemeStructure(theme);
  const errors = [...structural.errors];
  const warnings = [...structural.warnings];

  for (const requirement of EVIDENCE_MESSAGES) {
    if (requirement.key === "artworkResolves" && !theme.artwork.enabled) continue;
    if (requirement.key === "logoResolves" && !theme.header.useEditionLogo) continue;

    const result = evidence[requirement.key];
    if (result === false) {
      errors.push(issue(requirement.code, requirement.section, requirement.message));
    } else if (result == null) {
      errors.push(
        issue(
          `${requirement.code}_NOT_VERIFIED`,
          requirement.section,
          `${requirement.message} This check has not been verified yet.`,
        ),
      );
    }
  }

  return {
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
    warnings,
  };
}

export function nextJuryShareThemeVersion(theme: JuryShareEditionTheme): JuryShareEditionTheme {
  return {
    ...cloneJuryShareEditionTheme(theme),
    version: theme.version + 1,
    state: "draft",
  };
}

export function canTransitionJuryShareTheme(
  from: JuryShareThemeLifecycleState,
  to: JuryShareThemeLifecycleState,
) {
  if (from === to) return true;
  if (from === "draft" && to === "ready") return true;
  if (from === "ready" && to === "archived") return true;
  return false;
}
