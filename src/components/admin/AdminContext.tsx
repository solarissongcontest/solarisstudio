import { createContext, useContext, useState, type ReactNode } from "react";

type Value = {
  editionId: string;
  showId: string;
  setEditionId: (id: string) => void;
  setShowId: (id: string) => void;
};

const EDITION_KEY = "solaris:admin:edition-id";
const SHOW_KEY = "solaris:admin:show-id";

const Ctx = createContext<Value | null>(null);

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [editionId, setEditionState] = useState(() => localStorage.getItem(EDITION_KEY) ?? "");
  const [showId, setShowState] = useState(() => localStorage.getItem(SHOW_KEY) ?? "");

  const setEditionId = (id: string) => {
    setEditionState(id);
    if (id) localStorage.setItem(EDITION_KEY, id);
    else localStorage.removeItem(EDITION_KEY);
  };

  const setShowId = (id: string) => {
    setShowState(id);
    if (id) localStorage.setItem(SHOW_KEY, id);
    else localStorage.removeItem(SHOW_KEY);
  };

  return <Ctx.Provider value={{ editionId, showId, setEditionId, setShowId }}>{children}</Ctx.Provider>;
}

export function useAdminContext() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Admin context missing");
  return value;
}
