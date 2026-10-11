export type V3ViewportClass =
  | "small-phone"
  | "phone"
  | "large-phone"
  | "tablet"
  | "desktop"
  | "wide-desktop";

export type V3ResponsiveContext = {
  width: number;
  height: number;
  largeText?: boolean;
  standalone?: boolean;
  organizer?: boolean;
};

export type V3ResponsiveLayout = {
  viewport: V3ViewportClass;
  gutters: number;
  contentColumns: 1 | 2 | 3;
  navigation: "bottom-expanded" | "bottom-icons" | "sidebar";
  allowCompactBottomNav: boolean;
  sheetMode: "near-full" | "detents" | "dialog-or-panel";
  useContextRail: boolean;
  maxContentWidth: number | null;
};

export function classifyV3Viewport(width: number): V3ViewportClass {
  if (!Number.isFinite(width) || width <= 0) throw new Error("V3 responsive policy requires a positive viewport width.");
  if (width < 375) return "small-phone";
  if (width < 431) return "phone";
  if (width < 600) return "large-phone";
  if (width < 900) return "tablet";
  if (width < 1440) return "desktop";
  return "wide-desktop";
}

export function projectV3ResponsiveLayout(context: V3ResponsiveContext): V3ResponsiveLayout {
  const viewport = classifyV3Viewport(context.width);
  const largeText = Boolean(context.largeText);

  switch (viewport) {
    case "small-phone":
      return {
        viewport,
        gutters: 16,
        contentColumns: 1,
        navigation: largeText ? "bottom-expanded" : "bottom-icons",
        allowCompactBottomNav: !largeText,
        sheetMode: "near-full",
        useContextRail: false,
        maxContentWidth: null,
      };
    case "phone":
      return {
        viewport,
        gutters: 20,
        contentColumns: 1,
        navigation: "bottom-expanded",
        allowCompactBottomNav: !largeText,
        sheetMode: "detents",
        useContextRail: false,
        maxContentWidth: null,
      };
    case "large-phone":
      return {
        viewport,
        gutters: 24,
        contentColumns: 1,
        navigation: "bottom-expanded",
        allowCompactBottomNav: !largeText,
        sheetMode: "detents",
        useContextRail: false,
        maxContentWidth: 720,
      };
    case "tablet":
      return {
        viewport,
        gutters: 32,
        contentColumns: 2,
        navigation: "bottom-expanded",
        allowCompactBottomNav: false,
        sheetMode: "detents",
        useContextRail: Boolean(context.organizer && context.width >= 760),
        maxContentWidth: 1040,
      };
    case "desktop":
      return {
        viewport,
        gutters: 40,
        contentColumns: context.organizer ? 3 : 2,
        navigation: "sidebar",
        allowCompactBottomNav: false,
        sheetMode: "dialog-or-panel",
        useContextRail: true,
        maxContentWidth: 1280,
      };
    case "wide-desktop":
      return {
        viewport,
        gutters: 48,
        contentColumns: 3,
        navigation: "sidebar",
        allowCompactBottomNav: false,
        sheetMode: "dialog-or-panel",
        useContextRail: true,
        maxContentWidth: 1440,
      };
  }
}
