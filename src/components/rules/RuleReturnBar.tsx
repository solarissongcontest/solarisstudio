import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import {
  markRuleReturnRestore,
  readRuleReturnContext,
  type RuleReturnContext,
} from "@/lib/rule-return-context";

export function RuleReturnBar() {
  const [context, setContext] = useState<RuleReturnContext | null>(null);

  useEffect(() => {
    setContext(readRuleReturnContext());
  }, []);

  if (!context) return null;

  return (
    <nav className="mb-4" aria-label="Return to previous Solaris task">
      <Link
        to={context.href as any}
        onClick={() => markRuleReturnRestore(context)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-surface/55 px-3 text-sm font-semibold text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {context.label}
      </Link>
    </nav>
  );
}
