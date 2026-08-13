import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
export const AdminFrame = ({ children }: { children: ReactNode }) => <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)]"><aside className="hidden border-r border-border lg:block"><AdminNav /></aside><main className="min-w-0 p-3 sm:p-5">{children}</main></div>;
