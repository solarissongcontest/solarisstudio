import { JURY_SHARE_POINTS, JURY_SHARE_TARGETS } from "./v3-jury-share-card-foundation";

export const ORGANIZER_JURY_SHARE_VIEW_CAPABILITY = "edition.share_theme.view" as const;
export const ORGANIZER_JURY_SHARE_MANAGE_CAPABILITY = "edition.share_theme.manage" as const;

export type OrganizerJuryShareThemeState =
  | "unconfigured"
  | "draft"
  | "ready"
  | "archived"
  | "invalid";

export type JuryShareArtworkPlacement =
  | "top"
  | "top_fade"
  | "background"
  | "bottom"
  | "bottom_fade"
  | "full";

export type JuryShareFadeDirection = "none" | "up" | "down" | "radial";

export type OrganizerJuryShareComposition = {
  artwork: null | {
    assetId: string;
    placement: JuryShareArtworkPlacement;
    focalX: number;
    focalY: number;
    scale: "cover" | "contain";
    opacity: number;
    blurPx: number;
    fadeDirection: JuryShareFadeDirection;
    fadeStart: number;
    fadeEnd: number;
    scrimStrength: number;
  };
  scoreboard: {
    inheritEditionScoreboard: boolean;
    rowRadius: number;
    rowHeight: number;
    emphasizeTwelvePoints: boolean;
    flagTreatment: "plain" | "framed";
    scoreTreatment: "plain" | "capsule";
  };
  header: {
    showSolarisMark: boolean;
    showEditionLabel: boolean;
    showShowLabel: boolean;
    alignment: "left" | "center";
  };
  background: {
    treatment: "edition" | "dark" | "artwork";
    strength: number;
  };
  footer: {
    showVotesOfLabel: boolean;
    showSourceFlag: boolean;
    alignment: "left" | "center";
  };
  decorativeAssets: readonly string[];
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type OrganizerJuryShareValidationIssue = {
  code: string;
  message: string;
  path?: string;
};

export type OrganizerJuryShareValidation = {
  valid: boolean;
  errors: readonly OrganizerJuryShareValidationIssue[];
  warnings: readonly OrganizerJuryShareValidationIssue[];
};

export type OrganizerJuryShareThemeSnapshot = {
  editionId: string;
  state: OrganizerJuryShareThemeState;
  version: number;
  composition: OrganizerJuryShareComposition;
  validation: OrganizerJuryShareValidation;
  updatedAt?: string | null;
};

export const ORGANIZER_JURY_SHARE_SAMPLE_ROWS = JURY_SHARE_POINTS.map((points, index) => ({
  points,
  country: `Country ${String.fromCharCode(65 + index)}`,
})) as readonly { points: (typeof JURY_SHARE_POINTS)[number]; country: string }[];

export function createOrganizerJuryShareComposition(input?: {
  artworkAssetId?: string | null;
}): OrganizerJuryShareComposition {
  const safeArea = JURY_SHARE_TARGETS.story.safeArea;
  const assetId = input?.artworkAssetId?.trim() || null;

  return {
    artwork: assetId
      ? {
          assetId,
          placement: "top_fade",
          focalX: 0.5,
          focalY: 0.5,
          scale: "cover",
          opacity: 0.9,
          blurPx: 0,
          fadeDirection: "down",
          fadeStart: 0.2,
          fadeEnd: 0.58,
          scrimStrength: 0.35,
        }
      : null,
    scoreboard: {
      inheritEditionScoreboard: true,
      rowRadius: 28,
      rowHeight: 96,
      emphasizeTwelvePoints: true,
      flagTreatment: "plain",
      scoreTreatment: "plain",
    },
    header: {
      showSolarisMark: true,
      showEditionLabel: true,
      showShowLabel: true,
      alignment: "left",
    },
    background: {
      treatment: assetId ? "artwork" : "edition",
      strength: 0.85,
    },
    footer: {
      showVotesOfLabel: true,
      showSourceFlag: true,
      alignment: "left",
    },
    decorativeAssets: [],
    safeArea: {
      top: safeArea.top,
      right: safeArea.right,
      bottom: safeArea.bottom,
      left: safeArea.left,
    },
  };
}

function finiteBetween(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function issue(code: string, message: string, path?: string): OrganizerJuryShareValidationIssue {
  return { code, message, path };
}

/**
 * Fast Organizer-side validation for editor feedback. The canonical System
 * validator still owns whether a theme may transition to Ready.
 */
export function validateOrganizerJuryShareComposition(
  composition: OrganizerJuryShareComposition,
): OrganizerJuryShareValidation {
  const errors: OrganizerJuryShareValidationIssue[] = [];
  const warnings: OrganizerJuryShareValidationIssue[] = [];

  if (composition.artwork) {
    const artwork = composition.artwork;
    if (!artwork.assetId.trim()) {
      errors.push(issue("ARTWORK_ASSET_REQUIRED", "Choose an edition-owned artwork asset.", "artwork.assetId"));
    }
    if (!finiteBetween(artwork.focalX, 0, 1) || !finiteBetween(artwork.focalY, 0, 1)) {
      errors.push(issue("ARTWORK_FOCAL_INVALID", "Artwork focal position must stay between 0 and 1.", "artwork"));
    }
    if (!finiteBetween(artwork.opacity, 0, 1)) {
      errors.push(issue("ARTWORK_OPACITY_INVALID", "Artwork opacity must stay between 0 and 1.", "artwork.opacity"));
    }
    if (!finiteBetween(artwork.blurPx, 0, 40)) {
      errors.push(issue("ARTWORK_BLUR_INVALID", "Artwork blur must stay between 0 and 40 px.", "artwork.blurPx"));
    }
    if (!finiteBetween(artwork.fadeStart, 0, 1) || !finiteBetween(artwork.fadeEnd, 0, 1)) {
      errors.push(issue("ARTWORK_FADE_INVALID", "Artwork fade bounds must stay between 0 and 1.", "artwork"));
    } else if (artwork.fadeDirection !== "none" && artwork.fadeEnd <= artwork.fadeStart) {
      errors.push(issue("ARTWORK_FADE_ORDER_INVALID", "Fade end must be after fade start.", "artwork.fadeEnd"));
    }
    if (!finiteBetween(artwork.scrimStrength, 0, 1)) {
      errors.push(issue("ARTWORK_SCRIM_INVALID", "Scrim strength must stay between 0 and 1.", "artwork.scrimStrength"));
    }
  } else {
    warnings.push(issue("EDITION_ARTWORK_NOT_CONFIGURED", "No edition artwork is selected. The Edition design can still use edition colours."));
  }

  if (!finiteBetween(composition.scoreboard.rowRadius, 0, 80)) {
    errors.push(issue("ROW_RADIUS_INVALID", "Row radius must stay between 0 and 80 px.", "scoreboard.rowRadius"));
  }
  if (!finiteBetween(composition.scoreboard.rowHeight, 64, 132)) {
    errors.push(issue("ROW_HEIGHT_INVALID", "Row height must stay between 64 and 132 px.", "scoreboard.rowHeight"));
  }

  const { top, right, bottom, left } = composition.safeArea;
  if (![top, right, bottom, left].every((value) => Number.isFinite(value) && value >= 0)) {
    errors.push(issue("SAFE_AREA_VALUE_INVALID", "Safe-area values must be non-negative numbers.", "safeArea"));
  } else {
    if (top + bottom >= JURY_SHARE_TARGETS.story.height) {
      errors.push(issue("SAFE_AREA_VERTICAL_INVALID", "Top and bottom safe areas leave no usable Story height.", "safeArea"));
    }
    if (left + right >= JURY_SHARE_TARGETS.story.width) {
      errors.push(issue("SAFE_AREA_HORIZONTAL_INVALID", "Left and right safe areas leave no usable Story width.", "safeArea"));
    }
  }

  if (composition.decorativeAssets.length > 32) {
    errors.push(issue("TOO_MANY_DECORATIVE_ASSETS", "Use at most 32 structured decorative assets.", "decorativeAssets"));
  }

  if (!composition.scoreboard.inheritEditionScoreboard) {
    warnings.push(issue("SCOREBOARD_OVERRIDE_ACTIVE", "This theme overrides part of the edition scoreboard treatment. Check long country names before marking Ready."));
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function organizerJuryShareStateLabel(state: OrganizerJuryShareThemeState) {
  switch (state) {
    case "unconfigured":
      return "Not configured";
    case "draft":
      return "Draft";
    case "ready":
      return "Ready";
    case "archived":
      return "Archived";
    case "invalid":
      return "Needs fixes";
  }
}
