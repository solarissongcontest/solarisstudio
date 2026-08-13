import { Link } from "@tanstack/react-router";
import { AdminPredictionLink } from "./AdminPredictionLink";

export function AdminNav() {
  return <nav className="space-y-1 p-3 text-sm"><Link to="/admin" className="block rounded-lg px-3 py-2 hover:bg-surface">Dashboard</Link><Link to="/admin/hosts" className="block rounded-lg px-3 py-2 hover:bg-surface">Hosting</Link><AdminPredictionLink /></nav>;
}
