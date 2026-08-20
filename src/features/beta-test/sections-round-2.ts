import { beta2DiscoverySections } from "./sections-beta2-discovery";
import { beta2EvaluationSections } from "./sections-beta2-evaluation";
import type { BetaSection } from "./types";

export const betaSectionsRound2: BetaSection[] = [
  ...beta2DiscoverySections,
  ...beta2EvaluationSections,
];
