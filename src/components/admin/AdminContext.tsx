import { createContext, useContext, useState, type ReactNode } from "react";

type AdminContextValue = {
  editionId: string;
  setEditionId: (id: string) => void;
};

const EDITION_KEY = "solaris:admin:edition-id";
const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [editionId, setEditionState] = useState(() =>
    window.localStorage.getItem(EDITION_KEY) ?? "",
  );

  const setEditionId = (id: string) => {
    setEditionState(id);

    if (id) {
      window.localStorage.setItem(EDITION_KEY, id);
    } else {
      window.localStorage.removeItem(EDITION_KEY);
    }
  };

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
