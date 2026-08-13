import { createContext, useContext, useState, type ReactNode } from "react";

type Value = {
  editionId: string;
  showId: string;
  setEditionId: (id: string) => void;
  setShowId: (id: string) => void;
};
const Ctx = createContext<Value | null>(null);

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [editionId, setEditionState] = useState(() => localStorage.getItem("solaris:admin:edition") ?? "");
  const [showId, setShowState] = useState(() => localStorage.getItem("solaris:admin:show") ?? "");
  const setEditionId = (id: string) => { setEditionState(id); localStorage.setItem("solaris:admin:edition", id); };
  const setShowId = (id: string) => { setShowState(id); localStorage.setItem("solaris:admin:show", id); };
  return <Ctx.Provider value={{ editionId, showId, setEditionId, setShowId }}>{children}</Ctx.Provider>;
}

export function useAdminContext() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Admin context missing");
  return value;
}
