import type { User } from "@supabase/supabase-js";
import { createContext, useContext, type ReactNode } from "react";

const AuthenticatedUserContext = createContext<User | null>(null);

export function AuthenticatedUserProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  return (
    <AuthenticatedUserContext.Provider value={user}>
      {children}
    </AuthenticatedUserContext.Provider>
  );
}

export function useAuthenticatedUser() {
  const user = useContext(AuthenticatedUserContext);
  if (!user) {
    throw new Error("useAuthenticatedUser must be used inside AuthenticatedUserProvider");
  }
  return user;
}
