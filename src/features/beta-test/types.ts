export type BetaAnswer = string | number | string[] | Record<string, string>;
export type BetaAnswers = Record<string, BetaAnswer | undefined>;

export type BetaShowWhen = {
  id: string;
  equals?: string;
  notEquals?: string;
  oneOf?: string[];
  includes?: string;
};

export type BetaQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "single" | "multi" | "rating" | "matrix";
  required?: boolean;
  options?: string[];
  helper?: string;
  placeholder?: string;
  lowLabel?: string;
  highLabel?: string;
  rows?: string[];
  showWhen?: BetaShowWhen;
  optionsFrom?: string;
};

export type BetaSection = {
  id: string;
  title: string;
  description?: string;
  task?: { body: string; href?: string; linkLabel?: string };
  questions: BetaQuestion[];
};

export type BetaBugReport = {
  id: string;
  page: string;
  did: string;
  expected: string;
  instead: string;
  reproducibility: string;
  severity: string;
  screenshotPath?: string;
  file?: File;
};
