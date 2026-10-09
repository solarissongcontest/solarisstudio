export type SolarisPerspective = "public" | "participant" | "organizer";

export type SolarisScreenPresentation =
  | "root"
  | "directory"
  | "entity"
  | "article"
  | "data"
  | "settings"
  | "task"
  | "live"
  | "error"
  | "workspace";

export type SolarisToolbarMode = "root" | "back" | "focused" | "hidden";
export type SolarisTabbarMode = "full" | "compact" | "minimal" | "hidden";
export type SolarisSearchMode = "none" | "global" | "local";

export type SolarisScreenContract = {
  id: string;
  perspective: SolarisPerspective;
  title: string;
  shortTitle?: string;
  root: string;
  parent?: {
    title: string;
    href: string;
  };
  presentation: SolarisScreenPresentation;
  toolbar: SolarisToolbarMode;
  tabbar: SolarisTabbarMode;
  search: SolarisSearchMode;
  preserveScroll: boolean;
  immersive: boolean;
};

/**
 * Every screen contract is declarative. Chrome may consume this contract, but
 * route components must not independently reinterpret root-tab ownership.
 */
export function assertSolarisScreenContract(screen: SolarisScreenContract) {
  if (!screen.id.trim()) throw new Error("Solaris screen id is required.");
  if (!screen.title.trim()) throw new Error(`Solaris screen title is required: ${screen.id}`);
  if (!screen.root.trim()) throw new Error(`Solaris screen root is required: ${screen.id}`);
  return screen;
}
