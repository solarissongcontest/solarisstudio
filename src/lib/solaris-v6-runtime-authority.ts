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
  acknowledgeStudio2Notice,
  loadStudio2HodWorkspace,
} from "@/lib/studio2-hod-workspace";
import {
  executeStudio2ResultOperation,
  loadStudio2ResultsOperations,
} from "@/lib/studio2-results-operations";

export type SolarisV6RuntimeAuthorityKind =
  | "canonical-read"
  | "canonical-write"
  | "authorization-contract"
  | "projection-only";

/**
 * V6 does not introduce replacement data authorities for mature V5 domains.
 *
 * This manifest binds new V6 surfaces and interaction flows to the canonical
 * runtime functions already used by the proven V5 system. The direct function
 * references are intentional: regression tests can detect accidental forks.
 */
export const SOLARIS_V6_RUNTIME_AUTHORITIES = {
  confirmation: {
    kind: "canonical-write" as const,
    read: getCountryConfirmationAccess,
    transports: [
      "public_country_account_confirmation_access",
      "public_country_account_confirmation_requirements",
      "submit_confirmation",
    ] as const,
    notes:
      "A single edition+country requirement is authoritative. Submission rounds are windows, not a second participation identity.",
  },
  participation: {
    kind: "canonical-read" as const,
    read: loadStudio2HodWorkspace,
    transports: ["studio2_hod_context"] as const,
    notes:
      "Participant readiness, confirmation completion, entry workflow, notices and jury state are read from the shared HOD workspace snapshot.",
  },
  acknowledgement: {
    kind: "canonical-write" as const,
    execute: acknowledgeStudio2Notice,
    transports: ["studio2_acknowledge_notice"] as const,
    notes:
      "Required acknowledgement is a canonical receipt. Notification read state is not an acknowledgement.",
  },
  task: {
    kind: "canonical-read" as const,
    read: loadOrganizerTasksV5,
    transports: ["admin_organizer_tasks"] as const,
    notes:
      "Organizer work is derived from domain truth and cannot be resolved by merely reading or dismissing a notification.",
  },
  results: {
    kind: "canonical-write" as const,
    read: loadStudio2ResultsOperations,
    execute: executeStudio2ResultOperation,
    transports: [
      "studio2_results_operations_snapshot",
      "studio2_execute_result_operation",
    ] as const,
    notes:
      "Consequential result operations preserve expected-version checks, stable execution identity and server receipts.",
  },
  permissions: {
    kind: "authorization-contract" as const,
    check: hasCapability,
    require: requireCapability,
    routeCapability: capabilityForOrganizerPath,
    transports: ["studio2_access_allowed"] as const,
    notes:
      "Client capability evaluation controls presentation only. Canonical server operations still enforce matching capabilities.",
  },
  notification: {
    kind: "projection-only" as const,
    read: getAppPushState,
    enableDelivery: enableAppPush,
    disableDelivery: disableAppPush,
    transports: ["app_push_subscriptions"] as const,
    notes:
      "Push is delivery infrastructure. It never becomes task, confirmation, voting, notice or result truth.",
  },
} as const;

export type SolarisV6RuntimeAuthorityId =
  keyof typeof SOLARIS_V6_RUNTIME_AUTHORITIES;

export function solarisV6RuntimeAuthority<
  TId extends SolarisV6RuntimeAuthorityId,
>(
  id: TId,
): (typeof SOLARIS_V6_RUNTIME_AUTHORITIES)[TId] {
  return SOLARIS_V6_RUNTIME_AUTHORITIES[id];
}
