import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import {
  readTabScopedEdition,
  SOLARIS_TAB_EDITION_KEY,
  writeTabScopedEdition,
} from "@/lib/solaris-v6-edition-context";

type AdminContextValue = {
  editionId: string;
  setEditionId: (id: string) => void;
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
  const [editionId, setEditionState] = useState(readStoredEditionId);

  const setEditionId = useCallback((id: string) => {
    setEditionState(id);
    persistEditionId(id);
  }, []);

  return (
    <AdminContext.Provider value={{ editionId, setEditionId }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminContext() {
  const value = useContext(AdminContext);

  if (!value) {
    throw new Error("Admin context missing");
  }

  return value;
}
