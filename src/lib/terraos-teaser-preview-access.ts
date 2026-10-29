import { notFound } from "@tanstack/react-router";

/** Fixture previews must disappear when the live application leaves maintenance. */
export function requireTerraOsTeaserMaintenance(maintenanceEnabled: boolean): void {
  if (!maintenanceEnabled) throw notFound();
}
