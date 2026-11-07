/** Fail closed before Playwright starts if the app under test is not loopback. */
export declare function requireLocalPlaywrightTarget(configuredUrl: string | undefined, fallbackUrl: string): string;
export declare function requireLocalPlaywrightSupabaseEnvironment(environment: Record<string, string | undefined>): true;
