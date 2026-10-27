import { validateV3DomainConsequenceRegistry } from "./v3-domain-consequence-registry";
import { V3_NOTIFICATION_PROVIDER_REGISTRY } from "./v3-notification-provider-registry";
import {
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
  v3SystemDomain,
} from "./v3-system-domain-registry";

export type V3SystemIntegrationRegistration = {
  path: string;
  coordinatorDomain: string;
  role: "command-adapter" | "projection-adapter" | "composite-read-adapter" | "rollout-probe";
};

export type V3SystemEdgeFunctionRegistration = {
  name: string;
  ownerDomain: string;
};

export type V3SystemScheduledJobRegistration = {
  name: string;
  ownerDomain: string;
  evidence: string;
};

export type V3SystemZeroOrphanDiscovery = {
  integrationPaths: readonly string[];
  edgeFunctionNames: readonly string[];
  scheduledJobNames: readonly string[];
};

/**
 * S15 inventory for the V3 server-integration surface.
 *
 * coordinatorDomain describes who owns the adapter boundary. It never promotes
 * an adapter into canonical write authority for the domains it reads.
 */
export const V3_SYSTEM_INTEGRATION_REGISTRY: readonly V3SystemIntegrationRegistration[] = [
  { path: "src/integrations/v3/broadcast-intelligence-source.server.ts", coordinatorDomain: "results", role: "composite-read-adapter" },
  { path: "src/integrations/v3/delegation-source.server.ts", coordinatorDomain: "delegation", role: "projection-adapter" },
  { path: "src/integrations/v3/edition-source.server.ts", coordinatorDomain: "edition", role: "projection-adapter" },
  { path: "src/integrations/v3/entry-actions.server.ts", coordinatorDomain: "entry", role: "command-adapter" },
  { path: "src/integrations/v3/entry-source.server.ts", coordinatorDomain: "entry", role: "projection-adapter" },
  { path: "src/integrations/v3/explore-source.server.ts", coordinatorDomain: "public-ux", role: "composite-read-adapter" },
  { path: "src/integrations/v3/jury-actions.server.ts", coordinatorDomain: "jury", role: "command-adapter" },
  { path: "src/integrations/v3/live-source.server.ts", coordinatorDomain: "live-show", role: "composite-read-adapter" },
  { path: "src/integrations/v3/me-summary.server.ts", coordinatorDomain: "account", role: "composite-read-adapter" },
  { path: "src/integrations/v3/organizer-acceptance-evidence.ts", coordinatorDomain: "feature-rollout", role: "command-adapter" },
  { path: "src/integrations/v3/organizer-prediction-operations.ts", coordinatorDomain: "prediction", role: "command-adapter" },
  { path: "src/integrations/v3/participant-activity.server.ts", coordinatorDomain: "activity", role: "projection-adapter" },
  { path: "src/integrations/v3/primary-surface-source.server.ts", coordinatorDomain: "participation", role: "composite-read-adapter" },
  { path: "src/integrations/v3/records-source.server.ts", coordinatorDomain: "results", role: "composite-read-adapter" },
  { path: "src/integrations/v3/relationships-source.server.ts", coordinatorDomain: "results", role: "composite-read-adapter" },
  { path: "src/integrations/v3/result-lab-source.server.ts", coordinatorDomain: "results", role: "composite-read-adapter" },
  { path: "src/integrations/v3/results-source.server.ts", coordinatorDomain: "results", role: "projection-adapter" },
  { path: "src/integrations/v3/rollout-probe.server.ts", coordinatorDomain: "feature-rollout", role: "rollout-probe" },
  { path: "src/integrations/v3/scoreboard-source.server.ts", coordinatorDomain: "publication", role: "projection-adapter" },
  { path: "src/integrations/v3/scorecharts-source.server.ts", coordinatorDomain: "results", role: "composite-read-adapter" },
  { path: "src/integrations/v3/stories-source.server.ts", coordinatorDomain: "story", role: "projection-adapter" },
];

export const V3_SYSTEM_EDGE_FUNCTION_REGISTRY: readonly V3SystemEdgeFunctionRegistration[] = [
  { name: "admin-country-password", ownerDomain: "identity" },
  { name: "country-auth", ownerDomain: "identity" },
  { name: "integrity-evidence-download", ownerDomain: "integrity" },
  { name: "integrity-evidence-lifecycle", ownerDomain: "integrity" },
  { name: "notification-receipt", ownerDomain: "notification" },
  { name: "solaris-push-dispatch", ownerDomain: "notification" },
  { name: "solaris-upload-finalize", ownerDomain: "media" },
];

export const V3_SYSTEM_SCHEDULED_JOB_REGISTRY: readonly V3SystemScheduledJobRegistration[] = [
  {
    name: "solaris-app-push-dispatch",
    ownerDomain: "notification",
    evidence: "supabase/migrations/20261002155500_push_runtime_vault_and_cron.sql",
  },
  {
    name: "solaris-studio2-publish-due-notices",
    ownerDomain: "notice",
    evidence: "supabase/migrations/20260911194000_studio2_official_communications_full.sql",
  },
  {
    name: "solaris-publish-due-entries",
    ownerDomain: "publication",
    evidence: "supabase/migrations/20260821170000_beta2_entry_reveals_and_national_final_history.sql",
  },
  {
    name: "solaris-studio2-publish-due-shows",
    ownerDomain: "publication",
    evidence: "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
  },
];

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function setDifference(expected: readonly string[], actual: readonly string[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: [...expectedSet].filter((item) => !actualSet.has(item)).sort(),
    unknown: [...actualSet].filter((item) => !expectedSet.has(item)).sort(),
  };
}

export function validateV3SystemZeroOrphans(discovery: V3SystemZeroOrphanDiscovery) {
  const failures: string[] = [];
  const domainIds = V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain);
  for (const duplicate of duplicateValues(domainIds)) {
    failures.push(`domain has multiple canonical owners: ${duplicate}`);
  }

  const commandOwners = new Map<string, string>();
  for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
    if (!domain.ownershipEvidence.length) {
      failures.push(`domain has no ownership evidence: ${domain.domain}`);
    }
    if (!domain.projections.length || domain.projections.some((projection) => !projection.trim())) {
      failures.push(`domain has no usable projection ownership: ${domain.domain}`);
    }
    for (const command of domain.mutationCommands) {
      if (!/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*$/.test(command)) {
        failures.push(`command is not namespaced: ${domain.domain} -> ${command}`);
      }
      const existing = commandOwners.get(command);
      if (existing && existing !== domain.domain) {
        failures.push(`command has multiple owners: ${command} -> ${existing}, ${domain.domain}`);
      } else {
        commandOwners.set(command, domain.domain);
      }
    }
  }

  for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) {
    const owner = V3_SYSTEM_CONCEPT_OWNER[concept];
    if (!owner || !v3SystemDomain(owner)) failures.push(`required concept has unknown owner: ${concept} -> ${owner}`);
  }

  for (const failure of validateV3DomainConsequenceRegistry()) {
    failures.push(`consequence registry: ${failure}`);
  }

  for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
    if (!v3SystemDomain(provider.ownerDomain)) {
      failures.push(`notification provider has unknown owner: ${provider.id} -> ${provider.ownerDomain}`);
    }
  }

  const registeredIntegrations = V3_SYSTEM_INTEGRATION_REGISTRY.map((item) => item.path).sort();
  for (const duplicate of duplicateValues(registeredIntegrations)) {
    failures.push(`integration registered more than once: ${duplicate}`);
  }
  for (const integration of V3_SYSTEM_INTEGRATION_REGISTRY) {
    if (!v3SystemDomain(integration.coordinatorDomain)) {
      failures.push(`integration has unknown coordinator domain: ${integration.path} -> ${integration.coordinatorDomain}`);
    }
  }
  const integrationDiff = setDifference(registeredIntegrations, [...discovery.integrationPaths].sort());
  for (const missing of integrationDiff.missing) failures.push(`registered V3 integration is missing: ${missing}`);
  for (const unknown of integrationDiff.unknown) failures.push(`unowned V3 integration discovered: ${unknown}`);

  const registeredEdgeFunctions = V3_SYSTEM_EDGE_FUNCTION_REGISTRY.map((item) => item.name).sort();
  for (const duplicate of duplicateValues(registeredEdgeFunctions)) {
    failures.push(`Edge Function registered more than once: ${duplicate}`);
  }
  for (const fn of V3_SYSTEM_EDGE_FUNCTION_REGISTRY) {
    if (!v3SystemDomain(fn.ownerDomain)) {
      failures.push(`Edge Function has unknown owner: ${fn.name} -> ${fn.ownerDomain}`);
    }
  }
  const edgeDiff = setDifference(registeredEdgeFunctions, [...discovery.edgeFunctionNames].sort());
  for (const missing of edgeDiff.missing) failures.push(`registered Edge Function is missing: ${missing}`);
  for (const unknown of edgeDiff.unknown) failures.push(`unowned Edge Function discovered: ${unknown}`);

  const registeredJobs = V3_SYSTEM_SCHEDULED_JOB_REGISTRY.map((item) => item.name).sort();
  for (const duplicate of duplicateValues(registeredJobs)) failures.push(`scheduled job registered more than once: ${duplicate}`);
  for (const job of V3_SYSTEM_SCHEDULED_JOB_REGISTRY) {
    if (!v3SystemDomain(job.ownerDomain)) failures.push(`scheduled job has unknown owner: ${job.name} -> ${job.ownerDomain}`);
  }
  const jobDiff = setDifference(registeredJobs, [...discovery.scheduledJobNames].sort());
  for (const missing of jobDiff.missing) failures.push(`registered scheduled job is missing: ${missing}`);
  for (const unknown of jobDiff.unknown) failures.push(`unowned scheduled job discovered: ${unknown}`);

  return failures;
}
