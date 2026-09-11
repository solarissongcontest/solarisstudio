import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronDown, FileClock, ShieldCheck } from "lucide-react";

import { ContextualRuleGuide } from "@/components/rules/ContextualRuleGuide";
import { usePublishedRulebook } from "@/lib/rules-governance";
import { cn } from "@/lib/utils";

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function shortcutLink(active: boolean) {
  return cn(
    "flex min-h-11 items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors",
    active
      ? "bg-surface-strong text-foreground"
      : "text-muted-foreground hover:bg-surface hover:text-foreground",
  );
}

function RulesShortcutMenu({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  const rulesActive = pathMatches(pathname, "/rules");
  const integrityActive = pathMatches(pathname, "/integrity");
  const active = rulesActive || integrityActive;

  return (
    <details
      key={`rules-navigation-${mobile ? "mobile" : "desktop"}-${pathname}`}
      className="group relative"
      data-solaris-rules-menu
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-xl border font-semibold shadow-lg backdrop-blur-xl transition-colors [&::-webkit-details-marker]:hidden",
          mobile ? "min-h-11 px-3 text-xs" : "px-3.5 py-2.5 text-sm",
          active
            ? "border-sky-200/25 bg-sky-200/12 text-foreground"
            : "border-border/75 bg-background/88 text-foreground hover:border-sky-200/25 hover:bg-surface-strong",
        )}
      >
        <ShieldCheck className="size-4 text-sky-200" />
        Rules
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>

      <div
        className={cn(
          "absolute overflow-hidden rounded-2xl border border-border/70 bg-background/96 p-2 shadow-2xl backdrop-blur-xl",
          mobile ? "bottom-[calc(100%+.6rem)] right-0 w-[min(88vw,20rem)]" : "right-0 top-[calc(100%+.6rem)] w-80",
        )}
      >
        <p className="px-3 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
          Rules & integrity
        </p>
        <Link to="/rules" className={shortcutLink(rulesActive)}>
          <BookOpen className="mt-0.5 size-4 shrink-0 text-sky-200" />
          <span>
            <span className="block text-xs font-semibold text-foreground">Official SSC rules</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
              Rule Map, interactive checks and the complete 21-chapter regulations
            </span>
          </span>
        </Link>
        <Link to="/rules/changes" className={shortcutLink(pathMatches(pathname, "/rules/changes"))}>
          <FileClock className="mt-0.5 size-4 shrink-0 text-violet-200" />
          <span>
            <span className="block text-xs font-semibold text-foreground">Rulebook changes</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
              Published versions, effective dates and rule-by-rule change reasons
            </span>
          </span>
        </Link>
        <Link to="/integrity" className={shortcutLink(integrityActive)}>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-200" />
          <span>
            <span className="block text-xs font-semibold text-foreground">Trust & Integrity</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
              Report a concern anonymously, ask privately or return to a protected case
            </span>
          </span>
        </Link>
      </div>
    </details>
  );
}

export function GlobalRulesNavigationAddon() {
  usePublishedRulebook();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <nav
        aria-label="Rules and integrity shortcuts"
        className="fixed right-4 top-20 z-[45] hidden lg:block"
      >
        <RulesShortcutMenu pathname={pathname} />
      </nav>

      <nav
        aria-label="Rules and integrity shortcuts"
        className="fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-3 z-[45] lg:hidden"
      >
        <RulesShortcutMenu pathname={pathname} mobile />
      </nav>

      <ContextualRuleGuide />
    </>
  );
}
