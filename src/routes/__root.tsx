import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import unifiedCss from "../unified-design.css?url";
import accessibilityCss from "../accessibility.css?url";
import anniversaryCss from "../anniversary.css?url";
import cardTypographyCss from "../card-typography.css?url";
import { UnifiedServiceAdminGate } from "../components/admin/UnifiedServiceAdminGate";
import { reportLovableError } from "../lib/lovable-error-reporting";

const SITE_DESCRIPTION =
  "Solaris Studio is the home of Solaris Song Contest editions, results, voting analytics, predictions, records and interactive archive tools.";

const TOOL_BACKGROUNDS: Array<[string, string]> = [
  [
    "/result-lab",
    "radial-gradient(circle at 82% 12%, rgba(66, 210, 214, .16), transparent 35%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/taste-dna",
    "radial-gradient(circle at 82% 12%, rgba(165, 105, 255, .18), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/broadcast-intelligence",
    "radial-gradient(circle at 82% 12%, rgba(255, 164, 74, .17), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/archive-games",
    "radial-gradient(circle at 82% 12%, rgba(102, 214, 143, .16), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/scorecharts",
    "radial-gradient(circle at 82% 12%, rgba(90, 158, 255, .16), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/compare",
    "radial-gradient(circle at 82% 12%, rgba(242, 113, 180, .14), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
  [
    "/pulse",
    "radial-gradient(circle at 82% 12%, rgba(83, 191, 238, .16), transparent 36%), linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')",
  ],
];

const BASE_BACKGROUND =
  "linear-gradient(180deg, rgba(1, 5, 20, .09), rgba(1, 5, 20, .25)), url('/IMG_8815.jpeg')";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <Link
            to="/wiki"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open Wiki
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Solaris Studio" },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "Solaris Studio" },
      { name: "application-name", content: "Solaris Studio" },
      { name: "theme-color", content: "#020817" },
      { property: "og:title", content: "Solaris Studio" },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Solaris Studio" },
      { name: "twitter:description", content: SITE_DESCRIPTION },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: unifiedCss },
      { rel: "stylesheet", href: accessibilityCss },
      { rel: "stylesheet", href: anniversaryCss },
      { rel: "stylesheet", href: cardTypographyCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          body[data-solaris-route="pulse"] .app-main .text-\\[9px\\],
          body[data-solaris-route="pulse"] .app-main .text-\\[10px\\] {
            font-size: .75rem !important;
            line-height: 1.05rem !important;
          }

          @media (max-width: 639px) {
            body[data-solaris-route="pulse"] .app-main .text-xs {
              font-size: .875rem !important;
              line-height: 1.35rem !important;
            }

            body[data-solaris-route="pulse"] .app-main .text-sm {
              font-size: .95rem !important;
              line-height: 1.4rem !important;
            }
          }
        `}</style>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const serviceAdmin =
    pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin");

  useEffect(() => {
    const route = pathname.startsWith("/pulse") ? "pulse" : "";
    if (route) document.body.dataset.solarisRoute = route;
    else delete document.body.dataset.solarisRoute;

    const themed = TOOL_BACKGROUNDS.find(([prefix]) => pathname.startsWith(prefix));
    document.body.style.backgroundImage = themed?.[1] ?? BASE_BACKGROUND;

    return () => {
      delete document.body.dataset.solarisRoute;
      document.body.style.backgroundImage = BASE_BACKGROUND;
    };
  }, [pathname]);

  const content = serviceAdmin ? (
    <UnifiedServiceAdminGate>
      <Outlet />
    </UnifiedServiceAdminGate>
  ) : (
    <Outlet />
  );

  return (
    <QueryClientProvider client={queryClient}>
      {content}
      <ToolQuickGuide pathname={pathname} />
    </QueryClientProvider>
  );
}

function ToolQuickGuide({ pathname }: { pathname: string }) {
  const guide = pathname.startsWith("/result-lab")
    ? {
        title: "How Result Lab works",
        intro: "A sandbox for asking ‘what if the voting system were different?’",
        steps: [
          "Pick a published edition and show.",
          "Change the jury/televote balance, jury scoring or included juries.",
          "Watch the simulated ranking update immediately. There is no Apply button.",
          "Nothing here changes the official SSC result.",
        ],
      }
    : pathname.startsWith("/taste-dna")
      ? {
          title: "What Taste DNA means",
          intro: "It measures how similar your personal ranking is to different groups, not whether your taste is ‘good’ or ‘bad’.",
          steps: [
            "Choose a published show and reorder the entries into your own ranking.",
            "A high Jury match means your order resembles the jury ranking; a high Televote match means it resembles the public ranking.",
            "Overall match compares you with the final combined result. Individual-jury matches show which juries ranked the field most like you did.",
            "Official/Jury/Televote are starting presets only. Saving your ballot is optional.",
          ],
        }
      : pathname.startsWith("/broadcast-intelligence") && !pathname.startsWith("/broadcast-intelligence/jury")
        ? {
            title: "What Broadcast Intelligence means",
            intro: "It explains how the official result changed when jury and televote scores came together. It is not another result table.",
            steps: [
              "The replay starts with every country's jury total already on the scoreboard.",
              "Televote scores are then revealed from the lowest jury-ranked entry upward so you can watch countries rise, fall or take the lead.",
              "Comeback / collapse describes movement from jury rank to final rank. Jury–tele agreement describes how similarly the two groups ranked the field.",
              "Volatility is a summary of how much the ranking moved. Higher volatility means the combined result changed the jury order more dramatically.",
            ],
          }
        : null;

  if (!guide) return null;

  return (
    <details
      open
      className="fixed bottom-[5.6rem] right-3 z-[80] max-h-[52vh] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-primary/25 bg-popover/95 shadow-2xl backdrop-blur-xl lg:bottom-5 lg:right-5"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-foreground [&::-webkit-details-marker]:hidden">
        {guide.title} <span className="float-right text-muted-foreground">▾</span>
      </summary>
      <div className="border-t border-border/70 px-4 py-3">
        <p className="mb-3 text-xs leading-relaxed text-foreground/85">{guide.intro}</p>
        <ol className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
          {guide.steps.map((step, index) => (
            <li key={step} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
              <span className="numeric font-bold text-primary">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
