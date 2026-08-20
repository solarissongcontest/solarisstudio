import { betaSectionsCore } from "./sections-core";
import { betaSectionsExtra } from "./sections-extra";
import type { BetaSection } from "./types";

export const beta1Sections: BetaSection[] = [
  ...betaSectionsCore,
  ...betaSectionsExtra,
];
