import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  validateV3DomainConsequenceRegistry,
} from "../src/lib/v3-domain-consequence-registry";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "../src/lib/v3-system-domain-registry";
import {
  V3_WORKFLOW_DEPENDENCY_REGISTRY,
  validateV3WorkflowDependencyRegistry,
} from "../src/lib/v3-workflow-dependency-registry";

const failures: string[] = [];
failures.push(...validateV3WorkflowDependencyRegistry().map((error) => `dependency: ${error}`));
failures.push(...validateV3DomainConsequenceRegistry().map((error) => `consequence: ${error}`));

const declaredEvents = new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.eventTypes));
for (const dependency of V3_WORKFLOW_DEPENDENCY_REGISTRY) {
  for (const produced of dependency.produces) {
    if (!declaredEvents.has(produced)) {
      failures.push(`dependency: ${dependency.operation} produces undeclared event ${produced}`);
    }
  }
  if (!dependency.requires.length) {
    failures.push(`dependency: ${dependency.operation} has no declared prerequisite`);
  }
  if (!dependency.evidence.length) {
    failures.push(`dependency: ${dependency.operation} has no ownership evidence`);
  }
}

for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
  if (!consequence.projections.length && !consequence.consumers.length) {
    failures.push(`consequence: ${consequence.eventType} has no projection or consumer consequence`);
  }
  if (!consequence.evidence.length) {
    failures.push(`consequence: ${consequence.eventType} has no ownership evidence`);
  }
}

if (failures.length) {
  console.error("System V3 S1 registry guard failed.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  [
    "System V3 S1 registry guard passed",
    `domains=${V3_SYSTEM_DOMAIN_REGISTRY.length}`,
    `workflowDependencies=${V3_WORKFLOW_DEPENDENCY_REGISTRY.length}`,
    `eventConsequences=${V3_DOMAIN_CONSEQUENCE_REGISTRY.length}`,
  ].join(" · "),
);
