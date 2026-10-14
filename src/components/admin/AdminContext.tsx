import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { OrganizerContext } from "@/lib/v3-organizer-projection";
import {
  readTabScopedEdition,
  SOLARIS_TAB_EDITION_KEY,
  writeTabScopedEdition,
} from "@/lib/solaris-v6-edition-context";

type EditionContextInput = {
  id: string;
  slug: string | null;
  label: string | null;
};

type ShowContextInput = {
  id: string;
  label: string | null;
};

type AdminContextState = {
  editionId: string;
  editionSlug: string | null;
  editionLabel: string | null;
  showId: string | null;
  showLabel: string | null;
  contextVersion: number;
};

type AdminContextValue = AdminContextState & {
  mode: "organizer";
  context: OrganizerContext;
  setEditionId: (id: string) => void;
  setEditionContext: (edition: EditionContextInput) => void;
  setShowContext: (show: ShowContextInput | null) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

function readStoredEditionId() {
  if (typeof window === "undefined") return "";
  try {
    return readTabScopedEdition(window.sessionStorage, SOLARIS_TAB_EDITION_KEY);
  } catch (error) {
    console.warn("[admin] Could not read saved edition preference", error);
    return "";
  }
}

function initialContextState(): AdminContextState {
  return {
    editionId: readStoredEditionId(),
    editionSlug: null,
    editionLabel: null,
    showId: null,
    showLabel: null,
    contextVersion: 1,
  };
}

function persistEditionId(id: string) {
  if (typeof window === "undefined") return;
  try {
    writeTabScopedEdition(window.sessionStorage, id, SOLARIS_TAB_EDITION_KEY);
  } catch (error) {
    // Browser privacy/storage restrictions must never prevent Organizer access.
    console.warn("[admin] Could not save edition preference", error);
  }
}

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialContextState);

  // Backward-compatible setter for legacy Organizer pages. Changing edition
  // clears show scope and stale labels; AdminSelectors then resolves the full
  // canonical edition identity from the shell-owned edition list.
  const setEditionId = useCallback((id: string) => {
    setState((current) => {
      if (current.editionId === id) return current;
      return {
        editionId: id,
        editionSlug: null,
        editionLabel: null,
        showId: null,
        showLabel: null,
        contextVersion: current.contextVersion + 1,
      };
    });
    persistEditionId(id);
  }, []);

  const setEditionContext = useCallback((edition: EditionContextInput) => {
    setState((current) => {
      const editionChanged = current.editionId !== edition.id;
      const metadataChanged =
        current.editionSlug !== edition.slug || current.editionLabel !== edition.label;
      if (!editionChanged && !metadataChanged) return current;
      return {
        editionId: edition.id,
        editionSlug: edition.slug,
        editionLabel: edition.label,
        showId: editionChanged ? null : current.showId,
        showLabel: editionChanged ? null : current.showLabel,
        // Slug/label hydration for the same edition is metadata enrichment, not
        // a scope transition. Only a real edition switch invalidates scoped UI.
        contextVersion: editionChanged ? current.contextVersion + 1 : current.contextVersion,
      };
    });
    persistEditionId(edition.id);
  }, []);

  const setShowContext = useCallback((show: ShowContextInput | null) => {
    setState((current) => {
      const nextId = show?.id ?? null;
      const nextLabel = show?.label ?? null;
      if (current.showId === nextId && current.showLabel === nextLabel) return current;
      return {
        ...current,
        showId: nextId,
        showLabel: nextLabel,
        contextVersion: current.contextVersion + 1,
      };
    });
  }, []);

  const context = useMemo<OrganizerContext>(
    () => ({
      editionId: state.editionId || null,
      editionSlug: state.editionSlug,
      editionLabel: state.editionLabel,
      showId: state.showId,
      showLabel: state.showLabel,
      mode: "organizer",
      contextVersion: state.contextVersion,
    }),
    [state],
  );

  const value = useMemo<AdminContextValue>(
    () => ({
      ...state,
      mode: "organizer",
      context,
      setEditionId,
      setEditionContext,
      setShowContext,
    }),
    [state, context, setEditionId, setEditionContext, setShowContext],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const value = useContext(AdminContext);

  if (!value) {
    throw new Error("Admin context missing");
  }

  return value;
}
