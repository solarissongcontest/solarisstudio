export type CoordinationEdge = {
  sourcePersonId: string;
  sourceName: string;
  targetPersonId: string;
  targetName: string;
  riskScore: number;
  confidence: number;
  uniqueEditions: number;
  supportEditions: number;
  opportunityEditions: number;
  reciprocalSupport: number;
  crossChannelEditions: number;
};

export type CoordinationGroupConfig = {
  minEdgeRisk: number;
  minMembers: number;
  minDensity: number;
  internalShareThreshold: number;
};

export type CoordinationGroup = {
  id: string;
  memberIds: string[];
  memberNames: string[];
  qualifiedEdges: number;
  possibleEdges: number;
  density: number;
  internalSupportShare: number;
  riskScore: number;
  averageEdgeRisk: number;
  maxEdgeRisk: number;
  strongestEdges: CoordinationEdge[];
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

export function detectCoordinationGroups(
  edges: CoordinationEdge[],
  config: CoordinationGroupConfig,
): CoordinationGroup[] {
  const minEdgeRisk = Math.max(0, Math.min(100, config.minEdgeRisk));
  const minMembers = Math.max(2, Math.trunc(config.minMembers));
  const minDensity = Math.max(0, Math.min(1, config.minDensity));
  const internalThreshold = Math.max(0, Math.min(1, config.internalShareThreshold));

  const names = new Map<string, string>();
  const adjacency = new Map<string, Set<string>>();
  const qualifiedPairRisk = new Map<string, number>();
  for (const edge of edges) {
    if (!edge.sourcePersonId || !edge.targetPersonId || edge.sourcePersonId === edge.targetPersonId) continue;
    names.set(edge.sourcePersonId, edge.sourceName);
    names.set(edge.targetPersonId, edge.targetName);
    if (edge.riskScore < minEdgeRisk) continue;
    const key = pairKey(edge.sourcePersonId, edge.targetPersonId);
    qualifiedPairRisk.set(key, Math.max(qualifiedPairRisk.get(key) ?? 0, edge.riskScore));
    const sourceSet = adjacency.get(edge.sourcePersonId) ?? new Set<string>();
    const targetSet = adjacency.get(edge.targetPersonId) ?? new Set<string>();
    sourceSet.add(edge.targetPersonId);
    targetSet.add(edge.sourcePersonId);
    adjacency.set(edge.sourcePersonId, sourceSet);
    adjacency.set(edge.targetPersonId, targetSet);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue;
    const stack = [node];
    const component: string[] = [];
    visited.add(node);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (component.length >= minMembers) components.push(component.sort());
  }

  const groups: CoordinationGroup[] = [];
  for (const members of components) {
    const memberSet = new Set(members);
    const possibleEdges = (members.length * (members.length - 1)) / 2;
    let qualifiedEdges = 0;
    const pairRisks: number[] = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const risk = qualifiedPairRisk.get(pairKey(members[i], members[j]));
        if (risk != null) {
          qualifiedEdges += 1;
          pairRisks.push(risk);
        }
      }
    }
    const density = possibleEdges ? qualifiedEdges / possibleEdges : 0;
    if (density < minDensity) continue;

    let internalSupport = 0;
    let allSupport = 0;
    for (const edge of edges) {
      if (!memberSet.has(edge.sourcePersonId)) continue;
      allSupport += Math.max(0, edge.supportEditions);
      if (memberSet.has(edge.targetPersonId)) internalSupport += Math.max(0, edge.supportEditions);
    }
    const internalSupportShare = allSupport ? internalSupport / allSupport : 0;
    if (internalSupportShare < internalThreshold) continue;

    const strongestEdges = edges
      .filter((edge) => memberSet.has(edge.sourcePersonId) && memberSet.has(edge.targetPersonId) && edge.sourcePersonId !== edge.targetPersonId)
      .sort((a, b) => b.riskScore - a.riskScore || b.uniqueEditions - a.uniqueEditions)
      .slice(0, 12);
    const averageEdgeRisk = pairRisks.length ? pairRisks.reduce((sum, risk) => sum + risk, 0) / pairRisks.length : 0;
    const maxEdgeRisk = pairRisks.length ? Math.max(...pairRisks) : 0;
    const riskScore = Math.min(100, Math.round(averageEdgeRisk * 0.7 + internalSupportShare * 20 + density * 10));

    groups.push({
      id: members.join("+"),
      memberIds: members,
      memberNames: members.map((id) => names.get(id) ?? id),
      qualifiedEdges,
      possibleEdges,
      density: Math.round(density * 1000) / 10,
      internalSupportShare: Math.round(internalSupportShare * 1000) / 10,
      riskScore,
      averageEdgeRisk: Math.round(averageEdgeRisk * 10) / 10,
      maxEdgeRisk,
      strongestEdges,
    });
  }

  return groups.sort((a, b) => b.riskScore - a.riskScore || b.memberIds.length - a.memberIds.length);
}
