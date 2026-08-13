import { createFileRoute } from "@tanstack/react-router";
import { AdminHealthStrip } from "@/components/admin/AdminHealthStrip";
export const Route = createFileRoute("/_authenticated/admin/status")({ component: () => <AdminHealthStrip /> });
