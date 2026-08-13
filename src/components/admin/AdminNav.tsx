import { Link } from "@tanstack/react-router";
import { AdminPredictionLink } from "./AdminPredictionLink";

export function AdminNav() {
  const c = "block rounded-lg px-3 py-2 hover:bg-surface";
  return <nav className="space-y-1 p-3 text-sm"><Link to="/admin" className={c}>Dashboard</Link><Link to="/admin/status" className={c}>Status</Link><Link to="/admin/hosts" className={c}>Hosting</Link><AdminPredictionLink /></nav>;
}
