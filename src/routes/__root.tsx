import { AccountCacheIsolation } from "@/components/app/AccountCacheIsolation";
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
import solarisBackgroundCss from "../solaris-background.css?url";
import cardTypographyCss from "../card-typography.css?url";
import solarisMotionCss from "../solaris-motion.css?url";
import flagMediaCss from "../flag-media.css?url";
import appShellCss from "../styles/app-shell.css?url";
import solarisDepthCss from "../solaris-depth.css?url";
import { UnifiedServiceAdminGate } from "../components/admin/UnifiedServiceAdminGate";
import { AppRuntime, useSolarisApp } from "../components/app/AppRuntime";
import { AppExperiencePreferenceSync } from "../components/app/AppExperiencePreferenceSync";
import { AppLaunchRestoreCoordinator } from "../components/app/AppLaunchRestoreCoordinator";
import { AppTelemetryBridge } from "../components/app/AppTelemetryBridge";
import { AppDataFreshnessCoordinator } from "../components/app/AppDataFreshnessCoordinator";
import { AppReconnectReconciler } from "../components/app/AppReconnectReconciler";
import { AppRouteStateFrame } from "../components/app/AppRouteStateFrame";
import { ParticipationRouteChrome } from "../components/ParticipationServiceShell";
import { RouteVisualTheme } from "../components/RouteVisualTheme";
import { RulesGovernanceContext } from "../components/rules/RulesGovernanceContext";
import { SolarisAmbientBackground } from "../components/SolarisAmbientBackground";
import { SolarisAnniversaryCelebration } from "../components/SolarisAnniversaryCelebration";
import { Toaster } from "../components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { appErrorPresentation, classifyAppError } from "../lib/app-error-state";
import { startPublicWebVitals } from "../lib/public-web-vitals";

const SITE_DESCRIPTION =
  "Solaris Studio is the home of Solaris Song Contest editions, results, voting analytics, predictions, records and interactive archive tools.";
const SITE_URL = "https://studio.solaris-song-contest.workers.dev";
const SOCIAL_PREVIEW_URL = `${SITE_URL}/solaris-studio-social.jpg?v=2`;

type BackgroundFamily =
  | "home"
  | "editions"
  | "countries"
  | "shows"
  | "wiki"
  | "analysis"
  | "relationships"
  | "compare"
  | "records"
  | "pulse"
  | "predictions"
  | "participate"
  | "confirmations"
  | "televoting"
  | "result-lab"
  | "taste-dna"
  | "broadcast"
  | "archive-games"
  | "scorecharts"
  | "tools"
  | "rules"
  | "integrity"
  | "core";

function backgroundFamilyFor(pathname: string): BackgroundFamily {
  if (pathname.startsWith("/rules")) return "rules";
  if (pathname.startsWith("/integrity")) return "integrity";
  if (pathname.startsWith("/confirmations")) return "confirmations";
  if (pathname.startsWith("/televoting")) return "televoting";
  if (pathname.startsWith("/jury-voting") || pathname.startsWith("/next-in-line"))
    return "participate";
  if (pathname.startsWith("/participate")) return "participate";
  if (pathname.startsWith("/pulse")) return "pulse";
  if (pathname.startsWith("/predictions")) return "predictions";
  if (pathname.startsWith("/relationships")) return "relationships";
  if (pathname.startsWith("/compare")) return "compare";
  if (pathname.startsWith("/analysis")) return "analysis";
  if (pathname.startsWith("/records")) return "records";
  if (pathname.startsWith("/archive-games")) return "archive-games";
  if (pathname.startsWith("/wiki")) return "wiki";
  if (pathname.startsWith("/result-lab")) return "result-lab";
  if (pathname.startsWith("/taste-dna")) return "taste-dna";
  if (pathname.startsWith("/broadcast-intelligence")) return "broadcast";
  if (pathname.startsWith("/scorecharts")) return "scorecharts";
  if (pathname.startsWith("/tools")) return "tools";
  if (pathname.startsWith("/editions")) return "editions";
  if (pathname.startsWith("/countries")) return "countries";
  if (pathname.startsWith("/shows")) return "shows";
  if (pathname === "/") return "home";
  return "core";
}

function NotFoundComponent() {
  const { isAppMode } = useSolarisApp();

  const body = (
    <div className={isAppMode ? "solaris-app-route-state-card" : "max-w-md text-center"}>
      <p
        className={
          isAppMode ? "solaris-app-route-state-kicker" : "text-7xl font-bold text-foreground"
        }
      >
        {isAppMode ? "404" : "404"}
      </p>
      <h2
        className={
          isAppMode ? "mt-2 text-xl font-semibold" : "mt-4 text-xl font-semibold text-foreground"
        }
      >
        Page not found
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The link may be outdated, or this page may have moved.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Go home
        </Link>
        <Link
          to="/explore"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
        >
          Explore Solaris
        </Link>
      </div>
    </div>
  );

  if (isAppMode) {
    return <AppRouteStateFrame title="Page not found">{body}</AppRouteStateFrame>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">{body}</div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { isAppMode } = useSolarisApp();
  const kind = classifyAppError(error, typeof navigator === "undefined" ? true : navigator.onLine);
  const presentation = appErrorPresentation(kind);

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
      app_error_kind: kind,
    });
  }, [error, kind]);

  const body = (
    <div
      className={isAppMode ? "solaris-app-route-state-card" : "max-w-md text-center"}
      data-solaris-error-kind={kind}
    >
      <p className="solaris-app-route-state-kicker">{presentation.eyebrow}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {presentation.title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{presentation.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {presentation.retry ? (
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        ) : null}
        {presentation.primaryHref ? (
          <Link
            to={presentation.primaryHref as any}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {presentation.primaryLabel ?? "Continue"}
          </Link>
        ) : null}
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
        >
          Go home
        </Link>
      </div>
    </div>
  );

  if (isAppMode) {
    return <AppRouteStateFrame title={presentation.title}>{body}</AppRouteStateFrame>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">{body}</div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Solaris Studio" },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "Solaris Studio" },
      { name: "application-name", content: "Solaris Studio" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Solaris Studio" },
      { name: "theme-color", content: "#020817" },
      { property: "og:title", content: "Solaris Studio" },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: SOCIAL_PREVIEW_URL },
      { property: "og:image:secure_url", content: SOCIAL_PREVIEW_URL },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1070" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Solaris Studio" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Solaris Studio" },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SOCIAL_PREVIEW_URL },
    ],
    scripts: [
      {
        children: `(() => {
          try {
            const installed =
              window.matchMedia("(display-mode: standalone)").matches ||
              window.matchMedia("(display-mode: window-controls-overlay)").matches ||
              navigator.standalone === true;
            if (!installed) return;
            const root = document.documentElement;
            root.setAttribute("data-solaris-app-boot", "");
            window.setTimeout(() => root.removeAttribute("data-solaris-app-boot"), 4000);
          } catch {}
        })();`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Solaris Studio",
          url: SITE_URL,
          description: SITE_DESCRIPTION,
          publisher: {
            "@type": "Organization",
            name: "Terra Solaris Broadcasting Coalition",
          },
        }),
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico?v=img2340-20260929", sizes: "any" },
      {
        rel: "icon",
        type: "image/png",
        href: "/icon-192.png?v=img2340-20260929",
        sizes: "192x192",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png?v=img2340-20260929",
        sizes: "180x180",
      },
      { rel: "manifest", href: "/site.webmanifest?v=img2340-20260929" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: unifiedCss },
      { rel: "stylesheet", href: accessibilityCss },
      { rel: "stylesheet", href: anniversaryCss },
      { rel: "stylesheet", href: solarisBackgroundCss },
      { rel: "stylesheet", href: cardTypographyCss },
      { rel: "stylesheet", href: solarisMotionCss },
      { rel: "stylesheet", href: flagMediaCss },
      { rel: "stylesheet", href: appShellCss },
      { rel: "stylesheet", href: solarisDepthCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppRuntime>{children}</AppRuntime>
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
  const fullAdmin = pathname.startsWith("/admin") || serviceAdmin;
  const publicParticipation =
    !serviceAdmin && (pathname.startsWith("/confirmations") || pathname.startsWith("/televoting"));

  useEffect(() => startPublicWebVitals(), []);

  useEffect(() => {
    const route = pathname.startsWith("/pulse") ? "pulse" : "";
    if (route) document.body.dataset.solarisRoute = route;
    else delete document.body.dataset.solarisRoute;

    document.body.dataset.solarisFamily = backgroundFamilyFor(pathname);

    return () => {
      delete document.body.dataset.solarisRoute;
      delete document.body.dataset.solarisFamily;
    };
  }, [pathname]);

  const outlet = <Outlet />;
  const content = serviceAdmin ? (
    <UnifiedServiceAdminGate>{outlet}</UnifiedServiceAdminGate>
  ) : publicParticipation ? (
    <ParticipationRouteChrome>{outlet}</ParticipationRouteChrome>
  ) : (
    outlet
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AccountCacheIsolation />
      <AppLaunchRestoreCoordinator />
      <AppDataFreshnessCoordinator />
      <AppReconnectReconciler />
      <AppExperiencePreferenceSync />
      <AppTelemetryBridge />
      <SolarisAnniversaryCelebration />
      <RouteVisualTheme />
      <RulesGovernanceContext />
      {!fullAdmin ? <SolarisAmbientBackground /> : null}
      {content}
      <ToolQuickGuide pathname={pathname} />
      <Toaster />
    </QueryClientProvider>
  );
}

function ToolQuickGuide({ pathname }: { pathname: string }) {
  const { isAppMode } = useSolarisApp();
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
          intro:
            "It measures how similar your personal ranking is to different groups, not whether your taste is ‘good’ or ‘bad’.",
          steps: [
            "Choose a published show and reorder the entries into your own ranking.",
            "A high Jury match means your order resembles the jury ranking; a high Televote match means it resembles the public ranking.",
            "Overall match compares you with the final combined result. Individual-jury matches show which juries ranked the field most like you did.",
            "Official/Jury/Televote are starting presets only. Saving your ballot is optional.",
          ],
        }
      : pathname.startsWith("/broadcast-intelligence") &&
          !pathname.startsWith("/broadcast-intelligence/jury")
        ? {
            title: "What Broadcast Intelligence means",
            intro:
              "It explains how the official result changed when jury and televote scores came together. It is not another result table.",
            steps: [
              "The replay starts with every country's jury total already on the scoreboard.",
              "Televote scores are then revealed from the lowest jury-ranked entry upward so you can watch countries rise, fall or take the lead.",
              "Comeback / collapse describes movement from jury rank to final rank. Jury–tele agreement describes how similarly the two groups ranked the field.",
              "Volatility is a summary of how much the ranking moved. Higher volatility means the combined result changed the jury order more dramatically.",
            ],
          }
        : null;

  // The website uses a floating quick-guide affordance. In installed mode
  // that extra fixed bubble competes with the app tab bar and makes the screen
  // feel like a website embedded in a shell, so app routes keep help inside
  // their own content / toolbar instead.
  if (!guide || isAppMode) return null;

  return (
    <details className="fixed bottom-[5.6rem] right-3 z-[80] max-h-[52vh] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-primary/25 bg-popover/95 shadow-2xl backdrop-blur-xl lg:bottom-5 lg:right-5">
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
