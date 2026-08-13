import { createContext, useContext, type ReactNode } from "react";

type Value = { editionId: string; showId: string };
const Ctx = createContext<Value>({ editionId: "", showId: "" });
export function AdminContextProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={{ editionId: "", showId: "" }}>{children}</Ctx.Provider>;
}
export const useAdminContext = () => useContext(Ctx);
