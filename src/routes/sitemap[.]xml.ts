import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// TODO: replace with the production origin once a permanent custom domain is set.
const BASE_URL = "";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/editions", changefreq: "weekly", priority: "0.9" },
          { path: "/countries", changefreq: "weekly", priority: "0.8" },
          { path: "/pulse", changefreq: "daily", priority: "0.8" },
          { path: "/predictions", changefreq: "daily", priority: "0.8" },
          { path: "/tools", changefreq: "monthly", priority: "0.8" },
          { path: "/analysis", changefreq: "monthly", priority: "0.7" },
          { path: "/result-lab", changefreq: "monthly", priority: "0.7" },
          { path: "/taste-dna", changefreq: "monthly", priority: "0.7" },
          { path: "/broadcast-intelligence", changefreq: "monthly", priority: "0.7" },
          { path: "/archive-games", changefreq: "monthly", priority: "0.7" },
          { path: "/relationships", changefreq: "monthly", priority: "0.7" },
          { path: "/compare", changefreq: "monthly", priority: "0.7" },
          { path: "/records", changefreq: "monthly", priority: "0.7" },
          { path: "/auth", changefreq: "yearly", priority: "0.2" },
        ];

        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (supabaseUrl && key) {
            const { createClient } = await import("@supabase/supabase-js");
            const client = createClient(supabaseUrl, key, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
            const [{ data: editions }, { data: countries }] = await Promise.all([
              client.from("editions").select("slug").eq("published", true),
              client.from("countries").select("short_code"),
            ]);
            (editions ?? []).forEach((edition: { slug: string }) =>
              entries.push({
                path: `/editions/${edition.slug}`,
                changefreq: "monthly",
                priority: "0.8",
              }),
            );
            (countries ?? []).forEach((country: { short_code: string }) =>
              entries.push({
                path: `/countries/${country.short_code}`,
                changefreq: "monthly",
                priority: "0.6",
              }),
            );
          }
        } catch {
          // Static routes are still returned if public data cannot be loaded.
        }

        const urls = entries.map((entry) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${entry.path}</loc>`,
            entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
            entry.priority ? `    <priority>${entry.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
