export type RuleReturnContext = {
  href: string;
  pathname: string;
  search: string;
  label: string;
  scrollY: number;
  focusId?: string;
  savedAt: string;
};

const CONTEXT_KEY = "solaris:rule-return-context:v1";
const RESTORE_KEY = "solaris:rule-return-restore:v1";

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberRuleReturnContext(label: string, focusId?: string) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/rules")) return;
  const context: RuleReturnContext = {
    href: window.location.pathname + window.location.search,
    pathname: window.location.pathname,
    search: window.location.search,
    label,
    scrollY: Math.max(0, window.scrollY),
    focusId,
    savedAt: new Date().toISOString(),
  };
  try {
    session()?.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Returning to the source task remains a best-effort enhancement.
  }
}

export function readRuleReturnContext(): RuleReturnContext | null {
  try {
    const raw = session()?.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuleReturnContext;
    if (
      !parsed ||
      typeof parsed.href !== "string" ||
      typeof parsed.pathname !== "string" ||
      parsed.pathname.startsWith("/rules") ||
      typeof parsed.label !== "string"
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function markRuleReturnRestore(context: RuleReturnContext) {
  try {
    session()?.setItem(RESTORE_KEY, JSON.stringify(context));
  } catch {
    // Focus/scroll restoration is best effort.
  }
}

export function consumeRuleReturnRestore(pathname: string, search: string) {
  try {
    const storage = session();
    const raw = storage?.getItem(RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuleReturnContext;
    if (parsed.pathname !== pathname || parsed.search !== search) return null;
    storage?.removeItem(RESTORE_KEY);
    return parsed;
  } catch {
    return null;
  }
}
