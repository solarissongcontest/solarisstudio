import { describe, expect, it } from "vitest";

import { loadOrganizerTasksV5 } from "@/lib/admin-tasks-v5";
import {
  disableAppPush,
  enableAppPush,
  getAppPushState,
} from "@/lib/app-notifications";
import { getCountryConfirmationAccess } from "@/lib/confirmation-country-account";
import { capabilityForOrganizerPath } from "@/lib/permission-route-map";
import { hasCapability, requireCapability } from "@/lib/permissions-v2";
import {
  SOLARIS_V6_RUNTIME_AUTHORITIES,
  solarisV6RuntimeAuthority,
} from "@/lib/solaris-v6-runtime-authority";
import {
  acknowledgeStudio2Notice,
  loadStudio2HodWorkspace,
} from "@/lib/studio2-hod-workspace";
import {
  executeStudio2ResultOperation,
  loadStudio2ResultsOperations,
} from "@/lib/studio2-results-operations";
import {
  applyShowPublicationChange,
  loadShowPublicationControls,
  previewShowPublicationChange,
  reauthenticateShowPublicationR3,
} from "@/lib/show-publication-lifecycle";

describe("Solaris V6 runtime authority binding", () => {
  it("reuses canonical Results operations instead of creating a V6 result path", () => {
    const results = solarisV6RuntimeAuthority("results");
    expect(results.read).toBe(loadStudio2ResultsOperations);
    expect(results.execute).toBe(executeStudio2ResultOperation);
    expect(results.transports).toContain("studio2_execute_result_operation");
  });

  it("reuses the canonical publication lifecycle instead of inventing a V6 release path", () => {
    const publication = solarisV6RuntimeAuthority("publication");
    expect(publication.read).toBe(loadShowPublicationControls);
    expect(publication.preview).toBe(previewShowPublicationChange);
    expect(publication.execute).toBe(applyShowPublicationChange);
    expect(publication.reauthenticate).toBe(reauthenticateShowPublicationR3);
    expect(publication.transports).toContain(
      "studio2_apply_show_publication_change",
    );
  });

  it("reuses canonical participant, confirmation and task projections", () => {
    expect(SOLARIS_V6_RUNTIME_AUTHORITIES.participation.read).toBe(
      loadStudio2HodWorkspace,
    );
    expect(SOLARIS_V6_RUNTIME_AUTHORITIES.confirmation.read).toBe(
      getCountryConfirmationAccess,
    );
    expect(SOLARIS_V6_RUNTIME_AUTHORITIES.task.read).toBe(
      loadOrganizerTasksV5,
    );
  });

  it("keeps required acknowledgement separate from notification read state", () => {
    const acknowledgement = solarisV6RuntimeAuthority("acknowledgement");
    expect(acknowledgement.execute).toBe(acknowledgeStudio2Notice);
    expect(acknowledgement.transports).toContain(
      "studio2_acknowledge_notice",
    );
  });

  it("binds Organizer presentation to the existing capability contract", () => {
    const permissions = solarisV6RuntimeAuthority("permissions");
    expect(permissions.check).toBe(hasCapability);
    expect(permissions.require).toBe(requireCapability);
    expect(permissions.routeCapability).toBe(capabilityForOrganizerPath);
    expect(permissions.kind).toBe("authorization-contract");
  });

  it("keeps push explicitly projection-only", () => {
    const notification = solarisV6RuntimeAuthority("notification");
    expect(notification.kind).toBe("projection-only");
    expect(notification.read).toBe(getAppPushState);
    expect(notification.enableDelivery).toBe(enableAppPush);
    expect(notification.disableDelivery).toBe(disableAppPush);
  });
});
